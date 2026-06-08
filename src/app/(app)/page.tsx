import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { startNextSession } from "./session/actions";

export default async function Home() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;

  const program = await getActiveProgram(supabase, userId);

  if (!program || program.days.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">No active program</h1>
          <p className="text-sm text-zinc-500">Build one to start training.</p>
        </div>
        <Link
          href="/program"
          className="rounded-xl bg-zinc-900 py-4 text-center text-lg font-semibold text-white dark:bg-white dark:text-black"
        >
          Build your program
        </Link>
      </div>
    );
  }

  const [{ count: finishedCount }, { data: open }, { data: lastFinished }] = await Promise.all([
    supabase
      .from("workout_session")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("program_id", program.id)
      .not("finished_at", "is", null),
    supabase
      .from("workout_session")
      .select("id")
      .eq("user_id", userId)
      .eq("program_id", program.id)
      .is("finished_at", null)
      .order("performed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  const completed = finishedCount ?? 0;
  const dayIndex = completed % program.days.length;
  const week = Math.floor(completed / program.days.length) + 1;
  const nextDay = program.days[dayIndex];

  const lastSummary = lastFinished ? await summarize(supabase, lastFinished) : null;

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
        <p className="text-sm text-zinc-500">
          Week {week} of {program.weeks} · next: {nextDay.name}
        </p>
      </div>

      {open ? (
        <Link
          href={`/session/${open.id}`}
          className="rounded-xl bg-zinc-900 py-4 text-center text-lg font-semibold text-white dark:bg-white dark:text-black"
        >
          Resume workout
        </Link>
      ) : (
        <form action={startNextSession}>
          <button className="w-full rounded-xl bg-zinc-900 py-4 text-lg font-semibold text-white dark:bg-white dark:text-black">
            Start next workout
          </button>
        </form>
      )}

      {lastSummary && (
        <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Last session
          </h2>
          <p className="text-sm">
            {lastSummary.dayName} · {lastSummary.totalSets} working sets
          </p>
          {lastSummary.topLift && (
            <p className="mt-1 text-sm text-zinc-500">
              Top: {lastSummary.topLift.name} · {Math.round(lastSummary.topLift.e1rm)} lb e1RM
            </p>
          )}
        </section>
      )}
    </div>
  );
}

async function summarize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: { id: string; program_day_id: string | null },
) {
  const [{ data: day }, { data: sets }] = await Promise.all([
    session.program_day_id
      ? supabase.from("program_day").select("name").eq("id", session.program_day_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("set_log")
      .select("exercise_id, e1rm")
      .eq("session_id", session.id)
      .eq("is_warmup", false),
  ]);

  let topLift: { name: string; e1rm: number } | null = null;
  for (const s of sets ?? []) {
    if (s.e1rm != null && (!topLift || s.e1rm > topLift.e1rm)) {
      topLift = { name: EXERCISE_BY_ID[s.exercise_id]?.name ?? s.exercise_id, e1rm: s.e1rm };
    }
  }

  return { dayName: day?.name ?? "Workout", totalSets: sets?.length ?? 0, topLift };
}
