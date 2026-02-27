"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Singleplayer" },
  { href: "/multiplayer", label: "Multiplayer" },
];

interface Props {
  username?: string;
}

export default function NavBar({ username }: Props) {
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
        <span className="ml-auto text-sm font-bold select-none px-2">{username}</span>
      )}
    </nav>
  );
}
