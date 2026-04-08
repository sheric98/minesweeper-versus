import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "20";

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode
    return NextResponse.json({
      players: [
        { username: "speedster", rating: 1450, wins: 25, losses: 10 },
        { username: "minepro", rating: 1380, wins: 18, losses: 12 },
        { username: "flagqueen", rating: 1320, wins: 15, losses: 14 },
        { username: "sweeper42", rating: 1250, wins: 10, losses: 10 },
        { username: "minehunter", rating: 1180, wins: 8, losses: 15 },
      ],
    });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/elo/leaderboard?limit=${limit}`, {
      cache: "no-store",
    });
  } catch (err) {
    console.error("[elo/leaderboard] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
