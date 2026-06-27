// Loads a user's program (active or by id) as a nested structure that home, the session
// screen, and the builder all share. set_log / workout_session reference these ids, so the
// builder preserves ids across edits (see program/actions.ts) — block position is derived
// from the count of finished sessions of the active program, never stored.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Pattern } from "@/lib/strength/coefficients";

type Client = SupabaseClient<Database>;

export interface ProgramSlot {
  id: string;
  exerciseId: string;
  pattern: Pattern;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number | null;
  plateauPatience: number | null;
}

export interface ProgramDay {
  id: string;
  name: string;
  slots: ProgramSlot[];
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  isActive: boolean;
  style: "classic" | "fluid";
  days: ProgramDay[];
}

async function assemble(
  supabase: Client,
  row: {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    weeks: number | null;
    is_active: boolean;
    style: string;
  },
): Promise<Program> {
  const { data: days } = await supabase
    .from("program_day")
    .select("id, name, position")
    .eq("program_id", row.id)
    .order("position", { ascending: true });

  const dayIds = (days ?? []).map((d) => d.id);
  const { data: slots } = dayIds.length
    ? await supabase
        .from("program_slot")
        .select("id, program_day_id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, position")
        .in("program_day_id", dayIds)
        .order("position", { ascending: true })
    : { data: [] };

  const slotsByDay = new Map<string, ProgramSlot[]>();
  for (const s of slots ?? []) {
    const list = slotsByDay.get(s.program_day_id) ?? [];
    list.push({
      id: s.id,
      exerciseId: s.exercise_id,
      pattern: s.pattern as Pattern,
      targetSets: s.target_sets,
      repMin: s.rep_min,
      repMax: s.rep_max,
      targetRir: s.target_rir,
      restSeconds: s.rest_seconds,
      plateauPatience: s.plateau_patience,
    });
    slotsByDay.set(s.program_day_id, list);
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags ?? [],
    weeks: row.weeks ?? 5,
    isActive: row.is_active,
    style: (row.style as "classic" | "fluid") ?? "classic",
    days: (days ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      slots: slotsByDay.get(d.id) ?? [],
    })),
  };
}

export async function getActiveProgram(
  supabase: Client,
  userId: string,
): Promise<Program | null> {
  const { data: row } = await supabase
    .from("program")
    .select("id, name, description, tags, weeks, is_active, style")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!row) return null;
  return assemble(supabase, row);
}

export async function getProgram(
  supabase: Client,
  userId: string,
  id: string,
): Promise<Program | null> {
  const { data: row } = await supabase
    .from("program")
    .select("id, name, description, tags, weeks, is_active, style")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  return assemble(supabase, row);
}

// Every program for a user, fully assembled (days + slots), created-order. The gallery
// expands cards inline, so it needs the full tree up front; users have only a handful of
// programs, so assembling all is cheap.
export async function listProgramsFull(
  supabase: Client,
  userId: string,
): Promise<Program[]> {
  const { data: rows } = await supabase
    .from("program")
    .select("id, name, description, tags, weeks, is_active, style")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return Promise.all((rows ?? []).map((row) => assemble(supabase, row)));
}

// Exercise ids the user has logged, most-recent-first (for recent-first picker ordering).
export async function recentExerciseIds(
  supabase: Client,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("set_log")
    .select("exercise_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const seen: string[] = [];
  for (const r of data ?? []) {
    if (!seen.includes(r.exercise_id)) seen.push(r.exercise_id);
  }
  return seen;
}
