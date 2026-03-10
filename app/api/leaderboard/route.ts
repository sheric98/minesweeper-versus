import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get("mode") || "random";
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    const mockScores = [
      { username: "speedster", time_seconds: 42, created_at: "2025-12-01T10:00:00Z" },
      { username: "minepro", time_seconds: 58, created_at: "2025-12-02T14:30:00Z" },
      { username: "flagqueen", time_seconds: 73, created_at: "2025-12-03T09:15:00Z" },
    ];
    return NextResponse.json({ scores: mockScores });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/leaderboard?mode=${encodeURIComponent(mode)}`, { cache: "no-store" });
  } catch (err) {
    console.error("[leaderboard] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return NextResponse.json({ success: true });
  }

  let backendRes: Response;
  try {
    const reqBody = await request.json();
    backendRes = await fetch(`${backendUrl}/leaderboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(reqBody),
    });
  } catch (err) {
    console.error("[leaderboard] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
