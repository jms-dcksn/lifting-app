import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ProgramTemplate } from "@/lib/program-templates";
import type { AssembledProgram } from "@/lib/agent/program-intake/assembler";

export type ProgramTree = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  style: "classic" | "fluid";
  isActive: boolean;
  phases: Array<{
    id: string;
    name: string;
    description: string | null;
    weekStart: number;
    weekEnd: number;
    targetRirMin: number | null;
    targetRirMax: number | null;
    setMultiplier: number | null;
  }>;
  days: Array<{
    id: string;
    name: string;
    slots: Array<{
      id: string;
      exerciseId: string;
      pattern: string;
      targetSets: number;
      repMin: number;
      repMax: number;
      targetRir: number;
      restSeconds: number | null;
      plateauPatience: number | null;
    }>;
  }>;
};

export function buildProgramTreeFromTemplate(
  template: ProgramTemplate,
  options: {
    programId: string;
    style?: "classic" | "fluid";
    isActive: boolean;
    name?: string;
  },
): ProgramTree {
  const style = options.style ?? "classic";
  const phaseInputs = style === "classic" ? (template.phases ?? []) : [];

  return {
    id: options.programId,
    name: options.name ?? template.name,
    description: template.description,
    tags: template.tags,
    weeks: template.weeks,
    style,
    isActive: options.isActive,
    phases: phaseInputs.map((phase) => ({
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
      slots: day.slots.map((slot) => ({
        id: crypto.randomUUID(),
        exerciseId: slot.exerciseId,
        pattern: slot.pattern,
        targetSets: slot.targetSets,
        repMin: slot.repMin,
        repMax: slot.repMax,
        targetRir: slot.targetRir,
        restSeconds: slot.restSeconds,
        plateauPatience: null,
      })),
    })),
  };
}

export function buildProgramTreeFromDraft(
  draft: AssembledProgram,
  options: { programId: string; isActive: boolean },
): ProgramTree {
  const phaseInputs = draft.style === "classic" ? (draft.phases ?? []) : [];
  return {
    id: options.programId,
    name: draft.name,
    description: draft.description,
    tags: draft.tags,
    weeks: draft.weeks,
    style: draft.style,
    isActive: options.isActive,
    phases: phaseInputs.map((phase) => ({
      id: crypto.randomUUID(),
      name: phase.name,
      description: phase.description ?? null,
      weekStart: phase.weekStart,
      weekEnd: phase.weekEnd,
      targetRirMin: phase.targetRirMin,
      targetRirMax: phase.targetRirMax,
      setMultiplier: phase.setMultiplier,
    })),
    days: draft.days.map((day) => ({
      id: crypto.randomUUID(),
      name: day.name,
      slots: day.slots.map((slot) => ({
        id: crypto.randomUUID(),
        exerciseId: slot.exerciseId,
        pattern: slot.pattern,
        targetSets: slot.targetSets,
        repMin: slot.repMin,
        repMax: slot.repMax,
        targetRir: slot.targetRir,
        restSeconds: slot.restSeconds,
        plateauPatience: null,
      })),
    })),
  };
}

export async function shouldActivateFirstProgram(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { count } = await supabase
    .from("program")
    .select("id", { count: "exact", head: true });
  return (count ?? 0) === 0;
}

export async function persistProgramTree(
  supabase: SupabaseClient<Database>,
  tree: ProgramTree,
): Promise<void> {
  const { error } = await supabase.rpc("save_program", { p_tree: tree });
  if (error) throw new Error(error.message);
}
