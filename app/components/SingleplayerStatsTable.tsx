"use client";

import { useEffect, useState } from "react";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";
import { formatSecondsAsMmSs } from "@/app/lib/format-time";

interface Category {
  mode: string;
  difficulty: string;
  total_wins: number;
  fastest_win_seconds: number | null;
  recent_count: number;
  recent_wins: number;
  recent_avg_win_seconds: number | null;
}

interface StatsResponse {
  categories: Category[];
}

const DISPLAY_LABELS: Record<string, string> = {
  "random|standard": "Standard",
  "no-guess|beginner": "No-guess Beginner",
  "no-guess|intermediate": "No-guess Intermediate",
  "no-guess|advanced": "No-guess Advanced",
  "no-guess|expert": "No-guess Expert",
};

const ORDERED_KEYS = [
  "random|standard",
  "no-guess|beginner",
  "no-guess|intermediate",
  "no-guess|advanced",
  "no-guess|expert",
];

function categoryKey(c: Pick<Category, "mode" | "difficulty">): string {
  return `${c.mode}|${c.difficulty}`;
}

function winRateText(c: Category): string {
  if (c.recent_count === 0) return "—";
  const pct = Math.round((c.recent_wins / c.recent_count) * 100);
  return `${pct}%`;
}

function windowSubtext(c: Category): string {
  if (c.recent_count === 0) return "";
  return `(last ${c.recent_count})`;
}

export default function SingleplayerStatsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<Category[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch("/api/singleplayer/stats/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : Promise.reject(new Error("stats failed"))))
      .then((d) => {
        if (cancelled) return;
        setData(d.categories || []);
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
  }, [reloadKey]);

  // Order categories canonically; fill missing with zeroed rows.
  const byKey = new Map(data.map((c) => [categoryKey(c), c]));
  const orderedCategories: Category[] = ORDERED_KEYS.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const [mode, difficulty] = key.split("|");
    return {
      mode,
      difficulty,
      total_wins: 0,
      fastest_win_seconds: null,
      recent_count: 0,
      recent_wins: 0,
      recent_avg_win_seconds: null,
    };
  });

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Single-player
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          {error && (
            <div className="flex items-center justify-between mb-2 text-sm text-red-700">
              <span>Couldn&apos;t load stats.</span>
              <button
                type="button"
                className="font-mono text-xs underline cursor-pointer"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Retry
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono border-collapse">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[#808080] tracking-wider">
                  <th className="px-2 py-1">Category</th>
                  <th className="px-2 py-1 text-right">Total wins</th>
                  <th className="px-2 py-1 text-right">Fastest</th>
                  <th className="px-2 py-1 text-right">Win rate</th>
                  <th className="px-2 py-1 text-right">Avg win time</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? ORDERED_KEYS.map((key) => (
                      <tr key={key} className="border-t border-[#dcdcdc]">
                        <td className="px-2 py-1.5">{DISPLAY_LABELS[key]}</td>
                        <td className="px-2 py-1.5 text-right text-[#808080]">…</td>
                        <td className="px-2 py-1.5 text-right text-[#808080]">…</td>
                        <td className="px-2 py-1.5 text-right text-[#808080]">…</td>
                        <td className="px-2 py-1.5 text-right text-[#808080]">…</td>
                      </tr>
                    ))
                  : orderedCategories.map((c) => {
                      const key = categoryKey(c);
                      const sub = windowSubtext(c);
                      return (
                        <tr key={key} className="border-t border-[#dcdcdc]">
                          <td className="px-2 py-1.5">{DISPLAY_LABELS[key]}</td>
                          <td className="px-2 py-1.5 text-right">{c.total_wins}</td>
                          <td className="px-2 py-1.5 text-right">{formatSecondsAsMmSs(c.fastest_win_seconds)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {winRateText(c)}
                            {sub && <span className="text-[10px] text-[#808080] ml-1">{sub}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">{formatSecondsAsMmSs(c.recent_avg_win_seconds)}</td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
