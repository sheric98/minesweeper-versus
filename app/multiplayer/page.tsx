import { cookies } from "next/headers";
import UsernameModal from "@/app/components/UsernameModal";
import MatchmakingLobby from "@/app/components/MatchmakingLobby";
import EloLeaderboard from "@/app/components/EloLeaderboard";

export default async function MultiplayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: oauthError } = await searchParams;
  const cookieStore = await cookies();
  // Read auth status server-side — the JWT value never reaches client JS.
  const token = cookieStore.get("session")?.value;
  const isAuthenticated = !!token;

  // Decode username from JWT for leaderboard highlight
  let playerName: string | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        if (typeof payload.sub === "string") playerName = payload.sub;
      }
    } catch { /* ignore */ }
  }

  return (
    // `relative` scopes UsernameModal's `absolute inset-0` overlay to this
    // content area, keeping the NavBar accessible above the modal.
    <main className="relative flex flex-1 items-center justify-center bg-[#c0c0c0]">
      {/* Authenticated: show matchmaking lobby; otherwise: placeholder behind modal */}
      {isAuthenticated ? (
        <div className="flex items-start gap-6">
          <MatchmakingLobby />
          <EloLeaderboard username={playerName} />
        </div>
      ) : (
        <div
          className="bg-ms-silver p-8 text-center"
          style={{
            borderTop: "2px solid #ffffff",
            borderLeft: "2px solid #ffffff",
            borderBottom: "2px solid #808080",
            borderRight: "2px solid #808080",
          }}
        >
          <h1 className="text-2xl font-bold mb-2">Multiplayer</h1>
          <p className="text-ms-dark">Sign in to play.</p>
        </div>
      )}

      {/* Shows username prompt when unauthenticated; renders null otherwise */}
      <UsernameModal isAuthenticated={isAuthenticated} oauthError={oauthError} />
    </main>
  );
}
