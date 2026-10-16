import { exactExerciseIdentity } from "@/lib/strength/identity";
import { cookies } from "next/headers";
import type { createClient } from "./supabase/server";
import type { Program } from "./program";
import { getCatalogMap } from "./catalog";
import { resolvePrescription } from "./periodization";
import { foldPrescription, type AdaptationRow } from "./strength/plateau";
import { readWorkoutPlan, workoutPlanKey, WORKOUT_PLAN_COOKIE } from "./workout-plan";
import { getCurrentBodyweight } from "./current-bodyweight";
import { loadWorkoutTargetHistory } from "./workout-target-data";
import { resolveExactWorkoutTarget } from "./effective-workout-target";
import { isDeload, stallContext } from "./stall-report";

export async function loadNextWorkout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  program: Program,
) {
  const [finished, open, catalog, profile, bodyweight, statRows] = await Promise.all([
    supabase.from("workout_session").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("program_id", program.id).not("finished_at", "is", null),
    supabase.from("workout_session").select("id, performed_at, program_day_id, week_index, exercise_swaps, is_deload").eq("user_id", userId)
      .eq("program_id", program.id).not("program_day_id", "is", null)
      .is("finished_at", null).order("performed_at", { ascending: false }).limit(1).maybeSingle(),
    getCatalogMap(supabase, userId),
    supabase.from("profile").select("default_rest_seconds").eq("id", userId).maybeSingle(),
    getCurrentBodyweight(supabase, userId),
    supabase.from("user_exercise_stat").select("exercise_id, current_e1rm, personal_coefficient, coeff_confidence_n").eq("user_id", userId),
  ]);
  if (finished.error) throw new Error(finished.error.message);
  if (open.error) throw new Error(open.error.message);
  if (profile.error) throw new Error(profile.error.message);
  if (statRows.error) throw new Error(statRows.error.message);
  const completed = finished.count ?? 0;
  const week = open.data ? open.data.week_index ?? 1 : Math.floor(completed / program.days.length) + 1;
  const day = program.days.find(day => day.id === open.data?.program_day_id) ?? program.days[completed % program.days.length];
  const key = workoutPlanKey(userId, program.id, day.id, completed);
  const swaps = open.data?.exercise_swaps;
  const stored = swaps && typeof swaps === "object" && !Array.isArray(swaps) ? swaps : {};
  const choices: Record<string, string> = open.data
    ? Object.fromEntries(day.slots.flatMap(slot => {
      const exerciseId = stored[slot.id];
      return typeof exerciseId === "string" ? [[slot.id, exerciseId]] : [];
    }))
    : readWorkoutPlan((await cookies()).get(WORKOUT_PLAN_COOKIE)?.value, key, day.slots, catalog);
  const [targetHistory, logged] = await Promise.all([
    loadWorkoutTargetHistory(supabase, userId, catalog, open.data ? new Date(open.data.performed_at) : new Date(), day.slots.map(slot => slot.id)),
    open.data ? supabase.from("set_log").select("program_slot_id, exercise_id, equipment_instance_id, set_index")
      .eq("user_id", userId).eq("session_id", open.data.id).order("set_index") : Promise.resolve({ data: [], error: null }),
  ]);
  if (logged.error) throw new Error(logged.error.message);
  const lastBySlot = new Map((logged.data ?? []).map(set => [set.program_slot_id, set]));
  const stats = (statRows.data ?? []).map(row => ({ exerciseId: row.exercise_id, currentE1rm: row.current_e1rm ?? 0,
    personalCoefficient: row.personal_coefficient, confidenceN: row.coeff_confidence_n }));
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
    const exerciseId = choices[slot.id] ?? lastBySlot.get(slot.id)?.exercise_id ?? baseExerciseId;
    const last = lastBySlot.get(slot.id);
    const equipmentInstanceId = last?.exercise_id === exerciseId ? last.equipment_instance_id : null;
    const prescription = resolvePrescription({ ...slot, repMin: folded.repMin, repMax: folded.repMax },
      week, program.style === "classic" ? program.phases : []);
    const context = stallContext({ ...slot, programId: program.id, programDayId: day.id },
      exerciseId, equipmentInstanceId, prescription, folded.phaseStartAt);
    const effectiveTarget = resolveExactWorkoutTarget({ slotId: slot.id, identity: exactExerciseIdentity(exerciseId, equipmentInstanceId),
      prescription, context, isDeload: open.data?.is_deload ?? isDeload(prescription.phase),
      history: targetHistory, catalog, stats, bodyweight });
    return { ...slot, baseExerciseId, exerciseId, prescription, targetContext: context, effectiveTarget,
      restSeconds: slot.restSeconds ?? profile.data?.default_rest_seconds ?? 120 };
  });
  return { key, choices, completed, week, day, slots, catalog, open: open.data, targetHistory, stats, bodyweight };
}
