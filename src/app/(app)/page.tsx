import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { loadNextWorkout } from "@/lib/next-workout";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { startNextSession } from "./session/actions";
import { loadWorkoutRecords } from "@/lib/workout-records";
import { loadWeekRecordChips } from "@/lib/week-records-data";
import { buildBoardLifts, sessionRecordChips, sessionRecordSummary } from "@/lib/board";
import { exerciseSummaries, type AnalyticsSetRow } from "@/lib/analytics";
import { BoardGrid } from "./analytics/board-grid";
import { LastSessionCard } from "./last-session-card";

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
      </div>
    );
  }

  const [next, { data: lastFinished }] = await Promise.all([
    loadNextWorkout(supabase, userId, program),
    supabase
      .from("workout_session")
      .select("id, program_day_id, performed_at")
      .eq("user_id", userId)
      .eq("program_id", program.id)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { completed, week, day: nextDay, catalog, open } = next;
  const [lastSummary, weekRecords, { data: setRows }] = await Promise.all([
    lastFinished
      ? summarizeLast(supabase, lastFinished, catalog, userId)
      : Promise.resolve(null),
    loadWeekRecordChips(supabase, userId, catalog),
    supabase
      .from("set_log")
      .select("id, session_id, exercise_id, weight, reps, rir, e1rm, created_at, is_warmup, workout_session!inner(performed_at)")
      .eq("user_id", userId)
      .eq("is_warmup", false)
      .order("created_at", { ascending: true }),
  ]);
  const nextWorkingSets = next.slots.reduce((total, slot) => total + slot.prescription.targetSets, 0);
  const totalSessions = program.days.length * program.weeks;
  const summaries = exerciseSummaries(normalizeHomeRows(setRows ?? []));
  const preview = buildBoardLifts({
    catalog,
    pins: [],
    summaries,
    weekExerciseIds: weekRecords.chips.map((chip) => chip.exerciseId),
  }).filter((lift) => lift.isCompound && lift.recentRecord);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <p className="w-fit rounded-full border border-border px-3 py-1 text-caption text-muted">
          {program.name}
          {program.style === "fluid" ? "" : ` · Week ${week}/${program.weeks}`}
        </p>
        <h1 className="text-display">Train</h1>
        {program.style === "fluid" ? (
          <p className="flex items-center gap-1 text-caption text-muted">
            Session {completed + 1} · Adaptive
            <InfoButton title="Adaptive program">Movements adjust as you plateau.</InfoButton>
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
          <Button size="lg" className="w-full">
            Start next workout
          </Button>
        </form>
      )}

      <Link
        href={open ? `/session/${open.id}` : "/workout/next"}
        aria-label={`View and plan ${nextDay.name}`}
        className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        <Card className="transition-colors hover:border-border-strong">
          <CardLabel>Today&apos;s work</CardLabel>
          <p className="text-heading">{nextDay.name}</p>
          <p className="mt-1 text-caption tabular-nums text-muted">
            {next.slots.length} lift{next.slots.length === 1 ? "" : "s"} · {nextWorkingSets} set
            {nextWorkingSets === 1 ? "" : "s"}
          </p>
          <p className="mt-4 text-caption font-medium">{open ? "Open workout" : "Plan"} →</p>
        </Card>
      </Link>

      {preview.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-caption font-semibold uppercase tracking-wide text-muted">Track</h2>
            <Link href="/analytics" className="min-h-11 py-2 text-caption font-medium text-muted">
              View all
            </Link>
          </div>
          <BoardGrid lifts={preview} pinnedIds={preview.map((lift) => lift.exerciseId)} showPin={false} />
        </section>
      )}

      {lastSummary && (
        <LastSessionCard
          sessionId={lastSummary.id}
          dayName={lastSummary.dayName}
          totalSets={lastSummary.totalSets}
          headline={lastSummary.headline}
          chips={lastSummary.chips}
        />
      )}
    </div>
  );
}

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

async function summarizeLast(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: { id: string; program_day_id: string | null; performed_at: string },
  catalog: Parameters<typeof loadWorkoutRecords>[4],
  userId: string,
) {
  const [{ data: day }, { achievements, current }] = await Promise.all([
    session.program_day_id
      ? supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadWorkoutRecords(supabase, userId, session.id, session.performed_at, catalog),
  ]);
  return {
    id: session.id,
    dayName: day?.name ?? "Workout",
    totalSets: current.filter((set) => !set.is_warmup).length,
    headline: sessionRecordSummary(achievements),
    chips: sessionRecordChips(session.id, achievements),
  };
}

function normalizeHomeRows(
  rows: Array<{
    id: string;
    session_id: string;
    exercise_id: string;
    weight: number;
    reps: number;
    rir: number | null;
    e1rm: number | null;
    created_at: string;
    is_warmup: boolean;
    workout_session:
      | { performed_at: string }
      | { performed_at: string }[]
      | null;
  }>,
): AnalyticsSetRow[] {
  return rows.flatMap((row) => {
    const session = Array.isArray(row.workout_session) ? row.workout_session[0] : row.workout_session;
    if (!session) return [];
    return [{
      id: row.id,
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      weight: row.weight,
      reps: row.reps,
      rir: row.rir,
      e1rm: row.e1rm,
      createdAt: row.created_at,
      performedAt: session.performed_at,
      isWarmup: row.is_warmup,
    }];
  });
}
