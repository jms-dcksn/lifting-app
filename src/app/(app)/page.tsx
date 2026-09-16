import Link from "next/link";
import { LogWeightButton } from "@/components/weight-calendar";
import { dateKey } from "@/lib/bodyweight";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { loadNextWorkout } from "@/lib/next-workout";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { rirLabel } from "@/lib/periodization";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card, CardLabel } from "@/components/ui/card";
import { startNextSession } from "./session/actions";

export default async function Home() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;

  const program = await getActiveProgram(supabase, userId);

  if (!program || program.days.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-display">No active program</h1>
          <p className="text-body text-muted">Build one to start training.</p>
        </div>
        <Link href="/program" className={buttonClasses("primary", "lg", "w-full")}>
          Build your program
        </Link>
        <LogWeightButton today={dateKey(new Date())} className="w-full" />
      </div>
    );
  }

  const [next, { data: lastFinished }] = await Promise.all([
    loadNextWorkout(supabase, userId, program),
    supabase
      .from("workout_session")
      .select("id, program_day_id")
      .eq("user_id", userId)
      .eq("program_id", program.id)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { completed, week, day: nextDay, catalog, open } = next;
  const lastSummary = lastFinished ? await summarize(supabase, lastFinished, catalog, userId) : null;
  const nextWorkout = next.slots.map((slot) => ({
    ...slot,
    exerciseName: catalog[slot.exerciseId]?.name ?? slot.exerciseId,
  }));
  const nextWorkingSets = nextWorkout.reduce(
    (total, slot) => total + slot.prescription.targetSets,
    0,
  );

  const totalSessions = program.days.length * program.weeks;

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-display">{program.name}</h1>
          <p className="text-body text-muted">
            {program.style === "fluid" ? "Next" : `Week ${week} of ${program.weeks} · next`}:{" "}
            <span className="font-medium text-foreground">{nextDay.name}</span>
          </p>
        </div>
        {program.style === "fluid" ? (
          <p className="text-caption text-muted">
            Session {completed + 1} · adaptive — movements adjust as you plateau
          </p>
        ) : (
          <BlockProgress completed={completed} total={totalSessions} />
        )}
      </div>

      {open ? (
        <Link href={`/session/${open.id}`} className={buttonClasses("primary", "lg", "w-full")}>
          Resume workout
        </Link>
      ) : (
        <form action={startNextSession}>
          {/* Auto-pending via useFormStatus, so a double-tap can't start two sessions. */}
          <Button size="lg" className="w-full">
            Start next workout
          </Button>
        </form>
      )}

      <Link href={open ? `/session/${open.id}` : "/workout/next"}
        aria-label={`View and plan ${nextDay.name}`}
        className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
        <Card className="transition-colors hover:border-border-strong">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <CardLabel>Next workout</CardLabel>
              <p className="text-heading">{nextDay.name}</p>
            </div>
            <p className="shrink-0 text-caption tabular-nums text-muted">
              {nextWorkout.length} exercise{nextWorkout.length === 1 ? "" : "s"} · {nextWorkingSets} set{nextWorkingSets === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {nextWorkout.map((slot) => (
              <li key={slot.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <span className="text-body font-medium">{slot.exerciseName}</span>
                <span className="shrink-0 text-caption tabular-nums text-muted">
                  {slot.prescription.targetSets} × {slot.prescription.repMin}
                  {slot.prescription.repMin === slot.prescription.repMax ? "" : `–${slot.prescription.repMax}`}
                  {" · "}{rirLabel(slot.prescription)} RIR
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-caption font-medium">{open ? "Open workout" : "View details & plan workout"} →</p>
        </Card>
      </Link>

      <LogWeightButton today={dateKey(new Date())} className="w-full" />

      {lastSummary && (
        <Card>
          <CardLabel className="mb-1">Last session</CardLabel>
          <p className="text-body">
            {lastSummary.dayName} · {lastSummary.totalSets} working sets
          </p>
          {lastSummary.topLift && (
            <p className="mt-1 text-body text-muted">
              Top:{" "}
              <Link
                href={`/history/${lastSummary.topLift.exerciseId}`}
                className="underline underline-offset-2"
              >
                {lastSummary.topLift.name}
              </Link>{" "}
              · {Math.round(lastSummary.topLift.e1rm)} lb e1RM
              {lastSummary.topLift.isPr && (
                <span className="ml-1.5 rounded-full border border-overload-up px-1.5 py-0.5 text-caption font-semibold text-overload-up">
                  PR
                </span>
              )}
            </p>
          )}
          {lastSummary.recordsThisWeek > 0 && (
            <p className="mt-2 text-caption font-medium text-foreground">
              {lastSummary.recordsThisWeek} record{lastSummary.recordsThisWeek === 1 ? "" : "s"} this week
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

// Block completion at a glance: a thin bar plus a sessions-done count.
function BlockProgress({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption tabular-nums text-muted">
        {completed} of {total} sessions this block
      </span>
    </div>
  );
}

async function summarize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: { id: string; program_day_id: string | null },
  catalog: Record<string, ExerciseDef>,
  userId: string,
) {
  const [{ data: day }, { data: sets }, { data: allSets }] = await Promise.all([
    session.program_day_id
      ? supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("set_log")
      .select("exercise_id, e1rm, created_at")
      .eq("session_id", session.id)
      .eq("is_warmup", false),
    supabase
      .from("set_log")
      .select("exercise_id, e1rm, created_at")
      .eq("user_id", userId)
      .eq("is_warmup", false)
      .order("created_at", { ascending: true }),
  ]);

  let topLift: { exerciseId: string; name: string; e1rm: number; isPr: boolean } | null = null;
  const bestByExercise = new Map<string, number>();
  
  for (const s of allSets ?? []) {
    if (s.e1rm != null) {
      const prior = bestByExercise.get(s.exercise_id);
      if (prior == null || s.e1rm > prior) {
        bestByExercise.set(s.exercise_id, s.e1rm);
      }
    }
  }

  for (const s of sets ?? []) {
    if (s.e1rm != null && (!topLift || s.e1rm > topLift.e1rm)) {
      const prior = bestByExercise.get(s.exercise_id);
      const isPr = prior != null && s.e1rm >= prior;
      topLift = {
        exerciseId: s.exercise_id,
        name: catalog[s.exercise_id]?.name ?? s.exercise_id,
        e1rm: s.e1rm,
        isPr,
      };
    }
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();
  const recordsThisWeek = (sets ?? []).filter((s) => {
    if (!s.e1rm || !s.created_at) return false;
    if (s.created_at < weekAgoIso) return false;
    const best = bestByExercise.get(s.exercise_id);
    return best != null && s.e1rm >= best;
  }).length;

  return { 
    dayName: day?.name ?? "Workout", 
    totalSets: sets?.length ?? 0, 
    topLift,
    recordsThisWeek,
  };
}
