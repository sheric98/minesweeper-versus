import { NextRequest, NextResponse } from "next/server";
import { setQueueJoinedAt } from "../_mock-state";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    setQueueJoinedAt(null);
    return NextResponse.json({ status: "left" });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/matchmaking/queue/leave`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[matchmaking/queue/leave] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
