import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import NavBar from "@/app/components/NavBar";

export const metadata: Metadata = {
  title: "Minesweeper",
  description: "Classic Minesweeper — 30×16 board, 99 mines",
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
        <NavBar username={username} authLevel={authLevel} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
