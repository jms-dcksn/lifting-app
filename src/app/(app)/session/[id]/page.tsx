import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Pattern } from "@/lib/strength/coefficients";
import type { ProgressionPerformance } from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { recentExerciseIds } from "@/lib/program";
import { getCatalogMap } from "@/lib/catalog";
import { foldPrescription, type AdaptationRow } from "@/lib/strength/plateau";
import { loadPendingSuggestions } from "@/lib/fluid";
import { phaseForWeek, resolvePrescription, type ProgramPhase } from "@/lib/periodization";
import type { JointPain } from "@/lib/session-feedback";
import { loadWorkoutRecords } from "@/lib/workout-records";
import { getCurrentBodyweight } from "@/lib/current-bodyweight";
import { ActiveSession, type SlotView, type LoggedSet } from "./active-session";

type PriorSetRow = {
  session_id: string;
  program_slot_id: string | null;
  exercise_id: string;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
  set_index: number;
  created_at: string;
  workout_session:
    | { performed_at: string; finished_at: string | null }
    | { performed_at: string; finished_at: string | null }[]
    | null;
};

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
    .select("id, performed_at, week_index, finished_at, program_id, program_day_id, readiness, joint_pain, notes, exercise_swaps")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session?.program_day_id) notFound();

  const [{ data: day }, { data: program }, { data: daySlots }, { data: phaseRows }] = await Promise.all([
    supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle(),
    session.program_id
      ? supabase.from("program").select("weeks, style").eq("id", session.program_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("program_slot")
      .select("id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience, position")
      .eq("program_day_id", session.program_day_id)
      .order("position", { ascending: true }),
    session.program_id
      ? supabase
          .from("program_phase")
          .select("id, position, name, description, week_start, week_end, target_rir_min, target_rir_max, set_multiplier")
          .eq("program_id", session.program_id)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  if (!day) notFound();

  const [{ data: profile }, bodyweight, { data: statRows }, { data: thisSessionSets }, recentIds] =
    await Promise.all([
      supabase
        .from("profile")
        .select("default_rest_seconds, rest_tone_enabled")
        .eq("id", userId)
        .maybeSingle(),
      getCurrentBodyweight(supabase, userId),
      supabase
        .from("user_exercise_stat")
        .select("exercise_id, current_e1rm, personal_coefficient, coeff_confidence_n")
        .eq("user_id", userId),
      supabase
        .from("set_log")
        .select("id, program_slot_id, exercise_id, weight, reps, rir, set_index, e1rm")
        .eq("session_id", id)
        .order("set_index", { ascending: true }),
      recentExerciseIds(supabase, userId),
    ]);

  const catalog = await getCatalogMap(supabase, userId);

  const { achievements } = await loadWorkoutRecords(supabase, userId, id, session.performed_at, catalog);

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
  const historyExerciseIds = [...new Set([
    ...recentIds,
    ...(daySlots ?? []).map((slot) => slot.exercise_id),
    ...(thisSessionSets ?? []).map((set) => set.exercise_id),
    ...Object.values(sessionSwaps).filter((value): value is string => typeof value === "string"),
  ])];

  // Recent first working sets for each exact exercise across every program slot. The active
  // client selects a best-recent reference within the current slot cycle, allowing Lower A to
  // benefit from a newer Lower B exposure without letting an old all-time PR dictate the target.
  // Fetch all working sets because an exercise introduced by a mid-session swap may start at a
  // set index above zero; grouping below finds its first set within that exposure.
  const { data: priorSets, error: priorSetsError } = historyExerciseIds.length
    ? await supabase
        .from("set_log")
        .select("session_id, program_slot_id, exercise_id, weight, reps, rir, e1rm, set_index, created_at, workout_session!inner(performed_at, finished_at)")
        .eq("user_id", userId)
        .eq("is_warmup", false)
        .neq("session_id", id)
        .in("exercise_id", historyExerciseIds)
        .lt("workout_session.performed_at", session.performed_at)
        .lte("workout_session.finished_at", session.performed_at)
        .lt("created_at", session.performed_at)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [], error: null };
  if (priorSetsError) throw new Error("Unable to load progression history. Please try again.");

  const firstByExposure = new Map<string, PriorSetRow>();
  for (const row of (priorSets ?? []) as PriorSetRow[]) {
    const key = `${row.session_id}:${row.program_slot_id ?? "adhoc"}:${row.exercise_id}`;
    const current = firstByExposure.get(key);
    if (!current || row.set_index < current.set_index || (
      row.set_index === current.set_index && row.created_at < current.created_at
    )) {
      firstByExposure.set(key, row);
    }
  }
  const progressionByExercise: Record<string, ProgressionPerformance[]> = {};
  for (const row of firstByExposure.values()) {
    const joined = Array.isArray(row.workout_session)
      ? row.workout_session[0]
      : row.workout_session;
    if (!joined?.finished_at) continue;
    const list = progressionByExercise[row.exercise_id] ?? [];
    list.push({
      programSlotId: row.program_slot_id,
      performedAt: joined.performed_at,
      weight: row.weight,
      reps: row.reps,
      rir: row.rir,
      e1rm: row.e1rm,
    });
    progressionByExercise[row.exercise_id] = list;
  }
  for (const list of Object.values(progressionByExercise)) {
    list.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  }

  // Group by slot, not exercise, so a duplicated exercise across two slots renders
  // its own sets on each card (matching the slot-keyed progression above). The last
  // logged exercise per slot also makes an in-session swap survive a page reload.
  const setsBySlot = new Map<string, LoggedSet[]>();
  const sessionExercise = new Map<string, string>();
  for (const s of thisSessionSets ?? []) {
    if (!s.program_slot_id) continue;
    const list = setsBySlot.get(s.program_slot_id) ?? [];
    list.push({ id: s.id, exerciseId: s.exercise_id, weight: s.weight, reps: s.reps, rir: s.rir, setIndex: s.set_index });
    setsBySlot.set(s.program_slot_id, list);
    sessionExercise.set(s.program_slot_id, s.exercise_id);
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
        if (altDef && altDef.pattern === slot.pattern && !altDef.machineTemplate) {
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
  }));
  const sessionWeek = session.week_index ?? 1;
  const activePhase = phaseForWeek(phases, sessionWeek);

  const slots: SlotView[] = (daySlots ?? []).map((slot) => {
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
    return {
      programSlotId: slot.id,
      // Explicit choice wins even before logging; legacy sessions fall back to their sets.
      exerciseId: typeof sessionSwaps[slot.id] === "string"
        ? sessionSwaps[slot.id] as string
        : sessionExercise.get(slot.id) ?? folded?.exerciseId ?? slot.exercise_id,
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
      sets: setsBySlot.get(slot.id) ?? [],
      pendingSuggestion: null,
      lastUsedAlternate: lastUsedBySlot.get(slot.id) ?? null,
    };
  });

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
      dayName={day.name}
      week={sessionWeek}
      weeks={program?.weeks ?? 5}
      phase={activePhase}
      bodyweight={bodyweight}
      defaultRestSeconds={profile?.default_rest_seconds ?? 120}
      restToneEnabled={profile?.rest_tone_enabled ?? true}
      alreadyFinished={!!session.finished_at}
      initialFeedback={{
        readiness: session.readiness,
        jointPain: session.joint_pain as JointPain | null,
        note: session.notes,
      }}
      stats={stats}
      recentIds={recentIds}
      slots={slots}
      progressionByExercise={progressionByExercise}
      catalog={catalog}
      achievements={achievements}
    />
  );
}
