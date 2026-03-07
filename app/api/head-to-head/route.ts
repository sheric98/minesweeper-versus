import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const opponent = request.nextUrl.searchParams.get("opponent");
  if (!opponent) {
    return NextResponse.json({ error: "Missing opponent parameter" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Mock mode: return empty record
    return NextResponse.json({ wins: 0, losses: 0, opponent });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backendUrl}/head-to-head?opponent=${encodeURIComponent(opponent)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch (err) {
    console.error("[head-to-head] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
