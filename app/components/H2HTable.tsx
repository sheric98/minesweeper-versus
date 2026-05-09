export interface H2HRecord {
  opponent: string;
  wins: number;
  losses: number;
  total_games: number;
}

interface H2HTableProps {
  records: H2HRecord[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
}

export default function H2HTable({
  records,
  loading,
  error,
  emptyMessage = "No records yet",
}: H2HTableProps) {
  return (
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
              {emptyMessage}
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
  );
}
