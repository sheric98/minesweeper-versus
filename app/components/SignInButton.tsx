"use client";

import { useState } from "react";

import UsernameModal from "@/app/components/UsernameModal";

// Note: pendingOAuth is intentionally not handled here. The Google OAuth
// callback always redirects back to /multiplayer, where the page-level
// UsernameModal renders the first-time username chooser.
export default function SignInButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          borderTop: "2px solid #ffffff",
          borderLeft: "2px solid #ffffff",
          borderBottom: "2px solid #808080",
          borderRight: "2px solid #808080",
        }}
        className="px-4 py-1 text-sm font-bold select-none bg-ms-silver hover:brightness-95 cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]"
      >
        Sign in
      </button>
      {open && (
        <UsernameModal
          isAuthenticated={false}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
