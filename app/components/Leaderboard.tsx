"use client";

import { useState, useEffect } from "react";

const RAISED = "border-2 border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]";
const SUNKEN_PANEL = "border-2 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]";

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
}

export default function Leaderboard({ username, refreshKey, mode = "random" }: LeaderboardProps) {
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<LeaderboardMode>(mode);

  // Sync active tab when game mode changes
  useEffect(() => {
    setActiveTab(mode);
  }, [mode]);

  useEffect(() => {
    fetch(`/api/leaderboard?mode=${activeTab}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.scores) setScores(data.scores);
      })
      .catch(() => {});
  }, [refreshKey, activeTab]);

  return (
    <div className={`${RAISED} bg-[#c0c0c0] p-2 w-56 flex-shrink-0`}>
      <div className={`${SUNKEN_PANEL} bg-white p-2`}>
        <h3 className="font-mono font-bold text-sm text-center mb-2">LEADERBOARD</h3>
        <div className="flex mb-2">
          <button
            className={`flex-1 font-mono text-xs font-bold py-0.5 cursor-pointer ${
              activeTab === "random" ? SUNKEN_PANEL + " bg-[#b0b0b0]" : RAISED + " bg-[#c0c0c0]"
            }`}
            onClick={() => setActiveTab("random")}
          >
            Random
          </button>
          <button
            className={`flex-1 font-mono text-xs font-bold py-0.5 cursor-pointer ${
              activeTab === "no-guess" ? SUNKEN_PANEL + " bg-[#b0b0b0]" : RAISED + " bg-[#c0c0c0]"
            }`}
            onClick={() => setActiveTab("no-guess")}
          >
            No Guess
          </button>
        </div>
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
