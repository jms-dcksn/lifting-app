import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { sessionTarget, type LastPerformance } from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
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
    .select("id, week_index, finished_at, program_id, program_day_id")
    .eq("id", id)
    .maybeSingle();
  if (!session?.program_day_id) notFound();

  const [{ data: day }, { data: program }, { data: daySlots }] = await Promise.all([
    supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle(),
    session.program_id
      ? supabase.from("program").select("weeks").eq("id", session.program_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("program_slot")
      .select("id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, position")
      .eq("program_day_id", session.program_day_id)
      .order("position", { ascending: true }),
  ]);
  if (!day) notFound();

  const [{ data: profile }, { data: statRows }, { data: thisSessionSets }] =
    await Promise.all([
      supabase.from("profile").select("bodyweight").eq("id", userId).maybeSingle(),
      supabase
        .from("user_exercise_stat")
        .select("exercise_id, current_e1rm, personal_coefficient, coeff_confidence_n")
        .eq("user_id", userId),
      supabase
        .from("set_log")
        .select("id, exercise_id, weight, reps, rir, set_index, e1rm")
        .eq("session_id", id)
        .order("set_index", { ascending: true }),
    ]);

  const stats: ExerciseStat[] = (statRows ?? []).map((r) => ({
    exerciseId: r.exercise_id,
    currentE1rm: r.current_e1rm ?? 0,
    personalCoefficient: r.personal_coefficient,
    confidenceN: r.coeff_confidence_n,
  }));

  // Last performance per slot, keyed on program_slot_id: first working set of the most recent
  // prior session for this exact slot (so a duplicated exercise progresses independently).
  const slotIds = (daySlots ?? []).map((s) => s.id);
  const { data: priorSets } = slotIds.length
    ? await supabase
        .from("set_log")
        .select("program_slot_id, weight, reps, created_at")
        .eq("user_id", userId)
        .eq("set_index", 0)
        .eq("is_warmup", false)
        .neq("session_id", id)
        .in("program_slot_id", slotIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const lastBySlot = new Map<string, LastPerformance>();
  for (const row of priorSets ?? []) {
    if (row.program_slot_id && !lastBySlot.has(row.program_slot_id)) {
      lastBySlot.set(row.program_slot_id, { weight: row.weight, reps: row.reps });
    }
  }

  const setsByExercise = new Map<string, LoggedSet[]>();
  for (const s of thisSessionSets ?? []) {
    const list = setsByExercise.get(s.exercise_id) ?? [];
    list.push({ id: s.id, weight: s.weight, reps: s.reps, rir: s.rir, setIndex: s.set_index });
    setsByExercise.set(s.exercise_id, list);
  }

  const slots: SlotView[] = (daySlots ?? []).map((slot) => {
    const def = EXERCISE_BY_ID[slot.exercise_id];
    const last = lastBySlot.get(slot.id) ?? null;
    const target = sessionTarget(
      def,
      { repMin: slot.rep_min, repMax: slot.rep_max, targetRir: slot.target_rir },
      last,
      EXERCISE_BY_ID,
      stats,
    );
    return {
      programSlotId: slot.id,
      exerciseId: slot.exercise_id,
      name: def?.name ?? slot.exercise_id,
      equipment: def?.equipment ?? "barbell",
      increment: def?.increment ?? 5,
      prescription: {
        targetSets: slot.target_sets,
        repMin: slot.rep_min,
        repMax: slot.rep_max,
        targetRir: slot.target_rir,
      },
      target,
      sets: setsByExercise.get(slot.exercise_id) ?? [],
    };
  });

  return (
    <ActiveSession
      sessionId={id}
      dayName={day.name}
      week={session.week_index ?? 1}
      weeks={program?.weeks ?? 5}
      bodyweight={profile?.bodyweight ?? null}
      alreadyFinished={!!session.finished_at}
      slots={slots}
    />
  );
}
