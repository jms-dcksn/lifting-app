import type { ExerciseDef } from "./coefficients";
import { computeE1rm, pctOf1RM } from "./e1rm";

export interface RecordSet {
  id: string;
  user_id: string;
  session_id: string;
  exercise_id: string;
  equipment_instance_id: string | null;
  program_slot_id: string | null;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  e1rm: number | null;
  is_warmup: boolean;
  created_at: string;
  workout_session: { performed_at: string; finished_at: string | null };
}

interface RecordSource {
  setId: string;
  slotId: string | null;
}

export interface RepRecord extends RecordSource {
  load: number;
  weight: number;
  reps: number;
  // null means the baseline was established within this workout.
  improvement: number | null;
}

export interface E1rmRecord extends RecordSource {
  value: number;
  improvement: number | null;
}

export interface ExerciseRecords {
  key: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  name: string;
  isBodyweight: boolean;
  repRecords: RepRecord[];
  e1rmRecord: E1rmRecord | null;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const loadPrecision = (value: number) => Math.round(value * 1000) / 1000;
// Compare at the same tenth-pound precision displayed to the lifter. No +0 PRs.
const estimatePrecision = (value: number) => Math.round(value * 10) / 10;

export function validSetNumbers(set: { weight: unknown; reps: unknown; rir: unknown }) {
  return finite(set.weight) && finite(set.reps) && Number.isInteger(set.reps) && set.reps > 0
    && (set.rir === null || (finite(set.rir) && set.rir >= 0 && set.rir <= 5));
}

// e1rm was persisted with the canonical RIR formula when the set was saved. Inverting
// it recovers the historical effective load without consulting today's bodyweight.
export function historicalBodyweight(set: Pick<RecordSet, "weight" | "reps" | "rir" | "e1rm">) {
  if (!validSetNumbers(set) || !finite(set.e1rm) || set.e1rm <= 0) return null;
  const bodyweight = loadPrecision(set.e1rm * pctOf1RM(set.reps! + (set.rir ?? 2)) - set.weight!);
  return bodyweight > 0 ? bodyweight : null;
}

function eligible(set: RecordSet, def: ExerciseDef | undefined) {
  if (!def || def.machineTemplate || set.is_warmup || !validSetNumbers(set)) return null;
  const weight = set.weight!;
  const reps = set.reps!;
  const bodyweight = def.equipment === "bodyweight" ? historicalBodyweight(set) : null;
  if (def.equipment === "bodyweight" && bodyweight == null) return null;
  const effective = def.equipment === "bodyweight" ? bodyweight! + weight : weight;
  if (effective <= 0) return null;
  const estimate = def.equipment === "bodyweight" ? set.e1rm! : computeE1rm(effective, reps, set.rir ?? 2);
  if (!Number.isFinite(estimate) || estimate <= 0) return null;
  return { load: loadPrecision(effective), estimate: estimatePrecision(estimate), reps, weight };
}

function scope(set: RecordSet) {
  return JSON.stringify([set.exercise_id, set.equipment_instance_id]);
}

/** Pure replay of persisted sets. Never call this with optimistic rows. */
export function workoutRecords(
  rows: RecordSet[],
  userId: string,
  sessionId: string,
  startedAt: string,
  catalog: Record<string, ExerciseDef>,
): ExerciseRecords[] {
  const cutoff = Date.parse(startedAt);
  if (!Number.isFinite(cutoff)) throw new Error("Invalid workout start time");
  const sets = [...new Map(rows.filter((s) => s.user_id === userId).map((s) => [s.id, s])).values()];
  const prior = sets.filter((s) => s.session_id !== sessionId
    && s.workout_session.finished_at != null
    && Date.parse(s.workout_session.finished_at) <= cutoff
    && Date.parse(s.workout_session.performed_at) < cutoff
    && Date.parse(s.created_at) < cutoff);
  const current = sets.filter((s) => s.session_id === sessionId)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));

  const priorReps = new Map<string, number>();
  const priorEstimates = new Map<string, number>();
  for (const set of prior) {
    const values = eligible(set, catalog[set.exercise_id]);
    if (!values) continue;
    const key = scope(set);
    const loadKey = `${key}:${values.load}`;
    priorReps.set(loadKey, Math.max(priorReps.get(loadKey) ?? 0, values.reps));
    priorEstimates.set(key, Math.max(priorEstimates.get(key) ?? 0, values.estimate));
  }
  const bestReps = new Map(priorReps);
  const bestEstimates = new Map(priorEstimates);
  const groups = new Map<string, ExerciseRecords>();
  for (const set of current) {
    const def = catalog[set.exercise_id];
    const values = eligible(set, def);
    if (!values) continue;
    const key = scope(set);
    const loadKey = `${key}:${values.load}`;
    const previousReps = bestReps.get(loadKey);
    const previousEstimate = bestEstimates.get(key);
    const repPr = previousReps != null && values.reps > previousReps;
    const estimatePr = previousEstimate != null && values.estimate > previousEstimate;
    if (repPr || estimatePr) {
      const group = groups.get(key) ?? {
        key, exerciseId: set.exercise_id, equipmentInstanceId: set.equipment_instance_id,
        name: def.name, isBodyweight: def.equipment === "bodyweight", repRecords: [], e1rmRecord: null,
      };
      const source = { setId: set.id, slotId: set.program_slot_id };
      if (repPr) {
        const baseline = priorReps.get(loadKey);
        group.repRecords = group.repRecords.filter((r) => r.load !== values.load);
        group.repRecords.push({ ...source, load: values.load, weight: values.weight, reps: values.reps,
          improvement: baseline == null ? null : values.reps - baseline });
      }
      if (estimatePr) {
        const baseline = priorEstimates.get(key);
        group.e1rmRecord = { ...source, value: values.estimate,
          improvement: baseline == null ? null : estimatePrecision(values.estimate - baseline) };
      }
      groups.set(key, group);
    }
    bestReps.set(loadKey, Math.max(previousReps ?? 0, values.reps));
    bestEstimates.set(key, Math.max(previousEstimate ?? 0, values.estimate));
  }
  return [...groups.values()].map((g) => ({ ...g, repRecords: g.repRecords.sort((a, b) => b.load - a.load) }));
}

export function recordCounts(groups: ExerciseRecords[]) {
  return {
    reps: groups.reduce((n, g) => n + g.repRecords.length, 0),
    e1rm: groups.filter((g) => g.e1rmRecord != null).length,
    exercises: new Set(groups.map((g) => g.exerciseId)).size,
  };
}

export function recordsForSlot(groups: ExerciseRecords[], slotId: string) {
  return groups.map((group) => ({
    ...group,
    repRecords: group.repRecords.filter((r) => r.slotId === slotId),
    e1rmRecord: group.e1rmRecord?.slotId === slotId ? group.e1rmRecord : null,
  })).filter((g) => g.repRecords.length > 0 || g.e1rmRecord != null);
}
