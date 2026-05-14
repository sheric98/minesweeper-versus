import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BotBanner from "@/app/components/BotBanner";
import PlayerSearch from "@/app/components/PlayerSearch";
import SingleplayerStatsTable from "@/app/components/SingleplayerStatsTable";
import StatsSummary from "@/app/components/StatsSummary";
import TopOpponentsTable from "@/app/components/TopOpponentsTable";

export default async function PlayerStatsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawRouteUsername } = await params;
  const routeUsername = decodeURIComponent(rawRouteUsername);

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let authLevel: string | undefined;
  let sessionUsername: string | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel;
        if (typeof payload.sub === "string") sessionUsername = payload.sub;
      }
    } catch { /* malformed token */ }
  }

  if (authLevel !== "google") {
    redirect("/");
  }

  if (sessionUsername && sessionUsername === routeUsername) {
    redirect("/stats");
  }

  return (
    <main className="bg-[#c0c0c0] flex flex-1 flex-col items-center py-6 px-4 gap-4">
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        <PlayerSearch />
        <BotBanner username={routeUsername} />
        <SingleplayerStatsTable username={routeUsername} />
        <StatsSummary username={routeUsername} isOwnStats={false} />
        <TopOpponentsTable targetUsername={routeUsername} />
      </div>
    </main>
  );
}
