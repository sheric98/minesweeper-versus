"use client";

import { useEffect, useState } from "react";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";
import H2HTable, { type H2HRecord } from "@/app/components/H2HTable";

interface TopOpponentsTableProps {
  targetUsername: string;
}

export default function TopOpponentsTable({ targetUsername }: TopOpponentsTableProps) {
  const [records, setRecords] = useState<H2HRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        username: targetUsername,
        page: "1",
        page_size: "10",
      });

      try {
        const res = await fetch(`/api/head-to-head?${params.toString()}`);
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to fetch records");
          setRecords([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setRecords(data.records || []);
      } catch {
        if (cancelled) return;
        setError("Failed to fetch records");
        setRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [targetUsername]);

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        {targetUsername}&apos;s Top Opponents
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          <H2HTable
            records={records}
            loading={loading}
            error={error}
            emptyMessage="No opponents yet"
          />
        </div>
      </div>
    </div>
  );
}
