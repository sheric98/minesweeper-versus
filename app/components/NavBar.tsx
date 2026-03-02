"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Singleplayer" },
  { href: "/multiplayer", label: "Multiplayer" },
];

interface Props {
  username?: string;
  authLevel?: "anonymous" | "google";
}

export default function NavBar({ username, authLevel }: Props) {
  const pathname = usePathname();

  return (
    <nav className="w-full bg-ms-silver border-b-2 border-ms-dark flex items-center gap-1 px-3 py-1">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            style={
              active
                ? {
                    borderTop: "2px solid #808080",
                    borderLeft: "2px solid #808080",
                    borderBottom: "2px solid #ffffff",
                    borderRight: "2px solid #ffffff",
                  }
                : {
                    borderTop: "2px solid #ffffff",
                    borderLeft: "2px solid #ffffff",
                    borderBottom: "2px solid #808080",
                    borderRight: "2px solid #808080",
                  }
            }
            className="px-4 py-1 text-sm font-bold select-none bg-ms-silver hover:brightness-95"
          >
            {label}
          </Link>
        );
      })}
      {username && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm font-bold select-none px-2">
            {username}
            {authLevel === "google" && (
              <span className="ml-1 text-xs font-normal text-[#808080]">(Google)</span>
            )}
          </span>
          <a
            href="/api/auth/signout"
            className="text-xs text-[#808080] hover:text-black select-none underline"
          >
            Sign out
          </a>
        </div>
      )}
    </nav>
  );
}
