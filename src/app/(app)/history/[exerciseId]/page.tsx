import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { E1rmChart, type ChartPoint } from "./e1rm-chart";

interface SessionGroup {
  sessionId: string;
  performedAt: string;
  bestE1rm: number | null;
  sets: { id: string; weight: number; reps: number; rir: number | null }[];
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const def = EXERCISE_BY_ID[exerciseId];
  const name = def?.name ?? exerciseId;
  const isBodyweight = def?.equipment === "bodyweight";

  const { data: rows } = await supabase
    .from("set_log")
    .select("id, weight, reps, rir, e1rm, session_id, created_at, workout_session!inner(performed_at)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false)
    .order("created_at", { ascending: true });

  // Group working sets by session, in session (performed_at) order.
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

  const chartData: ChartPoint[] = sessions
    .filter((s) => s.bestE1rm != null)
    .map((s) => ({ date: shortDate(s.performedAt), e1rm: s.bestE1rm as number }));

  // Overload signal: best e1RM of the latest session vs the session before it.
  const withE1rm = sessions.filter((s) => s.bestE1rm != null);
  const latest = withE1rm.at(-1);
  const previous = withE1rm.at(-2);
  const delta =
    latest?.bestE1rm != null && previous?.bestE1rm != null
      ? latest.bestE1rm - previous.bestE1rm
      : null;

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="text-sm text-zinc-500">
          {sessions.length} session{sessions.length === 1 ? "" : "s"} logged
          {latest?.bestE1rm != null && ` · current e1RM ${Math.round(latest.bestE1rm)} lb`}
        </p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">No working sets logged yet.</p>
      ) : (
        <>
          {delta != null && <OverloadBadge delta={delta} />}

          {chartData.length >= 2 && (
            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                e1RM over time
              </h2>
              <E1rmChart data={chartData} />
            </section>
          )}

          <section className="flex flex-col gap-3">
            {[...sessions].reverse().map((s) => (
              <div
                key={s.sessionId}
                className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{longDate(s.performedAt)}</h3>
                  {s.bestE1rm != null && (
                    <span className="text-xs text-zinc-500 tabular-nums">
                      best e1RM {Math.round(s.bestE1rm)} lb
                    </span>
                  )}
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {s.sets.map((set, i) => (
                    <li key={set.id} className="text-sm tabular-nums">
                      <span className="text-zinc-400">{i + 1}.</span> {set.weight} lb
                      {isBodyweight ? " added" : ""} × {set.reps}
                      {set.rir != null ? ` @ ${set.rir} RIR` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function OverloadBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta);
  const cls =
    rounded > 0 ? "text-emerald-600" : rounded < 0 ? "text-red-500" : "text-zinc-500";
  const text =
    rounded > 0
      ? `Beat last session by ${rounded} lb e1RM`
      : rounded < 0
        ? `Down ${Math.abs(rounded)} lb e1RM vs last session`
        : "Matched last session's e1RM";
  return (
    <p className={`text-sm font-medium ${cls}`}>
      {text}
    </p>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
