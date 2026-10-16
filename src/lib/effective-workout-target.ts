import { exactExerciseIdentity, type ExactExerciseIdentity } from "./strength/identity";
import type { EffectivePrescription } from "./periodization";
import { buildStallAssessments, type StallContext, type StallHistory } from "./stall-report";
import type { ExerciseDef } from "./strength/coefficients";
import { repeatedEffortReduction } from "./strength/effort";
import { selectProgressionReference, sessionTarget, type ProgressionPerformance, type SessionTarget } from "./strength/progression";
import type { ExerciseStat } from "./strength/recommend";

export interface TargetPerformance extends ProgressionPerformance {
  exerciseId: string;
  equipmentInstanceId: string | null;
  sessionId: string;
  setId: string;
}

export interface WorkoutTargetHistory {
  progressionByExercise: Record<string, TargetPerformance[]>;
  effortBySlot: Record<string, { context: StallContext; exposures: TargetPerformance[] }>;
}

export type EffectiveTargetReason = "unavailable" | "starting_weight" | "recovery" | "below_rep_floor"
  | "add_load" | "add_rep" | "hold_load" | "repeated_effort_miss";

export interface EffectiveWorkoutTarget {
  status: "current_target";
  target: SessionTarget | null;
  reason: EffectiveTargetReason;
  reference: ReturnType<typeof selectProgressionReference>;
  evidence: TargetPerformance[];
}

export interface EffectiveTargetInput {
  slotId: string;
  exerciseId: string;
  equipmentInstanceId?: string | null;
  prescription: Pick<EffectivePrescription, "repMin" | "repMax" | "targetRir">;
  context: StallContext | null;
  isDeload?: boolean;
  history: WorkoutTargetHistory;
  catalog: Record<string, ExerciseDef>;
  stats: ExerciseStat[];
  bodyweight: number | null;
}

// The supplied snapshot is bounded before the workout starts; open-session sets never feed it.
export function buildWorkoutTargetHistory(history: StallHistory, catalog: Record<string, ExerciseDef>, asOf: Date,
  slotIds = history.slots.map(slot => slot.id)): WorkoutTargetHistory {
  const cutoff = asOf.getTime();
  const sessions = history.sessions.filter(session => session.finishedAt != null
    && Date.parse(session.finishedAt) <= cutoff && Date.parse(session.performedAt) < cutoff);
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const sets = [...new Map(history.sets.filter(set => set.user_id === history.userId && !set.is_warmup
    && sessionById.has(set.session_id) && Date.parse(set.created_at) < cutoff).map(set => [set.id, set])).values()];
  const snapshot = { ...history, sessions, sets };
  const firstByExposure = new Map<string, typeof sets[number]>();
  const missingIndex = new Set<string>();
  for (const set of sets) {
    const key = JSON.stringify([set.session_id, set.program_slot_id, set.exercise_id, set.equipment_instance_id]);
    if (!Number.isInteger(set.set_index) || set.set_index! < 0) { missingIndex.add(key); continue; }
    const first = firstByExposure.get(key);
    if (!first || set.set_index! < first.set_index! || (set.set_index === first.set_index && set.created_at < first.created_at)) {
      firstByExposure.set(key, set);
    }
  }
  const progressionByExercise: WorkoutTargetHistory["progressionByExercise"] = {};
  const performanceByExposure = new Map<string, TargetPerformance>();
  for (const [key, set] of firstByExposure) {
    if (missingIndex.has(key)) continue;
    const session = sessionById.get(set.session_id)!;
    if (set.is_deload || session.isDeload || set.weight == null || !Number.isFinite(set.weight)
      || set.reps == null || !Number.isInteger(set.reps) || set.reps < 1) continue;
    const performance: TargetPerformance = { exerciseId: set.exercise_id, equipmentInstanceId: set.equipment_instance_id,
      sessionId: set.session_id, setId: set.id, programSlotId: set.program_slot_id, performedAt: session.performedAt,
      weight: set.weight, reps: set.reps, rir: set.rir, e1rm: set.e1rm };
    performanceByExposure.set(key, performance);
    (progressionByExercise[set.exercise_id] ??= []).push(performance);
  }
  const effortBySlot: WorkoutTargetHistory["effortBySlot"] = {};
  for (const assessment of buildStallAssessments(snapshot, catalog, asOf)) {
    if (!slotIds.includes(assessment.slotId) || !assessment.context || assessment.points.length < 2) continue;
    const exposures = assessment.points.slice(-2).map(point => performanceByExposure.get(JSON.stringify([
      point.sessionId, assessment.slotId, assessment.exerciseId, assessment.equipmentInstanceId,
    ])));
    if (exposures.every((exposure): exposure is TargetPerformance => exposure != null)) {
      effortBySlot[assessment.slotId] = { context: assessment.context, exposures };
    }
  }
  // Keep each slot's anchor/best plus the fresh-swap window, not every historical exposure.
  for (const [exerciseId, performances] of Object.entries(progressionByExercise)) {
    const keep = new Set<string>();
    for (const instance of new Set(performances.map(performance => performance.equipmentInstanceId))) {
      const exact = performances.filter(performance => performance.equipmentInstanceId === instance);
      for (const performance of [...exact].sort((a, b) => b.performedAt.localeCompare(a.performedAt)).slice(0, 4)) keep.add(performance.setId);
      for (const slotId of slotIds) {
        const reference = selectProgressionReference(exact, slotId);
        for (const point of [reference.lastSameSlot, reference.bestRecent]) {
          if (point) keep.add((point as TargetPerformance).setId);
        }
      }
    }
    progressionByExercise[exerciseId] = performances.filter(performance => keep.has(performance.setId));
  }
  return { progressionByExercise, effortBySlot };
}

