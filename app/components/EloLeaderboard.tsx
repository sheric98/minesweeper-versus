"use client";

import { useState, useEffect } from "react";
import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

const RAISED = RAISED_INNER;
const SUNKEN_PANEL = SUNKEN_INNER;

interface EloEntry {
  username: string;
  rating: number;
  wins: number;
  losses: number;
}

interface EloLeaderboardProps {
  username?: string;
}

export default function EloLeaderboard({ username }: EloLeaderboardProps) {
  const [players, setPlayers] = useState<EloEntry[]>([]);

  useEffect(() => {
    fetch("/api/elo/leaderboard?limit=20")
      .then((res) => res.json())
      .then((data) => {
        if (data.players) setPlayers(data.players);
      })
      .catch(() => {});
  }, []);

  return (
    <div className={`${RAISED} bg-[#c0c0c0] p-2 w-64 flex-shrink-0`}>
      <div className={`${SUNKEN_PANEL} bg-white p-2`}>
        <h3 className="font-mono font-bold text-sm text-center mb-2">ELO RANKINGS</h3>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-[#a0a0a0]">
              <th className="text-left w-6">#</th>
              <th className="text-left">Name</th>
              <th className="text-right">Elo</th>
              <th className="text-right">W/L</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-[#808080] py-2">
                  No ratings yet
                </td>
              </tr>
            )}
            {players.map((entry, i) => {
              const isCurrentUser = username && entry.username === username;
              return (
                <tr
                  key={entry.username}
                  className={isCurrentUser ? "bg-[#000080] text-white" : ""}
                >
                  <td className="text-left">{i + 1}</td>
                  <td className="text-left truncate max-w-[6rem]">{entry.username}</td>
                  <td className="text-right">{entry.rating}</td>
                  <td className="text-right">{entry.wins}/{entry.losses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
