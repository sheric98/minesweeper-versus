import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import NavBar from "@/app/components/NavBar";
import { ControlsProvider } from "@/app/components/ControlsProvider";

// Same env var the OAuth callback uses for redirects; localhost fallback
// keeps `next build` working without it. og/twitter images come from
// app/opengraph-image.tsx and app/twitter-image.tsx automatically.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Minesweeper — Solo, No-Guess & Multiplayer Races",
  description:
    "Classic Minesweeper — 30×16 board, 99 mines. Play solo, race friends in real-time multiplayer, and climb the leaderboards.",
  openGraph: {
    title: "Minesweeper — Solo, No-Guess & Multiplayer Races",
    description:
      "Classic Minesweeper — 30×16 board, 99 mines. Play solo, race friends in real-time multiplayer, and climb the leaderboards.",
    url: "/",
    siteName: "Minesweeper",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Minesweeper — Solo, No-Guess & Multiplayer Races",
    description:
      "Classic Minesweeper — 30×16 board, 99 mines. Play solo, race friends in real-time multiplayer, and climb the leaderboards.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  let username: string | undefined;
  let authLevel: "anonymous" | "google" | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        if (typeof payload.sub === "string") username = payload.sub;
        authLevel = payload.authLevel === "google" ? "google" : "anonymous";
      }
    } catch { /* malformed token — render nothing */ }
  }

  return (
    <html lang="en">
      <body
        className="antialiased flex flex-col min-h-screen"
      >
        <ControlsProvider authLevel={authLevel}>
          <NavBar username={username} authLevel={authLevel} />
          {children}
        </ControlsProvider>
        <Analytics />
      </body>
    </html>
  );
}
