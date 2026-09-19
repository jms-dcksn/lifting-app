import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { defaultCompoundIds, isExercisePinned } from "@/lib/board";
import { dateKey } from "@/lib/bodyweight";
import { loadUserPinRows } from "@/lib/pins-data";
import { isEligibleForPeriodTracking, loadPeriodObservationsInRange } from "@/lib/period-calendar";
import { groupReviewSessions } from "@/lib/exercise-review-sessions";
import { reviewMonthParam } from "@/lib/review-month";
import { ExerciseReview } from "./exercise-review";

export default async function HistoryPage({
  params, searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ month?: string | string[]; equipment?: string | string[] }>;
}) {
  const { exerciseId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const now = new Date();
  const catalog = await getCatalogMap(supabase, userId);
  const query = await searchParams;
  const reviewMonth = reviewMonthParam(query.month, now);
  const pinRows = await loadUserPinRows(supabase, userId);
  const def = catalog[exerciseId];
  const name = def?.name ?? exerciseId;
  const isBodyweight = def?.equipment === "bodyweight";
  const pin = def && !def.machineTemplate
    ? { exerciseId, pinned: isExercisePinned(pinRows, defaultCompoundIds(catalog), exerciseId), name }
    : undefined;

  const { data: rows, error } = await supabase
    .from("set_log")
    .select("id, weight, reps, rir, e1rm, session_id, created_at, workout_session!inner(performed_at, finished_at)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false)
    .not("workout_session.finished_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const sessions = groupReviewSessions(
    (rows ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      weight: row.weight,
      reps: row.reps,
      rir: row.rir,
      e1rm: row.e1rm,
      performedAt: row.workout_session.performed_at,
      finishedAt: row.workout_session.finished_at,
    })),
    now,
  );

  if (!def && sessions.length === 0) {
    return <ExerciseReview status="missing" reviewMonth={reviewMonth} />;
  }
  if (sessions.length === 0) {
    return <ExerciseReview status="empty" name={name} reviewMonth={reviewMonth} pin={pin} />;
  }

  const periodEligible = await isEligibleForPeriodTracking(supabase, userId);
  const periodDates = periodEligible
    ? (await loadPeriodObservationsInRange(
        supabase,
        userId,
        sessions[0].dateKey,
        dateKey(now),
      )).map((observation) => observation.observedOn)
    : [];

  return (
    <ExerciseReview
      status="ready"
      name={name}
      isBodyweight={isBodyweight}
      sessions={sessions}
      reviewMonth={reviewMonth}
      pin={pin}
      now={now}
      periodEligible={periodEligible}
      periodDates={periodDates}
    />
  );
}
