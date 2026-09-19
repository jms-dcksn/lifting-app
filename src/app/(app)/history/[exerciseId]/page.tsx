import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { defaultCompoundIds, isExercisePinned } from "@/lib/board";
import { loadUserPinRows } from "@/lib/pins-data";
import { reviewMonthParam } from "@/lib/review-month";
import { ExerciseReview, type SessionGroup } from "./exercise-review";

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

  const catalog = await getCatalogMap(supabase, userId);
  const query = await searchParams;
  const reviewMonth = reviewMonthParam(query.month);
  const pinRows = await loadUserPinRows(supabase, userId);
  const def = catalog[exerciseId];
  const name = def?.name ?? exerciseId;
  const isBodyweight = def?.equipment === "bodyweight";
  const pin = def && !def.machineTemplate
    ? { exerciseId, pinned: isExercisePinned(pinRows, defaultCompoundIds(catalog), exerciseId), name }
    : undefined;

  const { data: rows, error } = await supabase
    .from("set_log")
    .select("id, weight, reps, rir, e1rm, session_id, created_at, workout_session!inner(performed_at)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const bySession = new Map<string, SessionGroup>();
  for (const r of rows ?? []) {
    let g = bySession.get(r.session_id);
    if (!g) {
      g = {
        sessionId: r.session_id,
        performedAt: r.workout_session.performed_at,
        bestE1rm: null,
        sets: [],
      };
      bySession.set(r.session_id, g);
    }
    g.sets.push({ id: r.id, weight: r.weight, reps: r.reps, rir: r.rir });
    if (r.e1rm != null && (g.bestE1rm == null || r.e1rm > g.bestE1rm)) g.bestE1rm = r.e1rm;
  }
  const sessions = [...bySession.values()].sort(
    (a, b) => a.performedAt.localeCompare(b.performedAt),
  );

  if (!def && sessions.length === 0) {
    return <ExerciseReview status="missing" reviewMonth={reviewMonth} />;
  }
  if (sessions.length === 0) {
    return <ExerciseReview status="empty" name={name} reviewMonth={reviewMonth} pin={pin} />;
  }
  return (
    <ExerciseReview
      status="ready"
      name={name}
      isBodyweight={isBodyweight}
      sessions={sessions}
      reviewMonth={reviewMonth}
      pin={pin}
    />
  );
}
