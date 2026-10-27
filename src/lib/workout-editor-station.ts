import { EXERCISE_BY_ID, resolveStationFields, type ExerciseDef } from "./strength/coefficients";
import { normalizeStationModel, MACHINE_MODELS } from "./machine-models";
import { variantName } from "./exercise-id";
import type { ResolveVariantInput } from "@/app/(app)/exercise/actions";

/** Resolve locally; persistence belongs to the editor's atomic Save, never the picker. */
export function draftStation(input: ResolveVariantInput, id: string): ExerciseDef {
  const base = EXERCISE_BY_ID[input.baseExerciseId];
  if (!base) throw new Error("Unknown station template.");
  const fields = resolveStationFields(base, input);
  const model = normalizeStationModel(input.stationModel);
  const known = MACHINE_MODELS.find(m => m.id === model);
  if (known && (known.brand !== fields.brand || known.machineType !== fields.machineType || !known.exercises.includes(base.id))) {
    throw new Error("Model does not match this exercise, brand or loading type.");
  }
  return { ...base, id, name: variantName(base.name, fields.brand, fields.machineType, model),
    brand: fields.brand ?? undefined, machineType: fields.machineType, stationModel: model ?? undefined,
    baseExerciseId: base.id, stationProfile: "none" };
}
