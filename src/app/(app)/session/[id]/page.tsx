import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Pattern } from "@/lib/strength/coefficients";
import type { LastPerformance } from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { recentExerciseIds } from "@/lib/program";
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
      .select("id, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds, position")
      .eq("program_day_id", session.program_day_id)
      .order("position", { ascending: true }),
  ]);
  if (!day) notFound();

  const [{ data: profile }, { data: statRows }, { data: thisSessionSets }, recentIds] =
    await Promise.all([
      supabase
        .from("profile")
        .select("bodyweight, default_rest_seconds")
        .eq("id", userId)
        .maybeSingle(),
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

  // Hydrated to the client: targets (and swap re-derivation) compute client-side.
  const stats: ExerciseStat[] = (statRows ?? []).map((r) => ({
    exerciseId: r.exercise_id,
    currentE1rm: r.current_e1rm ?? 0,
    personalCoefficient: r.personal_coefficient,
    confidenceN: r.coeff_confidence_n,
  }));

  // Last performance per (slot, exercise): first working set of the most recent prior
  // session. Keyed on exercise too, so a swapped exercise resumes its own progression
  // chain in the slot without corrupting the original's.
  const slotIds = (daySlots ?? []).map((s) => s.id);
  const { data: priorSets } = slotIds.length
    ? await supabase
        .from("set_log")
        .select("program_slot_id, exercise_id, weight, reps, created_at")
        .eq("user_id", userId)
        .eq("set_index", 0)
        .eq("is_warmup", false)
        .neq("session_id", id)
        .in("program_slot_id", slotIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const lastBySlot = new Map<string, Record<string, LastPerformance>>();
  for (const row of priorSets ?? []) {
    if (!row.program_slot_id) continue;
    const byExercise = lastBySlot.get(row.program_slot_id) ?? {};
    if (!byExercise[row.exercise_id]) {
      byExercise[row.exercise_id] = { weight: row.weight, reps: row.reps };
    }
    lastBySlot.set(row.program_slot_id, byExercise);
  }

  // Group by slot, not exercise, so a duplicated exercise across two slots renders
  // its own sets on each card (matching the slot-keyed progression above). The last
  // logged exercise per slot also makes an in-session swap survive a page reload.
  const setsBySlot = new Map<string, LoggedSet[]>();
  const sessionExercise = new Map<string, string>();
  for (const s of thisSessionSets ?? []) {
    if (!s.program_slot_id) continue;
    const list = setsBySlot.get(s.program_slot_id) ?? [];
    list.push({ id: s.id, weight: s.weight, reps: s.reps, rir: s.rir, setIndex: s.set_index });
    setsBySlot.set(s.program_slot_id, list);
    sessionExercise.set(s.program_slot_id, s.exercise_id);
  }

  const slots: SlotView[] = (daySlots ?? []).map((slot) => ({
    programSlotId: slot.id,
    exerciseId: sessionExercise.get(slot.id) ?? slot.exercise_id,
    pattern: slot.pattern as Pattern,
    prescription: {
      targetSets: slot.target_sets,
      repMin: slot.rep_min,
      repMax: slot.rep_max,
      targetRir: slot.target_rir,
    },
    lastByExercise: lastBySlot.get(slot.id) ?? {},
    restSeconds: slot.rest_seconds,
    sets: setsBySlot.get(slot.id) ?? [],
  }));

  return (
    <ActiveSession
      sessionId={id}
      dayName={day.name}
      week={session.week_index ?? 1}
      weeks={program?.weeks ?? 5}
      bodyweight={profile?.bodyweight ?? null}
      defaultRestSeconds={profile?.default_rest_seconds ?? 120}
      alreadyFinished={!!session.finished_at}
      stats={stats}
      recentIds={recentIds}
      slots={slots}
    />
  );
}
