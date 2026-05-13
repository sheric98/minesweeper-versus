import { NextRequest, NextResponse } from "next/server";
import { emptyCategories } from "@/app/api/singleplayer/_empty-categories";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ categories: emptyCategories() });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backendUrl}/singleplayer/stats/player?username=${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
  } catch (err) {
    console.error("[singleplayer/stats/player] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
