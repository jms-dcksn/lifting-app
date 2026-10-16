import { z } from "zod";
import { isProgressionSet } from "./strength/eligibility";
import { exactExerciseIdentity, type ExactExerciseIdentity } from "./strength/identity";
import { historicalBodyweight, workoutRecords, type RecordSet } from "./strength/records";

const id = z.string().min(1).refine(value => value.trim().length > 0);
const timestamp = z.iso.datetime({ offset: true });
const persistedSet = z.object({
  id, user_id: id, session_id: id, exercise_id: id,
  equipment_instance_id: id.nullable(), program_slot_id: id.nullable(),
  weight: z.number().nullable(), reps: z.number().int().nullable(),
  rir: z.number().min(0).max(5).nullable(), e1rm: z.number().nullable(),
  is_warmup: z.boolean(), is_deload: z.boolean(), created_at: timestamp,
  set_index: z.number().int().nonnegative().optional(),
  workout_session: z.object({ performed_at: timestamp, finished_at: timestamp.nullable() }),
});

export interface TrainingEvidence {
  kind: "training_activity";
  set: RecordSet & { is_deload: boolean };
  identity: ExactExerciseIdentity;
  historicalBodyweight: number | null;
}
export interface ProgressionEvidence extends Omit<TrainingEvidence, "kind"> {
  kind: "progression_evidence";
}

/** Missing classification is unknown, never implicitly a normal working set. */
export function parseTrainingEvidence(input: unknown, ownerId: string): TrainingEvidence {
  const result = persistedSet.safeParse(input);
  if (!result.success || result.data.user_id !== ownerId) {
    throw new Error("Unable to load training evidence: incomplete or invalid saved set.");
  }
  const set = result.data;
  return { kind: "training_activity", set,
    identity: exactExerciseIdentity(set.exercise_id, set.equipment_instance_id),
    historicalBodyweight: historicalBodyweight(set) };
}

export function progressionEvidence(activity: TrainingEvidence): ProgressionEvidence | null {
  return isProgressionSet({ isWarmup: activity.set.is_warmup, isDeload: activity.set.is_deload })
    ? { ...activity, kind: "progression_evidence" } : null;
}

/** Validated record replay; activity remains available even when ineligible for records. */
export function replayTrainingRecords(
  activity: TrainingEvidence[], userId: string, sessionId: string, startedAt: string,
  catalog: Parameters<typeof workoutRecords>[4],
) {
  return workoutRecords(activity.flatMap(item => progressionEvidence(item)?.set ?? []),
    userId, sessionId, startedAt, catalog);
}
