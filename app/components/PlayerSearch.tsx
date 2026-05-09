"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RAISED_OUTER, RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

export default function PlayerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue("");
    setError(null);
  }, [pathname]);

  const trimmed = value.trim();
  const disabled = trimmed === "" || submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/elo/player?username=${encodeURIComponent(name)}`,
      );
      if (res.ok) {
        router.push(`/stats/${encodeURIComponent(name)}`);
      } else if (res.status === 404) {
        setError(`No player named "${name}"`);
      } else {
        setError("Couldn't search right now, try again.");
      }
    } catch {
      setError("Couldn't search right now, try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Find Player
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter a username..."
              className={`${SUNKEN_INNER} flex-1 px-2 py-1 font-mono text-xs bg-white outline-none`}
            />
            <button
              type="submit"
              disabled={disabled}
              className={`${RAISED_INNER} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
            >
              View
            </button>
          </form>
          <div className="mt-2 min-h-[1rem] font-mono text-xs text-[#a00000]">
            {error ?? ""}
          </div>
        </div>
      </div>
    </div>
  );
}
