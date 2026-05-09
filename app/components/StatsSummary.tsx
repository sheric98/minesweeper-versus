"use client";

import { useEffect, useState } from "react";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";

interface EloStats {
  rating: number;
  wins: number;
  losses: number;
}

interface LeaderboardEntry {
  username: string;
  rating: number;
  wins: number;
  losses: number;
}

interface LeaderboardResponse {
  players?: LeaderboardEntry[];
}

interface StatsSummaryProps {
  username?: string;
  isOwnStats?: boolean;
}

export default function StatsSummary({ username, isOwnStats = true }: StatsSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState<EloStats | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const statsUrl =
      isOwnStats || !username
        ? "/api/elo/me"
        : `/api/elo/player?username=${encodeURIComponent(username)}`;

    Promise.allSettled([
      fetch(statsUrl).then((r) =>
        r.ok ? (r.json() as Promise<EloStats>) : Promise.reject(new Error("stats failed")),
      ),
      fetch("/api/elo/leaderboard?limit=20").then((r) =>
        r.ok ? (r.json() as Promise<LeaderboardResponse>) : Promise.reject(new Error("leaderboard failed")),
      ),
    ]).then(([statsResult, lbResult]) => {
      if (cancelled) return;

      const statsData = statsResult.status === "fulfilled" ? statsResult.value : null;
      const lbData = lbResult.status === "fulfilled" ? lbResult.value : null;

      setStats(statsData);
      setError(!statsData);

      if (username && lbData && Array.isArray(lbData.players)) {
        const idx = lbData.players.findIndex((p) => p.username === username);
        setRank(idx === -1 ? null : idx + 1);
      } else {
        setRank(null);
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [username, isOwnStats]);

  const total = stats ? stats.wins + stats.losses : 0;
  const matchesText = loading ? "…" : error || !stats ? "—" : String(total);
  const winRateText = loading
    ? "…"
    : error || !stats
      ? "—"
      : total === 0
        ? "—"
        : `${Math.round((stats.wins / total) * 100)}%`;
  const eloText = loading ? "…" : error || !stats ? "—" : String(stats.rating);
  const rankText = loading
    ? "…"
    : rank == null
      ? "Unranked"
      : `#${rank}`;

  const titleText = isOwnStats || !username ? "Stats" : `${username} — Stats`;

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        {titleText}
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          <div className="grid grid-cols-4 gap-3">
            <StatCell label="Matches" value={matchesText} />
            <StatCell label="Win %" value={winRateText} />
            <StatCell label="ELO" value={eloText} />
            <StatCell label="Rank" value={rankText} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-[10px] uppercase text-[#808080] tracking-wider">
        {label}
      </span>
      <span className="font-mono text-xl font-bold text-center">{value}</span>
    </div>
  );
}
