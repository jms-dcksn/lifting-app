import { exactExerciseIdentity } from "@/lib/strength/identity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNextWorkout } from "@/lib/next-workout";
import { getActiveProgram } from "@/lib/program";
import { effectiveTargetExplanation, resolveExactWorkoutTarget, type WorkoutTargetHistory } from "@/lib/effective-workout-target";
import type { StallContext } from "@/lib/stall-report";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { ExerciseStat } from "@/lib/strength/recommend";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function nextWorkout(supabase: Client, userId: string) {
  const program = await getActiveProgram(supabase, userId);
  if (!program || program.days.length === 0) {
    return { source: "nextWorkout" as const, workout: null };
  }
  const next = await loadNextWorkout(supabase, userId, program);
  return {
    source: "nextWorkout" as const,
    workout: {
      programName: program.name,
      dayName: next.day.name,
      week: next.week,
      completedSessions: next.completed,
      openSessionId: next.open?.id ?? null,
      slots: hydrateSlotTargets({ slots: next.slots, catalog: next.catalog, stats: next.stats,
        bodyweight: next.bodyweight, targetHistory: next.targetHistory }),
    },
  };
}

export function hydrateSlotTargets(input: {
  slots: Array<{ id: string; exerciseId: string; targetSets: number;
    prescription: { repMin: number; repMax: number; targetRir: number; targetSets?: number; phase?: { name: string; description: string | null; setMultiplier: number | null; isDeload?: boolean } | null };
    targetContext?: StallContext | null; effectiveTarget?: import("@/lib/effective-workout-target").EffectiveWorkoutTarget }>;
  catalog: Record<string, ExerciseDef>;
  stats: ExerciseStat[];
  bodyweight: number | null;
  targetHistory: WorkoutTargetHistory;
}) {
  return input.slots.map(slot => {
    const effectiveTarget = slot.effectiveTarget ?? resolveExactWorkoutTarget({ slotId: slot.id, identity: exactExerciseIdentity(slot.exerciseId, slot.targetContext?.equipmentInstanceId ?? null), prescription: slot.prescription,
      context: slot.targetContext ?? null, history: input.targetHistory, catalog: input.catalog, stats: input.stats, bodyweight: input.bodyweight });
    return {
        slotId: slot.id,
        exerciseId: slot.exerciseId,
        exerciseName: input.catalog[slot.exerciseId]?.name ?? slot.exerciseId,
        targetSets: slot.prescription.targetSets ?? slot.targetSets,
        prescription: slot.prescription,
        target: effectiveTarget.target ? {
          weight: effectiveTarget.target.weight,
          targetReps: effectiveTarget.target.targetReps,
          targetRir: effectiveTarget.target.targetRir,
          source: effectiveTarget.target.source,
          confidence: effectiveTarget.target.confidence ?? null,
        } : null,
        effectiveTarget,
        targetExplanation: effectiveTargetExplanation(effectiveTarget),
        targetEngine: "resolveEffectiveWorkoutTarget",
      };
  });
}
