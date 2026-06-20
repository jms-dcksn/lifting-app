"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRestRemaining } from "@/lib/rest";

export interface RestTimer {
  remaining: number | null; // seconds left, or null when idle
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  skip: () => void;
}

// One rest countdown for the whole session — only one rest runs at a time. Tracks an
// absolute end timestamp (not a decrementing counter), so it stays accurate across the
// 250ms tick and any tab throttling. Fires a vibrate + short beep once on completion.
export function useRestTimer(): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Drive the countdown from the interval only — never set state synchronously in the
  // effect body (the event handlers seed the initial value), so re-renders stay minimal.
  useEffect(() => {
    if (endsAt == null) return;
    const iv = setInterval(() => {
      const left = Math.round((endsAt - Date.now()) / 1000);
      if (left <= 0) {
        setRemaining(null);
        setEndsAt(null);
        notifyRestDone();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(iv);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    setEndsAt(Date.now() + seconds * 1000);
    setRemaining(seconds);
  }, []);
  const add = useCallback((seconds: number) => {
    setEndsAt((cur) => (cur == null ? cur : cur + seconds * 1000));
    setRemaining((cur) => (cur == null ? cur : cur + seconds));
  }, []);
  const skip = useCallback(() => {
    setEndsAt(null);
    setRemaining(null);
  }, []);

  return { remaining, start, add, skip };
}

// Vibration + a brief beep. Both are best-effort: unsupported browsers (and audio that the
// browser blocks without a recent gesture) simply no-op.
function notifyRestDone() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // no-op
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // no-op
  }
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
