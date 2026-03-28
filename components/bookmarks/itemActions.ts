import type { BookmarkItem } from "@/lib/bookmarks/types";

type PopoutPayload = {
  createdAt: number;
  item: BookmarkItem;
};

const POPOUT_PREFIX = "bookmarks:popout:";
const POPOUT_TTL_MS = 2 * 60 * 1000;

function languageToMime(language?: string): string {
  const normalized = language?.trim().toLowerCase();
  if (normalized === "xml") return "application/xml";
  if (normalized === "json") return "application/json";
  return "text/plain";
}

export function openUrlInNewTab(url: string) {
  if (typeof window === "undefined") return;
  const w = window.open(url, "_blank", "noopener");
  if (w) w.opener = null;
}

function newPopoutToken(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function cleanupExpiredPopouts() {
  if (typeof window === "undefined") return;

  const now = Date.now();
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(POPOUT_PREFIX)) continue;
      keys.push(key);
    }

    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        window.localStorage.removeItem(key);
        continue;
      }
      try {
        const payload = JSON.parse(raw) as Partial<PopoutPayload>;
        const createdAt = typeof payload.createdAt === "number" ? payload.createdAt : 0;
        if (!createdAt || now - createdAt > POPOUT_TTL_MS) window.localStorage.removeItem(key);
      } catch {
        window.localStorage.removeItem(key);
      }
    }
  } catch {}
}

export function openItemPreviewInNewTab(item: BookmarkItem) {
  if (typeof window === "undefined") return;
  cleanupExpiredPopouts();

  const token = newPopoutToken();
  const key = `${POPOUT_PREFIX}${token}`;
  const payload: PopoutPayload = { createdAt: Date.now(), item };

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore localStorage failures; fall back to opening the original URL.
    openItemInNewTab(item);
    return;
  }

  openUrlInNewTab(`/viewer?token=${encodeURIComponent(token)}`);
}

export function getPopoutItem(token: string): BookmarkItem | null {
  if (typeof window === "undefined") return null;
  cleanupExpiredPopouts();

  try {
    const raw = window.localStorage.getItem(`${POPOUT_PREFIX}${token}`);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<PopoutPayload>;
    const createdAt = typeof payload.createdAt === "number" ? payload.createdAt : 0;
    if (!createdAt || Date.now() - createdAt > POPOUT_TTL_MS) return null;
    if (!payload.item || typeof payload.item !== "object") return null;
    return payload.item as BookmarkItem;
  } catch {
    return null;
  }
}

export function openItemInNewTab(item: BookmarkItem) {
  if (typeof window === "undefined") return;

  if (item.url) {
    openUrlInNewTab(item.url);
    return;
  }

  const content = item.view?.content;
  if (!content) return;

  const mime = languageToMime(item.view?.language);
  const blob = new Blob([content], { type: mime });
  const blobUrl = URL.createObjectURL(blob);

  const w = window.open(blobUrl, "_blank", "noopener");
  if (w) w.opener = null;

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}
