import { NextRequest, NextResponse } from "next/server";

const USERNAME_RE = /^[a-zA-Z0-9_]{1,20}$/;

function validateUsername(
  raw: unknown,
): { ok: true; username: string } | { ok: false; message: string } {
  if (typeof raw !== "string") return { ok: false, message: "username must be a string" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, message: "username cannot be empty" };
  if (!USERNAME_RE.test(trimmed))
    return {
      ok: false,
      message: "username must be 1–20 alphanumeric/underscore characters",
    };
  return { ok: true, username: trimmed };
}

// Dev-only placeholder: NOT a real JWT. Used when BACKEND_URL is not set.
// Once BACKEND_URL is configured, this branch is never reached.
function mockToken(username: string): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: username, iat: Date.now(), mock: true }));
  return `${header}.${payload}.mock`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 2. Validate username
  const validation = validateUsername((body as Record<string, unknown>)?.username);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }
  const { username } = validation;

  // 3. Get JWT from backend (or mock in dev)
  let token: string;
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // PLACEHOLDER MODE: no backend configured — mint a dev-only mock token.
    // This lets the full UI auth flow work locally without an EC2 instance.
    token = mockToken(username);
  } else {
    // PRODUCTION MODE: forward to EC2 backend.
    // The backend owns the signing key; Vercel never sees it.
    // For subsequent authenticated API calls, the BFF should forward the
    // session cookie as `Authorization: Bearer <token>` to the backend.
    let backendRes: Response;
    try {
      backendRes = await fetch(`${backendUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
    } catch (err) {
      console.error("[register-session] Backend unreachable:", err);
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 },
      );
    }

    if (!backendRes.ok) {
      // Propagate backend errors (e.g. 409 duplicate username, 400 invalid)
      const errBody = await backendRes
        .json()
        .catch(() => ({ error: "Unknown backend error" }));
      return NextResponse.json(errBody, { status: backendRes.status });
    }

    token = ((await backendRes.json()) as { token: string }).token;
  }

  // 4. Set the session cookie on the response.
  // HttpOnly: client JS cannot read the token (prevents XSS token theft).
  // SameSite=Strict: cross-site requests cannot include this cookie (CSRF protection).
  // secure: only sent over HTTPS; disabled in dev so localhost (HTTP) works.
  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // Session cookie (no maxAge): expires when the browser closes.
    // For persistence across sessions, add: maxAge: 60 * 60 * 24 * 7  // 7 days
  });
  return response;
}
