"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRestRemaining, notifyRestDone } from "@/lib/rest";
import {
  cancelRestNotification,
  ensureRestNotificationPermission,
  registerRestNotificationWorker,
  scheduleRestNotification,
} from "@/lib/rest-notification";

export interface RestTimer {
  remaining: number | null; // seconds left, or null when idle
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  skip: () => void;
}

export function useRestTimer(toneEnabled = true): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const endsAtRef = useRef<number | null>(null);

  useEffect(() => {
    void registerRestNotificationWorker();
  }, []);

  // Drive the countdown from the interval only — never set state synchronously in the
  // effect body (the event handlers seed the initial value), so re-renders stay minimal.
  useEffect(() => {
    if (endsAt == null) return;
    const iv = setInterval(() => {
      const left = Math.round((endsAt - Date.now()) / 1000);
      if (left <= 0) {
        cancelRestNotification();
        endsAtRef.current = null;
        setRemaining(null);
        setEndsAt(null);
        notifyRestDone(toneEnabled);
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(iv);
  }, [endsAt, toneEnabled]);

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    const nextEnds = Date.now() + seconds * 1000;
    endsAtRef.current = nextEnds;
    setEndsAt(nextEnds);
    setRemaining(seconds);
    void ensureRestNotificationPermission().then((permission) => {
      if (permission === "granted") void scheduleRestNotification(nextEnds);
    });
  }, []);
  const add = useCallback((seconds: number) => {
    const cur = endsAtRef.current;
    if (cur == null) return;
    const next = cur + seconds * 1000;
    endsAtRef.current = next;
    setEndsAt(next);
    setRemaining((value) => (value == null ? value : value + seconds));
    void scheduleRestNotification(next);
  }, []);
  const skip = useCallback(() => {
    cancelRestNotification();
    endsAtRef.current = null;
    setEndsAt(null);
    setRemaining(null);
  }, []);

  return { remaining, start, add, skip };
}

export function RestBar({ timer }: { timer: RestTimer }) {
  if (timer.remaining == null) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-border-strong bg-surface px-4 py-2">
      <span className="flex items-baseline gap-2">
        <span className="text-caption uppercase tracking-wide text-muted">Rest</span>
        <span className="text-heading tabular-nums">{formatRestRemaining(timer.remaining)}</span>
      </span>
      <span className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => timer.add(30)}>
          +30s
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={timer.skip}>
          Skip
        </Button>
      </span>
    </div>
  );
}
