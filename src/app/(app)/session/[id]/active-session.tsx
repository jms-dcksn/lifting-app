"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";
import {
  selectProgressionReference,
  sessionTarget,
  startingWeight,
  type ProgressionPerformance,
  type ProgressionReference,
  type SessionTarget,
} from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { rirLabel, type EffectivePrescription, type ProgramPhase } from "@/lib/periodization";
import type { SessionFeedback } from "@/lib/session-feedback";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconHistory, IconLastUsed, IconSwap } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { Stepper } from "@/components/ui/stepper";
import { PinButton } from "../../pins/pin-button";
import { ExercisePicker } from "../../program/exercise-picker";
import { RestBar, useSessionRestTimer } from "./rest-timer";
import { ExerciseHistory } from "./exercise-history";
import {
  swapSessionExercise,
  logSet,
  editSet,
  deleteSet,
  finishSession,
  updateSessionFeedback,
  acceptAdaptation,
  dismissAdaptation,
  retryRecomputeStat,
} from "../actions";
import { AchievementPills } from "./achievements";
import { recordsForSlot, type ExerciseRecords } from "@/lib/strength/records";
import { exerciseReviewHref } from "@/lib/exercise-review-href";
import { variantShortLabel } from "@/lib/exercise-id";
import { ReadinessPrompt, SessionFeedbackDetails, SessionFeedbackSheet } from "./session-feedback";
import { retryServerAction } from "@/lib/retry";
import { sessionRecapPath } from "@/lib/session-paths";
import { FinishedWorkoutNav } from "./session-nav";

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

function WorkoutRecordsSync({
  recordsPromise,
  onRecords,
}: {
  recordsPromise: Promise<ExerciseRecords[] | null>;
  onRecords: (records: ExerciseRecords[]) => void;
}) {
  const records = use(recordsPromise);
  useEffect(() => {
    if (records) onRecords(records);
  }, [onRecords, records]);
  return null;
}

export interface LoggedSet {
  id: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  weight: number;
  reps: number;
  rir: number | null;
  setIndex: number;
}

export interface SlotView {
  programSlotId: string;
  exerciseId: string; // last logged this session, else the program slot's exercise
  pattern: Pattern;
  prescription: Omit<EffectivePrescription, "phase">;
  restSeconds: number | null;
  sets: LoggedSet[];
  pendingSuggestion: import("@/lib/fluid").PendingSuggestion | null;
  lastUsedAlternate: string | null;
}

