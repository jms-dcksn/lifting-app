/** Exact loading identity. Movement comparisons cannot be passed as target identities. */
export interface ExactExerciseIdentity {
  kind: "exact";
  exerciseId: string;
  equipmentInstanceId: string | null;
}

export function exactExerciseIdentity(exerciseId: string, equipmentInstanceId: string | null): ExactExerciseIdentity {
  if (typeof exerciseId !== "string" || !exerciseId.trim()
    || (equipmentInstanceId !== null && (typeof equipmentInstanceId !== "string" || !equipmentInstanceId.trim()))) {
    throw new Error("Exercise identity is unavailable.");
  }
  return { kind: "exact", exerciseId, equipmentInstanceId };
}

export function exactIdentityKey(identity: ExactExerciseIdentity): string {
  return JSON.stringify([identity.exerciseId, identity.equipmentInstanceId]);
}
