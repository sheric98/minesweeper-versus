"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  isAuthenticated: boolean;
  oauthError?: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{1,20}$/;

// Full class strings (no template literals) so Tailwind v4's scanner detects them.
// Convention matches RAISED/SUNKEN constants used in Cell.tsx and Header.tsx.
const RAISED = "border-2 border-t-[#ffffff] border-l-[#ffffff] border-b-[#808080] border-r-[#808080]";
const SUNKEN = "border-2 border-t-[#808080] border-l-[#808080] border-b-[#ffffff] border-r-[#ffffff]";
const PRESSED = "border-2 border-t-[#808080] border-l-[#808080] border-b-[#ffffff] border-r-[#ffffff]";

export default function UsernameModal({ isAuthenticated, oauthError }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already authenticated — render nothing, let page content show through.
  if (isAuthenticated) return null;

  function clientValidate(value: string): string | null {
    if (value.trim().length === 0) return "Username cannot be empty.";
    if (!USERNAME_RE.test(value.trim())) return "1–20 letters, numbers, or underscores only.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientError = clientValidate(username);
    if (clientError) {
      setError(clientError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/register-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Trigger server re-render: Server Component re-reads the cookie,
      // isAuthenticated flips to true, and this modal returns null.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    // Overlay scoped to the parent's `relative` container — does not cover the NavBar.
    <div className="absolute inset-0 flex items-center justify-center bg-[#c0c0c0]/70">
      {/* Win95-style dialog window */}
      <div
        className={`${RAISED} bg-ms-silver flex flex-col min-w-[280px] max-w-[360px] w-full`}
      >
        {/* Title bar */}
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
          Multiplayer
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          {oauthError && (
            <p className="text-red-700 text-xs bg-white px-2 py-1 border border-red-700">
              {oauthError === "state" ? "Sign-in expired. Please try again." :
               oauthError === "exchange" ? "Could not complete sign-in. Please try again." :
               oauthError === "verify" ? "Could not verify your account. Please try again." :
               oauthError === "backend" ? "Server error during sign-in. Please try again." :
               "Sign-in failed. Please try again."}
            </p>
          )}

          {/* Google sign-in */}
          <a
            href="/api/auth/google/init"
            className={`${RAISED} bg-ms-silver px-4 py-1.5 text-sm font-bold text-center cursor-default hover:brightness-95 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
          >
            Sign in with Google
          </a>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-[#808080]" />
            <span className="text-xs text-[#808080] select-none">or play as guest</span>
            <div className="flex-1 border-t border-[#808080]" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              type="text"
              value={username}
              onChange={e => {
                setUsername(e.target.value);
                if (error) setError(null); // clear stale error on edit
              }}
              maxLength={20}
              placeholder="e.g. player_one"
              disabled={loading}
              autoFocus
              className={`${SUNKEN} bg-white px-2 py-1 text-sm font-mono w-full outline-none disabled:opacity-60`}
            />

            {/* Reserved height prevents layout shift when error appears/disappears */}
            <p className="text-red-700 text-xs min-h-[1rem]">{error ?? ""}</p>

            <button
              type="submit"
              disabled={loading}
              className={`${loading ? PRESSED : RAISED} bg-ms-silver px-4 py-1 text-sm font-bold self-end cursor-default disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
            >
              {loading ? "Joining…" : "OK"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
