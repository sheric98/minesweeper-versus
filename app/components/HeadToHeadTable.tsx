"use client";

import { useState, useEffect, useCallback } from "react";
import { RAISED_OUTER, RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";
import H2HTable, { type H2HRecord } from "@/app/components/H2HTable";

const PAGE_SIZE = 10;

export default function HeadToHeadTable() {
  const [records, setRecords] = useState<H2HRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);

    try {
      const res = await fetch(`/api/head-to-head?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to fetch records");
        setRecords([]);
        setTotalRecords(0);
        return;
      }
      const data = await res.json();
      setRecords(data.records || []);
      setTotalRecords(data.total_records || 0);
    } catch {
      setError("Failed to fetch records");
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Head-to-Head
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opponent..."
              className={`${SUNKEN_INNER} w-full px-2 py-1 font-mono text-xs bg-white outline-none`}
            />
          </div>

          {/* Table */}
          <H2HTable
            records={records}
            loading={loading}
            error={error}
            emptyMessage={debouncedSearch ? "No matching opponents" : "No records yet"}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`${RAISED_INNER} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
              >
                Prev
              </button>
              <span className="font-mono text-xs text-[#808080]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={`${RAISED_INNER} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