export function ActiveSession({
  sessionId,
  dayName,
  week,
  weeks,
  phase,
  bodyweight,
  defaultRestSeconds,
  alreadyFinished,
  initialFeedback,
  stats,
  recentIds,
  slots,
  progressionByExercise,
  catalog: initialCatalog,
  recordsPromise,
  pinnedIds,
}: {
  sessionId: string;
  dayName: string;
  week: number;
  weeks: number;
  phase: ProgramPhase | null;
  bodyweight: number | null;
  defaultRestSeconds: number;
  alreadyFinished: boolean;
  initialFeedback: SessionFeedback;
  stats: ExerciseStat[];
  recentIds: string[];
  slots: SlotView[];
  progressionByExercise: Record<string, ProgressionPerformance[]>;
  catalog: Record<string, ExerciseDef>;
  recordsPromise: Promise<ExerciseRecords[] | null>;
  pinnedIds: string[];
}) {
  useScreenWakeLock(!alreadyFinished);
  const router = useRouter();
  const rest = useSessionRestTimer();
  const [achievements, setAchievements] = useState<ExerciseRecords[]>([]);
  const onRecords = useCallback((records: ExerciseRecords[]) => {
    setAchievements(records);
  }, []);
  // Holds the merged catalog in state so a variant resolved in-session can be added and
  // immediately drive that slot's name/target without a round-trip.
  const [catalog, setCatalog] = useState(initialCatalog);
  const addToCatalog = useCallback(
    (def: ExerciseDef) => setCatalog((c) => (c[def.id] ? c : { ...c, [def.id]: def })),
    [],
  );
  const [feedback, setFeedback] = useState(initialFeedback);
  const [feedbackSheet, setFeedbackSheet] = useState<"finish" | "edit" | null>(null);
  const [finishing, startFinish] = useTransition();
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const phasePrescription = slots[0]?.prescription;
  const hasLoggedSets = slots.some((slot) => slot.sets.length > 0);

  function handleFinish(nextFeedback: Pick<SessionFeedback, "jointPain" | "note">) {
    return new Promise<void>((resolve, reject) => {
      startFinish(async () => {
        try {
          await retryServerAction(
            () => finishSession(sessionId, nextFeedback),
            { onRetry: () => setSummaryError("Retrying…") }
          );
          rest.skip();
          setFeedbackSheet(null);
          setSummaryError(null);
          router.replace(sessionRecapPath(sessionId));
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async function handleFeedbackEdit(nextFeedback: Pick<SessionFeedback, "jointPain" | "note">) {
    const saved = await retryServerAction(
      () => updateSessionFeedback({ sessionId, ...nextFeedback }),
      { onRetry: () => {} }
    );
    const updated = { ...feedback, ...saved };
    setFeedback(updated);
    setFeedbackSheet(null);
  }

  // Current slot = first one not yet at its target set count (server truth; re-derives
  // after each logged set revalidates). Earlier slots recede, the current one reads active.
  const currentIndex = slots.findIndex((s) => s.sets.length < s.prescription.targetSets);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-4 py-5">
      <Suspense fallback={null}>
        <WorkoutRecordsSync recordsPromise={recordsPromise} onRecords={onRecords} />
      </Suspense>
      <header>
        <h1 className="text-display">{dayName}</h1>
        <p className="text-body text-muted">
          {alreadyFinished ? `Finished · Week ${week} of ${weeks}` : `Week ${week} of ${weeks}`}
          {bodyweight ? ` · BW ${bodyweight} lb` : ""}
        </p>
      </header>

      {phase && phasePrescription ? (
        <Card tone="active">
          <CardLabel>Week {week} · {phase.name}</CardLabel>
          {phase.description ? (
            <p className="mt-1 text-body">{phase.description}</p>
          ) : null}
          <p className="mt-2 text-caption text-muted">
            Effective RIR: {rirLabel(phasePrescription)}
            {phase.setMultiplier != null ? ` · ${Math.round(phase.setMultiplier * 100)}% working sets` : ""}
          </p>
        </Card>
      ) : null}

      {!alreadyFinished && !hasLoggedSets && initialFeedback.readiness == null ? (
        <ReadinessPrompt sessionId={sessionId} />
      ) : null}

      {alreadyFinished ? (
        <SessionFeedbackDetails feedback={feedback} onEdit={() => setFeedbackSheet("edit")} />
      ) : null}

      {slots.map((slot, i) => (
        <SlotCard
          key={slot.programSlotId}
          sessionId={sessionId}
          slot={slot}
          progressionByExercise={progressionByExercise}
          achievements={recordsForSlot(achievements, slot.programSlotId)}
          isCurrent={i === currentIndex}
          alreadyFinished={alreadyFinished}
          stats={stats}
          bodyweight={bodyweight}
          recentIds={recentIds}
          catalog={catalog}
          onResolve={addToCatalog}
          startRest={() => rest.start(slot.restSeconds ?? defaultRestSeconds)}
          pinnedIds={pinnedIds}
        />
      ))}

      {alreadyFinished ? (
        <FinishedWorkoutNav sessionId={sessionId} />
      ) : (
        <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
          <RestBar timer={rest} />
          {summaryError && <p role="alert" className="text-caption text-danger">{summaryError}</p>}
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => {
              setSummaryError(null);
              setFeedbackSheet("finish");
            }}
            pending={finishing}
          >
            Finish workout
          </Button>
        </div>
      )}

      {feedbackSheet && (
        <SessionFeedbackSheet
          initial={feedback}
          mode={feedbackSheet}
          onClose={() => setFeedbackSheet(null)}
          onSubmit={feedbackSheet === "finish" ? handleFinish : handleFeedbackEdit}
        />
      )}
    </div>
  );
}

type OptimisticAction =
  | { type: "add"; set: LoggedSet }
  | { type: "delete"; id: string };

function SlotCard({
  alreadyFinished,
  sessionId,
  slot,
  progressionByExercise,
  isCurrent,
  stats,
  bodyweight,
  recentIds,
  catalog,
  onResolve,
  startRest,
  achievements,
  pinnedIds,
}: {
  alreadyFinished: boolean;
  sessionId: string;
  slot: SlotView;
  progressionByExercise: Record<string, ProgressionPerformance[]>;
  isCurrent: boolean;
  stats: ExerciseStat[];
  bodyweight: number | null;
  recentIds: string[];
  catalog: Record<string, ExerciseDef>;
  onResolve: (def: ExerciseDef) => void;
  startRest: () => void;
  achievements: ExerciseRecords[];
  pinnedIds: string[];
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
  const [recomputeWarning, setRecomputeWarning] = useState<string | null>(null);
  const [retryingRecompute, startRetryRecompute] = useTransition();
  // Swap (machine taken, etc.): sets log against the swapped exercise_id but keep the
  // original program_slot_id, so each exercise's progression chain stays intact.
  const [exerciseId, setExerciseId] = useState(slot.exerciseId);
  const [swapping, setSwapping] = useState(false);
  const [pickedSwap, setPickedSwap] = useState<ExerciseDef | null>(null);
  const [savingSwap, startSwap] = useTransition();
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapNotice, setSwapNotice] = useState<string | null>(null);
  function confirmSwap(scope: "workout" | "program") {
    if (!pickedSwap || savingSwap) return;
    const picked = pickedSwap;
    setSwapError(null);
    startSwap(async () => {
      try {
        await swapSessionExercise({ sessionId, programSlotId: slot.programSlotId, exerciseId: picked.id, scope });
        onResolve(picked);
        setExerciseId(picked.id);
        setDismissed(true);
        setPickedSwap(null);
        setSwapNotice(scope === "program" ? "Saved for this day for the rest of your program." : "Saved for this workout only.");
      } catch (err) {
        setSwapError(err instanceof Error ? err.message : "Could not save swap. Please try again.");
      }
    });
  }
  const [showHistory, setShowHistory] = useState(false);
  // Fluid plateau suggestion: shown before any set is logged this session; accepting writes a
  // movement_adaptation row, "Keep going" snoozes it.
  const [dismissed, setDismissed] = useState(false);
  const [applying, startApply] = useTransition();
  const suggestion = slot.pendingSuggestion;
  const showSuggestion = !!suggestion && !dismissed && slot.sets.length === 0;

  const def = catalog[exerciseId];
  const name = def?.name ?? exerciseId;
  const equipment = def?.equipment ?? "barbell";
  const increment = def?.increment ?? 5;
  // A bare machine template isn't loggable — it must be instantiated to a brand/type variant.
  const isTemplate = !!def?.machineTemplate;

  // Quick swap to the alternate last used for this slot. The button names the alternate by its
  // brand/type (never a sliced display name) so two variants of one movement stay distinct; the
  // scope sheet then shows the full name before anything saves.
  const lastUsedDef = slot.lastUsedAlternate ? catalog[slot.lastUsedAlternate] : null;
  const lastUsedLabel = lastUsedDef
    ? variantShortLabel(lastUsedDef.brand, lastUsedDef.machineType) ?? lastUsedDef.name
    : null;

  const p = slot.prescription;
  const isBodyweight = equipment === "bodyweight";
  const isMachine = equipment.startsWith("machine") || equipment === "cable";

  const progressionReference = useMemo(
    () => selectProgressionReference(
      progressionByExercise[exerciseId] ?? [],
      slot.programSlotId,
    ),
    [exerciseId, progressionByExercise, slot.programSlotId],
  );

  // Target computes client-side off hydrated stats and recent exercise-wide history, so a swap
  // re-derives instantly and repeated weekly exercises share progress safely.
  const target = useMemo(
    () =>
      def
        ? sessionTarget(
            def,
            { repMin: p.repMin, repMax: p.repMax, targetRir: p.targetRir },
            progressionReference.selected,
            catalog,
            stats,
            bodyweight,
          )
        : null,
    [def, catalog, p.repMin, p.repMax, p.targetRir, progressionReference.selected, stats, bodyweight],
  );

  // Before any history exists, the suggested weight follows reps/RIR edits live.
  const liveWeight =
    def && target?.source === "recommendation"
      ? (reps: number, rir: number) =>
          startingWeight(def, reps, rir, catalog, stats, bodyweight)?.weight ?? null
      : undefined;

  const initialWeight = target?.weight ?? (isMachine ? 0 : isBodyweight ? 0 : 45);
  const initialReps = target?.targetReps ?? p.repMin;

  const done = optimisticSets.length;
  const complete = done >= p.targetSets;
  const tone = complete && achievements.length === 0 ? "done" : isCurrent ? "active" : "default";

  function handleLog(weight: number, reps: number, rir: number) {
    if (isPending) return;
    const idempotencyKey = generateIdempotencyKey();
    setError(null);
    setRecomputeWarning(null);
    // Rest starts the moment the set is logged (optimistically) — a failed write doesn't
    // stop the clock, which matches what the lifter is already doing: resting.
    startRest();
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        set: { id: `temp-${Date.now()}`, exerciseId, equipmentInstanceId: slot.sets.at(-1)?.equipmentInstanceId ?? null, weight, reps, rir, setIndex: optimisticSets.length },
      });
      try {
        const result = await retryServerAction(
          () => logSet({
            sessionId,
            programSlotId: slot.programSlotId,
            exerciseId,
            weight,
            reps,
            rir,
            idempotencyKey,
          }),
          { onRetry: () => setError("Retrying…") }
        );
        setError(null);
        if (result.recomputeWarning) {
          setRecomputeWarning(result.recomputeWarning);
        }
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
    if (isPending) return;
    setError(null);
    setRecomputeWarning(null);
    setExitingIds((ids) => [...ids, id]);
    setTimeout(() => {
      startTransition(async () => {
        applyOptimistic({ type: "delete", id });
        try {
          const result = await retryServerAction(
            () => deleteSet(id),
            { onRetry: () => setError("Retrying…") }
          );
          setError(null);
          if (result?.recomputeWarning) {
            setRecomputeWarning(result.recomputeWarning);
          }
        } catch {
          setError("Couldn’t delete that set. Try again.");
        }
      });
      setExitingIds((ids) => ids.filter((x) => x !== id));
    }, 160);
  }

  function handleEdit(id: string, weight: number, reps: number, rir: number) {
    if (isPending) return;
    setError(null);
    setRecomputeWarning(null);
    startTransition(async () => {
      try {
        const result = await retryServerAction(
          () => editSet({ setId: id, weight, reps, rir }),
          { onRetry: () => setError("Retrying…") }
        );
        setError(null);
        setEditingId(null);
        if (result.recomputeWarning) {
          setRecomputeWarning(result.recomputeWarning);
        }
      } catch {
        setError("Couldn’t save those changes. Please try again.");
      }
    });
  }

  function handleRetryRecompute() {
    startRetryRecompute(async () => {
      const result = await retryRecomputeStat({ exerciseId, sessionId });
      if (result.success) {
        setRecomputeWarning(null);
      } else if (result.warning) {
        setRecomputeWarning(result.warning);
      }
    });
  }

  return (
    <Card tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading">
          <Link
            href={exerciseReviewHref({
              exerciseId,
              equipmentInstanceId: slot.sets.at(-1)?.equipmentInstanceId ?? null,
            })}
            className="underline-offset-2 hover:underline"
          >
            {name}
          </Link>
        </h2>
        <div className="flex shrink-0">
          {lastUsedDef && !isTemplate && (
            <IconButton
              variant="ghost"
              onClick={() => {
                setSwapError(null);
                setPickedSwap(lastUsedDef);
              }}
              disabled={alreadyFinished || savingSwap}
              aria-label={`Quick swap to ${lastUsedDef.name}`}
              title={lastUsedLabel ?? lastUsedDef.name}
            >
              <IconLastUsed />
            </IconButton>
          )}
          <IconButton
            variant="ghost"
            onClick={() => setSwapping(true)}
            disabled={alreadyFinished || savingSwap}
            aria-label={isTemplate ? `Choose machine for ${name}` : `Swap ${name} for another exercise`}
          >
            <IconSwap />
          </IconButton>
          <IconButton
            variant="ghost"
            onClick={() => setShowHistory(true)}
            aria-label={`View history for ${name}`}
          >
            <IconHistory />
          </IconButton>
          {!isTemplate && (
            <PinButton
              exerciseId={exerciseId}
              pinned={pinnedIds.includes(exerciseId)}
              name={name}
            />
          )}
        </div>
      </div>
      {showHistory && (
        <ExerciseHistory key={exerciseId} exerciseId={exerciseId} sessionId={sessionId}
          name={catalog[def?.baseExerciseId ?? exerciseId]?.name ?? name}
          isBodyweight={isBodyweight} onClose={() => setShowHistory(false)} />
      )}

      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-caption text-muted">
          {p.targetSets} × {p.repMin}–{p.repMax} @ {rirLabel(p)} RIR
        </span>
        <ProgressDots done={done} target={p.targetSets} />
      </div>

      <AchievementPills groups={achievements} exerciseId={exerciseId} />

      <TargetLine
        target={target}
        reference={progressionReference}
        isBodyweight={isBodyweight}
        done={done}
      />

      {showSuggestion && suggestion && (
        <div className="mt-3 rounded-card border border-border-strong p-3">
          <div className="flex items-center gap-1">
            <p className="text-caption uppercase tracking-wide text-muted">Plateau</p>
            <InfoButton title="Plateau">
              {name} had no new e1RM high in {suggestion.stalledExposures} sessions.
            </InfoButton>
          </div>
          {suggestion.action === "rep_change" && suggestion.repBand && (
            <>
              <p className="mt-1 text-body">
                Try{" "}
                <span className="font-medium text-foreground">
                  {suggestion.repBand.repMin}–{suggestion.repBand.repMax} reps
                  {suggestion.weight != null ? ` @ ${suggestion.weight} lb` : ""}
                </span>
                .
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  pending={applying}
                  onClick={() =>
                    startApply(async () => {
                      await acceptAdaptation({
                        sessionId,
                        programSlotId: slot.programSlotId,
                        exerciseId,
                        action: "rep_change",
                        ladderStep: suggestion.ladderStep,
                        newRepMin: suggestion.repBand!.repMin,
                        newRepMax: suggestion.repBand!.repMax,
                      });
                    })
                  }
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    startApply(async () => {
                      await dismissAdaptation({ programSlotId: slot.programSlotId, exerciseId });
                      setDismissed(true);
                    })
                  }
                >
                  Keep going
                </Button>
              </div>
            </>
          )}
          {suggestion.action === "swap" && (
            <>
              <ul className="mt-2 flex flex-col gap-1">
                {suggestion.candidates?.map((c) => (
                  <li key={c.exerciseId}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full justify-between"
                      pending={applying}
                      onClick={() =>
                        startApply(async () => {
                          await acceptAdaptation({
                            sessionId,
                            programSlotId: slot.programSlotId,
                            exerciseId,
                            action: "swap",
                            ladderStep: suggestion.ladderStep,
                            newExerciseId: c.exerciseId,
                          });
                          setExerciseId(c.exerciseId);
                        })
                      }
                    >
                      <span>{c.name}</span>
                      {c.weight != null && <span className="tabular-nums text-muted">{c.weight} lb</span>}
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSwapping(true)}>
                  Other options
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    startApply(async () => {
                      await dismissAdaptation({ programSlotId: slot.programSlotId, exerciseId });
                      setDismissed(true);
                    })
                  }
                >
                  Keep going
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {swapping && (
        <ExercisePicker
          catalog={Object.values(catalog)}
          recentIds={recentIds}
          patternFilter={slot.pattern}
          resolveMachines
          onPick={(picked) => {
            setSwapError(null);
            setPickedSwap(picked);
          }}
          onClose={() => setSwapping(false)}
        />
      )}

      {pickedSwap && !swapping && (
        <Sheet ariaLabel="Apply exercise swap" dismissible={!savingSwap} onClose={() => setPickedSwap(null)}>
          <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
            <h2 className="text-heading">Use {pickedSwap.name} for…</h2>
            <p className="text-caption text-muted">Logged sets stay.</p>
            <Button type="button" pending={savingSwap} onClick={() => confirmSwap("workout")}>
              This workout only
            </Button>
            <Button type="button" variant="secondary" pending={savingSwap} onClick={() => confirmSwap("program")}>
              Remainder of program
            </Button>
            {swapError && <p role="alert" className="text-caption text-danger">{swapError}</p>}
            <Button type="button" variant="ghost" disabled={savingSwap} onClick={() => setPickedSwap(null)}>Cancel</Button>
          </div>
        </Sheet>
      )}
      {swapNotice && <p role="status" className="mt-2 text-caption text-muted">{swapNotice}</p>}

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
                  {s.exerciseId !== exerciseId && <span className="block text-caption text-muted">{catalog[s.exerciseId]?.name ?? s.exerciseId}</span>}
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

      {recomputeWarning && (
        <div className="mt-2 flex flex-col gap-2 rounded-card border border-border bg-surface p-2">
          <p className="text-caption text-muted">{recomputeWarning}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            pending={retryingRecompute}
            onClick={handleRetryRecompute}
          >
            Retry stats update
          </Button>
        </div>
      )}

      {isTemplate ? (
        <div className="mt-3">
          <Button type="button" className="w-full" disabled={alreadyFinished || savingSwap} onClick={() => setSwapping(true)}>
            Choose machine
          </Button>
        </div>
      ) : editingId === null ? (
        <div className="mt-3">
          <SetEntry
            key={`${exerciseId}-${p.repMin}-${p.repMax}`}
            increment={increment}
            defaultRir={p.targetRir}
            initial={{ weight: initialWeight, reps: initialReps, rir: p.targetRir }}
            label="Log set"
            disabled={isPending}
            liveWeight={liveWeight}
            onSubmit={handleLog}
          />
        </div>
      ) : null}
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
  reference,
  isBodyweight,
  done,
}: {
  target: SessionTarget | null;
  reference: ProgressionReference;
  isBodyweight: boolean;
  done: number;
}) {
  if (!target) {
    return (
      <p className="mt-2 text-body text-muted">Log a set to start.</p>
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
      </div>
      {target.source === "progression" && (
        <ProgressionContext reference={reference} isBodyweight={isBodyweight} />
      )}
      {isRecommendation && target.confidence === "calibrate" && (
        <p className="mt-1 flex items-center gap-1 text-caption text-calibrate">
          Feel out this set.
          <InfoButton title="New machine">
            First session on this machine is a conservative start. After you log it, the target is yours.
          </InfoButton>
        </p>
      )}
    </div>
  );
}

function ProgressionContext({
  reference,
  isBodyweight,
}: {
  reference: ProgressionReference;
  isBodyweight: boolean;
}) {
  const last = reference.lastSameSlot;
  const best = reference.bestRecent;
  if (!last && !best) return null;
  const bestDiffers = best && (
    !last
    || best.performedAt !== last.performedAt
    || best.programSlotId !== last.programSlotId
  );
  const compact = (item: ProgressionPerformance) => `${item.weight} × ${item.reps}`;
  const caption = last ? `Last ${compact(last)}` : best ? `Best ${compact(best)}` : null;

  return (
    <p className="mt-1 flex items-center gap-1 text-caption tabular-nums text-muted">
      <span>{caption}</span>
      <InfoButton title="Last here">
        Last is this slot&apos;s previous first set{last ? ` (${compact(last)})` : ""}.
        Best is the strongest first set of this exercise since then
        {best && bestDiffers ? ` (${compact(best)})` : ""}.
        {isBodyweight ? " Numbers are added load." : ""}
      </InfoButton>
    </p>
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

// Keep the screen awake during a workout; re-acquire when the tab returns to foreground.
function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);
}
