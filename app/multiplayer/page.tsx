import { cookies } from "next/headers";
import UsernameModal from "@/app/components/UsernameModal";
import MatchmakingLobby from "@/app/components/MatchmakingLobby";

export default async function MultiplayerPage() {
  const cookieStore = await cookies();
  // Read auth status server-side — the JWT value never reaches client JS.
  const isAuthenticated = cookieStore.has("session");

  return (
    // `relative` scopes UsernameModal's `absolute inset-0` overlay to this
    // content area, keeping the NavBar accessible above the modal.
    <main className="relative flex flex-1 items-center justify-center bg-[#c0c0c0]">
      {/* Authenticated: show matchmaking lobby; otherwise: placeholder behind modal */}
      {isAuthenticated ? (
        <MatchmakingLobby />
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
      <UsernameModal isAuthenticated={isAuthenticated} />
    </main>
  );
}
