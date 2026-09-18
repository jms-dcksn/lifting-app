"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { VARIANTS, type VariantKey } from "./variant";

// Three variants of a PR-first visual language, switchable via ?variant=,
// on throwaway /prototype/ux. A Board (tabs + compound grid), B Atlas
// (spatial pattern bands + one-lift session), C Pulse (timeline + recap).
export function UxPrototype({ variant }: { variant: VariantKey }) {
  const [state, setState] = useState<Record<string, unknown>>({ variant });
  const onState = useCallback((next: Record<string, unknown>) => {
    setState(next);
  }, []);

  return (
    <div className="proto-studio">
      <aside className="proto-brief">
        <p className="proto-kicker">Throwaway visual study</p>
        <h1>What should a PR-first Lift look like?</h1>
        <p>
          Current app is a precise logger in near-monochrome type. That is honest. It is also easy
          to miss the point: you came here to watch a handful of lifts get heavier.
        </p>

        <section>
          <h2>Keep in front</h2>
          <ul>
            <li>Start / resume today’s work</li>
            <li>The six compounds (squat, hinge, press, overhead, row, pull)</li>
            <li>Pins you choose — hip thrust, split squat, whatever you actually chase</li>
            <li>This week’s records, as gold not caption text</li>
            <li>The working number mid-set</li>
          </ul>
        </section>

        <section>
          <h2>Hide, then offer</h2>
          <ul>
            <li>Next-workout slot list, RIR, rest → plan sheet</li>
            <li>What e1RM / PR means → info button</li>
            <li>Coach paste + proposals → You / a sheet of three next steps</li>
            <li>Volume, balance, bodyweight charts → You, not Home</li>
            <li>Month windows, stalls, equipment identity → month / lift detail</li>
            <li>Swap, history, machine brand → icon buttons on the set</li>
            <li>Sign out, rest default, period tracking → You overflow</li>
          </ul>
        </section>

        <section>
          <h2>How the three disagree</h2>
          <ul>
            <li><b>A Board</b> — four bottom tabs. Strength is a scoreboard of tiles. Session stays a list, with icon actions and a PR stamp.</li>
            <li><b>B Atlas</b> — no tabs. Home is a stacked pattern map. Workout is a floating pill. Session is one giant number at a time.</li>
            <li><b>C Pulse</b> — no grid. Today is a ticket + a number ticker + a PR timeline. Recap is cinematic. Two destinations only.</li>
          </ul>
        </section>

        <section>
          <h2>Steal this, not that</h2>
          <ul>
            <li>Keep Geist, one column, 44px targets. Do not become a sticker book.</li>
            <li>One new accent is enough: PR gold, on top of overload green/red.</li>
            <li>Session must hide the main nav — rest timer + finish already own the bottom.</li>
            <li>Pins are a display preference, not a new record identity.</li>
            <li>Cap what is pinned (about 6–8). A board of twenty is Progress again.</li>
          </ul>
        </section>
      </aside>

      <div className="proto-stage">
        <div className="proto-phone">
          <div className="proto-phone-screen">
            {variant === "A" && <VariantA onState={onState} />}
            {variant === "B" && <VariantB onState={onState} />}
            {variant === "C" && <VariantC onState={onState} />}
          </div>
        </div>
        <pre className="proto-state">{JSON.stringify(state, null, 2)}</pre>
      </div>

      <PrototypeSwitcher current={variant} />
    </div>
  );
}

function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = VARIANTS.findIndex((item) => item.key === current);
  const label = VARIANTS[index] ?? VARIANTS[0];

  const go = useMemo(() => {
    return (key: VariantKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", key);
      router.replace(`${pathname}?${params.toString()}`);
    };
  }, [pathname, router, searchParams]);

  function cycle(delta: number) {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    go(next.key);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      go(next.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  return (
    <div className="proto-switcher">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>←</button>
      <div className="label">{label.key} ({label.name})</div>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)}>→</button>
    </div>
  );
}
