"use client";

import { useState, useEffect, useCallback } from "react";

const RAISED = "border-2 border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]";
const SUNKEN = "border-2 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]";

interface H2HRecord {
  opponent: string;
  wins: number;
  losses: number;
  total_games: number;
}

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
    <div className={`${RAISED} bg-[#c0c0c0] p-3 w-full max-w-lg`}>
      <div className={`${SUNKEN} bg-white p-3`}>
        <h3 className="font-mono font-bold text-sm text-center mb-3">HEAD-TO-HEAD RECORDS</h3>

        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opponent..."
            className={`${SUNKEN} w-full px-2 py-1 font-mono text-xs bg-white outline-none`}
          />
        </div>

        {/* Table */}
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-[#a0a0a0]">
              <th className="text-left py-1">Opponent</th>
              <th className="text-right py-1">W</th>
              <th className="text-right py-1">L</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center text-[#808080] py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={4} className="text-center text-red-600 py-4">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && records.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-[#808080] py-4">
                  {debouncedSearch ? "No matching opponents" : "No records yet"}
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              records.map((r) => (
                <tr key={r.opponent} className="border-b border-[#e0e0e0] hover:bg-[#e8e8e8]">
                  <td className="text-left py-1 truncate max-w-[10rem]">{r.opponent}</td>
                  <td className="text-right py-1">{r.wins}</td>
                  <td className="text-right py-1">{r.losses}</td>
                  <td className="text-right py-1">{r.total_games}</td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`${RAISED} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
            >
              Prev
            </button>
            <span className="font-mono text-xs text-[#808080]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={`${RAISED} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
