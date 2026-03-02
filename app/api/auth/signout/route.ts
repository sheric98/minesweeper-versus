import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/", appUrl));
  response.cookies.delete("session");
  return response;
}
