"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./cx";

const HOLD_DELAY_MS = 450;
const HOLD_REPEAT_MS = 80;

// The most-touched control in the gym: 44px hit areas, press-and-hold auto-repeat,
// value tick animation, select-all on focus. `column` stacks value over −/+ (set
// entry grid); `row` is the inline [−][value][+] form.
export function Stepper({
  label,
  value,
  step,
  min,
  max,
  layout = "column",
  inputMode = "decimal",
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  layout?: "column" | "row";
  inputMode?: "decimal" | "numeric";
  onChange: (v: number) => void;
}) {
  // Hold-repeat reads the latest value through a ref; state lives in the parent.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  const [tick, setTick] = useState(0);

  function clamp(v: number) {
    let n = Number.isFinite(v) ? v : (min ?? 0);
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  }

  const bump = (dir: 1 | -1) => {
    onChange(clamp(valueRef.current + dir * step));
    setTick((t) => t + 1); // remounts the input so the tick animation replays
  };

  const btn =
    "flex h-11 min-w-11 shrink-0 select-none items-center justify-center rounded-control border border-border-strong text-xl text-muted transition-transform duration-150 ease-out active:scale-95 active:bg-surface";

  const input = (
    <input
      key={tick}
      type="number"
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(clamp(Number(e.target.value)))}
      onFocus={(e) => e.currentTarget.select()}
      aria-label={label}
      className={cx(
        "h-11 min-w-0 animate-tick bg-transparent text-center font-semibold tabular-nums",
        layout === "column" ? "w-full text-lg" : "w-12 text-base",
      )}
    />
  );

  if (layout === "row") {
    return (
      <div className="flex items-center gap-1">
        <HoldButton dir={-1} label={`Decrease ${label}`} className={btn} onStep={bump}>
          −
        </HoldButton>
        {input}
        <HoldButton dir={1} label={`Increase ${label}`} className={btn} onStep={bump}>
          +
        </HoldButton>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-center text-caption uppercase tracking-wide text-muted">
        {label}
      </span>
      {input}
      <div className="grid grid-cols-2 gap-1">
        <HoldButton dir={-1} label={`Decrease ${label}`} className={btn} onStep={bump}>
          −
        </HoldButton>
        <HoldButton dir={1} label={`Increase ${label}`} className={btn} onStep={bump}>
          +
        </HoldButton>
      </div>
    </div>
  );
}

// Press-and-hold auto-repeat. The action fires on pointerdown (and repeats on hold);
// click is keyboard-only activation, distinguished via the handled flag, which is
// cleared on a timer because click fires before timers run.
function HoldButton({
  dir,
  label,
  className,
  onStep,
  children,
}: {
  dir: 1 | -1;
  label: string;
  className?: string;
  onStep: (dir: 1 | -1) => void;
  children: React.ReactNode;
}) {
  const hold = useRef<{
    start?: ReturnType<typeof setTimeout>;
    repeat?: ReturnType<typeof setInterval>;
  }>({});
  const pointerHandled = useRef(false);

  useEffect(() => {
    const h = hold.current;
    return () => {
      clearTimeout(h.start);
      clearInterval(h.repeat);
    };
  }, []);

  const end = () => {
    clearTimeout(hold.current.start);
    clearInterval(hold.current.repeat);
    setTimeout(() => {
      pointerHandled.current = false;
    }, 0);
  };

  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      onPointerDown={(e) => {
        e.preventDefault(); // keep focus where it is; no text selection
        pointerHandled.current = true;
        onStep(dir);
        hold.current.start = setTimeout(() => {
          hold.current.repeat = setInterval(() => onStep(dir), HOLD_REPEAT_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onClick={() => {
        if (!pointerHandled.current) onStep(dir); // keyboard (Enter/Space)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
