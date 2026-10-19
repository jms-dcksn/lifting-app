"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { refreshInbox } from "@/app/(app)/coach/inbox/actions";
import { IconButton } from "@/components/ui/icon-button";
import { CoachInboxContext } from "./coach-inbox-button";

// One refresh per shell, coalesced across route/visibility/mutation events.
export function CoachInboxProvider({
  pathname,
  hide,
  children,
}: {
  pathname: string;
  hide: boolean;
  children: ReactNode;
}) {
  const [unread, setUnread] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [arrival, setArrival] = useState<{ id: string; title: string } | null>(
    null,
  );
  const inFlight = useRef(false);
  const rerun = useRef(false);
  const suppressArrivals = hide || pathname === "/coach" || pathname.startsWith("/coach/");
  const hidden = useRef(suppressArrivals);
  useEffect(() => {
    hidden.current = suppressArrivals;
  }, [suppressArrivals]);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      if (hidden.current) setArrival(null);
      if (document.visibilityState === "hidden") return;
      if (inFlight.current) {
        rerun.current = true;
        return;
      }
      inFlight.current = true;
      try {
        const result = await refreshInbox(!hidden.current);
        if (!mounted) return;
        setEnabled(result.refresh.status !== "disabled");
        setFailed(
          result.refresh.status === "unavailable" ||
            result.refresh.status === "refresh_required",
        );
        if (result.page) setUnread(result.page.unread);
        if (!hidden.current && result.refresh.arrival)
          setArrival(result.refresh.arrival);
        window.dispatchEvent(new Event("coach:updated"));
      } catch {
        if (mounted) setFailed(true);
      } finally {
        inFlight.current = false;
        if (mounted && rerun.current) {
          rerun.current = false;
          void refresh();
        }
      }
    };
    const onMutation = () => {
      void refresh();
    };
    window.addEventListener("focus", onMutation);
    document.addEventListener("visibilitychange", onMutation);
    window.addEventListener("coach:refresh", onMutation);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onMutation);
      document.removeEventListener("visibilitychange", onMutation);
      window.removeEventListener("coach:refresh", onMutation);
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new Event("coach:refresh"));
  }, [pathname, hide]);
  return (
    <CoachInboxContext.Provider value={{ unread, failed, visible: !hide && enabled, pathname }}>
      {children}
      {!suppressArrivals && enabled && arrival ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-page items-center justify-between gap-2 rounded-card border border-border-strong bg-background p-3 shadow-lg"
        >
          <Link
            className="min-h-11 content-center text-sm"
            href={`/coach/inbox/${arrival.id}`}
          >
            {arrival.title}
          </Link>
          <IconButton
            aria-label="Close Coach notification"
            onClick={() => setArrival(null)}
          >
            ×
          </IconButton>
        </div>
      ) : null}
    </CoachInboxContext.Provider>
  );
}
