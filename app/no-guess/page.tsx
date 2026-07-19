import { cookies } from "next/headers";
import MinesweeperGame from "@/app/components/MinesweeperGame";

export default async function NoGuess() {
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
    <main className="flex flex-1 flex-col items-center justify-center bg-[#c0c0c0] py-6">
      <MinesweeperGame
        mode="no-guess"
        authLevel={authLevel}
        username={username}
        windowTitle="Minesweeper — No Guess"
        subtitle="Every board is solvable by pure logic — no 50/50 guesses. Difficulty sets how deep the deductions go; the board is always 30×16."
      />
    </main>
  );
}
