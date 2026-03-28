"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import BookmarkCard from "@/components/bookmarks/BookmarkCard";
import {
  BookmarkIcon,
  CloseIcon,
  ExternalArrowIcon,
  GoTopIcon,
  LockIcon,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  StatIcon,
  SunIcon,
} from "@/components/bookmarks/icons";
import ItemViewerModal from "@/components/bookmarks/ItemViewerModal";
import SectionHeader from "@/components/bookmarks/SectionHeader";
import SensitiveUnlockModal from "@/components/bookmarks/SensitiveUnlockModal";
import { PALETTE, type PaletteColor } from "@/lib/bookmarks/palette";
import { isPreviewable } from "@/components/bookmarks/itemPreview";
import type {
  BookmarkFolder,
  BookmarkItem,
  BookmarkSubfolder,
  BookmarksMeta,
} from "@/lib/bookmarks/types";
import {
  countAllLinks,
  countFolderLinks,
  matchesNormalizedQuery,
} from "@/lib/bookmarks/utils";
import { verifyPassword } from "@/lib/bookmarks/password";
import { openItemInNewTab } from "@/components/bookmarks/itemActions";

type Props = {
  folders: BookmarkFolder[];
  meta: BookmarksMeta;
};

const THEME_STORAGE_KEY = "bookmarks:theme";
const THEME_COOKIE_KEY = "bookmarks_theme";
const VIEWER_WIDTH_STORAGE_KEY = "bookmarks:viewerWidth";
const SENSITIVE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_SENSITIVE_PASSWORD_HASH =
  "sha256:925b0be382ade40cd89eeaee88d7367e2e513e430d17a105d1bc6ac68d537f4c";

type PendingUnlock = {
  folderId: string;
  action?: {
    kind: "view" | "new-tab";
    item: BookmarkItem;
  };
};

type ItemMenuState = {
  x: number;
  y: number;
  item: BookmarkItem;
};

type FlatSection = {
  kind: "flat";
  key: string;
  index: number;
  folder: BookmarkFolder;
  palette: PaletteColor;
  items: BookmarkItem[];
  count: number;
};

type SubfoldersSection = {
  kind: "subfolders";
  key: string;
  index: number;
  folder: BookmarkFolder;
  palette: PaletteColor;
  subfolders: BookmarkSubfolder[];
  count: number;
};

type Section = FlatSection | SubfoldersSection;

function isSection(value: Section | null): value is Section {
  return value !== null;
}

