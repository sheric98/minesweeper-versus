import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MultiplayerGame from "@/app/components/MultiplayerGame";

interface PageProps {
  searchParams: Promise<{ matchId?: string }>;
}

export default async function MultiplayerGamePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) redirect("/multiplayer");

  const params = await searchParams;
  const matchId = params.matchId;
  if (!matchId) redirect("/multiplayer");

  // Decode username from JWT payload (same logic as layout.tsx)
  let playerName = "Player";
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (typeof payload.sub === "string") playerName = payload.sub;
    }
  } catch { /* fallback to "Player" */ }

  return (
    <main className="flex flex-1 items-center justify-center bg-[#c0c0c0]">
      <MultiplayerGame matchId={matchId} playerName={playerName} />
    </main>
  );
}
