"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookmarkItem } from "@/lib/bookmarks/types";
import { getDomain } from "@/lib/bookmarks/utils";
import {
  openItemInNewTab,
  openItemPreviewInNewTab,
  openUrlInNewTab,
} from "@/components/bookmarks/itemActions";
import { resolveItemPreview } from "@/components/bookmarks/itemPreview";
import { CloseIcon, ExternalArrowIcon } from "@/components/bookmarks/icons";

type Props = {
  open: boolean;
  item: BookmarkItem | null;
  onClose: () => void;
  drawerWidth: number;
  onDrawerWidthChange: (width: number) => void;
};

function isCloudflareAccessUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase().endsWith("cloudflareaccess.com");
  } catch {
    return false;
  }
}

export default function ItemViewerModal({
  open,
  item,
  onClose,
  drawerWidth,
  onDrawerWidthChange,
}: Props) {
  const resolved = useMemo(
    () => (item ? resolveItemPreview(item) : { kind: "none" as const }),
    [item],
  );
  const resolvedInlineText = resolved.kind === "text" ? resolved.inlineText : undefined;
  const resolvedSrc = resolved.kind === "text" ? resolved.src : undefined;
  const resolvedFrameSrc =
    resolved.kind === "pdf" || resolved.kind === "iframe" ? resolved.src : undefined;
  const [text, setText] = useState<string>(() => {
    if (resolved.kind === "text" && resolvedInlineText) return resolvedInlineText;
    return "";
  });
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(() => {
    if (resolved.kind !== "text") return "idle";
    if (resolvedInlineText) return "ready";
    if (resolvedSrc) return "loading";
    return "error";
  });
  const [error, setError] = useState<string | undefined>(() => {
    if (resolved.kind === "text" && !resolvedInlineText && !resolvedSrc) {
      return "Preview source missing.";
    }
    return undefined;
  });

  const [frameStatus, setFrameStatus] = useState<"idle" | "loading" | "ready">(() => {
    if (resolved.kind === "pdf" || resolved.kind === "iframe") return "loading";
    return "idle";
  });
  const [frameTimedOut, setFrameTimedOut] = useState(false);
  const [embedCheck, setEmbedCheck] = useState<
    { status: "idle" } | { status: "checking" } | { status: "allowed" } | { status: "blocked"; reason?: string }
  >(() => {
    if (resolved.kind === "pdf" || resolved.kind === "iframe") return { status: "checking" };
    return { status: "idle" };
  });

  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  );
  const rafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const wasBodySelectRef = useRef<string | null>(null);
  const wasBodyCursorRef = useRef<string | null>(null);

  const openOriginalInNewTab = useCallback(() => {
    if (!item) return;

    if (resolved.kind === "text" && resolved.inlineText) {
      openItemInNewTab(item);
      return;
    }

    if (
      (resolved.kind === "image" ||
        resolved.kind === "pdf" ||
        resolved.kind === "iframe" ||
        resolved.kind === "file") &&
      "src" in resolved
    ) {
      openUrlInNewTab(resolved.src);
      return;
    }

    if (resolved.kind === "text" && resolved.src) {
      openUrlInNewTab(resolved.src);
      return;
    }

    openItemInNewTab(item);
  }, [item, resolved]);

  const popoutPreview = useCallback(() => {
    if (!item) return;

    if (embedCheck.status === "blocked") {
      openOriginalInNewTab();
      return;
    }

    if (resolved.kind === "none" || resolved.kind === "file") {
      openOriginalInNewTab();
      return;
    }

    openItemPreviewInNewTab(item);
  }, [embedCheck.status, item, openOriginalInNewTab, resolved.kind]);

  const endResize = useCallback(() => {
    resizeStateRef.current = null;
    pendingWidthRef.current = null;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (wasBodySelectRef.current !== null) {
      document.body.style.userSelect = wasBodySelectRef.current;
      wasBodySelectRef.current = null;
    } else {
      document.body.style.userSelect = "";
    }
    if (wasBodyCursorRef.current !== null) {
      document.body.style.cursor = wasBodyCursorRef.current;
      wasBodyCursorRef.current = null;
    } else {
      document.body.style.cursor = "";
    }
  }, []);

  useEffect(() => {
    if (!open || !item) endResize();
    return () => endResize();
  }, [endResize, item, open]);

  useEffect(() => {
    if (!open || !item) return;

    if (resolved.kind !== "text") return;
    if (resolvedInlineText) return;
    if (!resolvedSrc) return;

    let cancelled = false;

    fetch(resolvedSrc)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      })
      .then((raw) => {
        if (cancelled) return;
        setStatus("ready");
        setText(raw);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setError("Unable to load preview (blocked by CORS or missing file).");
      });

    return () => {
      cancelled = true;
    };
  }, [item, open, resolved.kind, resolvedInlineText, resolvedSrc]);

  useEffect(() => {
    if (!open || !item) return;
    if (resolved.kind !== "pdf" && resolved.kind !== "iframe") return;
    if (frameStatus !== "loading") return;

    const timer = window.setTimeout(() => setFrameTimedOut(true), 9000);
    return () => window.clearTimeout(timer);
  }, [frameStatus, item, open, resolved.kind]);

  useEffect(() => {
    if (!open || !item) return;
    if (resolved.kind !== "pdf" && resolved.kind !== "iframe") return;
    if (embedCheck.status !== "checking") return;

    let cancelled = false;
    const src = resolvedFrameSrc;
    if (!src) return;

    fetch(`/api/embed-check?url=${encodeURIComponent(src)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return { blocked: false } as { blocked: boolean; reason?: string };
        return (await res.json()) as { blocked: boolean; reason?: string };
      })
      .then((data) => {
        if (cancelled) return;
        if (data.blocked) {
          setEmbedCheck({ status: "blocked", reason: data.reason });
          return;
        }
        setEmbedCheck({ status: "allowed" });
      })
      .catch(() => {
        if (cancelled) return;
        setEmbedCheck({ status: "allowed" });
      });

    return () => {
      cancelled = true;
    };
  }, [embedCheck.status, item, open, resolved.kind, resolvedFrameSrc]);

  if (!open || !item) return null;

  const subtitle = item.description?.trim() || (item.url ? getDomain(item.url) : "Inline content");
  const cloudflareAccess = isCloudflareAccessUrl(item.url);

  return (
    <div className="modal-backdrop viewer-backdrop" role="presentation">
      <div
        className="modal viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ ["--viewer-width" as string]: `${drawerWidth}px` }}
      >
        <div
          className="viewer-resize"
          role="separator"
          aria-label="Resize preview"
          aria-orientation="vertical"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStateRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startWidth: drawerWidth,
            };
            wasBodySelectRef.current = document.body.style.userSelect;
            wasBodyCursorRef.current = document.body.style.cursor;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
          }}
          onPointerMove={(event) => {
            const state = resizeStateRef.current;
            if (!state) return;
            if (state.pointerId !== event.pointerId) return;

            const delta = state.startX - event.clientX;
            const minWidth = 420;
            const maxWidth = Math.max(minWidth, window.innerWidth - 40);
            const nextWidth = Math.min(Math.max(state.startWidth + delta, minWidth), maxWidth);

            pendingWidthRef.current = nextWidth;
            if (rafRef.current !== null) return;
            rafRef.current = window.requestAnimationFrame(() => {
              rafRef.current = null;
              const value = pendingWidthRef.current;
              if (typeof value === "number") onDrawerWidthChange(value);
            });
          }}
          onPointerUp={(event) => {
            const state = resizeStateRef.current;
            if (!state) return;
            if (state.pointerId !== event.pointerId) return;
            endResize();
          }}
          onPointerCancel={(event) => {
            const state = resizeStateRef.current;
            if (!state) return;
            if (state.pointerId !== event.pointerId) return;
            endResize();
          }}
        />

        <div className="modal-head viewer-head">
          <div className="viewer-head-left">
            <div className="modal-title">{item.name}</div>
            <div className="modal-sub">{subtitle}</div>
          </div>
          <div className="viewer-head-actions">
            <button
              type="button"
              className="card-action"
              onClick={popoutPreview}
              aria-label="Open preview in new tab"
              title="Open preview in new tab"
            >
              <ExternalArrowIcon color="currentColor" />
            </button>
            <button
              type="button"
              className="card-action"
              onClick={() => {
                endResize();
                onClose();
              }}
              aria-label="Close"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="viewer-body">
          {resolved.kind === "image" ? (
            <div className="viewer-scroll">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="viewer-img" src={resolved.src} alt={item.name} />
            </div>
          ) : null}

          {resolved.kind === "pdf" ? (
            <div className="viewer-frame-wrap">
              {embedCheck.status !== "blocked" ? (
                <iframe
                  className={`viewer-frame${frameStatus === "ready" ? " ready" : ""}`}
                  src={resolved.src}
                  title={item.name}
                  onLoad={() => setFrameStatus("ready")}
                />
              ) : null}

              {embedCheck.status === "blocked" ? (
                <div className="viewer-loading">
                  <div className="viewer-loading-title">Preview blocked</div>
                  <div className="viewer-loading-sub">
                    This PDF can’t be embedded inside the app. {embedCheck.reason ?? ""}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEmbedCheck({ status: "allowed" })}
                    >
                      Try preview
                    </button>
                  </div>
                </div>
              ) : frameStatus !== "ready" || embedCheck.status === "checking" ? (
                <div className="viewer-loading">
                  <div className="viewer-spinner" aria-hidden="true" />
                  <div className="viewer-loading-title">
                    {embedCheck.status === "checking" ? "Preparing preview…" : "Loading PDF…"}
                  </div>
                  {frameTimedOut ? (
                    <div className="viewer-loading-sub">Taking longer than usual.</div>
                  ) : (
                    <div className="viewer-loading-sub">
                      If it doesn’t load, try opening in a new tab.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {resolved.kind === "iframe" ? (
            <div className="viewer-frame-wrap">
              {embedCheck.status !== "blocked" ? (
                <iframe
                  className={`viewer-frame${frameStatus === "ready" ? " ready" : ""}`}
                  src={resolved.src}
                  title={item.name}
                  onLoad={() => setFrameStatus("ready")}
                />
              ) : null}

              {embedCheck.status === "blocked" ? (
                <div className="viewer-loading">
                  <div className="viewer-loading-title">Preview blocked</div>
                  <div className="viewer-loading-sub">
                    This site doesn’t allow being opened inside an in-app preview (iframe).{" "}
                    {embedCheck.reason ?? ""}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEmbedCheck({ status: "allowed" })}
                    >
                      Try preview
                    </button>
                  </div>
                </div>
              ) : frameStatus !== "ready" || embedCheck.status === "checking" ? (
                <div className="viewer-loading">
                  <div className="viewer-spinner" aria-hidden="true" />
                  <div className="viewer-loading-title">
                    {embedCheck.status === "checking" ? "Preparing preview…" : "Loading site…"}
                  </div>
                  {frameTimedOut ? (
                    <div className="viewer-loading-sub">
                      This site may block being opened inside the app.
                    </div>
                  ) : (
                    <div className="viewer-loading-sub">
                      If you see “refused to connect”, open it in a new tab.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {resolved.kind === "text" ? (
            <div className="viewer-scroll">
              {status === "loading" ? <div className="viewer-hint">Loading preview…</div> : null}
              {status === "error" ? <div className="viewer-error">{error}</div> : null}
              {status === "ready" ? (
                <pre className="viewer-pre" data-language={resolved.language ?? ""}>
                  {text}
                </pre>
              ) : null}
            </div>
          ) : null}

          {resolved.kind === "none" ? (
            <div className="viewer-scroll">
              <div className="viewer-hint">
                {cloudflareAccess ? (
                  <>
                    This site uses Cloudflare Access and can’t be opened inside the app. Use{" "}
                    <strong>New tab</strong>.
                  </>
                ) : (
                  <>
                    Preview not available for this item. Use <strong>New tab</strong>.
                  </>
                )}
              </div>
            </div>
          ) : null}

          {resolved.kind === "file" ? (
            <div className="viewer-scroll">
              <div className="viewer-hint">
                Preview isn’t supported for <strong>.{resolved.ext}</strong> files. Use{" "}
                <strong>New tab</strong> to download/open it, or export to <strong>CSV</strong> for
                in-app preview.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
