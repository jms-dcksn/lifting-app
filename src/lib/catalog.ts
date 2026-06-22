// Merged exercise catalog: seeded templates (coefficients.ts) + the user's DB exercise
// rows (brand/type variants and fully-custom exercises). The pure strength engine consumes
// the resulting Record<id, ExerciseDef>; seeded ids win any collision.

import type { createClient } from "@/lib/supabase/server";
import {
  EXERCISES,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type Pattern,
} from "@/lib/strength/coefficients";

export interface DbExerciseRow {
  id: string;
  name: string;
  pattern: string;
  equipment: string;
  brand: string | null;
  machine_type: string | null;
  base_exercise_id: string | null;
  coefficient: number;
  is_reference: boolean;
  needs_calibration: boolean;
  increment: number;
}

const SELECT =
  "id, name, pattern, equipment, brand, machine_type, base_exercise_id, coefficient, is_reference, needs_calibration, increment";

export function dbExerciseToDef(row: DbExerciseRow): ExerciseDef {
  return {
    id: row.id,
    name: row.name,
    pattern: row.pattern as Pattern,
    equipment: row.equipment as Equipment,
    brand: row.brand ?? undefined,
    machineType: (row.machine_type as MachineType | null) ?? undefined,
    baseExerciseId: row.base_exercise_id ?? undefined,
    coefficient: Number(row.coefficient),
    isReference: row.is_reference,
    needsCalibration: row.needs_calibration,
    increment: Number(row.increment),
  };
}

// Pure: seeded templates first, then DB rows that don't collide with a seeded id.
export function mergeCatalog(rows: DbExerciseRow[]): Record<string, ExerciseDef> {
  const map: Record<string, ExerciseDef> = {};
  for (const def of EXERCISES) map[def.id] = def;
  for (const row of rows) {
    if (map[row.id]) continue; // seeded wins
    map[row.id] = dbExerciseToDef(row);
  }
  return map;
}

export async function getCatalogMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Record<string, ExerciseDef>> {
  const { data } = await supabase.from("exercise").select(SELECT).eq("user_id", userId);
  return mergeCatalog((data ?? []) as DbExerciseRow[]);
}

export async function getCatalogList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ExerciseDef[]> {
  return Object.values(await getCatalogMap(supabase, userId));
}
