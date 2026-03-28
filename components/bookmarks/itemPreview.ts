import type { BookmarkItem } from "@/lib/bookmarks/types";

export type ItemPreview =
  | { kind: "image"; src: string }
  | { kind: "pdf"; src: string }
  | { kind: "iframe"; src: string }
  | { kind: "text"; src?: string; inlineText?: string; language?: string }
  | { kind: "file"; src: string; ext: string }
  | { kind: "none" };

function getExtension(url: string): string | undefined {
  const base = url.split("#")[0]?.split("?")[0] ?? url;
  const file = base.split("/").pop();
  if (!file) return undefined;
  const dot = file.lastIndexOf(".");
  if (dot <= 0 || dot === file.length - 1) return undefined;
  return file.slice(dot + 1).toLowerCase();
}

function getGooglePreviewUrl(url: string): string | undefined {
  const driveFileMatch = url.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch?.[1]) return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;

  const driveOpenMatch = url.match(/https?:\/\/drive\.google\.com\/open\?id=([^&]+)/i);
  if (driveOpenMatch?.[1]) return `https://drive.google.com/file/d/${driveOpenMatch[1]}/preview`;

  const docsMatch = url.match(/https?:\/\/docs\.google\.com\/document\/d\/([^/]+)/i);
  if (docsMatch?.[1]) return `https://docs.google.com/document/d/${docsMatch[1]}/preview`;

  const sheetsMatch = url.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (sheetsMatch?.[1]) return `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/preview`;

  const slidesMatch = url.match(/https?:\/\/docs\.google\.com\/presentation\/d\/([^/]+)/i);
  if (slidesMatch?.[1]) return `https://docs.google.com/presentation/d/${slidesMatch[1]}/preview`;

  return undefined;
}

export function resolveItemPreview(item: BookmarkItem): ItemPreview {
  const inlineText = item.view?.content;
  if (inlineText) return { kind: "text", inlineText, language: item.view?.language };

  const viewType = item.view?.type;
  if (viewType && viewType !== "auto") {
    if (!item.url) return { kind: "none" };
    if (viewType === "image") return { kind: "image", src: item.url };
    if (viewType === "pdf") return { kind: "pdf", src: item.url };
    if (viewType === "iframe") return { kind: "iframe", src: item.url };
    return { kind: "text", src: item.url, language: item.view?.language };
  }

  if (!item.url) return { kind: "none" };

  const googlePreview = getGooglePreviewUrl(item.url);
  if (googlePreview) return { kind: "iframe", src: googlePreview };

  const format = item.format?.trim().toLowerCase();
  if (format && format !== "uri") {
    if (format === "image") return { kind: "image", src: item.url };
    if (format === "pdf") return { kind: "pdf", src: item.url };
    if (format === "iframe") return { kind: "iframe", src: item.url };
    if (["xls", "xlsx", "xlsm", "ods"].includes(format)) {
      return { kind: "file", src: item.url, ext: format };
    }

    const language =
      item.view?.language ??
      (format === "text" || format === "uri" ? undefined : format);
    return { kind: "text", src: item.url, language };
  }

  const ext = getExtension(item.url);
  if (ext) {
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
      return { kind: "image", src: item.url };
    }
    if (ext === "pdf") return { kind: "pdf", src: item.url };
    if (["txt", "log", "xml", "json", "yaml", "yml", "env", "md", "csv", "tsv"].includes(ext)) {
      return { kind: "text", src: item.url, language: ext };
    }
    if (["xls", "xlsx", "xlsm", "ods"].includes(ext)) return { kind: "file", src: item.url, ext };
  }

  try {
    const parsed = new URL(item.url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith("cloudflareaccess.com")) return { kind: "none" };

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { kind: "iframe", src: item.url };
    }
  } catch {}

  return { kind: "none" };
}

export function isPreviewable(item: BookmarkItem): boolean {
  const kind = resolveItemPreview(item).kind;
  return kind !== "none" && kind !== "file";
}
