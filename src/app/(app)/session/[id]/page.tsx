import { parseStoredPlan } from "@/lib/workout-editor";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Pattern } from "@/lib/strength/coefficients";
import { loadWorkoutTargetHistory } from "@/lib/workout-target-data";
import { stallContext } from "@/lib/stall-report";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { recentExerciseIds } from "@/lib/program";
import { getCatalogMap } from "@/lib/catalog";
import { foldPrescription, type AdaptationRow } from "@/lib/strength/plateau";
import { loadPendingSuggestions } from "@/lib/fluid";
import { phaseForWeek, resolvePrescription, type ProgramPhase } from "@/lib/periodization";
import type { JointPain } from "@/lib/session-feedback";
import { loadWorkoutRecords } from "@/lib/workout-records";
import { getCurrentBodyweight } from "@/lib/current-bodyweight";
import { defaultCompoundIds, pinnedExerciseIds } from "@/lib/board";
import { isLoggableExercise } from "@/lib/station";
import { loadUserPinRows } from "@/lib/pins-data";
import { ActiveSession, type SlotView, type LoggedSet } from "./active-session";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: session } = await supabase
    .from("workout_session")
    .select("id, performed_at, week_index, finished_at, program_id, program_day_id, readiness, joint_pain, notes, exercise_swaps, is_deload, plan_snapshot")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session || (!session.program_day_id && !session.plan_snapshot)) notFound();
  const capturedPlan = session.plan_snapshot ? parseStoredPlan(session.plan_snapshot) : null;

  const [{ data: day }, { data: program }, { data: daySlots }, { data: phaseRows }] = await Promise.all([
    session.program_day_id ? supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle() : Promise.resolve({data:{name:capturedPlan?.dayName??"Workout"}}),
    session.program_id
      ? supabase.from("program").select("weeks, style").eq("id", session.program_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("program_slot")
      .select("id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, superset_group, position")
      .eq("program_day_id", session.program_day_id ?? "00000000-0000-0000-0000-000000000000")
      .order("position", { ascending: true }),
    session.program_id
      ? supabase
          .from("program_phase")
          .select("id, position, name, description, week_start, week_end, target_rir_min, target_rir_max, set_multiplier, is_deload")
          .eq("program_id", session.program_id)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  if (!day) notFound();

  const [{ data: profile }, bodyweight, { data: statRows }, { data: thisSessionSets }, recentIds] =
    await Promise.all([
      supabase
        .from("profile")
        .select("default_rest_seconds")
        .eq("id", userId)
        .maybeSingle(),
      getCurrentBodyweight(supabase, userId),
      supabase
        .from("user_exercise_stat")
        .select("exercise_id, current_e1rm, personal_coefficient, coeff_confidence_n")
        .eq("user_id", userId),
      supabase
        .from("set_log")
        .select("id, program_slot_id, exercise_id, equipment_instance_id, weight, reps, rir, set_index, e1rm, planned_slot_id, planned_set_id")
        .eq("session_id", id)
        .order("set_index", { ascending: true }),
      recentExerciseIds(supabase, userId),
    ]);

  const catalog = await getCatalogMap(supabase, userId);
  const pinRows = await loadUserPinRows(supabase, userId);
  const pinnedIds = pinnedExerciseIds(pinRows, defaultCompoundIds(catalog), catalog);

  // Do not await record history here. The first saved set of an exercise is when
  // loadWorkoutRecords starts paging prior sets for PR / e1RM chips; blocking the
  // page on that work suspends session/[id]/loading.tsx and would remount the rest
  // timer. Stream achievements into the client instead.
  const recordsPromise = loadWorkoutRecords(supabase, userId, id, session.performed_at, catalog)
    .then((result) => result.achievements)
    .catch(() => null);

  // Hydrated to the client: targets (and swap re-derivation) compute client-side.
  const stats: ExerciseStat[] = (statRows ?? []).map((r) => ({
    exerciseId: r.exercise_id,
    currentE1rm: r.current_e1rm ?? 0,
    personalCoefficient: r.personal_coefficient,
    confidenceN: r.coeff_confidence_n,
  }));

  const slotIds = (daySlots ?? []).map((s) => s.id);
  const swaps = session.exercise_swaps;
  const sessionSwaps = swaps && typeof swaps === "object" && !Array.isArray(swaps) ? swaps : {};
  const targetHistory = await loadWorkoutTargetHistory(supabase, userId, catalog, new Date(session.performed_at), slotIds);

  // Group by slot, not exercise, so a duplicated exercise across two slots renders
  // its own sets on each card (matching the slot-keyed progression above). The last
  // logged exercise per slot also makes an in-session swap survive a page reload.
  const setsBySlot = new Map<string, LoggedSet[]>();
  const sessionExercise = new Map<string, string>();
  for (const s of thisSessionSets ?? []) {
    const slotId = s.planned_slot_id ?? s.program_slot_id;
    if (!slotId) continue;
    const list = setsBySlot.get(slotId) ?? [];
    list.push({
      id: s.id,
      exerciseId: s.exercise_id,
      equipmentInstanceId: s.equipment_instance_id,
      weight: s.weight,
      reps: s.reps,
      rir: s.rir,
      setIndex: s.set_index,
      plannedSetId: s.planned_set_id,
    });
    setsBySlot.set(slotId, list);
    sessionExercise.set(slotId, s.exercise_id);
  }

  // Fluid programs: fold the per-slot adaptation log so this session shows the *current*
  // prescription (post rep-range change / swap), not the program's built defaults.
  const isFluid = program?.style === "fluid";
  const foldedBySlot = new Map<string, ReturnType<typeof foldPrescription>>();
  if (isFluid && slotIds.length) {
    const { data: adaptRows } = await supabase
      .from("movement_adaptation")
      .select("program_slot_id, action, new_exercise_id, new_rep_min, new_rep_max, created_at")
      .eq("user_id", userId)
      .in("program_slot_id", slotIds)
      .order("created_at", { ascending: true });
    for (const slot of daySlots ?? []) {
      const rows: AdaptationRow[] = (adaptRows ?? [])
        .filter((r) => r.program_slot_id === slot.id)
        .map((r) => ({
          action: r.action as AdaptationRow["action"],
          newExerciseId: r.new_exercise_id,
          newRepMin: r.new_rep_min,
          newRepMax: r.new_rep_max,
          createdAt: r.created_at,
        }));
      foldedBySlot.set(
        slot.id,
        foldPrescription({ exerciseId: slot.exercise_id, repMin: slot.rep_min, repMax: slot.rep_max }, rows),
      );
    }
  }

  // Quick swap: fetch last used alternates for crowded-gym brand swaps.
  // Query manual_swap events for each slot, find the most recent swap TO a different exercise.
  const lastUsedBySlot = new Map<string, string>();
  if (slotIds.length) {
    const { data: swapRows } = await supabase
      .from("movement_adaptation")
      .select("program_slot_id, new_exercise_id, created_at")
      .eq("user_id", userId)
      .eq("action", "manual_swap")
      .not("new_exercise_id", "is", null)
      .in("program_slot_id", slotIds)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const slot of daySlots ?? []) {
      const currentExercise = typeof sessionSwaps[slot.id] === "string"
        ? sessionSwaps[slot.id] as string
        : sessionExercise.get(slot.id) ?? foldedBySlot.get(slot.id)?.exerciseId ?? slot.exercise_id;
      const lastSwap = (swapRows ?? [])
        .filter((r) => r.program_slot_id === slot.id && r.new_exercise_id !== currentExercise)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (lastSwap?.new_exercise_id) {
        const altDef = catalog[lastSwap.new_exercise_id];
        if (altDef && altDef.pattern === slot.pattern && isLoggableExercise(altDef)) {
          lastUsedBySlot.set(slot.id, lastSwap.new_exercise_id);
        }
      }
    }
  }

  const phases: ProgramPhase[] = (program?.style === "classic" ? phaseRows ?? [] : []).map((phase) => ({
    id: phase.id,
    position: phase.position,
    name: phase.name,
    description: phase.description,
    weekStart: phase.week_start,
    weekEnd: phase.week_end,
    targetRirMin: phase.target_rir_min,
    targetRirMax: phase.target_rir_max,
    setMultiplier: phase.set_multiplier,
    isDeload: phase.is_deload,
  }));
  const sessionWeek = session.week_index ?? 1;
  const activePhase = phaseForWeek(phases, sessionWeek);

  let slots: SlotView[] = (daySlots ?? []).map((slot) => {
    const folded = foldedBySlot.get(slot.id);
    const effective = resolvePrescription(
      {
        targetSets: slot.target_sets,
        repMin: folded?.repMin ?? slot.rep_min,
        repMax: folded?.repMax ?? slot.rep_max,
        targetRir: slot.target_rir,
      },
      sessionWeek,
      phases,
    );
    const exerciseId = typeof sessionSwaps[slot.id] === "string"
      ? sessionSwaps[slot.id] as string
      : sessionExercise.get(slot.id) ?? folded?.exerciseId ?? slot.exercise_id;
    const last = (setsBySlot.get(slot.id) ?? []).at(-1);
    const equipmentInstanceId = last?.exerciseId === exerciseId ? last.equipmentInstanceId : null;
    return {
      programSlotId: slot.id,
      exerciseId,
      targetContext: session.program_id ? stallContext({ id: slot.id, programId: session.program_id,
        programDayId: session.program_day_id!, exerciseId, targetSets: slot.target_sets,
        repMin: slot.rep_min, repMax: slot.rep_max, targetRir: slot.target_rir },
        exerciseId, equipmentInstanceId, effective, folded?.phaseStartAt ?? null) : null,
      pattern: slot.pattern as Pattern,
      prescription: {
        targetSets: effective.targetSets,
        repMin: effective.repMin,
        repMax: effective.repMax,
        targetRir: effective.targetRir,
        targetRirMin: effective.targetRirMin,
        targetRirMax: effective.targetRirMax,
      },
      restSeconds: slot.rest_seconds,
      supersetGroup: slot.superset_group,
      sets: setsBySlot.get(slot.id) ?? [],
      pendingSuggestion: null,
      lastUsedAlternate: lastUsedBySlot.get(slot.id) ?? null,
    };
  });

  if (session.plan_snapshot) {
    const snapshot = parseStoredPlan(session.plan_snapshot);
    slots = snapshot.slots.map(slot => {
      const selected = typeof sessionSwaps[slot.id] === "string" ? sessionSwaps[slot.id] as string : slot.exerciseId;
      const first = slot.sets[0];
      return { programSlotId: slot.id, sourceProgramSlotId: slot.programSlotId,
        exerciseId: selected, pattern: slot.pattern as Pattern, restSeconds: slot.restSeconds,
        supersetGroup: slot.supersetGroup, plannedSets: slot.sets,
        snapshotExerciseId: slot.exerciseId,
        prescription: { targetSets: slot.sets.length, repMin: first.repMin, repMax: first.repMax,
          targetRir: first.rirMax, targetRirMin: first.rirMin, targetRirMax: first.rirMax },
        targetContext: null, sets: setsBySlot.get(slot.id) ?? [], pendingSuggestion: null,
        lastUsedAlternate: lastUsedBySlot.get(slot.programSlotId ?? slot.id) ?? null };
    });
  }

  if (isFluid) {
    const suggestions = await loadPendingSuggestions(
      supabase,
      userId,
      slots.map((s) => ({
        programSlotId: s.programSlotId,
        exerciseId: s.exerciseId,
        pattern: s.pattern,
        repMin: s.prescription.repMin,
        repMax: s.prescription.repMax,
        targetRir: s.prescription.targetRir,
        plateauPatience:
          (daySlots ?? []).find((d) => d.id === s.programSlotId)?.plateau_patience ?? null,
      })),
      catalog,
      stats,
      bodyweight,
    );
    for (const s of slots) s.pendingSuggestion = suggestions[s.programSlotId] ?? null;
  }

  return (
    <ActiveSession
      sessionId={id}
      dayName={capturedPlan?.dayName??day.name}
      week={sessionWeek}
      weeks={program?.weeks ?? 5}
      phase={capturedPlan ? capturedPlan.phase??null : activePhase}
      isDeload={session.is_deload}
      bodyweight={bodyweight}
      defaultRestSeconds={profile?.default_rest_seconds ?? 120}
      alreadyFinished={!!session.finished_at}
      initialFeedback={{
        readiness: session.readiness,
        jointPain: session.joint_pain as JointPain | null,
        note: session.notes,
      }}
      stats={stats}
      recentIds={recentIds}
      slots={slots}
      targetHistory={targetHistory}
      catalog={catalog}
      recordsPromise={recordsPromise}
      pinnedIds={pinnedIds}
    />
  );
}
