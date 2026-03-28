import BookmarksHub from "@/components/bookmarks/BookmarksHub";
import { getBookmarksData } from "@/lib/bookmarks/server";

export default async function Home() {
  const { folders, meta } = await getBookmarksData();
  return <BookmarksHub folders={folders} meta={meta} />;
}
