"use client";

import { useEffect, useState } from "react";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";

interface EloMe {
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
}

export default function StatsSummary({ username }: StatsSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<EloMe | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/elo/me").then((r) =>
        r.ok ? (r.json() as Promise<EloMe>) : Promise.reject(new Error("elo/me failed")),
      ),
      fetch("/api/elo/leaderboard?limit=20").then((r) =>
        r.ok ? (r.json() as Promise<LeaderboardResponse>) : Promise.reject(new Error("leaderboard failed")),
      ),
    ])
      .then(([meData, lbData]) => {
        if (cancelled) return;
        setMe(meData);
        if (username && Array.isArray(lbData.players)) {
          const idx = lbData.players.findIndex((p) => p.username === username);
          setRank(idx === -1 ? null : idx + 1);
        } else {
          setRank(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const total = me ? me.wins + me.losses : 0;
  const matchesText = loading ? "…" : error || !me ? "—" : String(total);
  const winRateText = loading
    ? "…"
    : error || !me
      ? "—"
      : total === 0
        ? "—"
        : `${Math.round((me.wins / total) * 100)}%`;
  const eloText = loading ? "…" : error || !me ? "—" : String(me.rating);
  const rankText = loading
    ? "…"
    : error
      ? "—"
      : rank == null
        ? "Unranked"
        : `#${rank}`;

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Stats
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
      <span className="font-mono text-xl font-bold">{value}</span>
    </div>
  );
}
