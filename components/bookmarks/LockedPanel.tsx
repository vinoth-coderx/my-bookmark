import { LockIcon } from "@/components/bookmarks/icons";

type Props = {
  title?: string;
  description?: string;
  onUnlock: () => void;
};

export default function LockedPanel({
  title = "Locked",
  description = "This section is marked as sensitive.",
  onUnlock,
}: Props) {
  return (
    <div className="locked">
      <div className="locked-ic">
        <LockIcon size={18} />
      </div>
      <div className="locked-title">{title}</div>
      <div className="locked-sub">{description}</div>
      <button type="button" className="btn btn-primary" onClick={onUnlock}>
        Unlock
      </button>
    </div>
  );
}
