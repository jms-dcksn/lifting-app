import { exactExerciseIdentity } from "./strength/identity";
import { resolveExactWorkoutTarget, type TargetPerformance, type WorkoutTargetHistory } from "./effective-workout-target";
import type { ExerciseDef } from "./strength/coefficients";
import type { ExerciseStat } from "./strength/recommend";
import type { StallContext } from "./stall-report";
import type { PlannedSet, PlannedSlot, WorkoutEditorPlan } from "./workout-editor";

export type PlannedPerformance = TargetPerformance & { plannedSetId: string; repMin: number; repMax: number; rirMin: number; rirMax: number; phaseId?: string | null };
export function plannedSetTarget(input: {
  slotId: string; exerciseId: string; equipmentInstanceId?: string | null; set: PlannedSet; history: PlannedPerformance[];
  catalog: Record<string, ExerciseDef>; stats: ExerciseStat[]; bodyweight: number | null; isDeload: boolean; context?:StallContext|null;
}): PlannedSet {
  const { set } = input;
  const performances = input.history.filter(p => p.plannedSetId === set.id && p.exerciseId === input.exerciseId
    && p.equipmentInstanceId === (input.equipmentInstanceId??null) && p.repMin === set.repMin && p.repMax === set.repMax
    && p.rirMin === set.rirMin && p.rirMax === set.rirMax && (!set.seedAt || p.performedAt > set.seedAt)
    && (!set.contextAt || p.performedAt > set.contextAt));
  const context = input.context ? {...input.context,repMin:set.repMin,repMax:set.repMax,
    targetRirMin:set.rirMin,targetRirMax:set.rirMax,targetSets:1} : null;
  const exposures=performances.filter(p=>!context || p.phaseId===context.phaseId)
    .sort((a,b)=>a.performedAt.localeCompare(b.performedAt)).slice(-2);
  const history: WorkoutTargetHistory = { progressionByExercise: { [input.exerciseId]: performances }, effortBySlot: context && exposures.length===2 ? {[input.slotId]:{context,exposures}} : {} };
  const target = resolveExactWorkoutTarget({ slotId: input.slotId, identity: exactExerciseIdentity(input.exerciseId, input.equipmentInstanceId??null),
    prescription: { repMin: set.repMin, repMax: set.repMax, targetRir: set.rirMax }, context,
    history, catalog: input.catalog, stats: input.stats, bodyweight: input.bodyweight, isDeload: input.isDeload }).target;
  return { ...set, weight: performances.length || input.isDeload ? null : set.weight,
    suggestedWeight: target?.weight ?? null, targetReps: target?.targetReps ?? set.repMin };
}


export function plannedSetSessionTarget(row: PlannedSet): import("./strength/progression").SessionTarget | null {
  const weight = row.weight ?? row.suggestedWeight;
  return weight === null ? null : { weight, targetReps: row.targetReps, targetRir: row.rirMax, source: "progression" };
}

export function plannedCardTarget(base: import("./effective-workout-target").EffectiveWorkoutTarget, row: PlannedSet) {
  const weight=row.weight??row.suggestedWeight;
  return { ...base, reason: row.weight!==null ? "manual_target" as const : base.reason,
    target:weight===null?null:{...base.target,weight,targetReps:row.targetReps,targetRir:row.rirMax,source:base.target?.source??"recommendation" as const} };
}

// Reuse freshly resolved source rows, never the cached suggestions in a saved draft.
// Changed contexts use per-set evidence, keeping heavy/back-off rows independent.
export function refreshWorkoutPlanTargets(plan: WorkoutEditorPlan, input: {
  sources: PlannedSlot[]; history: PlannedPerformance[]; catalog: Record<string, ExerciseDef>;
  stats: ExerciseStat[]; bodyweight: number | null; isDeload: boolean; normalWeek?: boolean;
}): WorkoutEditorPlan {
  return { ...plan, slots: plan.slots.map(slot => {
    const source = input.sources.find(s => s.id === slot.id && s.exerciseId === slot.exerciseId
      && (s.equipmentInstanceId ?? null) === (slot.equipmentInstanceId ?? null));
    const resolve = (row: PlannedSet, normal: boolean): PlannedSet => {
      const original = (normal ? source?.normalSets ?? source?.sets : source?.sets)?.find(s => s.id === row.id
        && s.repMin === row.repMin && s.repMax === row.repMax && s.rirMin === row.rirMin && s.rirMax === row.rirMax
        && (s.contextAt ?? null) === (row.contextAt ?? null) && s.seedAt === row.seedAt);
      const resolved = original ?? plannedSetTarget({ slotId: slot.id, exerciseId: slot.exerciseId,
        equipmentInstanceId: slot.equipmentInstanceId, set: row, history: input.history,
        catalog: input.catalog, stats: input.stats, bodyweight: input.bodyweight, isDeload: !normal && input.isDeload });
      return { ...row, suggestedWeight: resolved.suggestedWeight,
        targetReps: row.weight !== null ? row.targetReps : resolved.targetReps };
    };
    return { ...slot, sets: slot.sets.map(row => resolve(row, !!input.normalWeek)),
      normalSets: slot.normalSets?.map(row => resolve(row, true)) };
  }) };
}
