import { resolveTempo } from "./tempo";
import { editorSlot, parseStoredPlan, recoverySets, type PlannedSet } from "./workout-editor";
import { plannedCardTarget, plannedSetTarget, type PlannedPerformance } from "./workout-editor-targets";
import { loadPlannedPerformances } from "./workout-editor-data";
import { exactExerciseIdentity } from "@/lib/strength/identity";
import { cookies } from "next/headers";
import type { createClient } from "./supabase/server";
import type { Program, ProgramDay } from "./program";
import { getCatalogMap } from "./catalog";
import { resolvePrescription } from "./periodization";
import { foldPrescription, type AdaptationRow } from "./strength/plateau";
import { readWorkoutPlan, workoutPlanKey, WORKOUT_PLAN_COOKIE } from "./workout-plan";
import { getCurrentBodyweight } from "./current-bodyweight";
import { loadWorkoutTargetHistory } from "./workout-target-data";
import { resolveExactWorkoutTarget, type WorkoutTargetHistory } from "./effective-workout-target";
import { isDeload, stallContext } from "./stall-report";
import type { ExerciseDef } from "./strength/coefficients";
import type { ExerciseStat } from "./strength/recommend";

type Adaptation = { program_slot_id: string; action: string; new_exercise_id: string | null;
  new_rep_min: number | null; new_rep_max: number | null; created_at: string };
type LoggedIdentity = { program_slot_id: string | null; exercise_id: string; equipment_instance_id: string | null };

/** Shared prescription/identity/target composition for the planner and program-week reads. */
export function resolveWorkoutSlots(input: {
  program: Program; day: ProgramDay; week: number; choices: Record<string, string>;
  logged: LoggedIdentity[]; adaptations: Adaptation[]; targetHistory: WorkoutTargetHistory;
  catalog: Record<string, ExerciseDef>; stats: ExerciseStat[]; bodyweight: number | null;
  defaultRestSeconds: number; sessionIsDeload?: boolean; plannedHistory?: PlannedPerformance[];
}) {
  const { program, day, week, choices, targetHistory, catalog, stats, bodyweight } = input;
  const lastBySlot = new Map(input.logged.map(set => [set.program_slot_id, set]));
  return day.slots.map((slot) => {
    const rows: AdaptationRow[] = input.adaptations.filter((r) => r.program_slot_id === slot.id)
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
    let effectiveTarget = resolveExactWorkoutTarget({ slotId: slot.id, identity: exactExerciseIdentity(exerciseId, equipmentInstanceId),
      prescription, context, isDeload: input.sessionIsDeload ?? isDeload(prescription.phase),
      history: targetHistory, catalog, stats, bodyweight });
    let plannedSets: PlannedSet[] | undefined;
    let normalSets: PlannedSet[] | undefined;
    if (slot.setPrescriptions) {
      const normalPrescription=isDeload(prescription.phase)
        ? resolvePrescription({...slot,repMin:folded.repMin,repMax:folded.repMax},week,[]) : {...prescription,phase:null};
      normalSets=recoverySets(slot.setPrescriptions,{...normalPrescription,phase:null}).map(set=>plannedSetTarget({
        slotId:slot.id,exerciseId,equipmentInstanceId,set,history:input.plannedHistory??[],
        context:{...context,phaseId:null},catalog,stats,bodyweight,isDeload:false}));
      const rows = recoverySets(slot.setPrescriptions, prescription);
      plannedSets = rows.map(set => plannedSetTarget({ slotId: slot.id, exerciseId, equipmentInstanceId, set,
        history: input.plannedHistory ?? [], context, catalog, stats, bodyweight, isDeload: input.sessionIsDeload ?? isDeload(prescription.phase) }));
      prescription.targetSets = plannedSets.length;
      if(plannedSets[0]) effectiveTarget=plannedCardTarget(effectiveTarget,plannedSets[0]);
    }
    return { ...slot, resolvedTempo: resolveTempo(catalog[exerciseId], slot.tempo), baseExerciseId, exerciseId, prescription, targetContext: context, effectiveTarget,
      plannedSets, normalSets,
      restSeconds: slot.restSeconds ?? input.defaultRestSeconds };
  });
}

