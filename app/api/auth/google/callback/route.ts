import { NextRequest, NextResponse } from "next/server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Dev-only placeholder JWT for mock mode.
function mockToken(displayName: string): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: displayName,
      userId: crypto.randomUUID(),
      authLevel: "google",
      iat: Date.now(),
      mock: true,
    }),
  );
  return `${header}.${payload}.mock`;
}

function redirectWithError(appUrl: string, code: string): NextResponse {
  const url = new URL("/multiplayer", appUrl);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url.toString());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const params = request.nextUrl.searchParams;

  // --- Mock mode ---
  if (!clientId || params.get("mock") === "1") {
    const token = mockToken("MockGoogleUser");
    const response = NextResponse.redirect(new URL("/multiplayer", appUrl));
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    return response;
  }

  // --- Production OAuth flow ---

  // 1. Validate CSRF state
  const state = params.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || state !== storedState) {
    return redirectWithError(appUrl, "csrf_mismatch");
  }

  // 2. Check for error from Google
  const error = params.get("error");
  if (error) {
    console.error("[oauth/callback] Google returned error:", error);
    return redirectWithError(appUrl, "google_denied");
  }

  // 3. Exchange authorization code for tokens
  const code = params.get("code");
  if (!code) {
    return redirectWithError(appUrl, "missing_code");
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  let tokenData: { id_token?: string };
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[oauth/callback] Token exchange failed:", errBody);
      return redirectWithError(appUrl, "token_exchange_failed");
    }

    tokenData = (await tokenRes.json()) as { id_token?: string };
  } catch (err) {
    console.error("[oauth/callback] Token exchange error:", err);
    return redirectWithError(appUrl, "token_exchange_failed");
  }

  if (!tokenData.id_token) {
    return redirectWithError(appUrl, "missing_id_token");
  }

  // 4. Verify ID token
  let idClaims: { aud?: string; sub?: string; email?: string; name?: string };
  try {
    const verifyRes = await fetch(
      `${TOKEN_INFO_URL}?id_token=${tokenData.id_token}`,
    );
    if (!verifyRes.ok) {
      console.error("[oauth/callback] ID token verification failed");
      return redirectWithError(appUrl, "token_verify_failed");
    }
    idClaims = (await verifyRes.json()) as typeof idClaims;
  } catch (err) {
    console.error("[oauth/callback] ID token verify error:", err);
    return redirectWithError(appUrl, "token_verify_failed");
  }

  // 5. Validate audience matches our client ID
  if (idClaims.aud !== clientId) {
    console.error("[oauth/callback] aud mismatch:", idClaims.aud);
    return redirectWithError(appUrl, "invalid_audience");
  }

  // 6. Send verified claims to Flask backend
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    // Fallback: no backend, mint a mock token with Google profile info
    const token = mockToken(idClaims.name ?? "GoogleUser");
    const response = NextResponse.redirect(new URL("/multiplayer", appUrl));
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    return response;
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        google_id: idClaims.sub,
        email: idClaims.email,
        display_name: idClaims.name ?? "User",
      }),
    });
  } catch (err) {
    console.error("[oauth/callback] Backend unreachable:", err);
    return redirectWithError(appUrl, "backend_unavailable");
  }

  if (!backendRes.ok) {
    console.error("[oauth/callback] Backend error:", backendRes.status);
    return redirectWithError(appUrl, "backend_error");
  }

  const { token } = (await backendRes.json()) as { token: string };

  // 7. Set session cookie and redirect to multiplayer lobby
  const response = NextResponse.redirect(new URL("/multiplayer", appUrl));
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });

  // Clear the oauth_state cookie
  response.cookies.delete("oauth_state");

  return response;
}
