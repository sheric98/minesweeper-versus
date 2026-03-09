import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HeadToHeadTable from "@/app/components/HeadToHeadTable";

export default async function StatsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let authLevel: string | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel;
      }
    } catch { /* malformed token */ }
  }

  if (authLevel !== "google") {
    redirect("/");
  }

  return (
    <main className="flex flex-col items-center py-6 px-4 gap-4">
      <h1 className="font-mono font-bold text-lg">STATS</h1>
      <HeadToHeadTable />
    </main>
  );
}
