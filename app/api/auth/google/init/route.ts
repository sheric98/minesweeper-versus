import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const NEXT_TTL_SECONDS = 600; // 10 minutes — matches pending-score expiry

// Accept only same-origin paths; reject `//evil.com`, `/\evil.com`, `https://...`.
function isSafeNext(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\/(?![/\\])/.test(value);
}

function setOauthNextCookie(response: NextResponse, next: string): void {
  response.cookies.set("oauth_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NEXT_TTL_SECONDS,
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const nextParam = request.nextUrl.searchParams.get("next");
  const safeNext = isSafeNext(nextParam) ? nextParam : null;

  // Mock mode: no Google credentials configured — skip straight to callback.
  if (!clientId) {
    const url = new URL(redirectUri);
    url.searchParams.set("mock", "1");
    const response = NextResponse.redirect(url);
    if (safeNext) setOauthNextCookie(response, safeNext);
    return response;
  }

  // Generate CSRF state token
  const state = crypto.randomUUID();

  // Build Google OAuth authorization URL
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in short-lived cookie for CSRF validation on callback.
  // sameSite "lax" is required because Google's redirect is a cross-site navigation.
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  if (safeNext) setOauthNextCookie(response, safeNext);

  return response;
}
