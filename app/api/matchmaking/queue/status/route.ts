import { NextRequest, NextResponse } from "next/server";
import { queueJoinedAt, setQueueJoinedAt } from "../_mock-state";

const MOCK_MATCH_DELAY_MS = 5000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    if (queueJoinedAt == null) {
      return NextResponse.json({ status: "none" });
    }
    const elapsed = Date.now() - queueJoinedAt;
    if (elapsed < MOCK_MATCH_DELAY_MS) {
      return NextResponse.json({ status: "waiting", waitSeconds: elapsed / 1000 });
    }
    // Simulate finding a match
    setQueueJoinedAt(null);
    return NextResponse.json({
      status: "matched",
      matchId: `mock_match_${Date.now()}`,
      opponent: "sweeper42",
    });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/matchmaking/queue/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[matchmaking/queue/status] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
