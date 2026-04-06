import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }

  const { searchParams } = request.nextUrl;
  const difficulty = searchParams.get("difficulty") || "expert";
  const startRow = searchParams.get("start_row");
  const startCol = searchParams.get("start_col");

  if (!startRow || !startCol) {
    return NextResponse.json({ error: "start_row and start_col are required" }, { status: 400 });
  }

  let backendRes: Response;
  try {
    const url = `${backendUrl}/board?difficulty=${encodeURIComponent(difficulty)}&start_row=${encodeURIComponent(startRow)}&start_col=${encodeURIComponent(startCol)}`;
    backendRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[board] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
