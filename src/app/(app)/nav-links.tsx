"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

const links = [
  { href: "/program", label: "Program" },
  { href: "/settings", label: "Settings" },
];

// Active route reads as active (foreground); others stay muted.
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-2 text-body">
      <Link href="/" className="px-1 py-3 font-semibold tracking-tight">
        Lift
      </Link>
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "px-2 py-3 transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
