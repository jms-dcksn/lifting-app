"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EXERCISE_BY_ID,
  resolveStationFields,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type Pattern,
  type StationTag,
} from "@/lib/strength/coefficients";
import { dbExerciseToDef, type DbExerciseRow } from "@/lib/catalog";
import { variantId, variantName, ownedVariantId, slugifyCustom } from "@/lib/exercise-id";
import type { Database } from "@/lib/supabase/types";

type Client = Awaited<ReturnType<typeof createClient>>;
type VariantInsert = Database["public"]["Tables"]["exercise"]["Insert"];

const SELECT =
  "id, name, pattern, equipment, brand, machine_type, base_exercise_id, coefficient, is_reference, needs_calibration, increment";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export interface ResolveVariantInput {
  baseExerciseId: string;
  brand: string | null;
  machineType: StationTag;
}

async function findOwnVariant(
  supabase: Client,
  userId: string,
  baseExerciseId: string,
  brand: string | null,
  machineType: StationTag,
): Promise<DbExerciseRow | null> {
  const query = supabase
    .from("exercise")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("base_exercise_id", baseExerciseId)
    .eq("machine_type", machineType);
  const { data } = await (brand === null ? query.is("brand", null) : query.eq("brand", brand)).maybeSingle();
  return (data as DbExerciseRow | null) ?? null;
}

async function insertVariant(
  supabase: Client,
  row: VariantInsert,
): Promise<DbExerciseRow | null> {
  const { data, error } = await supabase.from("exercise").insert(row).select(SELECT).maybeSingle();
  if (data) return data as DbExerciseRow;
  if (error && error.code !== "23505") throw new Error(error.message);
  return null;
}

// Find-or-create the variant for (template, brand, station tag). Dedup is the per-user
// unique index, not the global id. A concurrent insert re-selects; a taken canonical slug
// retries with an owned id so a second user can still instantiate the same station.
export async function resolveVariant(input: ResolveVariantInput): Promise<ExerciseDef> {
  const { supabase, userId } = await requireUser();
  const base = EXERCISE_BY_ID[input.baseExerciseId];
  if (!base) throw new Error(`Unknown template: ${input.baseExerciseId}`);
  const { brand, machineType } = resolveStationFields(base, input);

  const existing = await findOwnVariant(supabase, userId, base.id, brand, machineType);
  if (existing) return dbExerciseToDef(existing);

  const row = {
    id: variantId(base.id, brand, machineType),
    user_id: userId,
    name: variantName(base.name, brand, machineType),
    pattern: base.pattern,
    equipment: base.equipment,
    brand,
    machine_type: machineType,
    base_exercise_id: base.id,
    coefficient: base.coefficient,
    is_reference: false,
    needs_calibration: !!base.needsCalibration,
    increment: base.increment,
  };

  const inserted = await insertVariant(supabase, row);
  if (inserted) return dbExerciseToDef(inserted);

  const raced = await findOwnVariant(supabase, userId, base.id, brand, machineType);
  if (raced) return dbExerciseToDef(raced);

  row.id = ownedVariantId(base.id, brand, machineType, userId);
  const scoped = await insertVariant(supabase, row);
  if (scoped) return dbExerciseToDef(scoped);

  const after = await findOwnVariant(supabase, userId, base.id, brand, machineType);
  if (after) return dbExerciseToDef(after);

  throw new Error("Could not select station");
}

export interface CreateCustomInput {
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  brand?: string | null;
  machineType?: MachineType | null;
}

export async function createCustomExercise(input: CreateCustomInput): Promise<ExerciseDef> {
  const { supabase, userId } = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  const isMachine = input.equipment === "machine";

  const { data, error } = await supabase
    .from("exercise")
    .insert({
      id: slugifyCustom(name),
      user_id: userId,
      name,
      pattern: input.pattern,
      equipment: input.equipment,
      brand: isMachine ? (input.brand ?? null) : null,
      machine_type: isMachine ? (input.machineType ?? null) : null,
      base_exercise_id: null,
      coefficient: 1.0,
      is_reference: false,
      needs_calibration: isMachine,
      increment: input.equipment === "barbell" ? 5 : 10,
    })
    .select(SELECT)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create exercise");
  return dbExerciseToDef(data as DbExerciseRow);
}
