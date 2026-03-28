import type { BookmarkFolder, BookmarkItem } from "@/lib/bookmarks/types";

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\\./, "");
  } catch {
    return url;
  }
}

export function getFaviconUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(parsed.hostname)}`;
  } catch {
    return undefined;
  }
}

export function countFolderLinks(folder: BookmarkFolder): number {
  if (folder.items?.length) return folder.items.length;
  return (
    folder.subfolders?.reduce((total, sf) => total + (sf.items?.length ?? 0), 0) ??
    0
  );
}

export function countAllLinks(folders: BookmarkFolder[]): number {
  return folders.reduce((total, folder) => total + countFolderLinks(folder), 0);
}

export function matchesNormalizedQuery(item: BookmarkItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const domain = item.url ? getDomain(item.url).toLowerCase() : "";
  return (
    item.name.toLowerCase().includes(normalizedQuery) ||
    (item.description?.toLowerCase().includes(normalizedQuery) ?? false) ||
    domain.includes(normalizedQuery)
  );
}

export function matchesQuery(item: BookmarkItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return matchesNormalizedQuery(item, normalizedQuery);
}
