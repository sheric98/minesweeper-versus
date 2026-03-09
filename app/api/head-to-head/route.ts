import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const opponent = params.get("opponent");
  const page = params.get("page");
  const pageSize = params.get("page_size");
  const search = params.get("search");

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode
    if (opponent) {
      return NextResponse.json({ wins: 0, losses: 0, opponent });
    }
    // Mock paginated records
    const mockRecords = [
      { opponent: "sweeper42", wins: 5, losses: 3, total_games: 8 },
      { opponent: "minehunter", wins: 2, losses: 4, total_games: 6 },
      { opponent: "flag_master", wins: 3, losses: 1, total_games: 4 },
      { opponent: "kaboom_king", wins: 1, losses: 2, total_games: 3 },
    ];
    const filtered = search
      ? mockRecords.filter((r) => r.opponent.toLowerCase().includes(search.toLowerCase()))
      : mockRecords;
    return NextResponse.json({
      records: filtered,
      page: 1,
      page_size: 10,
      total_records: filtered.length,
    });
  }

  // Build query string for backend
  const qp = new URLSearchParams();
  if (opponent) qp.set("opponent", opponent);
  if (page) qp.set("page", page);
  if (pageSize) qp.set("page_size", pageSize);
  if (search) qp.set("search", search);

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backendUrl}/head-to-head?${qp.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch (err) {
    console.error("[head-to-head] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
