import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { sessionTarget, type LastPerformance } from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { SEED_PROGRAM } from "../seed";
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
    .select("id, performed_at, week_index, finished_at")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  // Block position is derived: which seed day this session is = completed sessions before it.
  const { count: priorFinished } = await supabase
    .from("workout_session")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("finished_at", "is", null)
    .lt("performed_at", session.performed_at);

  const dayIndex = (priorFinished ?? 0) % SEED_PROGRAM.days.length;
  const day = SEED_PROGRAM.days[dayIndex];
  const week = session.week_index ?? Math.floor((priorFinished ?? 0) / SEED_PROGRAM.days.length) + 1;

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

  // Last performance per slot: the first working set of the most recent prior session.
  const exerciseIds = day.slots.map((s) => s.exerciseId);
  const { data: priorSets } = await supabase
    .from("set_log")
    .select("exercise_id, weight, reps, created_at")
    .eq("user_id", userId)
    .eq("set_index", 0)
    .eq("is_warmup", false)
    .neq("session_id", id)
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: false });

  const lastByExercise = new Map<string, LastPerformance>();
  for (const row of priorSets ?? []) {
    if (!lastByExercise.has(row.exercise_id)) {
      lastByExercise.set(row.exercise_id, { weight: row.weight, reps: row.reps });
    }
  }

  const setsByExercise = new Map<string, LoggedSet[]>();
  for (const s of thisSessionSets ?? []) {
    const list = setsByExercise.get(s.exercise_id) ?? [];
    list.push({ id: s.id, weight: s.weight, reps: s.reps, rir: s.rir, setIndex: s.set_index });
    setsByExercise.set(s.exercise_id, list);
  }

  const slots: SlotView[] = day.slots.map((slot) => {
    const def = EXERCISE_BY_ID[slot.exerciseId];
    const last = lastByExercise.get(slot.exerciseId) ?? null;
    const target = sessionTarget(
      def,
      { repMin: slot.repMin, repMax: slot.repMax, targetRir: slot.targetRir },
      last,
      EXERCISE_BY_ID,
      stats,
    );
    return {
      exerciseId: slot.exerciseId,
      name: def?.name ?? slot.exerciseId,
      equipment: def?.equipment ?? "barbell",
      increment: def?.increment ?? 5,
      prescription: {
        targetSets: slot.targetSets,
        repMin: slot.repMin,
        repMax: slot.repMax,
        targetRir: slot.targetRir,
      },
      target,
      sets: setsByExercise.get(slot.exerciseId) ?? [],
    };
  });

  return (
    <ActiveSession
      sessionId={id}
      dayName={day.name}
      week={week}
      weeks={SEED_PROGRAM.weeks}
      bodyweight={profile?.bodyweight ?? null}
      alreadyFinished={!!session.finished_at}
      slots={slots}
    />
  );
}
