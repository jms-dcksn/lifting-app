"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { iconButtonClasses } from "@/components/ui/icon-button-styles";
import { IconBell } from "@/components/ui/icons";

export const CoachInboxContext = createContext<{
  unread: number;
  failed: boolean;
  visible: boolean;
  pathname: string;
} | null>(null);

export function CoachInboxButton() {
  const inbox = useContext(CoachInboxContext);
  if (!inbox?.visible) return null;
  const { unread, failed, pathname } = inbox;
  return (
    <Link
      href="/coach/inbox"
      aria-label={`Coach inbox${unread ? `, ${unread} unread` : ""}${failed ? ", refresh needed" : ""}`}
      title="Coach inbox"
      aria-current={pathname === "/coach/inbox" ? "page" : undefined}
      className={iconButtonClasses("ghost", "relative")}
    >
      <IconBell />
      {unread > 0 || failed ? (
        <span
          aria-hidden
          className="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-caption tabular-nums text-background ring-2 ring-background"
        >
          {failed ? "!" : unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
