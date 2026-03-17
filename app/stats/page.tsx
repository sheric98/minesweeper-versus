import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RAISED_OUTER } from "@/app/lib/win95";
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
      <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col min-w-[320px] max-w-[600px] w-full`}>
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
          Stats
        </div>
        <div className="px-4 py-4">
          <HeadToHeadTable />
        </div>
      </div>
    </main>
  );
}
