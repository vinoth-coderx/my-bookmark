# Bookmarks Hub (Next.js + JSON Server)

## Getting started

```bash
npm run dev
```

- Web app: `http://localhost:3000`
- JSON Server API: `http://localhost:4000`

## Data-driven bookmarks

All bookmarks live in `data/db.json`.

- Add/edit categories + links by changing only `data/db.json` (UI code stays the same).
- If the API isn’t running, the app falls back to reading `data/db.json` directly (refresh the page).

### Categories, projects, groups

Each entry in `folders` supports:

- `group` (string): sidebar group label (e.g. `Bookmarks`, `Drivers`, `KT Sessions`, `Envs`)
- `items`: flat list of links
- `subfolders`: project-wise lists of links

### Sensitive sections (password-gated)

Add `isSensitive: true` on a folder or a subfolder to require a password.

- Set password hash in `meta.sensitivePasswordHash` (format: `sha256:<hex>`)
- Unlock is in-memory only (not persisted). If you switch to another category and come back, you’ll be prompted again.
- If you’re inactive for 5 minutes, it auto-locks and asks again.

### Viewing files (PDF/images/XML/text)

Each bookmark item supports optional preview metadata:

- `url` (string): link/file URL (optional if `view.content` is provided)
- `description` (string)
- `view` (object): `{ type?: "auto"|"image"|"pdf"|"text"|"code"|"iframe", content?: string, language?: string }`

If the link is previewable (by URL extension like `pdf/png/jpg/xml/json/csv/tsv`) or a Google Drive file/doc link, the UI automatically shows **View** + **New tab** buttons. Otherwise the whole card opens in a new tab.

Use `view` only when you need overrides:

- `view.content` for inline text (no hosting needed)
- `view.type` to force a preview mode (e.g. `"iframe"` for embedded pages)
- `xls/xlsx` shows a download hint (use **New tab**), or export to CSV/TSV for in-app preview

## Useful scripts

- `npm run dev:web` – run Next.js only
- `npm run dev:api` – run JSON Server only

## Config

- `BOOKMARKS_API_ORIGIN` (optional): defaults to `http://localhost:4000`
# my-bookmarks
