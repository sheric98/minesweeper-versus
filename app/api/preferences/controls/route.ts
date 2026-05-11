import { NextRequest, NextResponse } from "next/server";
import { parseControls } from "@/app/lib/controls";

interface JwtPayload {
  sub?: string;
  userId?: string;
  authLevel?: "anonymous" | "google";
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as JwtPayload;
  } catch {
    return null;
  }
}

// In-memory store for mock-mode dev (no BACKEND_URL). Resets on dev-server restart.
const mockStore = new Map<string, ReturnType<typeof parseControls>>();

function authOrUnauthorized(
  request: NextRequest,
): { token: string; payload: JwtPayload } | NextResponse {
  const token = request.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = decodeJwt(token);
  if (!payload || payload.authLevel !== "google") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { token, payload };
}

function userKey(payload: JwtPayload): string {
  return payload.userId ?? payload.sub ?? "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = authOrUnauthorized(request);
  if (auth instanceof NextResponse) return auth;
  const { token, payload } = auth;

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    const key = userKey(payload);
    const stored = mockStore.get(key);
    if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ controls: stored });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/preferences/controls`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[preferences/controls GET] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Propagate 200 and 404 verbatim; convert other errors to 503.
  if (backendRes.status === 200 || backendRes.status === 404) {
    const body = await backendRes.json().catch(() => ({}));
    return NextResponse.json(body, { status: backendRes.status });
  }
  console.error("[preferences/controls GET] Unexpected backend status:", backendRes.status);
  return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = authOrUnauthorized(request);
  if (auth instanceof NextResponse) return auth;
  const { token, payload } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = (body as { controls?: unknown })?.controls;
  if (incoming === undefined) {
    return NextResponse.json({ error: "Missing 'controls' field" }, { status: 400 });
  }
  const validated = parseControls(incoming);

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    mockStore.set(userKey(payload), validated);
    return NextResponse.json({ controls: validated });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/preferences/controls`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ controls: validated }),
    });
  } catch (err) {
    console.error("[preferences/controls PUT] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const respBody = await backendRes.json().catch(() => ({}));
  return NextResponse.json(respBody, { status: backendRes.status });
}
