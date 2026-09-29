import type { ExerciseDef, StationProfile } from "./coefficients";

// Comparison identity for e1RM and PR replay.
//
// The seeded template is the movement. A station variant is where the set was
// loaded. Ordinary-lb families share the template. Machine and cable numbers
// are stack or leverage units, so they stay on the logged exercise id.
// Variants in the catalog do not carry stationProfile. Read it from the template.

export type ComparisonScope =
  | { kind: "movement"; movementId: string }
  | { kind: "station"; exerciseId: string; equipmentInstanceId: string | null };

export function movementId(def: Pick<ExerciseDef, "id" | "baseExerciseId">): string {
  return def.baseExerciseId ?? def.id;
}

export function stationProfileOf(
  def: Pick<ExerciseDef, "stationProfile" | "equipment">,
): StationProfile {
  if (def.stationProfile) return def.stationProfile;
  if (def.equipment === "machine") return "machine";
  if (def.equipment === "cable") return "cable";
  return "none";
}

// Records proposal for Card 1 only. Not a session-target or stall switch.
// Cable raw stack e1RM stays out. A `rollup` reply is a new value, not this boolean.
export function rollsUp(template: Pick<ExerciseDef, "stationProfile" | "equipment">): boolean {
  const profile = stationProfileOf(template);
  return profile !== "machine" && profile !== "cable";
}

export function movementTemplate(
  def: ExerciseDef,
  catalog: Record<string, ExerciseDef>,
): ExerciseDef {
  return catalog[movementId(def)] ?? def;
}

export function comparisonScope(
  set: { exercise_id: string; equipment_instance_id: string | null },
  catalog: Record<string, ExerciseDef>,
): ComparisonScope {
  const def = catalog[set.exercise_id];
  if (!def) {
    return {
      kind: "station",
      exerciseId: set.exercise_id,
      equipmentInstanceId: set.equipment_instance_id,
    };
  }
  const template = movementTemplate(def, catalog);
  if (!rollsUp(template)) {
    return {
      kind: "station",
      exerciseId: set.exercise_id,
      equipmentInstanceId: set.equipment_instance_id,
    };
  }
  return { kind: "movement", movementId: movementId(def) };
}

export function comparisonKey(scope: ComparisonScope): string {
  if (scope.kind === "movement") return `movement:${scope.movementId}`;
  return `station:${scope.exerciseId}:${scope.equipmentInstanceId ?? ""}`;
}

// Ids whose sets belong on one movement story. Non-rolling ids return only
// themselves, so machine and cable siblings never enter the query.
export function movementMemberIds(
  exerciseId: string,
  catalog: Record<string, ExerciseDef>,
): string[] {
  const def = catalog[exerciseId];
  if (!def) return [exerciseId];
  const template = movementTemplate(def, catalog);
  if (!rollsUp(template)) return [def.id];
  const movement = movementId(def);
  const members = Object.values(catalog)
    .filter((candidate) => movementId(candidate) === movement)
    .map((candidate) => candidate.id);
  return [...new Set(members)].sort();
}