// Compose the existing rules once. The result is a suggestion, never a persisted intervention.
export function resolveEffectiveWorkoutTarget(input: EffectiveTargetInput): EffectiveWorkoutTarget {
  const { prescription, context, catalog, stats, bodyweight } = input;
  const def = catalog[input.exerciseId];
  const performances = (input.history.progressionByExercise[input.exerciseId] ?? [])
    .filter(performance => performance.equipmentInstanceId === (input.equipmentInstanceId ?? null));
  const reference = selectProgressionReference(performances, input.slotId);
  const selected = reference.selected as TargetPerformance | null;
  const target = def ? sessionTarget(def, prescription, selected, catalog, stats, bodyweight) : null;
  const evidence = selected ? [selected] : [];
  const result = (target: SessionTarget | null, reason: EffectiveTargetReason, evidence: TargetPerformance[]): EffectiveWorkoutTarget =>
    ({ status: "current_target", target, reason, reference, evidence });
  if (!target || !def) return result(null, "unavailable", evidence);
  if (input.isDeload || prescription.targetRir >= 4) return result(target, "recovery", evidence);
  const effort = input.history.effortBySlot[input.slotId];
  if (context && context.exerciseId === input.exerciseId && context.equipmentInstanceId === (input.equipmentInstanceId ?? null)
    && context.repMin === prescription.repMin && context.repMax === prescription.repMax && context.targetRirMax === prescription.targetRir
    && effort && JSON.stringify(effort.context) === JSON.stringify(context)) {
    const reduction = repeatedEffortReduction(def, prescription,
      effort.exposures.map(exposure => ({ ...exposure, targetRirMin: context.targetRirMin })));
    if (reduction) return result({ ...reduction, targetRir: prescription.targetRir, source: "progression", last: effort.exposures.at(-1)! },
      "repeated_effort_miss", effort.exposures);
  }
  if (!selected) return result(target, "starting_weight", evidence);
  const reason = selected.reps < prescription.repMin ? "below_rep_floor"
    : target.weight > selected.weight ? "add_load" : target.targetReps > selected.reps ? "add_rep" : "hold_load";
  return result(target, reason, evidence);
}

export function effectiveTargetExplanation(result: EffectiveWorkoutTarget): string {
  switch (result.reason) {
    case "repeated_effort_miss": return "The first working set was harder than the prescribed RIR in two consecutive comparable exposures. The upcoming target uses one increment less load; this is a calculated suggestion, not a program change.";
    case "recovery": return "This target follows the current recovery prescription. Repeated effort misses do not override recovery.";
    case "below_rep_floor": return "The selected first set was below the current rep range. The target returns to the rep floor using recorded reps and effort.";
    case "add_load": return "The selected first set reached the rep ceiling. The target adds one increment and returns to the rep floor.";
    case "add_rep": return "The target holds load and advances reps within the current prescription.";
    case "hold_load": return "The target holds the selected load within the current prescription.";
    case "starting_weight": return "This is a starting estimate from the strength engine; no exact-exercise reference was available.";
    case "unavailable": return "There is not enough usable evidence to calculate this target.";
  }
}

/** Protected entry point for UI/data/tool consumers; legacy pure callers migrate separately. */
export function resolveExactWorkoutTarget(input: Omit<EffectiveTargetInput, "exerciseId" | "equipmentInstanceId"> & {
  identity: ExactExerciseIdentity;
}): EffectiveWorkoutTarget {
  if (input.identity.kind !== "exact") throw new Error("An exact exercise identity is required.");
  const identity = exactExerciseIdentity(input.identity.exerciseId, input.identity.equipmentInstanceId);
  return resolveEffectiveWorkoutTarget({ ...input, ...identity });
}
