import { cookies } from "next/headers";
import ControlsSettingsForm from "@/app/components/ControlsSettingsForm";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  let authLevel: "anonymous" | "google" | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel === "google" ? "google" : "anonymous";
      }
    } catch { /* malformed token — render unauthenticated */ }
  }

  return (
    <main className="flex-1 bg-[#c0c0c0] flex flex-col items-center py-6 px-4">
      <ControlsSettingsForm authLevel={authLevel} />
    </main>
  );
}