export async function loadNextWorkout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  program: Program,
) {
  const revisionRead = await supabase.from("coach_refresh_state").select("source_revision").eq("user_id", userId).maybeSingle();
  if (revisionRead.error) throw new Error(revisionRead.error.message);
  const sourceRevision = revisionRead.data?.source_revision ?? 0;
  const [finished, open, catalog, profile, bodyweight, statRows] = await Promise.all([
    supabase.from("workout_session").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("program_id", program.id).not("finished_at", "is", null),
    supabase.from("workout_session").select("id, performed_at, program_day_id, week_index, exercise_swaps, is_deload, plan_snapshot").eq("user_id", userId)
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
    ? Object.fromEntries(Object.entries(stored).flatMap(([slotId,exerciseId])=>typeof exerciseId==="string"?[[slotId,exerciseId]]:[]))
    : readWorkoutPlan((await cookies()).get(WORKOUT_PLAN_COOKIE)?.value, key, day.slots, catalog);
  const [targetHistory, logged] = await Promise.all([
    loadWorkoutTargetHistory(supabase, userId, catalog, open.data ? new Date(open.data.performed_at) : new Date(), day.slots.map(slot => slot.id)),
    open.data ? supabase.from("set_log").select("program_slot_id, exercise_id, equipment_instance_id, set_index")
      .eq("user_id", userId).eq("session_id", open.data.id).order("set_index") : Promise.resolve({ data: [], error: null }),
  ]);
  if (logged.error) throw new Error(logged.error.message);
  const stats = (statRows.data ?? []).map(row => ({ exerciseId: row.exercise_id, currentE1rm: row.current_e1rm ?? 0,
    personalCoefficient: row.personal_coefficient, confidenceN: row.coeff_confidence_n }));
  const adaptations = program.style === "fluid" && day.slots.length
    ? await supabase.from("movement_adaptation")
      .select("program_slot_id, action, new_exercise_id, new_rep_min, new_rep_max, created_at")
      .eq("user_id", userId).in("program_slot_id", day.slots.map((s) => s.id))
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (adaptations.error) throw new Error(adaptations.error.message);
  const defaultRestSeconds = profile.data?.default_rest_seconds ?? 120;
  const plannedHistory = await loadPlannedPerformances(supabase, userId, open.data ? new Date(open.data.performed_at) : new Date());
  let slots = resolveWorkoutSlots({ program, day, week, choices, logged: logged.data ?? [],
    adaptations: adaptations.data ?? [], targetHistory, catalog, stats, bodyweight,
    defaultRestSeconds, sessionIsDeload: open.data?.is_deload, plannedHistory });
  const saved = open.data ? null : await supabase.from("workout_plan").select("plan,revision,updated_at")
    .eq("user_id", userId).eq("program_id", program.id).eq("program_day_id", day.id).eq("completed_count", completed).maybeSingle();
  if (saved?.error) throw new Error(saved.error.message);
  const storedPlan = open.data?.plan_snapshot ?? saved?.data?.plan;
  const parsedPlan=storedPlan ? parseStoredPlan(storedPlan) : null;
  const editorPlan = parsedPlan ? open.data ? {...parsedPlan,slots:parsedPlan.slots.map(slot=>{
    const selected=choices[slot.id]??slot.exerciseId;
    if(selected===slot.exerciseId) return slot;
    return {...slot,exerciseId:selected,equipmentInstanceId:null,sets:slot.sets.map(row=>{
      const target=resolveExactWorkoutTarget({slotId:slot.id,identity:exactExerciseIdentity(selected,null),
        prescription:{repMin:row.repMin,repMax:row.repMax,targetRir:row.rirMax},context:null,
        history:targetHistory,catalog,stats,bodyweight,isDeload:open.data?.is_deload}).target;
      return {...row,weight:null,seedAt:null,suggestedWeight:target?.weight??null,targetReps:target?.targetReps??row.repMin};
    })};
  })} : {...parsedPlan,slots:parsedPlan.slots.map(s=>({...s,
    programSlotId:s.programSlotId && day.slots.some(b=>b.id===s.programSlotId)?s.programSlotId:null}))}
    : { version: 1 as const, dayName:day.name,phase:slots[0]?.prescription.phase??null, slots: slots.map(editorSlot) };
  if (storedPlan) slots = editorPlan.slots.map(s => {
    const base = slots.find(b => b.id === s.id);
    const first = s.sets[0];
    return { ...base, ...s, resolvedTempo: s.resolvedTempo ?? resolveTempo(catalog[s.exerciseId], s.tempo), baseExerciseId: base?.baseExerciseId ?? s.exerciseId,
      pattern: s.pattern as import("./strength/coefficients").Pattern,
      targetSets: s.sets.length, repMin: first.repMin, repMax: first.repMax, targetRir: first.rirMax,
      plateauPatience: base?.plateauPatience ?? null,
      prescription: { targetSets: s.sets.length, repMin: first.repMin, repMax: first.repMax,
        targetRir: first.rirMax, targetRirMin: first.rirMin, targetRirMax: first.rirMax, phase: base?.prescription.phase ?? null },
      effectiveTarget: plannedCardTarget(base?.effectiveTarget ?? { status: "current_target" as const, target: null,
        reason: "unavailable" as const, reference: { lastSameSlot: null, bestRecent: null, selected: null }, evidence: [] }, first),
      targetContext: base?.targetContext ?? stallContext({ id: s.programSlotId ?? s.id, programId: program.id,
        programDayId: day.id, exerciseId: s.exerciseId, targetSets: s.sets.length,
        repMin: first.repMin, repMax: first.repMax, targetRir: first.rirMax }, s.exerciseId, null,
        { targetSets: s.sets.length, repMin: first.repMin, repMax: first.repMax, targetRir: first.rirMax,
          targetRirMin: first.rirMin, targetRirMax: first.rirMax, phase: null }, null), plannedSets: s.sets, normalSets: s.normalSets,
    };
  });
  return { key, choices, completed, week, day, slots, catalog, open: open.data, targetHistory, stats, bodyweight,
    defaultRestSeconds, plannedHistory, editorPlan, sourceRevision, planRevision: saved?.data?.revision ?? 0,
    savedExpired: !!saved?.data && Date.parse(saved.data.updated_at) < Date.now() - 30 * 86400000 };
}
