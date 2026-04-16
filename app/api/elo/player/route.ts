import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode
    return NextResponse.json({ username, rating: 1200, wins: 5, losses: 3 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backendUrl}/elo/player?username=${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
  } catch (err) {
    console.error("[elo/player] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
