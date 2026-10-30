"use client";
import { WorkoutExerciseDetails } from "./workout-exercise-details";
import { SavedSetDetails } from "@/components/ui/set-details";
import { normalizeWorkoutText, WORKOUT_TEXT_LIMIT, type WorkoutExerciseDetail, type RememberedSetup } from "@/lib/workout-details";
import { CoachSlotReview } from "@/components/coach/coach-slot-review";
import { exactExerciseIdentity } from "@/lib/strength/identity";
import { supersetLabel, isSupersetEnd } from "@/lib/superset";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useMemo, useOptimistic, useRef, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";
import { canSwapStation, isLoggableExercise } from "@/lib/station";
import {
  startingWeight,
  type ProgressionPerformance,
  type ProgressionReference,
  type SessionTarget,
} from "@/lib/strength/progression";
import { effectiveTargetExplanation, resolveExactWorkoutTarget, type EffectiveWorkoutTarget, type WorkoutTargetHistory } from "@/lib/effective-workout-target";
import type { StallContext } from "@/lib/stall-report";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { rirLabel, type EffectivePrescription, type ProgramPhase } from "@/lib/periodization";
import type { SessionFeedback } from "@/lib/session-feedback";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { IconPastSets, IconLastUsed, IconSwap } from "@/components/ui/icons";
import { TempoFields, TempoLabel } from "@/components/ui/tempo";
import { resolveTempo, tempoSchema, type Tempo } from "@/lib/tempo";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { ExerciseCardLabel, exerciseCardAriaLabel } from "@/components/ui/exercise-card-label";
import { ExerciseVisual } from "@/components/ui/exercise-visual";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { formatExerciseSet } from "@/lib/strength/load-mode";
import { PlannedSetSummary } from "@/components/ui/planned-set-table";
import { Stepper } from "@/components/ui/stepper";
import { PinButton } from "../../pins/pin-button";
import { ExercisePicker } from "../../program/exercise-picker";
import { SwapStationButton } from "../../program/swap-station-button";
import { RestBar, useSessionRestTimer } from "./rest-timer";
import { ExerciseHistory } from "./exercise-history";
import {
  swapSessionExercise,
  logSet,
  editSet,
  deleteSet,
  finishSession,
  updateSessionFeedback,
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
  note?: string | null;
  setup?: string | null;
  editRevision?: number;
  tempo?: Tempo | null;
  id: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  weight: number;
  reps: number;
  rir: number | null;
  setIndex: number;
  plannedSetId?: string | null;
}

