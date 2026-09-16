"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeTags } from "@/lib/program-tags";
import { TEMPLATE_BY_ID } from "@/lib/program-templates";
import { programDetailHref } from "@/lib/program-routes";
import { validateProgramPhases } from "@/lib/periodization";

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
  plateauPatience: number | null;
}

export interface SaveDayInput {
  id: string;
  name: string;
  slots: SaveSlotInput[];
}

export interface SavePhaseInput {
  id: string;
  name: string;
  description: string | null;
  weekStart: number;
  weekEnd: number;
  targetRirMin: number | null;
  targetRirMax: number | null;
  setMultiplier: number | null;
}

export interface SaveProgramInput {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  style: "classic" | "fluid";
  phases: SavePhaseInput[];
  days: SaveDayInput[];
}

// Full save of one program from the builder. Preserves day/slot ids (the client generates
// uuids for new rows) so set_log.program_slot_id linkage survives edits, and re-derives
// positions from array order. Saving always makes this the single active program.
export async function saveProgram(input: SaveProgramInput) {
  const { supabase } = await requireUser();

  // Input validation remains in Server Action before calling RPC.
  if (input.days.length === 0) throw new Error("A program needs at least one day");

  const name = input.name.trim() || "My Program";
  const description = input.description?.trim() || null;
  const tags = normalizeTags(input.tags);
  const weeks = Math.min(12, Math.max(4, Math.round(input.weeks)));
  const phaseInputs = input.style === "classic" ? input.phases : [];
  const phaseErrors = validateProgramPhases(
    phaseInputs.map((phase, position) => ({ ...phase, position })),
    weeks,
  );
  if (phaseErrors.length) throw new Error(phaseErrors[0]);

  // Assemble JSONB tree for RPC.
  const tree = {
    id: input.id,
    name,
    description,
    tags,
    weeks,
    style: input.style,
    isActive: true,
    phases: phaseInputs.map((phase) => ({
      id: phase.id,
      name: phase.name.trim() || "",
      description: phase.description?.trim() || null,
      weekStart: Math.round(phase.weekStart),
      weekEnd: Math.round(phase.weekEnd),
      targetRirMin: phase.targetRirMin,
      targetRirMax: phase.targetRirMax,
      setMultiplier: phase.setMultiplier,
    })),
    days: input.days.map((d) => ({
      id: d.id,
      name: d.name.trim() || "",
      slots: d.slots.map((s) => ({
        id: s.id,
        exerciseId: s.exerciseId,
        pattern: s.pattern,
        targetSets: s.targetSets,
        repMin: s.repMin,
        repMax: s.repMax,
        targetRir: s.targetRir,
        restSeconds: s.restSeconds,
        plateauPatience: s.plateauPatience,
      })),
    })),
  };

  // Atomic save via RPC.
  const { error } = await supabase.rpc("save_program", { p_tree: tree });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/program");
  revalidatePath(programDetailHref(input.id));
}

// Create a program from a built-in template. On an empty account (first-run offer) the
// new program becomes active; otherwise it lands as an inactive draft so adding a template
// from the gallery never silently deactivates the program the user is running.
export async function createFromTemplate(templateId: string) {
  const template = TEMPLATE_BY_ID[templateId];
  if (!template) throw new Error("Unknown template");
  const { supabase } = await requireUser();

  // Check if this is the user's first program (activates by default).
  const { count } = await supabase
    .from("program")
    .select("id", { count: "exact", head: true });
  const activate = (count ?? 0) === 0;

  // Generate UUIDs for the template tree.
  const programId = crypto.randomUUID();

  // Assemble JSONB tree for RPC.
  const tree = {
    id: programId,
    name: template.name,
    description: template.description,
    tags: template.tags,
    weeks: template.weeks,
    style: "classic",
    isActive: activate,
    phases: (template.phases ?? []).map((phase) => ({
      id: crypto.randomUUID(),
      name: phase.name,
      description: phase.description,
      weekStart: phase.weekStart,
      weekEnd: phase.weekEnd,
      targetRirMin: phase.targetRirMin,
      targetRirMax: phase.targetRirMax,
      setMultiplier: phase.setMultiplier,
    })),
    days: template.days.map((day) => ({
      id: crypto.randomUUID(),
      name: day.name,
      slots: day.slots.map((s) => ({
        id: crypto.randomUUID(),
        exerciseId: s.exerciseId,
        pattern: s.pattern,
        targetSets: s.targetSets,
        repMin: s.repMin,
        repMax: s.repMax,
        targetRir: s.targetRir,
        restSeconds: s.restSeconds,
        plateauPatience: null,
      })),
    })),
  };

  // Atomic save via RPC.
  const { error } = await supabase.rpc("save_program", { p_tree: tree });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/program");
  redirect("/program");
}

