"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeTags } from "@/lib/program-tags";
import { SEED_PROGRAM } from "../session/seed";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export interface SaveSlotInput {
  id: string;
  exerciseId: string;
  pattern: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number | null;
}

export interface SaveDayInput {
  id: string;
  name: string;
  slots: SaveSlotInput[];
}

export interface SaveProgramInput {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  days: SaveDayInput[];
}

// Full save of one program from the builder. Preserves day/slot ids (the client generates
// uuids for new rows) so set_log.program_slot_id linkage survives edits, and re-derives
// positions from array order. Saving always makes this the single active program.
export async function saveProgram(input: SaveProgramInput) {
  const { supabase, userId } = await requireUser();

  // The delete-missing step below removes every day not in the input; an empty input
  // would silently wipe the whole program structure.
  if (input.days.length === 0) throw new Error("A program needs at least one day");

  const name = input.name.trim() || "My Program";
  const description = input.description?.trim() || null;
  const tags = normalizeTags(input.tags);
  const weeks = Math.min(6, Math.max(4, Math.round(input.weeks)));

  // Single active program per user (enforced by a partial unique index): clear others first.
  await supabase
    .from("program")
    .update({ is_active: false })
    .eq("user_id", userId)
    .neq("id", input.id);

  const { error: progErr } = await supabase
    .from("program")
    .upsert({ id: input.id, user_id: userId, name, description, tags, weeks, is_active: true });
  if (progErr) throw new Error(progErr.message);

  // Days: upsert incoming, then delete any removed (cascade drops their slots).
  const dayRows = input.days.map((d, i) => ({
    id: d.id,
    user_id: userId,
    program_id: input.id,
    position: i,
    name: d.name.trim() || `Day ${i + 1}`,
  }));
  if (dayRows.length) {
    const { error } = await supabase.from("program_day").upsert(dayRows);
    if (error) throw new Error(error.message);
  }
  // Delete removed days (cascade drops their slots).
  {
    let q = supabase.from("program_day").delete().eq("program_id", input.id);
    const keep = input.days.map((d) => d.id);
    if (keep.length) q = q.not("id", "in", `(${keep.join(",")})`);
    const { error } = await q;
    if (error) throw new Error(error.message);
  }

  // Slots: upsert incoming, then delete any removed within the surviving days.
  const slotRows = input.days.flatMap((d) =>
    d.slots.map((s, i) => ({
      id: s.id,
      user_id: userId,
      program_day_id: d.id,
      position: i,
      exercise_id: s.exerciseId,
      pattern: s.pattern,
      target_sets: s.targetSets,
      rep_min: s.repMin,
      rep_max: s.repMax,
      target_rir: s.targetRir,
      rest_seconds: s.restSeconds,
    })),
  );
  if (slotRows.length) {
    const { error } = await supabase.from("program_slot").upsert(slotRows);
    if (error) throw new Error(error.message);
  }
  // Delete removed slots within each surviving day.
  const keepSlotIds = slotRows.map((s) => s.id);
  for (const d of input.days) {
    let q = supabase.from("program_slot").delete().eq("program_day_id", d.id);
    if (keepSlotIds.length) q = q.not("id", "in", `(${keepSlotIds.join(",")})`);
    const { error } = await q;
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/program");
}

// Seed a new active program from the built-in Push/Pull/Legs template (onboarding shortcut).
export async function createFromTemplate() {
  const { supabase, userId } = await requireUser();

  await supabase.from("program").update({ is_active: false }).eq("user_id", userId);

  const { data: prog, error } = await supabase
    .from("program")
    .insert({ user_id: userId, name: SEED_PROGRAM.name, weeks: SEED_PROGRAM.weeks, is_active: true })
    .select("id")
    .single();
  if (error || !prog) throw new Error(error?.message ?? "Could not create program");

  for (const [di, day] of SEED_PROGRAM.days.entries()) {
    const { data: newDay } = await supabase
      .from("program_day")
      .insert({ user_id: userId, program_id: prog.id, name: day.name, position: di })
      .select("id")
      .single();
    if (!newDay) continue;
    await supabase.from("program_slot").insert(
      day.slots.map((s, si) => ({
        user_id: userId,
        program_day_id: newDay.id,
        position: si,
        exercise_id: s.exerciseId,
        pattern: s.pattern,
        target_sets: s.targetSets,
        rep_min: s.repMin,
        rep_max: s.repMax,
        target_rir: s.targetRir,
      })),
    );
  }

  revalidatePath("/");
  redirect("/program");
}

export async function setActiveProgram(id: string) {
  const { supabase, userId } = await requireUser();
  await supabase
    .from("program")
    .update({ is_active: false })
    .eq("user_id", userId)
    .neq("id", id);
  await supabase
    .from("program")
    .update({ is_active: true })
    .eq("user_id", userId)
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/program");
}

// Duplicate a program (new ids) as an inactive draft; returns the new program id.
export async function cloneProgram(id: string): Promise<string> {
  const { supabase, userId } = await requireUser();

  const { data: src } = await supabase
    .from("program")
    .select("name, weeks")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (!src) throw new Error("Program not found");

  const { data: newProg, error: progErr } = await supabase
    .from("program")
    .insert({ user_id: userId, name: `${src.name} (copy)`, weeks: src.weeks, is_active: false })
    .select("id")
    .single();
  if (progErr || !newProg) throw new Error(progErr?.message ?? "Could not clone program");

  const { data: days } = await supabase
    .from("program_day")
    .select("id, name, position")
    .eq("program_id", id)
    .order("position", { ascending: true });

  for (const day of days ?? []) {
    const { data: newDay } = await supabase
      .from("program_day")
      .insert({ user_id: userId, program_id: newProg.id, name: day.name, position: day.position })
      .select("id")
      .single();
    if (!newDay) continue;

    const { data: slots } = await supabase
      .from("program_slot")
      .select("exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, position")
      .eq("program_day_id", day.id)
      .order("position", { ascending: true });

    if (slots?.length) {
      await supabase.from("program_slot").insert(
        slots.map((s) => ({
          user_id: userId,
          program_day_id: newDay.id,
          exercise_id: s.exercise_id,
          pattern: s.pattern,
          target_sets: s.target_sets,
          rep_min: s.rep_min,
          rep_max: s.rep_max,
          target_rir: s.target_rir,
          rest_seconds: s.rest_seconds,
          position: s.position,
        })),
      );
    }
  }

  revalidatePath("/program");
  return newProg.id;
}
