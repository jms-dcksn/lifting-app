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

export interface TopWeightRecord extends RecordSource {
  load: number;
  weight: number;
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
  topWeightRecord: TopWeightRecord | null;
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

export function eligibleRecordSet(set: RecordSet, def: ExerciseDef | undefined) {
  if (!def || def.stationProfile === "machine" || set.is_warmup || !validSetNumbers(set)) return null;
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

export function recordScope(set: RecordSet) {
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
  const priorLoads = new Map<string, number>();
  for (const set of prior) {
    const values = eligibleRecordSet(set, catalog[set.exercise_id]);
    if (!values) continue;
    const key = recordScope(set);
    const loadKey = `${key}:${values.load}`;
    priorReps.set(loadKey, Math.max(priorReps.get(loadKey) ?? 0, values.reps));
    priorEstimates.set(key, Math.max(priorEstimates.get(key) ?? 0, values.estimate));
    priorLoads.set(key, Math.max(priorLoads.get(key) ?? 0, values.load));
  }
  const bestReps = new Map(priorReps);
  const bestEstimates = new Map(priorEstimates);
  const bestLoads = new Map(priorLoads);
  const groups = new Map<string, ExerciseRecords>();
  for (const set of current) {
    const def = catalog[set.exercise_id];
    const values = eligibleRecordSet(set, def);
    if (!values) continue;
    const key = recordScope(set);
    const loadKey = `${key}:${values.load}`;
    const previousReps = bestReps.get(loadKey);
    const previousEstimate = bestEstimates.get(key);
    const previousLoad = bestLoads.get(key);
    const repPr = previousReps != null && values.reps > previousReps;
    const estimatePr = previousEstimate != null && values.estimate > previousEstimate;
    const loadPr = previousLoad != null && values.load > previousLoad;
    if (repPr || estimatePr || loadPr) {
      const group = groups.get(key) ?? {
        key, exerciseId: set.exercise_id, equipmentInstanceId: set.equipment_instance_id,
        name: def.name, isBodyweight: def.equipment === "bodyweight",
        repRecords: [], e1rmRecord: null, topWeightRecord: null,
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
      if (loadPr) {
        const baseline = priorLoads.get(key);
        group.topWeightRecord = { ...source, load: values.load, weight: values.weight,
          improvement: baseline == null ? null : loadPrecision(values.load - baseline) };
      }
      groups.set(key, group);
    }
    bestReps.set(loadKey, Math.max(previousReps ?? 0, values.reps));
    bestEstimates.set(key, Math.max(previousEstimate ?? 0, values.estimate));
    bestLoads.set(key, Math.max(previousLoad ?? 0, values.load));
  }
  return [...groups.values()].map((g) => ({ ...g, repRecords: g.repRecords.sort((a, b) => b.load - a.load) }));
}

export function recordCounts(groups: ExerciseRecords[]) {
  return {
    reps: groups.reduce((n, g) => n + g.repRecords.length, 0),
    e1rm: groups.filter((g) => g.e1rmRecord != null).length,
    topWeight: groups.filter((g) => g.topWeightRecord != null).length,
    exercises: new Set(groups.map((g) => g.exerciseId)).size,
  };
}

export type RecordCounts = ReturnType<typeof recordCounts>;

export function recordTotal(counts: RecordCounts) {
  return counts.reps + counts.e1rm + counts.topWeight;
}

/** Finish-recap hero. A single "N PRs" number is only honest when every record is the same kind. */
export function recapHeadline(counts: RecordCounts) {
  const parts = [
    counts.reps > 0 ? `${counts.reps} rep ${counts.reps === 1 ? "PR" : "PRs"}` : null,
    counts.e1rm > 0 ? `${counts.e1rm} e1RM ${counts.e1rm === 1 ? "record" : "records"}` : null,
    counts.topWeight > 0 ? `${counts.topWeight} top-weight ${counts.topWeight === 1 ? "record" : "records"}` : null,
  ].filter((part): part is string => part != null);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    const n = counts.reps || counts.e1rm || counts.topWeight;
    return `${n} ${n === 1 ? "PR" : "PRs"}`;
  }
  return parts.join(" · ");
}

function compactDelta(improvement: number | null) {
  return improvement == null ? "" : ` +${improvement}`;
}

/** Compact recap lines for one exercise/equipment scope. No fabricated deltas. */
export function recapLines(group: ExerciseRecords) {
  const lines = group.repRecords.map((record) =>
    `${record.load} × ${record.reps}${compactDelta(record.improvement)}`,
  );
  if (group.topWeightRecord) {
    lines.push(`${group.topWeightRecord.load} top${compactDelta(group.topWeightRecord.improvement)}`);
  }
  if (group.e1rmRecord) {
    lines.push(`${group.e1rmRecord.value} e1RM${compactDelta(group.e1rmRecord.improvement)}`);
  }
  return lines;
}

export function recordsForSlot(groups: ExerciseRecords[], slotId: string) {
  return groups.map((group) => ({
    ...group,
    repRecords: group.repRecords.filter((r) => r.slotId === slotId),
    e1rmRecord: group.e1rmRecord?.slotId === slotId ? group.e1rmRecord : null,
    topWeightRecord: group.topWeightRecord?.slotId === slotId ? group.topWeightRecord : null,
  })).filter((g) => g.repRecords.length > 0 || g.e1rmRecord != null || g.topWeightRecord != null);
}
