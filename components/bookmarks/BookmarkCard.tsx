import { memo, type MouseEvent } from "react";
import { PALETTE } from "@/lib/bookmarks/palette";
import type { BookmarkItem } from "@/lib/bookmarks/types";
import { getDomain, getFaviconUrl } from "@/lib/bookmarks/utils";
import { BookmarkIcon, ExternalArrowIcon, LockIcon } from "@/components/bookmarks/icons";
import { openItemInNewTab } from "@/components/bookmarks/itemActions";

type Props = {
  item: BookmarkItem;
  paletteIndex: number;
  onView: (item: BookmarkItem) => void;
  onContextMenu?: (item: BookmarkItem, event: MouseEvent<HTMLElement>) => void;
  locked?: boolean;
  onUnlockRequest?: (item: BookmarkItem) => void;
  onUnlockIconClick?: (item: BookmarkItem) => void;
};

function BookmarkCard({
  item,
  paletteIndex,
  onView,
  onContextMenu,
  locked = false,
  onUnlockRequest,
  onUnlockIconClick,
}: Props) {
  const palette = PALETTE[paletteIndex % PALETTE.length]!;
  const domain = item.url ? getDomain(item.url) : "Inline content";
  const subtitle = item.description?.trim() || domain;
  const faviconUrl = item.url ? getFaviconUrl(item.url) : undefined;
  const onPrimaryAction = () => {
    if (locked) {
      onUnlockRequest?.(item);
      return;
    }
    onView(item);
  };

  return (
    <div
      className={`card card-link${locked ? " card-locked" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onPrimaryAction}
      onContextMenu={(event) => {
        if (locked) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onContextMenu?.(item, event);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPrimaryAction();
        }
      }}
      style={{ ["--accent" as string]: palette.fg }}
    >
      <div className="fav" style={{ background: palette.bg }}>
        {faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={(event) => {
              const svg = event.currentTarget.parentElement?.querySelector("svg");
              if (svg) svg.style.display = "none";
            }}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        <BookmarkIcon color={palette.fg} />
      </div>

      <div className="card-body">
        <div className="card-name">{item.name}</div>
        <div className="card-url">{subtitle}</div>
      </div>

      <div className="card-actions">
        {locked ? (
          <button
            type="button"
            className="card-action"
            onClick={(event) => {
              event.stopPropagation();
              onUnlockIconClick?.(item);
            }}
            aria-label={`Unlock ${item.name}`}
            title="Unlock"
          >
            <LockIcon />
          </button>
        ) : (
          <button
            type="button"
            className="card-action"
            onClick={(event) => {
              event.stopPropagation();
              openItemInNewTab(item);
            }}
            aria-label={`Open ${item.name} in new tab`}
            title="Open in new tab"
          >
            <ExternalArrowIcon color={palette.fg} />
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(BookmarkCard);
