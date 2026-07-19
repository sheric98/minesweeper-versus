import { NextRequest, NextResponse } from "next/server";

// Unauthenticated on purpose: anonymous players ping game-start too, so the
// post-win sign-in flow can still validate their pending score. The backend
// rate-limits per end-user IP via X-Client-IP (same pattern as register-session).
function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ success: true });
  }

  let backendRes: Response;
  try {
    const reqBody = await request.json();
    backendRes = await fetch(`${backendUrl}/singleplayer/games/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-IP": clientIp(request),
      },
      body: JSON.stringify(reqBody),
    });
  } catch (err) {
    console.error("[singleplayer/games/start] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
