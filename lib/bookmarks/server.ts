import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  BookmarkFolder,
  BookmarksMeta,
  BookmarkItem,
  BookmarkItemFormat,
} from "@/lib/bookmarks/types";

const DEFAULT_META: BookmarksMeta = {
  brandName: "Bookmarks",
  tagline: "YOUR PERSONAL HUB",
  creatorName: "You",
  creatorInitial: "Y",
  defaultTheme: "light",
};

type DbFile = {
  meta?: unknown;
  folders?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

type ItemViewType = NonNullable<BookmarkItem["view"]>["type"];

function asItemViewType(value: unknown): ItemViewType {
  if (value === "auto" || value === "image" || value === "pdf" || value === "text") return value;
  if (value === "code" || value === "iframe") return value;
  return undefined;
}

const ITEM_FORMATS = new Set<BookmarkItemFormat>([
  "uri",
  "pdf",
  "image",
  "text",
  "code",
  "xml",
  "json",
  "yaml",
  "yml",
  "env",
  "md",
  "csv",
  "tsv",
  "xls",
  "xlsx",
  "xlsm",
  "ods",
  "iframe",
]);

function asItemFormat(value: unknown): BookmarkItemFormat | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return ITEM_FORMATS.has(normalized as BookmarkItemFormat)
    ? (normalized as BookmarkItemFormat)
    : undefined;
}

function asTheme(value: unknown, fallback: "light" | "dark"): "light" | "dark" {
  return value === "dark" || value === "light" ? value : fallback;
}

function normalizeMeta(meta: unknown): BookmarksMeta {
  if (!isRecord(meta)) return DEFAULT_META;

  const creatorName = asString(meta.creatorName, DEFAULT_META.creatorName);
  const creatorInitial = asString(
    meta.creatorInitial,
    creatorName.trim()[0]?.toUpperCase() ?? DEFAULT_META.creatorInitial,
  );

  return {
    brandName: asString(meta.brandName, DEFAULT_META.brandName),
    tagline: asString(meta.tagline, DEFAULT_META.tagline),
    creatorName,
    creatorInitial,
    defaultTheme: asTheme(meta.defaultTheme, DEFAULT_META.defaultTheme),
    sensitivePasswordHash: asOptionalString(meta.sensitivePasswordHash),
  };
}

function normalizeFolders(folders: unknown): BookmarkFolder[] {
  if (!Array.isArray(folders)) return [];

  return folders
    .map((folder): BookmarkFolder | null => {
      if (!isRecord(folder)) return null;
      const id = asString(folder.id, "");
      const label = asString(folder.label, "");
      if (!id || !label) return null;

      const palette =
        typeof folder.palette === "number" && Number.isFinite(folder.palette) ? folder.palette : 0;

      const emoji = asOptionalString(folder.emoji);

      const base: BookmarkFolder = {
        id,
        label,
        emoji,
        palette,
        group: asOptionalString(folder.group),
        isSensitive: asOptionalBoolean(folder.isSensitive),
        showInAllBookmarks: asOptionalBoolean(folder.showInAllBookmarks),
      };

      if (Array.isArray(folder.items)) {
        base.items = folder.items
          .map((item) => {
            if (!isRecord(item)) return null;
            const name = asString(item.name, "");
            const url = asOptionalString(item.url);
            if (!name) return null;
            const description = asOptionalString(item.description);
            const format = asItemFormat(item.format) ?? "uri";

            let view: BookmarkItem["view"] | undefined;
            if (isRecord(item.view)) {
              const type = asItemViewType(item.view.type);
              const content = asOptionalString(item.view.content);
              const language = asOptionalString(item.view.language);
              if (type || content || language) view = { type, content, language };
            }

            if (!url && !view?.content) return null;
            return { name, url, description, format, view };
          })
          .filter(isNonNull);
      }

      if (Array.isArray(folder.subfolders)) {
        base.subfolders = folder.subfolders
          .map((sf) => {
            if (!isRecord(sf)) return null;
            const sfLabel = asString(sf.label, "");
            const tag = asString(sf.tag, "");
            if (!sfLabel || !tag) return null;
            const isSensitive = asOptionalBoolean(sf.isSensitive);

            const items = Array.isArray(sf.items)
              ? sf.items
                  .map((item) => {
                    if (!isRecord(item)) return null;
                    const name = asString(item.name, "");
                    const url = asOptionalString(item.url);
                    if (!name) return null;
                    const description = asOptionalString(item.description);
                    const format = asItemFormat(item.format) ?? "uri";

                    let view: BookmarkItem["view"] | undefined;
                    if (isRecord(item.view)) {
                      const type = asItemViewType(item.view.type);
                      const content = asOptionalString(item.view.content);
                      const language = asOptionalString(item.view.language);
                      if (type || content || language) view = { type, content, language };
                    }

                    if (!url && !view?.content) return null;
                    return { name, url, description, format, view };
                  })
                  .filter(isNonNull)
              : [];

            return { label: sfLabel, tag, items, isSensitive };
          })
          .filter(isNonNull);
      }

      return base;
    })
    .filter(isNonNull);
}

async function readLocalDb(): Promise<{ meta: BookmarksMeta; folders: BookmarkFolder[] }> {
  const dbPath = path.join(process.cwd(), "data", "db.json");
  const raw = await readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw) as DbFile;
  return {
    meta: normalizeMeta(parsed.meta),
    folders: normalizeFolders(parsed.folders),
  };
}

export async function getBookmarksData(): Promise<{
  meta: BookmarksMeta;
  folders: BookmarkFolder[];
  source: "json-server" | "local-file";
}> {
  const origin = process.env.BOOKMARKS_API_ORIGIN ?? "http://localhost:4000";

  try {
    const [metaRes, foldersRes] = await Promise.all([
      fetch(`${origin}/meta`, { cache: "no-store" }),
      fetch(`${origin}/folders`, { cache: "no-store" }),
    ]);

    if (!metaRes.ok || !foldersRes.ok) throw new Error("Non-200 response from json-server");

    const [metaJson, foldersJson] = await Promise.all([metaRes.json(), foldersRes.json()]);
    return {
      meta: normalizeMeta(metaJson),
      folders: normalizeFolders(foldersJson),
      source: "json-server",
    };
  } catch {
    try {
      const local = await readLocalDb();
      return { ...local, source: "local-file" };
    } catch {
      return { meta: DEFAULT_META, folders: [], source: "local-file" };
    }
  }
}
