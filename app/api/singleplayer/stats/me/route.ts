import { NextRequest, NextResponse } from "next/server";

const ALL_CATEGORIES: Array<{ mode: string; difficulty: string }> = [
  { mode: "random", difficulty: "standard" },
  { mode: "no-guess", difficulty: "beginner" },
  { mode: "no-guess", difficulty: "intermediate" },
  { mode: "no-guess", difficulty: "advanced" },
  { mode: "no-guess", difficulty: "expert" },
];

function emptyCategories() {
  return ALL_CATEGORIES.map((c) => ({
    mode: c.mode,
    difficulty: c.difficulty,
    total_wins: 0,
    fastest_win_seconds: null,
    recent_count: 0,
    recent_wins: 0,
    recent_avg_win_seconds: null,
  }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ categories: emptyCategories() });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/singleplayer/stats/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[singleplayer/stats/me] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
