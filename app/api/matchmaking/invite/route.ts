import { NextRequest, NextResponse } from "next/server";

// POST /api/matchmaking/invite — send an invitation to another player
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

  const targetUsername = (body as Record<string, unknown>)?.targetUsername;
  if (typeof targetUsername !== "string" || targetUsername.trim().length === 0) {
    return NextResponse.json({ error: "targetUsername is required" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode: return a fake invite ID immediately.
    return NextResponse.json({ inviteId: `inv_${Date.now()}` });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/matchmaking/invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetUsername: targetUsername.trim() }),
    });
  } catch (err) {
    console.error("[matchmaking/invite] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const resBody = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(resBody, { status: backendRes.status });
}

// GET /api/matchmaking/invite — poll for sent and received invitations
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode: return empty invitation lists.
    return NextResponse.json({ sent: [], received: [] });
  }

  const qs = request.nextUrl.searchParams.toString();
  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backendUrl}/matchmaking/invite${qs ? `?${qs}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    console.error("[matchmaking/invite GET] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const resBody = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(resBody, { status: backendRes.status });
}
