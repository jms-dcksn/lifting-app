import { exactExerciseIdentity } from "@/lib/strength/identity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNextWorkout } from "@/lib/next-workout";
import { getActiveProgram } from "@/lib/program";
import { loadProgramWeekWorkouts, type ProgramWeekScope } from "@/lib/program-week-workouts";
import { effectiveTargetExplanation, resolveExactWorkoutTarget, type EffectiveWorkoutTarget, type WorkoutTargetHistory } from "@/lib/effective-workout-target";
import type { StallContext } from "@/lib/stall-report";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { ExerciseStat } from "@/lib/strength/recommend";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
export type WorkoutScope = "next_workout" | ProgramWeekScope;

async function nextWorkoutOnly(supabase: Client, userId: string) {
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

async function programWeek(supabase: Client, userId: string, scope: ProgramWeekScope) {
  const program = await getActiveProgram(supabase, userId);
  if (!program || program.days.length === 0) {
    return { source: "nextWorkout" as const, scope, boundary: "program_week" as const,
      status: "no_active_program" as const, week: null, workouts: [] };
  }
  const loaded = await loadProgramWeekWorkouts(supabase, userId, program, scope);
  const { catalog, workouts, ...metadata } = loaded;
  return { source: "nextWorkout" as const, ...metadata, workouts: workouts.map(workout => ({
    ...workout,
    slots: workout.slots.map(slot => ({
      ...describeSlotTarget(slot, catalog, slot.effectiveTarget),
      equipmentInstanceId: slot.targetContext.equipmentInstanceId,
      restSeconds: slot.restSeconds,
      supersetGroup: slot.supersetGroup ?? null,
      targetAvailability: workout.status === "completed" ? "completed" as const
        : workout.status === "unknown" ? "unknown_completion" as const
        : slot.effectiveTarget.target ? "available" as const : "unavailable" as const,
      ...(workout.status === "completed" ? { target: null, effectiveTarget: null,
        targetExplanation: "Completed workout: current program prescriptions are shown, not historical targets or logged results. Use Exercise review for performed sets." } : {}),
      ...(workout.status === "unknown" ? { target: null, effectiveTarget: null,
        targetExplanation: "Program position has passed this day, but no completed workout with matching saved week/day was found. Completion and historical targets are unknown." } : {}),
    })),
  })) };
}

export function nextWorkout(supabase: Client, userId: string, scope?: "next_workout"): ReturnType<typeof nextWorkoutOnly>;
export function nextWorkout(supabase: Client, userId: string, scope: ProgramWeekScope): ReturnType<typeof programWeek>;
export function nextWorkout(supabase: Client, userId: string, scope: WorkoutScope): ReturnType<typeof nextWorkoutOnly> | ReturnType<typeof programWeek>;
export function nextWorkout(supabase: Client, userId: string, scope: WorkoutScope = "next_workout") {
  return scope === "next_workout" ? nextWorkoutOnly(supabase, userId) : programWeek(supabase, userId, scope);
}

type TargetSlot = { id: string; exerciseId: string; targetSets: number;
    prescription: { repMin: number; repMax: number; targetRir: number; targetSets?: number; phase?: { name: string; description: string | null; setMultiplier: number | null; isDeload?: boolean } | null };
    plannedSets?: import("@/lib/workout-editor").PlannedSet[]; targetContext?: StallContext | null; effectiveTarget?: EffectiveWorkoutTarget };

function describeSlotTarget(slot: TargetSlot, catalog: Record<string, ExerciseDef>, effectiveTarget: EffectiveWorkoutTarget) {
  return {
    slotId: slot.id,
    exerciseId: slot.exerciseId,
    exerciseName: catalog[slot.exerciseId]?.name ?? slot.exerciseId,
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
    ...(slot.plannedSets ? { perSetTargets: slot.plannedSets.map(s => ({setId:s.id,repMin:s.repMin,repMax:s.repMax,rirMin:s.rirMin,rirMax:s.rirMax,weight:s.weight??s.suggestedWeight,targetReps:s.targetReps,source:s.weight!==null?"user":"suggested"})) } : {}),
  };
}

export function hydrateSlotTargets(input: {
  slots: TargetSlot[];
  catalog: Record<string, ExerciseDef>;
  stats: ExerciseStat[];
  bodyweight: number | null;
  targetHistory: WorkoutTargetHistory;
}) {
  return input.slots.map(slot => {
    const effectiveTarget = slot.effectiveTarget ?? resolveExactWorkoutTarget({ slotId: slot.id, identity: exactExerciseIdentity(slot.exerciseId, slot.targetContext?.equipmentInstanceId ?? null), prescription: slot.prescription,
      context: slot.targetContext ?? null, history: input.targetHistory, catalog: input.catalog, stats: input.stats, bodyweight: input.bodyweight });
    return describeSlotTarget(slot, input.catalog, effectiveTarget);
  });
}
