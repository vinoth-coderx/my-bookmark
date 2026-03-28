"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  error?: string;
  onCancel: () => void;
  onUnlock: (password: string) => Promise<void> | void;
};

export default function SensitiveUnlockModal({
  open,
  title = "Sensitive section",
  description = "Enter password to continue.",
  error,
  onCancel,
  onUnlock,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setIsSubmitting(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <div className="modal-sub">{description}</div>
        </div>

        <div className="modal-body">
          <label className="modal-label" htmlFor="sensitivePassword">
            Password
          </label>
          <input
            ref={inputRef}
            id="sensitivePassword"
            className="modal-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (isSubmitting) return;
              setIsSubmitting(true);
              try {
                await onUnlock(password);
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
          {error ? <div className="modal-error">{error}</div> : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (isSubmitting) return;
              setIsSubmitting(true);
              try {
                await onUnlock(password);
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={!password.trim() || isSubmitting}
          >
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
}