export async function setActiveProgram(id: string) {
  const { supabase } = await requireUser();
  
  // Atomic activation via RPC.
  const { error } = await supabase.rpc("set_active_program", { p_program_id: id });
  if (error) throw new Error(error.message);
  
  revalidatePath("/");
  revalidatePath("/program");
  revalidatePath(programDetailHref(id));
}

// Duplicate a program (new ids) as an inactive draft; returns the new program id.
export async function cloneProgram(id: string): Promise<string> {
  const { supabase, userId } = await requireUser();

  // Load source program structure.
  const { data: src } = await supabase
    .from("program")
    .select("name, description, tags, weeks, style")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (!src) throw new Error("Program not found");

  const { data: phases } = await supabase
    .from("program_phase")
    .select("name, description, week_start, week_end, target_rir_min, target_rir_max, set_multiplier")
    .eq("program_id", id)
    .order("position", { ascending: true });

  const { data: days } = await supabase
    .from("program_day")
    .select("id, name")
    .eq("program_id", id)
    .order("position", { ascending: true });

  // Load slots for all days.
  const dayIds = days?.map((d) => d.id) ?? [];
  const { data: slots } = dayIds.length
    ? await supabase
        .from("program_slot")
        .select("program_day_id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, position")
        .in("program_day_id", dayIds)
        .order("program_day_id", { ascending: true })
        .order("position", { ascending: true })
    : { data: [] };

  // Generate new UUIDs for the clone.
  const newProgramId = crypto.randomUUID();
  const dayIdMap = new Map(days?.map((d) => [d.id, crypto.randomUUID()]) ?? []);

  // Assemble JSONB tree for RPC.
  const tree = {
    id: newProgramId,
    name: `${src.name} (copy)`,
    description: src.description,
    tags: src.tags,
    weeks: src.weeks,
    style: src.style,
    isActive: false,
    phases: (phases ?? []).map((phase) => ({
      id: crypto.randomUUID(),
      name: phase.name,
      description: phase.description,
      weekStart: phase.week_start,
      weekEnd: phase.week_end,
      targetRirMin: phase.target_rir_min,
      targetRirMax: phase.target_rir_max,
      setMultiplier: phase.set_multiplier,
    })),
    days: (days ?? []).map((day) => ({
      id: dayIdMap.get(day.id)!,
      name: day.name,
      slots: (slots ?? [])
        .filter((s) => s.program_day_id === day.id)
        .map((s) => ({
          id: crypto.randomUUID(),
          exerciseId: s.exercise_id,
          pattern: s.pattern,
          targetSets: s.target_sets,
          repMin: s.rep_min,
          repMax: s.rep_max,
          targetRir: s.target_rir,
          restSeconds: s.rest_seconds,
          plateauPatience: s.plateau_patience,
        })),
    })),
  };

  // Atomic save via RPC.
  const { error } = await supabase.rpc("save_program", { p_tree: tree });
  if (error) throw new Error(error.message);

  revalidatePath("/program");
  return newProgramId;
}
