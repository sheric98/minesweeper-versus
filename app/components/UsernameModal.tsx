"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RAISED_OUTER, SUNKEN_OUTER, PRESSED as WIN95_PRESSED } from "@/app/lib/win95";

const RAISED = RAISED_OUTER;
const SUNKEN = SUNKEN_OUTER;
const PRESSED = WIN95_PRESSED;

interface Props {
  isAuthenticated: boolean;
  oauthError?: string;
  pendingOAuth?: { suggestedUsername: string };
  // When provided, the modal is dismissible (× button, Esc, backdrop click)
  // and uses a fixed full-viewport overlay instead of an absolute-scoped one.
  onClose?: () => void;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{1,20}$/;

function oauthErrorMessage(code?: string): string | null {
  if (!code) return null;
  switch (code) {
    case "state":
    case "session_expired":
      return "Sign-in expired. Please try again.";
    case "exchange":
      return "Could not complete sign-in. Please try again.";
    case "verify":
      return "Could not verify your account. Please try again.";
    case "backend":
      return "Server error during sign-in. Please try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export default function UsernameModal({
  isAuthenticated,
  oauthError,
  pendingOAuth,
  onClose,
}: Props) {
  const router = useRouter();
  const isPending = !!pendingOAuth;
  const dismissible = !!onClose;
  const [username, setUsername] = useState(pendingOAuth?.suggestedUsername ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dismissible || isAuthenticated) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissible, isAuthenticated, onClose]);

  // Already authenticated — render nothing, let page content show through.
  if (isAuthenticated) return null;

  function clientValidate(value: string): string | null {
    if (value.trim().length === 0) return "Username cannot be empty.";
    if (!USERNAME_RE.test(value.trim()))
      return "1–20 letters, numbers, or underscores only.";
    return null;
  }

  async function handleGuestSubmit(e: React.FormEvent) {
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
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePendingSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientError = clientValidate(username);
    if (clientError) {
      setError(clientError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/google/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (res.status === 401) {
        // Pending state expired — navigate with an error code. The BFF has
        // already cleared the pending_oauth cookie in its 401 response, so
        // the server render at the new URL will show the default modal body
        // (no pending_oauth) with the "Sign-in expired" banner via oauthError.
        router.push("/multiplayer?error=session_expired");
        return;
      }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      const data = (await res.json()) as { next?: string | null };
      if (data.next) {
        router.push(data.next);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setLoading(true);
    try {
      await fetch("/api/auth/google/complete", { method: "DELETE" });
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const errorMessage = oauthErrorMessage(oauthError);

  return (
    // Overlay: `absolute` (scoped to parent `relative`, used by /multiplayer)
    // when no onClose; `fixed` covering the viewport when dismissible.
    <div
      className={
        dismissible
          ? "fixed inset-0 z-50 flex items-center justify-center bg-[#c0c0c0]/70"
          : "absolute inset-0 flex items-center justify-center bg-[#c0c0c0]/70"
      }
      onMouseDown={
        dismissible
          ? (e) => { if (e.target === e.currentTarget) onClose?.(); }
          : undefined
      }
    >
      {/* Win95-style dialog window */}
      <div
        className={`${RAISED} bg-ms-silver flex flex-col min-w-[280px] max-w-[360px] w-full`}
      >
        {/* Title bar */}
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none flex items-center">
          <span className="flex-1">
            {isPending ? "Choose your username" : dismissible ? "Sign in" : "Multiplayer"}
          </span>
          {dismissible && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={`${RAISED} bg-ms-silver text-black text-xs font-bold leading-none w-5 h-5 flex items-center justify-center cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          {errorMessage && (
            <p className="text-red-700 text-xs bg-white px-2 py-1 border border-red-700">
              {errorMessage}
            </p>
          )}

          {isPending ? (
            <>
              <p className="text-xs">
                Pick a username for your account. This is what other players
                will see.
              </p>
              <form onSubmit={handlePendingSubmit} className="flex flex-col gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  onFocus={e => e.target.select()}
                  maxLength={20}
                  placeholder="username"
                  disabled={loading}
                  autoFocus
                  className={`${SUNKEN} bg-white px-2 py-1 text-sm font-mono w-full outline-none disabled:opacity-60`}
                />

                {/* Reserved height prevents layout shift when error appears/disappears */}
                <p className="text-red-700 text-xs min-h-[1rem]">{error ?? ""}</p>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={loading}
                    className={`${RAISED} bg-ms-silver px-4 py-1 text-sm cursor-default disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className={`${loading ? PRESSED : RAISED} bg-ms-silver px-4 py-1 text-sm font-bold cursor-default disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
                  >
                    {loading ? "…" : "Continue"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
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
                <span className="text-xs text-[#808080] select-none">
                  or play as guest
                </span>
                <div className="flex-1 border-t border-[#808080]" />
              </div>

              <form onSubmit={handleGuestSubmit} className="flex flex-col gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  maxLength={20}
                  placeholder="e.g. player_one"
                  disabled={loading}
                  autoFocus
                  className={`${SUNKEN} bg-white px-2 py-1 text-sm font-mono w-full outline-none disabled:opacity-60`}
                />

                <p className="text-red-700 text-xs min-h-[1rem]">{error ?? ""}</p>

                <button
                  type="submit"
                  disabled={loading}
                  className={`${loading ? PRESSED : RAISED} bg-ms-silver px-4 py-1 text-sm font-bold self-end cursor-default disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
                >
                  {loading ? "Joining…" : "OK"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
