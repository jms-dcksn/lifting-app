import { cookies } from "next/headers";
import type { createClient } from "./supabase/server";
import type { Program } from "./program";
import { getCatalogMap } from "./catalog";
import { resolvePrescription } from "./periodization";
import { foldPrescription, type AdaptationRow } from "./strength/plateau";
import { readWorkoutPlan, workoutPlanKey, WORKOUT_PLAN_COOKIE } from "./workout-plan";

export async function loadNextWorkout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  program: Program,
) {
  const [finished, open, catalog, profile] = await Promise.all([
    supabase.from("workout_session").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("program_id", program.id).not("finished_at", "is", null),
    supabase.from("workout_session").select("id").eq("user_id", userId)
      .eq("program_id", program.id).not("program_day_id", "is", null)
      .is("finished_at", null).order("performed_at", { ascending: false }).limit(1).maybeSingle(),
    getCatalogMap(supabase, userId),
    supabase.from("profile").select("default_rest_seconds").eq("id", userId).maybeSingle(),
  ]);
  if (finished.error) throw new Error(finished.error.message);
  if (open.error) throw new Error(open.error.message);
  if (profile.error) throw new Error(profile.error.message);
  const completed = finished.count ?? 0;
  const week = Math.floor(completed / program.days.length) + 1;
  const day = program.days[completed % program.days.length];
  const key = workoutPlanKey(userId, program.id, day.id, completed);
  const choices = readWorkoutPlan((await cookies()).get(WORKOUT_PLAN_COOKIE)?.value, key, day.slots, catalog);
  const adaptations = program.style === "fluid" && day.slots.length
    ? await supabase.from("movement_adaptation")
      .select("program_slot_id, action, new_exercise_id, new_rep_min, new_rep_max, created_at")
      .eq("user_id", userId).in("program_slot_id", day.slots.map((s) => s.id))
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (adaptations.error) throw new Error(adaptations.error.message);
  const slots = day.slots.map((slot) => {
    const rows: AdaptationRow[] = (adaptations.data ?? []).filter((r) => r.program_slot_id === slot.id)
      .map((r) => ({ action: r.action as AdaptationRow["action"], newExerciseId: r.new_exercise_id,
        newRepMin: r.new_rep_min, newRepMax: r.new_rep_max, createdAt: r.created_at }));
    const folded = foldPrescription(slot, rows);
    const baseExerciseId = folded.exerciseId;
    return { ...slot, baseExerciseId, exerciseId: choices[slot.id] ?? baseExerciseId,
      prescription: resolvePrescription({ ...slot, repMin: folded.repMin, repMax: folded.repMax },
        week, program.style === "classic" ? program.phases : []),
      restSeconds: slot.restSeconds ?? profile.data?.default_rest_seconds ?? 120 };
  });
  return { key, choices, completed, week, day, slots, catalog, open: open.data };
}