export default function BookmarksHub({ folders, meta }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGoTop, setShowGoTop] = useState(false);
  const [unlockedFolderIds, setUnlockedFolderIds] = useState(() => new Set<string>());
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockError, setUnlockError] = useState<string | undefined>(undefined);
  const [pendingUnlock, setPendingUnlock] = useState<PendingUnlock | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<BookmarkItem | null>(null);
  const [viewerWidth, setViewerWidth] = useState(() => {
    if (typeof window === "undefined") return 1180;
    const raw = window.localStorage.getItem(VIEWER_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= 420) return parsed;
    return 1180;
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [itemMenu, setItemMenu] = useState<ItemMenuState | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sensitiveIdleTimerRef = useRef<number | null>(null);
  const hasSensitiveUnlockRef = useRef(false);

  const closeItemMenu = useCallback(() => setItemMenu(null), []);

  const onViewItem = useCallback(
    (item: BookmarkItem) => {
      closeItemMenu();
      if (!isPreviewable(item)) {
        openItemInNewTab(item);
        return;
      }
      setViewerItem(item);
      setViewerOpen(true);
    },
    [closeItemMenu],
  );

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setViewerItem(null);
  }, []);

  const onViewerWidthChange = useCallback((width: number) => {
    setViewerWidth(width);
    try {
      window.localStorage.setItem(VIEWER_WIDTH_STORAGE_KEY, String(Math.round(width)));
    } catch { }
  }, []);

  const stopSensitiveIdleTimer = useCallback(() => {
    const timer = sensitiveIdleTimerRef.current;
    if (timer === null) return;
    window.clearTimeout(timer);
    sensitiveIdleTimerRef.current = null;
  }, []);

  const lockSensitiveSession = useCallback(() => {
    setUnlockedFolderIds((prev) => (prev.size ? new Set() : prev));
    closeViewer();
  }, [closeViewer]);

  const armSensitiveIdleTimer = useCallback(() => {
    stopSensitiveIdleTimer();
    sensitiveIdleTimerRef.current = window.setTimeout(() => {
      lockSensitiveSession();
    }, SENSITIVE_IDLE_TIMEOUT_MS);
  }, [lockSensitiveSession, stopSensitiveIdleTimer]);

  const markSensitiveActivity = useCallback(() => {
    if (!hasSensitiveUnlockRef.current) return;
    armSensitiveIdleTimer();
  }, [armSensitiveIdleTimer]);

  const onItemContextMenu = useCallback(
    (item: BookmarkItem, event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      markSensitiveActivity();

      const menuWidth = 208;
      const menuHeight = 44;
      const padding = 12;

      const maxX = window.innerWidth - menuWidth - padding;
      const maxY = window.innerHeight - menuHeight - padding;

      const x = Math.min(Math.max(event.clientX, padding), Math.max(padding, maxX));
      const y = Math.min(Math.max(event.clientY, padding), Math.max(padding, maxY));
      setItemMenu({ x, y, item });
    },
    [markSensitiveActivity],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const fromDom = document.documentElement.getAttribute("data-theme");
    const initial = (() => {
      if (stored === "light" || stored === "dark") return stored;
      if (fromDom === "light" || fromDom === "dark") return fromDom;
      return meta.defaultTheme ?? "light";
    })();
    document.documentElement.setAttribute("data-theme", initial);
    window.localStorage.setItem(THEME_STORAGE_KEY, initial);
    document.cookie = `${THEME_COOKIE_KEY}=${initial}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [meta.defaultTheme]);

  const toggleTheme = () => {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    document.cookie = `${THEME_COOKIE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      markSensitiveActivity();
      if (e.key === "Escape" && itemMenu) {
        closeItemMenu();
        return;
      }
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        setSearchQuery("");
        (activeEl as HTMLElement | null)?.blur?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeItemMenu, itemMenu, markSensitiveActivity]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onScroll = () => {
      markSensitiveActivity();
      setShowGoTop(el.scrollTop > 300);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => el.removeEventListener("scroll", onScroll);
  }, [markSensitiveActivity]);

  useEffect(() => {
    const active = unlockedFolderIds.size > 0;
    hasSensitiveUnlockRef.current = active;
    if (!active) stopSensitiveIdleTimer();
  }, [stopSensitiveIdleTimer, unlockedFolderIds]);

  useEffect(() => {
    const onPointerActivity = () => markSensitiveActivity();
    window.addEventListener("pointerdown", onPointerActivity, { passive: true });
    window.addEventListener("pointermove", onPointerActivity, { passive: true });
    window.addEventListener("touchstart", onPointerActivity, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerActivity);
      window.removeEventListener("pointermove", onPointerActivity);
      window.removeEventListener("touchstart", onPointerActivity);
    };
  }, [markSensitiveActivity]);

  const foldersById = useMemo(
    () => new Map<string, BookmarkFolder>(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

  const foldersForAllBookmarks = useMemo(
    () => folders.filter((folder) => folder.showInAllBookmarks !== false),
    [folders],
  );

  const folderGroups = useMemo(() => {
    const groups: { label: string; folders: BookmarkFolder[] }[] = [];
    const byLabel = new Map<string, BookmarkFolder[]>();
    for (const folder of folders) {
      const label = folder.group?.trim() || "Bookmarks";
      let list = byLabel.get(label);
      if (!list) {
        list = [];
        byLabel.set(label, list);
        groups.push({ label, folders: list });
      }
      list.push(folder);
    }
    return groups;
  }, [folders]);

  const folderCountsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const folder of folders) map.set(folder.id, countFolderLinks(folder));
    return map;
  }, [folders]);

  const scrollContentToTop = () => contentRef.current?.scrollTo({ top: 0 });

  const unlockFolder = (folderId: string) => {
    setUnlockedFolderIds((prev) => {
      const next = new Set(prev);
      next.add(folderId);
      return next;
    });
  };

  const navigateTo = (folderId: string | null) => {
    closeItemMenu();
    if (viewerOpen && unlockedFolderIds.size) closeViewer();
    if (mobileSidebarOpen) setMobileSidebarOpen(false);
    if (folderId === activeId) {
      scrollContentToTop();
      return;
    }

    setUnlockedFolderIds((prev) => {
      if (folderId && prev.has(folderId)) return new Set([folderId]);
      return new Set();
    });
    setActiveId(folderId);
    scrollContentToTop();
  };

  const requestSensitiveUnlock = (
    folderId: string,
    action?: PendingUnlock["action"],
  ) => {
    setUnlockError(undefined);
    setPendingUnlock({ folderId, action });
    setUnlockModalOpen(true);
  };

  const onSensitiveUnlock = async (password: string) => {
    const pending = pendingUnlock;
    if (!pending) return;

    try {
      const hash = meta.sensitivePasswordHash ?? DEFAULT_SENSITIVE_PASSWORD_HASH;
      const ok = await verifyPassword(password, hash);
      if (!ok) {
        setUnlockError("Incorrect password.");
        return;
      }
    } catch {
      setUnlockError("Password verification failed in this browser.");
      return;
    }

    unlockFolder(pending.folderId);
    armSensitiveIdleTimer();
    setUnlockModalOpen(false);
    setPendingUnlock(null);

    if (pending.action?.kind === "view") {
      onViewItem(pending.action.item);
      return;
    }

    if (pending.action?.kind === "new-tab") {
      openItemInNewTab(pending.action.item);
    }
  };

  const totals = useMemo(() => {
    const totalLinks = countAllLinks(foldersForAllBookmarks);
    const totalSubfolders = foldersForAllBookmarks.reduce(
      (total, folder) => total + (folder.subfolders?.length ?? 0),
      0,
    );
    const directFolders = foldersForAllBookmarks.filter((folder) => Array.isArray(folder.items))
      .length;
    const visibleCategories = foldersForAllBookmarks.length;

    return { totalLinks, totalSubfolders, directFolders, visibleCategories };
  }, [foldersForAllBookmarks]);

  const displayed = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const toShow = activeId
      ? folders.filter((folder) => folder.id === activeId)
      : foldersForAllBookmarks;

    const sections: Section[] = toShow
      .map((folder, index) => {
        const palette = PALETTE[folder.palette % PALETTE.length]!;

        if (Array.isArray(folder.items)) {
          const items = folder.items.filter((item) => matchesNormalizedQuery(item, query));
          if (query && items.length === 0) return null;
          const section: FlatSection = {
            kind: "flat" as const,
            key: folder.id,
            index,
            folder,
            palette,
            items,
            count: items.length,
          };
          return section;
        }

        if (Array.isArray(folder.subfolders)) {
          const subfolders: BookmarkSubfolder[] = folder.subfolders
            .map((sf) => ({
              ...sf,
              items: sf.items.filter((item) => matchesNormalizedQuery(item, query)),
            }))
            .filter((sf) => (query ? sf.items.length > 0 : true));

          const count = subfolders.reduce((total, sf) => total + sf.items.length, 0);
          if (query && count === 0) return null;

          const section: SubfoldersSection = {
            kind: "subfolders" as const,
            key: folder.id,
            index,
            folder,
            palette,
            subfolders,
            count,
          };
          return section;
        }

        return null;
      })
      .filter(isSection);

    const visibleCount = sections.reduce((total, section) => total + section.count, 0);
    return { query, sections, visibleCount };
  }, [activeId, folders, foldersForAllBookmarks, searchQuery]);

  const activeFolder = activeId ? foldersById.get(activeId) : undefined;
  const activeFolderCount = activeFolder ? (folderCountsById.get(activeFolder.id) ?? 0) : 0;
  const activeFolderLocked =
    !!activeFolder?.isSensitive && !unlockedFolderIds.has(activeFolder.id);

  const title = activeFolder
    ? `${activeFolder.label}`
    : displayed.query
      ? `Search: \"${displayed.query}\"`
      : "All Bookmarks";

  const subtitle = activeFolder
    ? activeFolderLocked
      ? `${activeFolderCount} bookmarks · sensitive section`
      : `${activeFolderCount} bookmarks · click to preview`
    : displayed.query
      ? `${displayed.visibleCount} result${displayed.visibleCount === 1 ? "" : "s"} found`
      : `${totals.totalLinks} bookmarks across ${totals.visibleCategories} categories · click to preview`;

  return (
    <div className="app-shell">
      {mobileSidebarOpen ? (
        <div
          className="sidebar-backdrop"
          role="presentation"
          onMouseDown={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <aside id="sidebar" className={`sidebar${mobileSidebarOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-row">
            <div className="brand-gem">
              <BookmarkIcon />
            </div>
            <div>
              <div className="brand-name">{meta.brandName}</div>
              <div className="brand-tagline">{meta.tagline}</div>
            </div>
          </div>

          <div className="search-wrap">
            <SearchIcon />
            <input
              ref={searchRef}
              id="searchInput"
              type="text"
              placeholder="Search bookmarks…"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
            />
          </div>
        </div>

        <nav className="sb-nav" aria-label="Categories">
          <div className="nav-label">Overview</div>
          <button
            type="button"
            className={`nav-item${!activeId ? " on" : ""}`}
            onClick={() => navigateTo(null)}
          >
            <span className="nav-dot" style={{ background: PALETTE[0].fg }} />
            <span className="nav-txt">All Bookmarks</span>
            <span className="nav-badge">{totals.totalLinks}</span>
          </button>

          {folderGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.folders.map((folder) => {
                const palette = PALETTE[folder.palette % PALETTE.length]!;
                const isOn = activeId === folder.id;
                const isLocked = !!folder.isSensitive && !unlockedFolderIds.has(folder.id);
                const badge = isLocked ? <LockIcon size={12} /> : (folderCountsById.get(folder.id) ?? 0);

                return (
                  <button
                    key={folder.id}
                    type="button"
                    className={`nav-item${isOn ? " on" : ""}`}
                    onClick={() => {
                      navigateTo(folder.id);
                    }}
                    title={isLocked ? "Sensitive section" : undefined}
                  >
                    <span className="nav-dot" style={{ background: palette.fg }} />
                    <span className="nav-txt">{folder.label}</span>
                    <span className="nav-badge">{badge}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-footer">
          <div className="creator-card">
            <div className="creator-avatar">{meta.creatorInitial}</div>
            <div className="creator-info">
              <div className="creator-by">Created by</div>
              <div className="creator-name">{meta.creatorName}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button
            type="button"
            className="sb-toggle"
            onClick={() => setMobileSidebarOpen((prev) => !prev)}
            aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileSidebarOpen}
            aria-controls="sidebar"
            title={mobileSidebarOpen ? "Close menu" : "Menu"}
          >
            {mobileSidebarOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <div className="tb-info">
            <div className="tb-title">{title}</div>
            <div className="tb-sub">{subtitle}</div>
          </div>
          <div className="sp" />
          <div className="stat-pill" aria-live="polite">
            <StatIcon />
            <span>{displayed.visibleCount}</span> links
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <span className="theme-ic theme-ic-moon">
              <MoonIcon />
            </span>
            <span className="theme-ic theme-ic-sun">
              <SunIcon />
            </span>
          </button>
        </div>

        <div ref={contentRef} className="content" id="mainContent">
          {!activeId && !displayed.query ? (
            <div className="summary-bar">
              {[
                { label: "Total Links", value: totals.totalLinks },
                { label: "Categories", value: totals.visibleCategories },
                { label: "Sub-folders", value: totals.totalSubfolders },
                { label: "Direct Folders", value: totals.directFolders },
              ].map(({ label, value }) => (
                <div key={label} className="summary-card">
                  <div className="s-num">{value}</div>
                  <div className="s-lbl">{label}</div>
                </div>
              ))}
            </div>
          ) : null}

          {displayed.sections.length ? (
            displayed.sections.map((section) => {
              const { folder, palette } = section;
              const folderLocked = !!folder.isSensitive && !unlockedFolderIds.has(folder.id);

              if (section.kind === "flat") {
                const sectionCount = folderLocked ? <LockIcon size={12} /> : section.count;
                return (
                  <div
                    key={section.key}
                    className="section"
                    style={{ animationDelay: `${section.index * 20}ms` }}
                  >
                    <SectionHeader
                      label={folder.label}
                      palette={palette}
                      description={
                        folderLocked
                          ? "Sensitive · click a lock to unlock"
                          : `${section.count} bookmark${section.count === 1 ? "" : "s"}`
                      }
                      count={sectionCount}
                      onCountClick={
                        folderLocked ? () => requestSensitiveUnlock(folder.id) : undefined
                      }
                      countTitle={folderLocked ? "Unlock (sensitive)" : undefined}
                      countAriaLabel={folderLocked ? `Unlock ${folder.label}` : undefined}
                    />
                    <div className="grid">
                      {section.items.map((item, itemIndex) => (
                        <BookmarkCard
                          key={`${folder.id}:${item.url ?? item.name}:${itemIndex}`}
                          item={item}
                          paletteIndex={folder.palette}
                          onView={onViewItem}
                          onContextMenu={onItemContextMenu}
                          locked={folderLocked}
                          onUnlockRequest={(lockedItem) =>
                            requestSensitiveUnlock(folder.id, {
                              kind: "view",
                              item: lockedItem,
                            })
                          }
                          onUnlockIconClick={() => requestSensitiveUnlock(folder.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={section.key}
                  className="section"
                  style={{ animationDelay: `${section.index * 20}ms` }}
                >
                  <SectionHeader
                    label={folder.label}
                    palette={palette}
                    description={
                      folderLocked
                        ? "Sensitive · click a lock to unlock"
                        : `${section.count} bookmarks across ${section.subfolders.length} sub-folders`
                    }
                    count={folderLocked ? <LockIcon size={12} /> : section.count}
                    onCountClick={
                      folderLocked ? () => requestSensitiveUnlock(folder.id) : undefined
                    }
                    countTitle={folderLocked ? "Unlock (sensitive)" : undefined}
                    countAriaLabel={folderLocked ? `Unlock ${folder.label}` : undefined}
                  />

                  {section.subfolders.map((sf) => {
                    const subfolderLocked =
                      folderLocked || (!!sf.isSensitive && !unlockedFolderIds.has(folder.id));
                    const countEl = subfolderLocked ? (
                      <button
                        type="button"
                        className="sf-n sf-n-btn"
                        onClick={() => requestSensitiveUnlock(folder.id)}
                        title="Unlock (sensitive)"
                        aria-label={`Unlock ${folder.label} / ${sf.label}`}
                      >
                        <LockIcon size={12} />
                      </button>
                    ) : (
                      <span className="sf-n">{sf.items.length}</span>
                    );

                    return (
                      <div key={`${folder.id}:${sf.tag}`} className="subfolder">
                        <div className="sf-strip">
                          <span
                            className="sf-pill"
                            style={{ background: palette.bg, color: palette.fg }}
                          >
                            {sf.tag}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink3)" }}>
                            {sf.label}
                          </span>
                          <div className="sf-line" />
                          {countEl}
                        </div>

                        <div className="grid">
                          {sf.items.map((item, itemIndex) => (
                            <BookmarkCard
                              key={`${folder.id}:${sf.tag}:${item.url ?? item.name}:${itemIndex}`}
                              item={item}
                              paletteIndex={folder.palette}
                              onView={onViewItem}
                              onContextMenu={onItemContextMenu}
                              locked={subfolderLocked}
                              onUnlockRequest={(lockedItem) =>
                                requestSensitiveUnlock(folder.id, {
                                  kind: "view",
                                  item: lockedItem,
                                })
                              }
                              onUnlockIconClick={() => requestSensitiveUnlock(folder.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div className="empty">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <div>
                No results for <strong>&quot;{displayed.query}&quot;</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {itemMenu ? (
        <div
          className="ctx-backdrop"
          role="presentation"
          onMouseDown={closeItemMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeItemMenu();
          }}
        >
          <div
            className="ctx-menu"
            role="menu"
            style={{ left: itemMenu.x, top: itemMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ctx-item"
              role="menuitem"
              onClick={() => {
                openItemInNewTab(itemMenu.item);
                closeItemMenu();
              }}
            >
              <ExternalArrowIcon color="currentColor" />
              Open in new tab
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`go-top${showGoTop ? " visible" : ""}`}
        onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        title="Back to top"
        aria-label="Go to top"
      >
        <GoTopIcon />
      </button>

      <SensitiveUnlockModal
        open={unlockModalOpen}
        title={
          pendingUnlock
            ? `${foldersById.get(pendingUnlock.folderId)?.label ?? "Sensitive section"}`
            : undefined
        }
        description="Enter password to unlock."
        error={unlockError}
        onCancel={() => {
          setUnlockModalOpen(false);
          setPendingUnlock(null);
          setUnlockError(undefined);
        }}
        onUnlock={onSensitiveUnlock}
      />

      <ItemViewerModal
        key={viewerItem ? `${viewerItem.url ?? "inline"}|${viewerItem.name}` : "viewer-closed"}
        open={viewerOpen}
        item={viewerItem}
        onClose={closeViewer}
        drawerWidth={viewerWidth}
        onDrawerWidthChange={onViewerWidthChange}
      />
    </div>
  );
}
