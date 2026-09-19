"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { formatRestRemaining, notifyRestDone } from "@/lib/rest";
import {
  browserRestTimerStore,
  readRestEndsAt,
  restRemainingSeconds,
  subscribeRestTimer,
  writeRestEndsAt,
} from "@/lib/rest-timer-state";
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

const RestTimerContext = createContext<RestTimer | null>(null);

export function RestTimerProvider({
  sessionId,
  toneEnabled,
  enabled = true,
  children,
}: {
  sessionId: string;
  toneEnabled: boolean;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const timer = useRestTimer(toneEnabled, sessionId, enabled);
  return <RestTimerContext.Provider value={timer}>{children}</RestTimerContext.Provider>;
}

export function useSessionRestTimer(): RestTimer {
  const timer = useContext(RestTimerContext);
  if (!timer) throw new Error("Rest timer is missing from the session layout.");
  return timer;
}

export function SessionRestBar() {
  const timer = useContext(RestTimerContext);
  if (!timer || timer.remaining == null) return null;
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
      <RestBar timer={timer} />
    </div>
  );
}

export function useRestTimer(toneEnabled = true, sessionId = "", enabled = true): RestTimer {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeRestTimer(sessionId, onStoreChange),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (enabled ? readRestEndsAt(browserRestTimerStore(), sessionId) : null),
    [enabled, sessionId],
  );
  const endsAt = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [, setTick] = useState(0);

  useEffect(() => {
    void registerRestNotificationWorker();
  }, []);

  useEffect(() => {
    if (enabled || !sessionId) return;
    cancelRestNotification();
    writeRestEndsAt(browserRestTimerStore(), sessionId, null);
  }, [enabled, sessionId]);

  // Drive the countdown from the interval only — remaining is derived from the
  // persisted end timestamp, so tab throttling and remounts self-correct.
  useEffect(() => {
    if (endsAt == null || !sessionId) return;
    const iv = setInterval(() => {
      if (restRemainingSeconds(endsAt) <= 0) {
        cancelRestNotification();
        writeRestEndsAt(browserRestTimerStore(), sessionId, null);
        notifyRestDone(toneEnabled);
      } else {
        setTick((tick) => tick + 1);
      }
    }, 250);
    return () => clearInterval(iv);
  }, [endsAt, sessionId, toneEnabled]);

  const start = useCallback((seconds: number) => {
    if (!enabled || !sessionId || seconds <= 0) return;
    const nextEnds = Date.now() + seconds * 1000;
    writeRestEndsAt(browserRestTimerStore(), sessionId, nextEnds);
    void ensureRestNotificationPermission().then((permission) => {
      if (permission === "granted") void scheduleRestNotification(nextEnds);
    });
  }, [enabled, sessionId]);
  const add = useCallback((seconds: number) => {
    if (!enabled || !sessionId) return;
    const cur = readRestEndsAt(browserRestTimerStore(), sessionId);
    if (cur == null) return;
    const next = cur + seconds * 1000;
    writeRestEndsAt(browserRestTimerStore(), sessionId, next);
    void scheduleRestNotification(next);
  }, [enabled, sessionId]);
  const skip = useCallback(() => {
    cancelRestNotification();
    writeRestEndsAt(browserRestTimerStore(), sessionId, null);
  }, [sessionId]);

  const secondsLeft = endsAt == null ? 0 : restRemainingSeconds(endsAt);
  const remaining = secondsLeft > 0 ? secondsLeft : null;
  return useMemo(
    () => ({ remaining, start, add, skip }),
    [remaining, start, add, skip],
  );
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
