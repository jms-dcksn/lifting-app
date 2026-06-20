"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { EXERCISE_BY_ID, type Pattern } from "@/lib/strength/coefficients";
import {
  sessionTarget,
  startingWeight,
  type LastPerformance,
  type SessionTarget,
} from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { ExercisePicker } from "../../program/exercise-picker";
import { RestBar, useRestTimer } from "./rest-timer";
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
  programSlotId: string;
  exerciseId: string; // last logged this session, else the program slot's exercise
  pattern: Pattern;
  prescription: { targetSets: number; repMin: number; repMax: number; targetRir: number };
  lastByExercise: Record<string, LastPerformance>;
  restSeconds: number | null;
  sets: LoggedSet[];
}

export function ActiveSession({
  sessionId,
  dayName,
  week,
  weeks,
  bodyweight,
  defaultRestSeconds,
  alreadyFinished,
  stats,
  recentIds,
  slots,
}: {
  sessionId: string;
  dayName: string;
  week: number;
  weeks: number;
  bodyweight: number | null;
  defaultRestSeconds: number;
  alreadyFinished: boolean;
  stats: ExerciseStat[];
  recentIds: string[];
  slots: SlotView[];
}) {
  useScreenWakeLock();
  const rest = useRestTimer();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [finishing, startFinish] = useTransition();

  function handleFinish() {
    startFinish(async () => setSummary(await finishSession(sessionId)));
  }

  if (summary) return <Summary dayName={dayName} summary={summary} />;

  // Current slot = first one not yet at its target set count (server truth; re-derives
  // after each logged set revalidates). Earlier slots recede, the current one reads active.
  const currentIndex = slots.findIndex((s) => s.sets.length < s.prescription.targetSets);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="text-display">{dayName}</h1>
        <p className="text-body text-muted">
          Week {week} of {weeks}
          {bodyweight ? ` · BW ${bodyweight} lb` : ""}
        </p>
      </header>

      {slots.map((slot, i) => (
        <SlotCard
          key={slot.programSlotId}
          sessionId={sessionId}
          slot={slot}
          isCurrent={i === currentIndex}
          stats={stats}
          bodyweight={bodyweight}
          recentIds={recentIds}
          startRest={() => rest.start(slot.restSeconds ?? defaultRestSeconds)}
        />
      ))}

      <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <RestBar timer={rest} />
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleFinish}
          pending={finishing}
        >
          {alreadyFinished ? "View summary" : "Finish workout"}
        </Button>
      </div>
    </div>
  );
}

type OptimisticAction =
  | { type: "add"; set: LoggedSet }
  | { type: "delete"; id: string };

