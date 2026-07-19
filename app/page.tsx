import { cookies } from "next/headers";
import Link from "next/link";
import MinesweeperGame from "@/app/components/MinesweeperGame";

export default async function Home() {
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
    } catch { /* malformed token */ }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#c0c0c0] py-6">
      <MinesweeperGame mode="random" authLevel={authLevel} username={username} windowTitle="Minesweeper" />
      <p className="text-sm select-none">
        Race a friend in real time →{" "}
        <Link href="/multiplayer" className="font-bold underline">
          Multiplayer
        </Link>
      </p>
    </main>
  );
}
