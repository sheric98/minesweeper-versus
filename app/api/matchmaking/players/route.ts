import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode: return fake online players for local development.
    // Decode username from mock JWT to exclude self from list.
    let self = "";
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (typeof payload.sub === "string") self = payload.sub;
    } catch { /* ignore */ }

    const mockPlayers = [
      { username: "sweeper42", status: "online" as const },
      { username: "minehunter", status: "online" as const },
      { username: "flag_master", status: "online" as const },
      { username: "kaboom_king", status: "in_game" as const },
    ].filter(p => p.username !== self);

    return NextResponse.json({ players: mockPlayers });
  }

  // Production: proxy to EC2 backend.
  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/matchmaking/players`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[matchmaking/players] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
