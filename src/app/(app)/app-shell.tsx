"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cx } from "@/components/ui/cx";
import { IconGrid, IconPlay, IconProgram, IconUser } from "@/components/ui/icons";
import { hideAppChrome } from "@/lib/app-chrome";

const tabs = [
  { href: "/", label: "Train", icon: IconPlay, match: (path: string) => path === "/" },
  { href: "/analytics", label: "Track", icon: IconGrid, match: (path: string) => path === "/analytics" || path.startsWith("/analytics/") },
  { href: "/program", label: "Program", icon: IconProgram, match: (path: string) => path === "/program" || path.startsWith("/program/") },
  { href: "/settings", label: "You", icon: IconUser, match: (path: string) => path === "/settings" || path.startsWith("/settings/") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <Suspense fallback={<ShellFrame hide={hideAppChrome(pathname)} pathname={pathname}>{children}</ShellFrame>}>
      <AppShellInner pathname={pathname}>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const hide = hideAppChrome(pathname, searchParams.toString());
  return <ShellFrame hide={hide} pathname={pathname}>{children}</ShellFrame>;
}

function ShellFrame({
  hide,
  pathname,
  children,
}: {
  hide: boolean;
  pathname?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx("flex min-h-full flex-col", !hide && "pb-[calc(4.25rem+env(safe-area-inset-bottom))]")}>
      <main className="flex flex-1 flex-col">{children}</main>
      {!hide && <TabBar pathname={pathname} />}
    </div>
  );
}

function TabBar({ pathname = "" }: { pathname?: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-page grid-cols-4">
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-caption font-medium",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground",
                  active ? "text-foreground" : "text-muted",
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
