export type BookmarkItemFormat =
  | "uri"
  | "pdf"
  | "image"
  | "text"
  | "code"
  | "xml"
  | "json"
  | "yaml"
  | "yml"
  | "env"
  | "md"
  | "csv"
  | "tsv"
  | "xls"
  | "xlsx"
  | "xlsm"
  | "ods"
  | "iframe";

export type BookmarkItem = {
  name: string;
  url?: string;
  description?: string;
  format?: BookmarkItemFormat;
  view?: {
    type?: "auto" | "image" | "pdf" | "text" | "code" | "iframe";
    content?: string;
    language?: string;
  };
};

export type BookmarkSubfolder = {
  label: string;
  tag: string;
  items: BookmarkItem[];
  isSensitive?: boolean;
};

export type BookmarkFolder = {
  id: string;
  label: string;
  emoji?: string;
  palette: number;
  group?: string;
  isSensitive?: boolean;
  showInAllBookmarks?: boolean;
  items?: BookmarkItem[];
  subfolders?: BookmarkSubfolder[];
};

export type BookmarksMeta = {
  brandName: string;
  tagline: string;
  creatorName: string;
  creatorInitial: string;
  defaultTheme: "light" | "dark";
  sensitivePasswordHash?: string;
};
