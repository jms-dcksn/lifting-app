import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { loadWorkoutRecords } from "@/lib/workout-records";
import type { JointPain } from "@/lib/session-feedback";
import { sessionPath } from "@/lib/session-paths";
import { SessionRecap } from "../session-recap";

export default async function SessionRecapPage({
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
    .select("id, performed_at, finished_at, program_day_id, readiness, joint_pain, notes")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) notFound();
  if (!session.finished_at) redirect(sessionPath(id));

  const catalog = await getCatalogMap(supabase, userId);
  const [{ data: day }, { achievements, current }] = await Promise.all([
    session.program_day_id
      ? supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadWorkoutRecords(supabase, userId, id, session.performed_at, catalog),
  ]);

  return (
    <SessionRecap
      sessionId={id}
      dayName={day?.name ?? "Workout"}
      totalSets={current.filter((set) => !set.is_warmup).length}
      achievements={achievements}
      initialFeedback={{
        readiness: session.readiness,
        jointPain: session.joint_pain as JointPain | null,
        note: session.notes,
      }}
    />
  );
}
