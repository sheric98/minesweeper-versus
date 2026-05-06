import { NextRequest, NextResponse } from "next/server";

const USERNAME_RE = /^[a-zA-Z0-9_]{1,20}$/;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function isSafeNext(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\/(?![/\\])/.test(value);
}

function consumeNext(request: NextRequest): string | null {
  const cookieValue = request.cookies.get("oauth_next")?.value;
  return isSafeNext(cookieValue) ? cookieValue : null;
}

function clearOauthNextCookie(response: NextResponse): void {
  response.cookies.delete("oauth_next");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const pendingToken = request.cookies.get("pending_oauth")?.value;
  if (!pendingToken) {
    return NextResponse.json(
      { error: "No pending sign-in" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUsername = (body as { username?: unknown })?.username;
  if (
    typeof rawUsername !== "string" ||
    !USERNAME_RE.test(rawUsername.trim())
  ) {
    return NextResponse.json(
      { error: "username must be 1–20 alphanumeric/underscore characters" },
      { status: 400 },
    );
  }
  const username = rawUsername.trim();

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    // No backend configured — chooser flow can't complete in frontend-mock mode.
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 },
    );
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/auth/google/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pending_token: pendingToken, username }),
    });
  } catch (err) {
    console.error("[google/complete] Backend unreachable:", err);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 },
    );
  }

  if (backendRes.status === 401) {
    // Pending token expired or invalid — clear cookie so next visit
    // shows the regular sign-in modal, not a stale chooser.
    const errBody = await backendRes
      .json()
      .catch(() => ({ error: "Sign-in expired" }));
    const response = NextResponse.json(errBody, { status: 401 });
    response.cookies.delete("pending_oauth");
    return response;
  }

  if (!backendRes.ok) {
    // Includes 409 (username taken) and 400 (validation). Preserve the
    // pending_oauth cookie so the user can correct and retry.
    const errBody = await backendRes
      .json()
      .catch(() => ({ error: "Could not complete sign-in" }));
    return NextResponse.json(errBody, { status: backendRes.status });
  }

  let successData: { token?: string };
  try {
    successData = (await backendRes.json()) as { token?: string };
  } catch {
    console.error("[google/complete] Backend returned non-JSON on success");
    return NextResponse.json(
      { error: "Sign-in failed unexpectedly" },
      { status: 502 },
    );
  }
  if (!successData.token) {
    console.error("[google/complete] Backend success response missing token");
    return NextResponse.json(
      { error: "Sign-in failed unexpectedly" },
      { status: 502 },
    );
  }

  const next = consumeNext(request);
  const response = NextResponse.json({ ok: true, next });
  response.cookies.set("session", successData.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  response.cookies.delete("pending_oauth");
  clearOauthNextCookie(response);
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("pending_oauth");
  response.cookies.delete("oauth_next");
  return response;
}
