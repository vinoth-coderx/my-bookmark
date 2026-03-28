import type { ReactNode } from "react";
import type { PaletteColor } from "@/lib/bookmarks/palette";
import { BookmarkIcon } from "@/components/bookmarks/icons";

type Props = {
  label: string;
  palette: PaletteColor;
  description: string;
  count: ReactNode;
  onCountClick?: () => void;
  countTitle?: string;
  countAriaLabel?: string;
};

export default function SectionHeader({
  label,
  palette,
  description,
  count,
  onCountClick,
  countTitle,
  countAriaLabel,
}: Props) {
  return (
    <div className="sec-head">
      <div className={`sec-icon ${palette.cls}`} style={{ background: palette.bg }}>
        <BookmarkIcon color={palette.fg} />
      </div>
      <div className="sec-name-wrap">
        <div className="sec-name" style={{ color: palette.fg }}>
          {label}
        </div>
        <div className="sec-desc">{description}</div>
      </div>
      {onCountClick ? (
        <button
          type="button"
          className={`sec-count ${palette.cls} sec-count-btn`}
          style={{ background: palette.bg, color: palette.fg }}
          onClick={onCountClick}
          title={countTitle}
          aria-label={countAriaLabel ?? countTitle}
        >
          {count}
        </button>
      ) : (
        <div
          className={`sec-count ${palette.cls}`}
          style={{ background: palette.bg, color: palette.fg }}
          title={countTitle}
        >
          {count}
        </div>
      )}
    </div>
  );
}
