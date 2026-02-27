import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode: return a fake ticket for local development.
    const ticket = `mock-ticket-${crypto.randomUUID()}`;
    return NextResponse.json({ ticket });
  }

  // Production: request a single-use WS ticket from the EC2 backend.
  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/ws/ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[ws-ticket] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
