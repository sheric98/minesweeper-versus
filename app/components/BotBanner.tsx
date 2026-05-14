"use client";

import { useEffect, useState } from "react";
import { RAISED_OUTER } from "@/app/lib/win95";

interface BotBannerProps {
  username: string;
}

export default function BotBanner({ username }: BotBannerProps) {
  const [isBot, setIsBot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset between navigations so we don't briefly show a stale [BOT] banner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsBot(false);
    fetch(`/api/elo/player?username=${encodeURIComponent(username)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("lookup failed"))))
      .then((d: { isBot?: boolean }) => {
        if (cancelled) return;
        setIsBot(Boolean(d.isBot));
      })
      .catch(() => {
        if (cancelled) return;
        setIsBot(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!isBot) return null;

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-orange-600 text-white text-sm font-bold px-2 py-1 select-none">
        [BOT]
      </div>
      <div className="px-3 py-2 font-mono text-xs">
        <span className="font-bold">{username}</span> is an AI opponent — you&apos;re viewing a bot&apos;s stats.
      </div>
    </div>
  );
}
