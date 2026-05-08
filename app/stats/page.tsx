import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HeadToHeadTable from "@/app/components/HeadToHeadTable";
import StatsSummary from "@/app/components/StatsSummary";

export default async function StatsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let authLevel: string | undefined;
  let username: string | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel;
        if (typeof payload.sub === "string") username = payload.sub;
      }
    } catch { /* malformed token */ }
  }

  if (authLevel !== "google") {
    redirect("/");
  }

  return (
    <main className="bg-[#c0c0c0] flex flex-1 flex-col items-center py-6 px-4 gap-4">
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        <StatsSummary username={username} />
        <HeadToHeadTable />
      </div>
    </main>
  );
}