export interface SlotView {
  details?: WorkoutExerciseDetail[];
  remembered?: RememberedSetup[];
  equipmentLabels?: Record<string,string>;
  equipmentInstanceId?: string | null;
  tempo?: Tempo | null;
  resolvedTempo?: Tempo;
  plannedSets?: import("@/lib/workout-editor").PlannedSet[];
  sourceProgramSlotId?: string | null;
  snapshotExerciseId?: string;
  supersetGroup?: string | null;
  supersetLabel?: string | null;
  programSlotId: string;
  exerciseId: string; // last logged this session, else the program slot's exercise
  pattern: Pattern;
  prescription: Omit<EffectivePrescription, "phase">;
  targetContext: StallContext | null;
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
  isDeload = false,
  bodyweight,
  defaultRestSeconds,
  alreadyFinished,
  initialFeedback,
  stats,
  recentIds,
  slots,
  targetHistory,
  catalog: initialCatalog,
  recordsPromise,
  pinnedIds,
}: {
  sessionId: string;
  dayName: string;
  week: number;
  weeks: number;
  phase: ProgramPhase | null;
  isDeload?: boolean;
  bodyweight: number | null;
  defaultRestSeconds: number;
  alreadyFinished: boolean;
  initialFeedback: SessionFeedback;
  stats: ExerciseStat[];
  recentIds: string[];
  slots: SlotView[];
  targetHistory: WorkoutTargetHistory;
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
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
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
  const currentIndex = slots.findIndex((s) => s.plannedSets ? s.plannedSets.some(row=>!s.sets.some(log=>log.plannedSetId===row.id)) : s.sets.length < s.prescription.targetSets);

  const focusedSlotId = slots.some(slot => slot.programSlotId === selectedSlotId)
    ? selectedSlotId : slots[currentIndex >= 0 ? currentIndex : slots.length - 1]?.programSlotId;
  const loggedCount = slots.reduce((count, slot) => count + slot.sets.length, 0);
  const plannedCount = slots.reduce((count, slot) => count + (slot.plannedSets?.length ?? slot.prescription.targetSets), 0);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-4 py-5">
      <Suspense fallback={null}>
        <WorkoutRecordsSync recordsPromise={recordsPromise} onRecords={onRecords} />
      </Suspense>
      <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-display">{dayName}</h1>
          {!alreadyFinished && <Button type="button" variant="secondary" pending={finishing} onClick={() => {
            setSummaryError(null); setFeedbackSheet("finish");
          }}>Finish workout</Button>}
        </div>
        <p className="text-body text-muted">
          {alreadyFinished ? `Finished · Week ${week} of ${weeks}` : `Week ${week} of ${weeks}`}
          {bodyweight ? ` · BW ${bodyweight} lb` : ""}
        </p>
        <p className="mt-3 text-caption text-muted">{loggedCount} / {plannedCount} sets logged · {slots.length} exercises</p>
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full bg-foreground" style={{width:`${plannedCount ? Math.min(100, loggedCount / plannedCount * 100) : 0}%`}} />
        </div>
      </header>

      {isDeload && (
        <div className="flex items-center gap-1">
          <CardLabel>Deload</CardLabel>
          <InfoButton title="Deload">Excluded from strength progression and PRs. Working sets still count toward training volume.</InfoButton>
        </div>
      )}

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
          slot={{ ...slot, supersetLabel: supersetLabel(slots, i) }}
          targetHistory={targetHistory}
          isDeload={isDeload}
          achievements={recordsForSlot(achievements, slot.programSlotId)}
          isCurrent={i === currentIndex}
          expanded={alreadyFinished || slot.programSlotId === focusedSlotId}
          onFocus={() => setSelectedSlotId(slot.programSlotId)}
          alreadyFinished={alreadyFinished}
          stats={stats}
          bodyweight={bodyweight}
          recentIds={recentIds}
          catalog={catalog}
          onResolve={addToCatalog}
          startRest={() => { if (isSupersetEnd(slots, i)) rest.start(slot.restSeconds ?? defaultRestSeconds); }}
          pinnedIds={pinnedIds}
        />
      ))}

      {alreadyFinished ? (
        <FinishedWorkoutNav sessionId={sessionId} />
      ) : (
        <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
          {rest.remaining != null ? <RestBar timer={rest} /> : <div className="flex items-center justify-between px-1 py-2">
            <span className="text-caption text-muted">Rest timer</span><span className="text-heading">Ready</span>
          </div>}
          {summaryError && <p role="alert" className="text-caption text-danger">{summaryError}</p>}
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
  targetHistory,
  isDeload,
  isCurrent,
  expanded,
  onFocus,
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
  targetHistory: WorkoutTargetHistory;
  isDeload: boolean;
  isCurrent: boolean;
  expanded: boolean;
  onFocus: () => void;
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
  const editingSet = useRef<LoggedSet|null>(null);
  const entryRef = useRef<HTMLDivElement>(null);
  const logRequest = useRef<{content:string;id:string}|null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Rows fading out before their delete commits, and the last failed-write message.
  const [exitingIds, setExitingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recomputeWarning, setRecomputeWarning] = useState<string | null>(null);
  const [retryingRecompute, startRetryRecompute] = useTransition();
  // Swap (machine taken, etc.): sets log against the swapped exercise_id but keep the
  // original program_slot_id, so each exercise's progression chain stays intact.
  const [exerciseId, setExerciseId] = useState(slot.exerciseId);
  const [sourceExerciseId, setSourceExerciseId] = useState(slot.exerciseId);
  if (sourceExerciseId !== slot.exerciseId) {
    setSourceExerciseId(slot.exerciseId);
    setExerciseId(slot.exerciseId);
  }
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
  const [showTools, setShowTools] = useState(false);
  // All plateau choices use the shared, revalidated Coach confirmation flow.
  const [dismissed, setDismissed] = useState(false);
  const suggestion = slot.pendingSuggestion;
  const showSuggestion = !!suggestion && !dismissed && slot.sets.length === 0;

  const def = catalog[exerciseId];
  const name = def ? exerciseCardAriaLabel(def, catalog) : exerciseId;
  const equipment = def?.equipment ?? "barbell";
  const increment = def?.increment ?? 5;
  // A station template isn't loggable — it must resolve to a brand / brand+type variant.
  const isTemplate = !!def && !isLoggableExercise(def);
  const showStationSwap = canSwapStation(def, catalog);

  // Quick swap to the alternate last used for this slot. The button names the alternate by its
  // brand/type (never a sliced display name) so two variants of one movement stay distinct; the
  // scope sheet then shows the full name before anything saves.
  const lastUsedDef = slot.lastUsedAlternate ? catalog[slot.lastUsedAlternate] : null;
  const lastUsedLabel = lastUsedDef
    ? variantShortLabel(lastUsedDef.brand, lastUsedDef.machineType, lastUsedDef.stationModel) ?? lastUsedDef.name
    : null;

  const plannedRow = slot.plannedSets?.find(row => !optimisticSets.some(set => set.plannedSetId === row.id));
  const p = useMemo(() => plannedRow ? { ...slot.prescription, repMin: plannedRow.repMin, repMax: plannedRow.repMax,
    targetRir: plannedRow.rirMax, targetRirMin: plannedRow.rirMin, targetRirMax: plannedRow.rirMax } : slot.prescription,
    [plannedRow, slot.prescription]);
  const isBodyweight = equipment === "bodyweight";
  const isMachine = equipment.startsWith("machine") || equipment === "cable";

  const effectiveTarget = useMemo(() => resolveExactWorkoutTarget({
    slotId: slot.programSlotId, identity: exactExerciseIdentity(exerciseId,
      exerciseId === slot.targetContext?.exerciseId ? slot.targetContext.equipmentInstanceId : null),
    prescription: p,
    context: slot.targetContext ? { ...slot.targetContext, exerciseId,
      equipmentInstanceId: exerciseId === slot.targetContext.exerciseId ? slot.targetContext.equipmentInstanceId : null, repMin: p.repMin, repMax: p.repMax,
      targetRirMin: p.targetRirMin, targetRirMax: p.targetRirMax, targetSets: p.targetSets } : null,
    isDeload, history: targetHistory, catalog, stats, bodyweight,
  }), [slot.programSlotId, slot.targetContext, exerciseId, p, isDeload, targetHistory, catalog, stats, bodyweight]);
  const captured = plannedRow && exerciseId === slot.snapshotExerciseId;
  const target = captured && (plannedRow.weight??plannedRow.suggestedWeight)!==null ? { weight: plannedRow.weight ?? plannedRow.suggestedWeight ?? 0,
    targetReps: plannedRow.targetReps, targetRir: plannedRow.rirMax, source: "progression" as const } : effectiveTarget.target;
  const progressionReference = effectiveTarget.reference;

  // Before any history exists, the suggested weight follows reps/RIR edits live.
  const liveWeight =
    def && target?.source === "recommendation"
      ? (reps: number, rir: number) =>
          startingWeight(def, reps, rir, catalog, stats, bodyweight)?.weight ?? null
      : undefined;

  const lastLogged = optimisticSets.filter(set => set.exerciseId === exerciseId).at(-1);
  const initialWeight = (captured ? target?.weight : lastLogged?.weight) ?? target?.weight ?? (isMachine ? 0 : isBodyweight ? 0 : 45);
  const initialReps = (captured ? target?.targetReps : lastLogged?.reps) ?? target?.targetReps ?? p.repMin;

  const done = slot.plannedSets ? slot.plannedSets.filter(row => optimisticSets.some(set => set.plannedSetId === row.id)).length : optimisticSets.length;
  const complete = done >= p.targetSets;
  const tone = !complete && isCurrent ? "active" : "default";

  const prescribedTempo = slot.snapshotExerciseId === exerciseId ? slot.resolvedTempo ?? resolveTempo(def, slot.tempo) : resolveTempo(def, slot.tempo);

  function handleLog(weight: number, reps: number, rir: number, tempo?: Tempo | null, note?: string | null) {
    if (isPending) return;
    const content=JSON.stringify({exerciseId,weight,reps,rir,tempo,note,plannedSet:plannedRow?.id});
    if(logRequest.current?.content!==content) logRequest.current={content,id:generateIdempotencyKey()};
    const idempotencyKey = logRequest.current.id;
    setError(null);
    setRecomputeWarning(null);
    // Rest starts the moment the set is logged (optimistically) — a failed write doesn't
    // stop the clock, which matches what the lifter is already doing: resting.
    startRest();
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        set: { note, tempo: tempo === undefined ? prescribedTempo : tempo, id: `temp-${Date.now()}`, exerciseId, equipmentInstanceId: slot.sets.at(-1)?.equipmentInstanceId ?? null, weight, reps, rir, setIndex: optimisticSets.length, plannedSetId: plannedRow?.id },
      });
      try {
        const result = await retryServerAction(
          () => logSet({
            sessionId,
            programSlotId: slot.sourceProgramSlotId === undefined ? slot.programSlotId : slot.sourceProgramSlotId,
            plannedSlotId: slot.plannedSets ? slot.programSlotId : undefined,
            plannedSetId: plannedRow?.id,
            equipmentInstanceId:slot.equipmentInstanceId??null,
            exerciseId,
            weight,
            reps,
            rir,
            note,
            tempo: tempo === undefined ? prescribedTempo : tempo,
            idempotencyKey,
          }),
          { onRetry: () => setError("Retrying…") }
        );
        setError(null);
        logRequest.current=null;
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

  function handleEdit(id: string, weight: number, reps: number, rir: number, tempo?: Tempo | null, note?: string | null, numericEdited=true) {
    if (isPending) return;
    setError(null);
    setRecomputeWarning(null);
    startTransition(async () => {
      try {
        const result = await retryServerAction(
          () => editSet({ setId: id, weight, reps, rir, detailsOnly:!numericEdited, expectedRevision:editingSet.current?.editRevision, ...(tempo === undefined ? {} : {tempo}), ...(note === undefined ? {} : {note}) }),
          { onRetry: () => setError("Retrying…") }
        );
        setError(null);
        setEditingId(null);
        if (result.recomputeWarning) {
          setRecomputeWarning(result.recomputeWarning);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn’t save those changes. Please try again.");
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
    <Card aria-label={name} data-workout-slot={slot.programSlotId} tone={expanded ? "active" : tone} className={`p-3! ${complete ? "bg-surface/60" : ""}`}>
      {!alreadyFinished && expanded && <p className="mb-2 text-caption font-medium text-muted">{complete ? "Exercise complete" : "Current exercise"}</p>}
      {slot.supersetLabel && <p className="mb-2 text-caption font-medium">Superset {slot.supersetLabel} · Alternate exercises, then rest after the round</p>}
      <div className="flex min-w-0 items-start gap-3">
        <ExerciseVisual exerciseId={exerciseId} baseExerciseId={def?.baseExerciseId} size="sm" />
        <h2 className="min-w-0 flex-1">
            <Link
              href={exerciseReviewHref({
                exerciseId,
                equipmentInstanceId: slot.sets.at(-1)?.equipmentInstanceId ?? null,
              })}
              className="block underline-offset-2 hover:underline"
            >
              {def ? (
                <ExerciseCardLabel as="span" size="heading" compact def={def} catalog={catalog} />
              ) : (
                <span className="text-heading">{name}</span>
              )}
            </Link>
        </h2>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button type="button" variant="secondary" className="gap-2 text-caption!" aria-label={`View history for ${name}`} onClick={() => setShowHistory(true)}>
          <IconPastSets /> History
        </Button>
        <Button type="button" variant="ghost" className="gap-2 text-caption!" aria-label={`Swap ${name} for another exercise`}
          disabled={alreadyFinished || savingSwap} onClick={() => setSwapping(true)}><IconSwap /> Swap</Button>
        <Button type="button" variant="ghost" className="text-caption!" aria-label={`More tools for ${name}`} onClick={() => setShowTools(true)}>More ⋯</Button>
      </div>
      {showTools && <Sheet ariaLabel={`Tools for ${name}`} onClose={() => setShowTools(false)}>
        <div className="flex flex-col gap-3 px-4 pb-6">
          <h2 className="text-heading">Exercise tools</h2><p className="text-caption text-muted">{name}</p>
          {lastUsedDef && !isTemplate && <Button type="button" variant="secondary" disabled={alreadyFinished || savingSwap}
            aria-label={`Quick swap to ${lastUsedDef.name}`} onClick={() => {setShowTools(false);setSwapError(null);setPickedSwap(lastUsedDef);}}>
            <IconLastUsed /> {lastUsedLabel}
          </Button>}
          {!isTemplate && <PinButton exerciseId={exerciseId} pinned={pinnedIds.includes(exerciseId)} name={name} />}
          {showStationSwap && !isTemplate && <SwapStationButton exerciseId={exerciseId} catalog={catalog} size="md"
            disabled={alreadyFinished || savingSwap} onPick={picked => {setShowTools(false);setSwapError(null);setPickedSwap(picked);}} />}
          {slot.plannedSets && <details className="text-caption"><summary className="min-h-11 cursor-pointer py-3">Planned sets</summary>
            <PlannedSetSummary sets={slot.plannedSets} label={`Planned sets for ${name}`} loadMode={def?.loadMode} addedLoad={isBodyweight && !def?.loadMode} />
          </details>}
          <CloseTools />
        </div>
      </Sheet>}
      {showHistory && (
        <ExerciseHistory
          key={exerciseId}
          exerciseId={exerciseId}
          sessionId={sessionId}
          name={name}
          def={def}
          catalog={catalog}
          isBodyweight={isBodyweight}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-caption text-muted">
          {p.targetSets} × {p.repMin}–{p.repMax} @ {rirLabel(p)} RIR
        </span>
        <ProgressDots done={done} target={p.targetSets} />
      </div>

      <TempoLabel value={prescribedTempo} />

      <AchievementPills groups={achievements} exerciseId={exerciseId} />

      <div hidden={!expanded && !alreadyFinished}>
      <TargetLine
        target={target}
        reference={progressionReference}
        effectiveTarget={effectiveTarget}
        isBodyweight={isBodyweight}
        loadMode={def?.loadMode}
        done={done}
      />

      </div>

      {showSuggestion && suggestion && (
        <div className="mt-3 rounded-card border border-border-strong p-3">
          <p className="text-caption uppercase tracking-wide text-muted">Plateau</p>
          <p className="mt-1 text-body">Review the evidence and available choices with Coach.</p>
        </div>
      )}
      <CoachSlotReview slotId={slot.programSlotId} active={showSuggestion} />

      {swapping && (
        <ExercisePicker
          catalog={Object.values(catalog)}
          recentIds={recentIds}
          patternFilter={slot.pattern}
          resolveStations
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
            <div className="flex items-start gap-3">
              <ExerciseVisual exerciseId={pickedSwap.id} baseExerciseId={pickedSwap.baseExerciseId} />
              <div className="min-w-0">
                <p className="text-caption text-muted">Use for…</p>
                <ExerciseCardLabel as="h2" size="heading" compact def={pickedSwap} catalog={catalog} />
              </div>
            </div>
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
                  loadMode={catalog[s.exerciseId]?.loadMode}
                  increment={catalog[s.exerciseId]?.increment ?? increment}
                  defaultRir={p.targetRir}
                  initial={{ weight: s.weight, reps: s.reps, rir: s.rir ?? p.targetRir }}
                  initialTempo={s.tempo ?? null}
                  initialNote={s.note ?? null}
                  savedSetup={s.setup ?? null}
                  label="Save"
                  disabled={isPending}
                  onSubmit={(w, r, rir, tempo, note, numericEdited) => handleEdit(s.id, w, r, rir, tempo, note, numericEdited)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => { setEditingId(null); handleDelete(s.id); }}
                />
              </li>
            ) : (
              <li
                key={s.id}
                data-exiting={exitingIds.includes(s.id) || undefined}
                className="flex animate-row-in items-start justify-between gap-2 rounded-control bg-surface px-3 py-1 text-body"
              >
                <div className="min-w-0 flex-1 tabular-nums">
                  <span className="text-muted">{i + 1}. <span className="sr-only">Logged</span>✓</span>{" "}
                  {formatExerciseSet(catalog[s.exerciseId], s.weight, s.reps)}
                  {s.rir != null ? ` @ ${s.rir}` : ""}
                  <SavedSetDetails tempo={s.tempo} note={s.note} setup={s.setup} />
                  {s.exerciseId !== exerciseId && <span className="block text-caption text-muted">{catalog[s.exerciseId]?.name ?? s.exerciseId}</span>}
                </div>
                <span className="flex shrink-0 items-center gap-1 text-caption">
                  <button
                    type="button"
                    aria-label={`Edit set ${i + 1} for ${name}`}
                    onClick={() => {onFocus();editingSet.current=s;setEditingId(s.id);}}
                    disabled={s.id.startsWith("temp-")}
                    className="min-h-11 min-w-11 px-2 py-2 text-muted disabled:opacity-40"
                  >
                    Edit
                  </button>

                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {error && <p role="alert" className="mt-2 text-caption text-danger">{error}</p>}

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

      {showStationSwap && isTemplate ? (
        <div className="mt-3">
          <SwapStationButton
            exerciseId={exerciseId}
            catalog={catalog}
            size="lg"
            className="w-full"
            disabled={alreadyFinished || savingSwap}
            onPick={(picked) => {
              setSwapError(null);
              setPickedSwap(picked);
            }}
          />
        </div>
      ) : null}

      {!alreadyFinished && !expanded && !isTemplate && <Button type="button" variant="secondary" className="mt-3 w-full"
        data-focus-exercise aria-label={`${complete ? "Add set for" : "Log this exercise:"} ${name}`} aria-expanded={false} onClick={() => {
          onFocus(); requestAnimationFrame(() => entryRef.current?.querySelector<HTMLInputElement>("input")?.focus());
        }}>{complete ? "Add set" : "Log this exercise"}</Button>}
      {!alreadyFinished && !isTemplate && editingId === null ? (
        <div className="mt-3" ref={entryRef} data-set-entry hidden={!expanded}>
          {!complete && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-caption">
            <strong>Next · Set {plannedRow ? (slot.plannedSets?.indexOf(plannedRow) ?? done) + 1 : done + 1} of {p.targetSets}</strong>
            <span className="text-muted">Target {p.repMin}–{p.repMax} reps · {rirLabel(p)} RIR</span>
          </div>}
          <SetEntry
            key={`${exerciseId}:${slot.sets.length}`}
            suggestionIdentity={exerciseId}
            loadMode={def?.loadMode}
            increment={increment}
            defaultRir={p.targetRir}
            initial={{ weight: initialWeight, reps: initialReps, rir: p.targetRir }}
            initialTempo={prescribedTempo}
            label={complete ? "Add set" : "Log set"}
            variant={complete ? "secondary" : "primary"}
            disabled={isPending}
            liveWeight={liveWeight}
            onSubmit={handleLog}
          />
        </div>
      ) : null}
      <WorkoutExerciseDetails compact key={exerciseId} sessionId={sessionId} slotId={slot.programSlotId} exerciseId={exerciseId}
        equipmentInstanceId={slot.equipmentInstanceId??null} catalog={catalog} details={slot.details??[]} remembered={slot.remembered??[]} equipmentLabels={slot.equipmentLabels??{}} />


    </Card>
  );
}

// Keep the count and visual states on the prescription row whenever space permits.
function ProgressDots({ done, target }: { done: number; target: number }) {
  const complete = done >= target;
  return (
    <span
      className="ml-auto flex max-w-full shrink-0 items-center gap-2"
      role="status"
      aria-label={`${done} of ${target} sets logged${complete ? ", complete" : ""}`}
    >
      <span aria-hidden="true" className="text-caption tabular-nums text-muted">
        {complete ? "Done" : "Sets"}{" "}
        <span className="font-medium text-foreground">{done}/{target}</span>
      </span>
      <span aria-hidden="true" className="flex flex-wrap justify-end gap-1">
        {Array.from({ length: target }).map((_, i) => (
          <span
            key={i}
            className={`flex size-3 shrink-0 items-center justify-center rounded-full border ${
              i < done
                ? "border-foreground bg-foreground text-background"
                : i === done
                  ? "border-foreground ring-2 ring-foreground/15"
                  : "border-border-strong"
            }`}
          >
            {i < done && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="m3 6 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

function TargetLine({
  target,
  reference,
  effectiveTarget,
  isBodyweight,
  loadMode,
  done,
}: {
  target: SessionTarget | null;
  reference: ProgressionReference;
  effectiveTarget: EffectiveWorkoutTarget;
  isBodyweight: boolean;
  loadMode?: ExerciseDef["loadMode"];
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
      {loadMode ? formatExerciseSet({ loadMode }, target.weight, target.targetReps)
        : <>{target.weight} {unit} <span className="font-normal text-muted">× {target.targetReps}</span></>}
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
      {effectiveTarget.reason === "repeated_effort_miss" && (
        <p className="mt-1 flex items-center gap-1 text-caption text-muted">
          Effort adjustment
          <InfoButton title="Why this target">{effectiveTargetExplanation(effectiveTarget)}</InfoButton>
        </p>
      )}
      {target.source === "progression" && (
        <ProgressionContext reference={reference} isBodyweight={isBodyweight} loadMode={loadMode} />
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
  loadMode,
}: {
  reference: ProgressionReference;
  isBodyweight: boolean;
  loadMode?: ExerciseDef["loadMode"];
}) {
  const last = reference.lastSameSlot;
  const best = reference.bestRecent;
  if (!last && !best) return null;
  const bestDiffers = best && (
    !last
    || best.performedAt !== last.performedAt
    || best.programSlotId !== last.programSlotId
  );
  const compact = (item: ProgressionPerformance) => loadMode
    ? formatExerciseSet({ loadMode }, item.weight, item.reps) : `${item.weight} × ${item.reps}`;
  const caption = last ? `Last ${compact(last)}` : best ? `Best ${compact(best)}` : null;

  return (
    <p className="mt-1 flex items-center gap-1 text-caption tabular-nums text-muted">
      <span>{caption}</span>
      <InfoButton title="Last here">
        Last is this slot&apos;s previous first set{last ? ` (${compact(last)})` : ""}.
        Best is the strongest first set of this exercise since then
        {best && bestDiffers ? ` (${compact(best)})` : ""}.
        {isBodyweight && !loadMode ? " Numbers are added load." : ""}
      </InfoButton>
    </p>
  );
}

function SetEntry({
  suggestionIdentity = "",
  loadMode,
  increment,
  defaultRir,
  initial,
  initialTempo = null,
  initialNote = null,
  savedSetup = null,
  label,
  variant = "primary",
  disabled,
  liveWeight,
  onSubmit,
  onCancel,
  onDelete,
}: {
  suggestionIdentity?: string;
  loadMode?: ExerciseDef["loadMode"];
  increment: number;
  defaultRir: number;
  initial: { weight: number; reps: number; rir: number };
  initialTempo?: Tempo | null;
  initialNote?: string | null;
  savedSetup?: string | null;
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  // Recommender-derived weight for given reps/RIR; the weight field follows it live
  // until the user touches weight manually.
  liveWeight?: (reps: number, rir: number) => number | null;
  onSubmit: (weight: number, reps: number, rir: number, tempo?: Tempo | null, note?: string | null, numericEdited?:boolean) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const noteId=useId();
  const [note,setNote]=useState(initialNote??"");
  const noteDirty=note!==(initialNote??"");
  useEffect(()=>{
    if(!noteDirty) return;
    const unload=(event:BeforeUnloadEvent)=>event.preventDefault();
    const navigate=(event:MouseEvent)=>{if((event.target as HTMLElement).closest("a[href]") && !confirm("Discard unsaved set note?")){event.preventDefault();event.stopPropagation();}};
    window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
    return ()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[noteDirty]);
  const [tempo, setTempo] = useState<Tempo | null>(initialTempo);
  const [tempoTouched, setTempoTouched] = useState(false);
  const tempoKey = JSON.stringify(initialTempo);
  const [sourceTempo, setSourceTempo] = useState(tempoKey);
  if (sourceTempo !== tempoKey) { setSourceTempo(tempoKey); if (!tempoTouched) setTempo(initialTempo); }
  const [detailError, setDetailError] = useState<string | null>(null);
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [rir, setRir] = useState(initial.rir ?? defaultRir);
  const [weightTouched, setWeightTouched] = useState(false);
  const [repsTouched, setRepsTouched] = useState(false);
  const [rirTouched, setRirTouched] = useState(false);
  const initialKey = `${suggestionIdentity}:${initial.weight}:${initial.reps}:${initial.rir}`;
  const [sourceKey, setSourceKey] = useState(initialKey);
  if (sourceKey !== initialKey) {
    setSourceKey(initialKey);
    if (!weightTouched) setWeight(initial.weight);
    if (!repsTouched) setReps(initial.reps);
    if (!rirTouched) setRir(initial.rir ?? defaultRir);
  }

  function follow(nextReps: number, nextRir: number) {
    if (weightTouched || !liveWeight) return;
    const w = liveWeight(nextReps, nextRir);
    if (w != null) setWeight(w);
  }

  return (
    <fieldset disabled={disabled} className="set-entry flex min-w-0 flex-col gap-2">
      <div className={`grid ${loadMode === "reps_only" ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
        {loadMode !== "reps_only" && <Stepper
          label={loadMode === "assisted" ? "Assistance (lb)" : "Weight"}
          value={loadMode === "assisted" ? Math.abs(weight) : weight}
          step={increment}
          min={loadMode === "assisted" ? 0 : -200}
          onChange={(v) => {
            setWeightTouched(true);
            setWeight(loadMode === "assisted" ? -v : v);
          }}
        />}
        <Stepper
          label="Reps"
          value={reps}
          step={1}
          min={1}
          inputMode="numeric"
          onChange={(v) => {
            setRepsTouched(true);
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
            setRirTouched(true);
            setRir(v);
            follow(reps, v);
          }}
        />
      </div>
      <details className="text-caption"><summary className="min-h-11 cursor-pointer py-3">Set details · Tempo {tempo?.join("-") ?? "unspecified"}{note ? " · Note" : ""}</summary>
        {savedSetup && <SavedSetDetails tempo={initialTempo} setup={savedSetup}/>}
        <label className="mt-2 block text-caption text-muted" htmlFor={noteId}>Note for this set (optional)</label>
        <textarea id={noteId} rows={3} value={note} placeholder="Left shoulder discomfort on this set"
          className="mt-1 w-full rounded-control border border-border bg-surface p-3 text-body focus-visible:outline-2 focus-visible:outline-foreground"
          aria-invalid={Array.from(note).length>WORKOUT_TEXT_LIMIT || undefined} onChange={event=>{setNote(event.target.value);setDetailError(null);}} />
        <p className="text-caption text-muted">{Array.from(note).length} / {WORKOUT_TEXT_LIMIT} characters</p>
        <TempoFields variant="row" value={tempo ?? [2,0,1,0]} onChange={value => {setTempo(value);setTempoTouched(true);setDetailError(null);}} />
        {tempo && <Button type="button" variant="ghost" onClick={() => {setTempo(null);setTempoTouched(true);}}>Mark tempo unspecified</Button>}
      </details>
      {detailError && <p role="alert" className="text-caption text-danger">{detailError}</p>}
      <div className="flex flex-wrap gap-2">
        {onDelete && <Button type="button" variant="destructive" disabled={disabled} onClick={onDelete}>Delete</Button>}
        <Button
          type="button"
          variant={variant}
          size="md"
          className="flex-1"
          onClick={() => {
            if (tempo && !tempoSchema.safeParse(tempo).success) { setDetailError("Enter four non-negative whole seconds."); return; }
            try { const normalized=normalizeWorkoutText(note);onSubmit(loadMode === "reps_only" ? 0 : weight, reps, rir, tempo, normalized,weightTouched || repsTouched || rirTouched); }
            catch(cause) {setDetailError(cause instanceof Error?cause.message:"Enter a valid set note.");}
          }}
          disabled={disabled}
        >
          {label}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" size="md" onClick={()=>{if(!noteDirty || confirm("Discard unsaved set note?")) onCancel();}}>
            Cancel
          </Button>
        )}
      </div>
    </fieldset>
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

function CloseTools() {
  const dismiss = useSheetDismiss();
  return <Button type="button" variant="secondary" onClick={dismiss}>Done</Button>;
}
