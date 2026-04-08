import { NextRequest, NextResponse } from "next/server";
import { setQueueJoinedAt } from "../_mock-state";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    setQueueJoinedAt(Date.now());
    return NextResponse.json({ status: "queued" });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/matchmaking/queue/join`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[matchmaking/queue/join] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
