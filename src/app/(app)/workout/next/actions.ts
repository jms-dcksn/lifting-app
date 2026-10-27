"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { loadNextWorkout } from "@/lib/next-workout";
import { WORKOUT_PLAN_COOKIE } from "@/lib/workout-plan";
import { isLoggableExercise } from "@/lib/station";
import { swapProgramSlotExercise } from "../../session/actions";

const PLAN_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

async function requireNextWorkout(key: string, slotId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Please sign in again.");
  const program = await getActiveProgram(supabase, userId);
  if (!program?.days.length) throw new Error("No active program. Return home to choose a program.");
  const next = await loadNextWorkout(supabase, userId, program);
  if (next.open || next.key !== key) throw new Error("Your next workout changed. Return home and reopen it.");
  if (!next.day.slots.some((slot) => slot.id === slotId)) throw new Error("Exercise slot no longer exists.");
  return { next };
}

function writePlanCookie(key: string, choices: Record<string, string>) {
  const value = JSON.stringify({ key, choices });
  if (encodeURIComponent(value).length > 3800) {
    throw new Error("Too many planned changes. Start the workout to make more changes.");
  }
  return value;
}

export async function saveWorkoutChoice(
  key: string,
  slotId: string,
  exerciseId: string | null,
  scope: "workout" | "program" = "workout",
) {
  const { next } = await requireNextWorkout(key, slotId);
  if (exerciseId !== null && !isLoggableExercise(next.catalog[exerciseId])) {
    throw new Error("Choose a specific exercise or machine first.");
  }
  if (scope !== "workout" && scope !== "program") throw new Error("Invalid swap scope");

  if (exerciseId !== null && scope === "program") {
    await swapProgramSlotExercise({ programSlotId: slotId, exerciseId });
    const choices = { ...next.choices };
    delete choices[slotId];
    (await cookies()).set(WORKOUT_PLAN_COOKIE, writePlanCookie(key, choices), PLAN_COOKIE);
    revalidatePath("/");
    revalidatePath("/workout/next");
    return;
  }

  const choices = { ...next.choices };
  if (exerciseId === null) delete choices[slotId];
  else choices[slotId] = exerciseId;
  (await cookies()).set(WORKOUT_PLAN_COOKIE, writePlanCookie(key, choices), PLAN_COOKIE);
  revalidatePath("/");
  revalidatePath("/workout/next");
}

export async function saveWorkoutDraft(input: {
  key: string; programId: string; dayId: string; completed: number; sourceRevision: number;
  revision: number; scope: "workout" | "program"; plan: import("@/lib/workout-editor").WorkoutEditorPlan; requestId: string;
}) {
  const { workoutEditorSchema, validateEditorPlan } = await import("@/lib/workout-editor");
  const { draftStation } = await import("@/lib/workout-editor-station");
  const { getCatalogMap } = await import("@/lib/catalog");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Please sign in again.");
  let plan = workoutEditorSchema.parse(input.plan);
  if(plan.variants) plan={...plan,variants:plan.variants.filter(v=>plan.slots.some(s=>s.exerciseId===v.id))};
  const catalog = { ...await getCatalogMap(supabase, userId) };
  for (const v of plan.variants ?? []) catalog[v.id] = draftStation(v, v.id);
  const issues = validateEditorPlan(plan, catalog);
  if (issues.length) return { issues };
  if (input.scope === "program") {
    const { resolvePrescription } = await import("@/lib/periodization");
    const { recoverySets } = await import("@/lib/workout-editor");
    const { plannedSetTarget } = await import("@/lib/workout-editor-targets");
    const { isDeload } = await import("@/lib/stall-report");
    const program = await getActiveProgram(supabase, userId);
    if (!program || program.id !== input.programId) throw new Error("Active program changed. Reopen the planner.");
    const next=await loadNextWorkout(supabase,userId,program);
    plan = { ...plan, slots:plan.slots.map(slot => {
      let normal = slot.sets;
      const base = program.days.find(d=>d.id===input.dayId)?.slots.find(s=>s.id===slot.programSlotId);
      const p = resolvePrescription(base ?? {targetSets:normal.length,repMin:normal[0].repMin,repMax:normal[0].repMax,targetRir:normal[0].rirMax},
        next.week,program.style==="classic" ? program.phases : []);
      if(p.phase?.setMultiplier!=null && p.phase.setMultiplier!==1) normal=slot.normalSets??slot.sets;
      const prior=next.editorPlan.slots.find(s=>s.id===slot.id);
      const sets=recoverySets(normal,p).map(row=>{
        const oldNormal=(prior?.normalSets??prior?.sets)?.find(r=>r.id===row.id);
        const oldEffective=prior?.sets.find(r=>r.id===row.id);
        const inherited=oldNormal && oldNormal.seedAt===row.seedAt && oldNormal.weight===row.weight;
        const resolved=plannedSetTarget({slotId:slot.id,exerciseId:slot.exerciseId,equipmentInstanceId:slot.equipmentInstanceId,
          set:{...row,weight:null},history:next.plannedHistory,catalog,stats:next.stats,bodyweight:next.bodyweight,isDeload:isDeload(p.phase)});
        return {...resolved,weight:inherited?oldEffective?.weight??null:row.weight};
      });
      return {...slot,normalSets:normal,sets};
    }) };
  }
  if (input.key !== [userId, input.programId, input.dayId, input.completed].join(":")) throw new Error("Workout changed. Reopen it from Home.");
  const { data: result, error } = await supabase.rpc("save_workout_plan", {
    p_program: input.programId, p_day: input.dayId, p_completed: input.completed,
    p_source: input.sourceRevision, p_revision: input.revision, p_scope: input.scope,
    p_plan: plan as unknown as import("@/lib/supabase/types").Json, p_request: input.requestId,
  });
  if (error) throw new Error(error.message);
  (await cookies()).delete(WORKOUT_PLAN_COOKIE);
  revalidatePath("/");
  revalidatePath("/workout/next");
  revalidatePath("/program");
  return { issues: [], result };
}
