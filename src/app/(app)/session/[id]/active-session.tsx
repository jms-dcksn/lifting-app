"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import type { SessionTarget } from "@/lib/strength/progression";
import {
  logSet,
  editSet,
  deleteSet,
  finishSession,
  type SessionSummary,
} from "../actions";

export interface LoggedSet {
  id: string;
  weight: number;
  reps: number;
  rir: number | null;
  setIndex: number;
}

export interface SlotView {
  exerciseId: string;
  name: string;
  equipment: string;
  increment: number;
  prescription: { targetSets: number; repMin: number; repMax: number; targetRir: number };
  target: SessionTarget | null;
  sets: LoggedSet[];
}

export function ActiveSession({
  sessionId,
  dayName,
  week,
  weeks,
  bodyweight,
  alreadyFinished,
  slots,
}: {
  sessionId: string;
  dayName: string;
  week: number;
  weeks: number;
  bodyweight: number | null;
  alreadyFinished: boolean;
  slots: SlotView[];
}) {
  useScreenWakeLock();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [finishing, startFinish] = useTransition();

  function handleFinish() {
    startFinish(async () => setSummary(await finishSession(sessionId)));
  }

  if (summary) return <Summary dayName={dayName} summary={summary} />;

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-5 pb-28">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{dayName}</h1>
        <p className="text-sm text-zinc-500">
          Week {week} of {weeks}
          {bodyweight ? ` · BW ${bodyweight} lb` : ""}
        </p>
      </header>

      {slots.map((slot) => (
        <SlotCard key={slot.exerciseId} sessionId={sessionId} slot={slot} />
      ))}

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 p-3 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
        <button
          onClick={handleFinish}
          disabled={finishing}
          className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {alreadyFinished ? "View summary" : finishing ? "Finishing…" : "Finish workout"}
        </button>
      </div>
    </div>
  );
}

type OptimisticAction =
  | { type: "add"; set: LoggedSet }
  | { type: "delete"; id: string };

