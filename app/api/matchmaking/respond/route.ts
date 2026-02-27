import { NextRequest, NextResponse } from "next/server";

// POST /api/matchmaking/respond — accept or reject an invitation
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { inviteId, accept } = body as Record<string, unknown>;
  if (typeof inviteId !== "string" || inviteId.trim().length === 0) {
    return NextResponse.json({ error: "inviteId is required" }, { status: 400 });
  }
  if (typeof accept !== "boolean") {
    return NextResponse.json({ error: "accept must be a boolean" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode: if accepted, return a fake matchId.
    if (accept) {
      return NextResponse.json({ matchId: `match_${Date.now()}` });
    }
    return NextResponse.json({});
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/matchmaking/respond`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inviteId: inviteId.trim(), accept }),
    });
  } catch (err) {
    console.error("[matchmaking/respond] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const resBody = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(resBody, { status: backendRes.status });
}
