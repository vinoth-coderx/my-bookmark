"use client";

import { useCallback, useEffect, useState } from "react";
import ItemViewerModal from "@/components/bookmarks/ItemViewerModal";
import { getPopoutItem } from "@/components/bookmarks/itemActions";
import type { BookmarkItem } from "@/lib/bookmarks/types";

export default function ViewerPage() {
  const [item, setItem] = useState<BookmarkItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(99999);

  const close = useCallback(() => {
    try {
      window.close();
    } catch {}
    window.setTimeout(() => {
      window.location.assign("/");
    }, 50);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setMissing(true);
        return;
      }
      const popped = getPopoutItem(token);
      if (!popped) {
        setMissing(true);
        return;
      }
      setItem(popped);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  if (missing && !item) {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="modal-head">
            <div className="modal-title">Preview expired</div>
            <div className="modal-sub">Open the preview again from the bookmarks list.</div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={close}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Loading">
          <div className="modal-head">
            <div className="modal-title">Loading preview…</div>
            <div className="modal-sub">Just a moment.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ItemViewerModal
      open
      item={item}
      onClose={close}
      drawerWidth={drawerWidth}
      onDrawerWidthChange={setDrawerWidth}
    />
  );
}