function SlotCard({ sessionId, slot }: { sessionId: string; slot: SlotView }) {
  const [optimisticSets, applyOptimistic] = useOptimistic(
    slot.sets,
    (state: LoggedSet[], action: OptimisticAction) => {
      if (action.type === "add") return [...state, action.set];
      return state.filter((s) => s.id !== action.id);
    },
  );
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const p = slot.prescription;
  const isBodyweight = slot.equipment === "bodyweight";
  const isMachine = slot.equipment.startsWith("machine") || slot.equipment === "cable";

  const initialWeight = slot.target?.weight ?? (isMachine ? 0 : isBodyweight ? 0 : 45);
  const initialReps = slot.target?.targetReps ?? p.repMin;

  function handleLog(weight: number, reps: number, rir: number) {
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        set: { id: `temp-${Date.now()}`, weight, reps, rir, setIndex: optimisticSets.length },
      });
      await logSet({
        sessionId,
        programSlotId: null,
        exerciseId: slot.exerciseId,
        weight,
        reps,
        rir,
      });
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "delete", id });
      await deleteSet(id);
    });
  }

  function handleEdit(id: string, weight: number, reps: number, rir: number) {
    setEditingId(null);
    startTransition(async () => {
      await editSet({ setId: id, weight, reps, rir });
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">{slot.name}</h2>
        <span className="text-xs text-zinc-500">
          {p.targetSets} × {p.repMin}–{p.repMax} @ {p.targetRir} RIR
        </span>
      </div>

      <TargetLine target={slot.target} isBodyweight={isBodyweight} />

      {optimisticSets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {optimisticSets.map((s, i) =>
            editingId === s.id ? (
              <li key={s.id}>
                <SetEntry
                  increment={slot.increment}
                  defaultRir={p.targetRir}
                  initial={{ weight: s.weight, reps: s.reps, rir: s.rir ?? p.targetRir }}
                  label="Save"
                  onSubmit={(w, r, rir) => handleEdit(s.id, w, r, rir)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900"
              >
                <span className="tabular-nums">
                  <span className="text-zinc-400">{i + 1}.</span>{" "}
                  {s.weight} lb × {s.reps}
                  {s.rir != null ? ` @ ${s.rir}` : ""}
                </span>
                <span className="flex gap-3 text-xs">
                  <button
                    onClick={() => setEditingId(s.id)}
                    disabled={s.id.startsWith("temp-")}
                    className="text-zinc-500 disabled:opacity-40"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={s.id.startsWith("temp-")}
                    className="text-red-500 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {editingId === null && (
        <div className="mt-3">
          <SetEntry
            increment={slot.increment}
            defaultRir={p.targetRir}
            initial={{ weight: initialWeight, reps: initialReps, rir: p.targetRir }}
            label="Add set"
            onSubmit={handleLog}
          />
        </div>
      )}
    </section>
  );
}

function TargetLine({
  target,
  isBodyweight,
}: {
  target: SessionTarget | null;
  isBodyweight: boolean;
}) {
  if (!target) {
    return (
      <p className="mt-1 text-sm text-zinc-500">No history yet — log a set to set your baseline.</p>
    );
  }
  const unit = isBodyweight ? "added" : "lb";
  if (target.source === "recommendation") {
    const badge = confidenceBadge(target.confidence);
    return (
      <p className="mt-1 text-sm">
        <span className="text-zinc-500">Start: </span>
        <span className="font-medium">
          {target.weight} {unit} × {target.targetReps}
        </span>
        {badge && <span className={`ml-2 ${badge.className}`}>{badge.label}</span>}
      </p>
    );
  }
  return (
    <p className="mt-1 text-sm">
      <span className="text-zinc-500">Target: </span>
      <span className="font-medium">
        {target.weight} {unit} × {target.targetReps}
      </span>
      {target.last && (
        <span className="text-zinc-400">
          {" "}
          · last: {target.last.weight} × {target.last.reps}
        </span>
      )}
    </p>
  );
}

function confidenceBadge(c: SessionTarget["confidence"]) {
  switch (c) {
    case "calibrate":
      return { label: "feel it out", className: "text-amber-600" };
    case "low":
      return { label: "estimate", className: "text-zinc-400" };
    default:
      return null;
  }
}

function SetEntry({
  increment,
  defaultRir,
  initial,
  label,
  onSubmit,
  onCancel,
}: {
  increment: number;
  defaultRir: number;
  initial: { weight: number; reps: number; rir: number };
  label: string;
  onSubmit: (weight: number, reps: number, rir: number) => void;
  onCancel?: () => void;
}) {
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [rir, setRir] = useState(initial.rir ?? defaultRir);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Stepper label="Weight" value={weight} step={increment} min={-200} onChange={setWeight} />
        <Stepper label="Reps" value={reps} step={1} min={1} onChange={setReps} />
        <Stepper label="RIR" value={rir} step={1} min={0} max={5} onChange={setRir} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit(weight, reps, rir)}
          className="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
        >
          {label}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => {
    let n = v;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-center text-xs uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
        <button
          onClick={() => onChange(clamp(value - step))}
          className="px-3 py-2 text-lg text-zinc-500 active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="w-full min-w-0 bg-transparent py-2 text-center text-base font-semibold tabular-nums outline-none"
        />
        <button
          onClick={() => onChange(clamp(value + step))}
          className="px-3 py-2 text-lg text-zinc-500 active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Summary({ dayName, summary }: { dayName: string; summary: SessionSummary }) {
  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{dayName} done</h1>
        <p className="text-sm text-zinc-500">{summary.totalSets} working sets logged</p>
      </header>

      {summary.topE1rm.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Top e1RM
          </h2>
          <ul className="flex flex-col gap-1">
            {summary.topE1rm.map((t) => (
              <li key={t.exerciseId} className="flex justify-between text-sm">
                <span>{t.name}</span>
                <span className="font-semibold tabular-nums">{Math.round(t.e1rm)} lb</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/"
        className="rounded-xl bg-zinc-900 py-3 text-center font-semibold text-white dark:bg-white dark:text-black"
      >
        Done
      </Link>
    </div>
  );
}

// Keep the screen awake during a workout; re-acquire when the tab returns to foreground.
function useScreenWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wakeLock) return;

    const acquire = async () => {
      try {
        lock = await wakeLock.request("screen");
      } catch {
        // user/device may refuse — non-fatal.
      }
    };
    acquire();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}