function SlotCard({
  sessionId,
  slot,
  isCurrent,
  stats,
  bodyweight,
  recentIds,
  startRest,
}: {
  sessionId: string;
  slot: SlotView;
  isCurrent: boolean;
  stats: ExerciseStat[];
  bodyweight: number | null;
  recentIds: string[];
  startRest: () => void;
}) {
  const [optimisticSets, applyOptimistic] = useOptimistic(
    slot.sets,
    (state: LoggedSet[], action: OptimisticAction) => {
      if (action.type === "add") return [...state, action.set];
      return state.filter((s) => s.id !== action.id);
    },
  );
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Rows fading out before their delete commits, and the last failed-write message.
  const [exitingIds, setExitingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Swap (machine taken, etc.): sets log against the swapped exercise_id but keep the
  // original program_slot_id, so each exercise's progression chain stays intact.
  const [exerciseId, setExerciseId] = useState(slot.exerciseId);
  const [swapping, setSwapping] = useState(false);

  const def = EXERCISE_BY_ID[exerciseId];
  const name = def?.name ?? exerciseId;
  const equipment = def?.equipment ?? "barbell";
  const increment = def?.increment ?? 5;

  const p = slot.prescription;
  const isBodyweight = equipment === "bodyweight";
  const isMachine = equipment.startsWith("machine") || equipment === "cable";

  // Target computes client-side off hydrated stats, so a swap re-derives it instantly.
  const target = useMemo(
    () =>
      def
        ? sessionTarget(
            def,
            { repMin: p.repMin, repMax: p.repMax, targetRir: p.targetRir },
            slot.lastByExercise[exerciseId] ?? null,
            EXERCISE_BY_ID,
            stats,
            bodyweight,
          )
        : null,
    [def, exerciseId, p.repMin, p.repMax, p.targetRir, slot.lastByExercise, stats, bodyweight],
  );

  // Before any history exists, the suggested weight follows reps/RIR edits live.
  const liveWeight =
    def && target?.source === "recommendation"
      ? (reps: number, rir: number) =>
          startingWeight(def, reps, rir, EXERCISE_BY_ID, stats, bodyweight)?.weight ?? null
      : undefined;

  const initialWeight = target?.weight ?? (isMachine ? 0 : isBodyweight ? 0 : 45);
  const initialReps = target?.targetReps ?? p.repMin;

  const done = optimisticSets.length;
  const complete = done >= p.targetSets;
  const tone = complete ? "done" : isCurrent ? "active" : "default";

  function handleLog(weight: number, reps: number, rir: number) {
    setError(null);
    // Rest starts the moment the set is logged (optimistically) — a failed write doesn't
    // stop the clock, which matches what the lifter is already doing: resting.
    startRest();
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        set: { id: `temp-${Date.now()}`, weight, reps, rir, setIndex: optimisticSets.length },
      });
      try {
        await logSet({
          sessionId,
          programSlotId: slot.programSlotId,
          exerciseId,
          weight,
          reps,
          rir,
        });
      } catch {
        // optimistic row reverts when the transition settles — surface why so it
        // doesn't just vanish.
        setError("Couldn’t save that set. Check your connection and try again.");
      }
    });
  }

  // Play the row's exit animation, then commit the delete.
  function handleDelete(id: string) {
    if (id.startsWith("temp-")) return;
    setError(null);
    setExitingIds((ids) => [...ids, id]);
    setTimeout(() => {
      startTransition(async () => {
        applyOptimistic({ type: "delete", id });
        try {
          await deleteSet(id);
        } catch {
          setError("Couldn’t delete that set. Try again.");
        }
      });
      setExitingIds((ids) => ids.filter((x) => x !== id));
    }, 160);
  }

  function handleEdit(id: string, weight: number, reps: number, rir: number) {
    setEditingId(null);
    startTransition(async () => {
      await editSet({ setId: id, weight, reps, rir });
    });
  }

  return (
    <Card tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading">
          <Link href={`/history/${exerciseId}`} className="underline-offset-2 hover:underline">
            {name}
          </Link>
        </h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSwapping(true)}
          aria-label={`Swap ${name} for another exercise`}
          className="shrink-0"
        >
          Swap
        </Button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-caption text-muted">
          {p.targetSets} × {p.repMin}–{p.repMax} @ {p.targetRir} RIR
        </span>
        <ProgressDots done={done} target={p.targetSets} />
      </div>

      <TargetLine target={target} isBodyweight={isBodyweight} done={done} />

      {swapping && (
        <ExercisePicker
          recentIds={recentIds}
          patternFilter={slot.pattern}
          onPick={(e) => setExerciseId(e.id)}
          onClose={() => setSwapping(false)}
        />
      )}

      {optimisticSets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {optimisticSets.map((s, i) =>
            editingId === s.id ? (
              <li key={s.id}>
                <SetEntry
                  increment={increment}
                  defaultRir={p.targetRir}
                  initial={{ weight: s.weight, reps: s.reps, rir: s.rir ?? p.targetRir }}
                  label="Save"
                  disabled={isPending}
                  onSubmit={(w, r, rir) => handleEdit(s.id, w, r, rir)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={s.id}
                data-exiting={exitingIds.includes(s.id) || undefined}
                className="flex animate-row-in items-center justify-between rounded-control bg-surface px-3 py-1 text-body"
              >
                <span className="tabular-nums">
                  <span className="text-faint">{i + 1}.</span>{" "}
                  {s.weight} lb × {s.reps}
                  {s.rir != null ? ` @ ${s.rir}` : ""}
                </span>
                <span className="flex items-center gap-1 text-caption">
                  <button
                    type="button"
                    onClick={() => setEditingId(s.id)}
                    disabled={s.id.startsWith("temp-")}
                    className="px-2 py-2 text-muted disabled:opacity-40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    disabled={s.id.startsWith("temp-")}
                    className="px-2 py-2 text-danger disabled:opacity-40"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {error && <p className="mt-2 text-caption text-danger">{error}</p>}

      {editingId === null && (
        <div className="mt-3">
          <SetEntry
            key={exerciseId}
            increment={increment}
            defaultRir={p.targetRir}
            initial={{ weight: initialWeight, reps: initialReps, rir: p.targetRir }}
            label="Add set"
            disabled={isPending}
            liveWeight={liveWeight}
            onSubmit={handleLog}
          />
        </div>
      )}
    </Card>
  );
}

// Sets-done vs target at a glance — filled dots, hierarchy not color.
function ProgressDots({ done, target }: { done: number; target: number }) {
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`${done} of ${target} sets logged`}
    >
      {Array.from({ length: target }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < done ? "bg-foreground" : "bg-border-strong"}`}
        />
      ))}
      {done > target && (
        <span className="ml-0.5 text-caption tabular-nums text-muted">+{done - target}</span>
      )}
    </span>
  );
}

function TargetLine({
  target,
  isBodyweight,
  done,
}: {
  target: SessionTarget | null;
  isBodyweight: boolean;
  done: number;
}) {
  if (!target) {
    return (
      <p className="mt-2 text-body text-muted">No history yet — log a set to set your baseline.</p>
    );
  }
  const unit = isBodyweight ? "added" : "lb";
  const isRecommendation = target.source === "recommendation";

  // A recommendation is a *first-set* suggestion; once sets are logged this session it's
  // stale, so drop it (the next-set weight already carries forward in the stepper).
  if (isRecommendation && done > 0) return null;

  const value = (
    <span className="text-heading tabular-nums">
      {target.weight} {unit} <span className="font-normal text-muted">× {target.targetReps}</span>
    </span>
  );

  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-2">
        <span className="text-caption uppercase tracking-wide text-muted">
          {isRecommendation ? "Start" : "Target"}
        </span>
        {value}
        {target.source === "progression" && target.last && (
          <span className="text-caption tabular-nums text-muted">
            last {target.last.weight} × {target.last.reps}
          </span>
        )}
      </div>
      {isRecommendation && target.confidence === "calibrate" && (
        <p className="mt-1 text-caption text-calibrate">
          New machine — feel out the first set, then it calibrates to you.
        </p>
      )}
      {isRecommendation && target.confidence === "low" && (
        <p className="mt-1 text-caption text-muted">Starting estimate from your similar lifts.</p>
      )}
    </div>
  );
}

function SetEntry({
  increment,
  defaultRir,
  initial,
  label,
  disabled,
  liveWeight,
  onSubmit,
  onCancel,
}: {
  increment: number;
  defaultRir: number;
  initial: { weight: number; reps: number; rir: number };
  label: string;
  disabled?: boolean;
  // Recommender-derived weight for given reps/RIR; the weight field follows it live
  // until the user touches weight manually.
  liveWeight?: (reps: number, rir: number) => number | null;
  onSubmit: (weight: number, reps: number, rir: number) => void;
  onCancel?: () => void;
}) {
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [rir, setRir] = useState(initial.rir ?? defaultRir);
  const [weightTouched, setWeightTouched] = useState(false);

  function follow(nextReps: number, nextRir: number) {
    if (weightTouched || !liveWeight) return;
    const w = liveWeight(nextReps, nextRir);
    if (w != null) setWeight(w);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Stepper
          label="Weight"
          value={weight}
          step={increment}
          min={-200}
          onChange={(v) => {
            setWeightTouched(true);
            setWeight(v);
          }}
        />
        <Stepper
          label="Reps"
          value={reps}
          step={1}
          min={1}
          inputMode="numeric"
          onChange={(v) => {
            setReps(v);
            follow(v, rir);
          }}
        />
        <Stepper
          label="RIR"
          value={rir}
          step={1}
          min={0}
          max={5}
          inputMode="numeric"
          onChange={(v) => {
            setRir(v);
            follow(reps, v);
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="md"
          className="flex-1"
          onClick={() => onSubmit(weight, reps, rir)}
          disabled={disabled}
        >
          {label}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({ dayName, summary }: { dayName: string; summary: SessionSummary }) {
  // Staggered rise so the payoff screen lands as a moment, not a flash.
  let step = 0;
  const delay = () => ({ animationDelay: `${step++ * 70}ms` });
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-8">
      <header className="animate-rise" style={delay()}>
        <h1 className="text-display">{dayName} done</h1>
        <p className="text-body text-muted">{summary.totalSets} working sets logged</p>
      </header>

      {summary.topE1rm.length > 0 && (
        <Card className="animate-rise" style={delay()}>
          <CardLabel className="mb-2">Top e1RM</CardLabel>
          <ul className="flex flex-col gap-2">
            {summary.topE1rm.map((t) => (
              <li
                key={t.exerciseId}
                className="flex animate-rise items-baseline justify-between text-body"
                style={delay()}
              >
                <Link href={`/history/${t.exerciseId}`} className="underline-offset-2 hover:underline">
                  {t.name}
                </Link>
                <span className="tabular-nums">
                  <span className="font-semibold">{Math.round(t.e1rm)} lb</span>
                  <OverloadDelta e1rm={t.e1rm} prevE1rm={t.prevE1rm} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/" className={buttonClasses("primary", "lg", "w-full animate-rise")} style={delay()}>
        Done
      </Link>
    </div>
  );
}

// vs the previous session of this exercise: green = beat it, red = under it.
function OverloadDelta({ e1rm, prevE1rm }: { e1rm: number; prevE1rm: number | null }) {
  if (prevE1rm == null) return <span className="ml-2 text-caption text-muted">first</span>;
  const delta = Math.round(e1rm - prevE1rm);
  if (delta === 0) return <span className="ml-2 text-caption text-muted">±0</span>;
  const cls = delta > 0 ? "text-overload-up" : "text-overload-down";
  return (
    <span className={`ml-2 text-caption font-medium ${cls}`}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
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
