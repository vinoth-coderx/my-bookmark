import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookmarks Hub",
  description: "Your personal hub of bookmarks.",
};

function asTheme(value: string | undefined): "light" | "dark" | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme = asTheme(cookieStore.get("bookmarks_theme")?.value) ?? "light";

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
