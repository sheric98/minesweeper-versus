import { cookies } from "next/headers";
import HeadToHeadTable from "@/app/components/HeadToHeadTable";
import PlayerSearch from "@/app/components/PlayerSearch";
import SignInButton from "@/app/components/SignInButton";
import SingleplayerStatsTable from "@/app/components/SingleplayerStatsTable";
import StatsSummary from "@/app/components/StatsSummary";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";

export default async function StatsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let authLevel: string | undefined;
  let username: string | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel;
        if (typeof payload.sub === "string") username = payload.sub;
      }
    } catch { /* malformed token */ }
  }

  if (authLevel !== "google") {
    return (
      <main className="bg-[#c0c0c0] flex flex-1 flex-col items-center py-6 px-4">
        <div className={`${RAISED_OUTER} bg-[#c0c0c0] w-full max-w-md`}>
          <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
            Stats
          </div>
          <div className="px-4 py-4 flex flex-col items-center gap-3">
            <p className="text-sm font-bold">Sign in to track your stats</p>
            <div className={`${SUNKEN_INNER} bg-white w-full px-4 py-3`}>
              <ul className="text-xs leading-5 list-disc pl-4">
                <li>Lifetime wins and fastest times per mode</li>
                <li>Recent win rate over your last 100 games</li>
                <li>Spots on the global leaderboards</li>
                <li>Multiplayer ELO and head-to-head records</li>
              </ul>
            </div>
            <SignInButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-[#c0c0c0] flex flex-1 flex-col items-center py-6 px-4 gap-4">
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        <PlayerSearch />
        <SingleplayerStatsTable />
        <StatsSummary username={username} />
        <HeadToHeadTable />
      </div>
    </main>
  );
}
