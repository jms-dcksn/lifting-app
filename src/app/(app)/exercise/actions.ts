"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EXERCISE_BY_ID,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type Pattern,
} from "@/lib/strength/coefficients";
import { dbExerciseToDef, type DbExerciseRow } from "@/lib/catalog";
import { variantId, variantName, slugifyCustom } from "@/lib/exercise-id";

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
  machineType: MachineType;
}

// Find-or-create the variant for (template, brand, type). Idempotent: the unique index
// exercise_variant_unique backs the dedup; a concurrent insert resolves to a re-select.
export async function resolveVariant(input: ResolveVariantInput): Promise<ExerciseDef> {
  const { supabase, userId } = await requireUser();
  const base = EXERCISE_BY_ID[input.baseExerciseId];
  if (!base) throw new Error(`Unknown template: ${input.baseExerciseId}`);

  const id = variantId(base.id, input.brand, input.machineType);
  const existing = await supabase.from("exercise").select(SELECT).eq("id", id).maybeSingle();
  if (existing.data) return dbExerciseToDef(existing.data as DbExerciseRow);

  const insert = await supabase
    .from("exercise")
    .insert({
      id,
      user_id: userId,
      name: variantName(base.name, input.brand, input.machineType),
      pattern: base.pattern,
      equipment: "machine",
      brand: input.brand,
      machine_type: input.machineType,
      base_exercise_id: base.id,
      coefficient: base.coefficient,
      is_reference: false,
      needs_calibration: true,
      increment: base.increment,
    })
    .select(SELECT)
    .maybeSingle();

  if (insert.data) return dbExerciseToDef(insert.data as DbExerciseRow);

  // Lost a race on the unique index — re-select the winner.
  const after = await supabase.from("exercise").select(SELECT).eq("id", id).single();
  return dbExerciseToDef(after.data as DbExerciseRow);
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
