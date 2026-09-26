import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveProgram } from "@/lib/program";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function activeProgram(supabase: Client, userId: string) {
  const program = await getActiveProgram(supabase, userId);
  if (!program) {
    return { source: "activeProgram" as const, program: null };
  }
  return {
    source: "activeProgram" as const,
    program: {
      id: program.id,
      name: program.name,
      description: program.description,
      tags: program.tags,
      weeks: program.weeks,
      style: program.style,
      days: program.days.map((day) => ({
        id: day.id,
        name: day.name,
        slots: day.slots.map((slot) => ({
          id: slot.id,
          exerciseId: slot.exerciseId,
          pattern: slot.pattern,
          targetSets: slot.targetSets,
          repMin: slot.repMin,
          repMax: slot.repMax,
          targetRir: slot.targetRir,
        })),
      })),
    },
  };
}
