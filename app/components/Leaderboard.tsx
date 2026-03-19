"use client";

import { useState, useEffect } from "react";
import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

const RAISED = RAISED_INNER;
const SUNKEN_PANEL = SUNKEN_INNER;

type LeaderboardMode = "random" | "no-guess";

interface LeaderboardEntry {
  username: string;
  time_seconds: number;
  created_at: string;
}

interface LeaderboardProps {
  username?: string;
  refreshKey: number;
  mode?: LeaderboardMode;
  difficulty?: string;
}

export default function Leaderboard({ username, refreshKey, mode = "random", difficulty }: LeaderboardProps) {
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let url = `/api/leaderboard?mode=${mode}`;
    if (difficulty) url += `&difficulty=${encodeURIComponent(difficulty)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.scores) setScores(data.scores);
      })
      .catch(() => {});
  }, [refreshKey, mode, difficulty]);

  return (
    <div className={`${RAISED} bg-[#c0c0c0] p-2 w-56 flex-shrink-0`}>
      <div className={`${SUNKEN_PANEL} bg-white p-2`}>
        <h3 className="font-mono font-bold text-sm text-center mb-2">LEADERBOARD</h3>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-[#a0a0a0]">
              <th className="text-left w-6">#</th>
              <th className="text-left">Name</th>
              <th className="text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {scores.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-[#808080] py-2">
                  No scores yet
                </td>
              </tr>
            )}
            {scores.map((entry, i) => {
              const isCurrentUser = username && entry.username === username;
              return (
                <tr
                  key={`${entry.username}-${entry.created_at}`}
                  className={isCurrentUser ? "bg-[#000080] text-white" : ""}
                >
                  <td className="text-left">{i + 1}</td>
                  <td className="text-left truncate max-w-[7rem]">{entry.username}</td>
                  <td className="text-right">{entry.time_seconds}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
