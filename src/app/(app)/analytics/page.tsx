import Link from "next/link";
import { redirect } from "next/navigation";
import {
  e1rmPrFeed,
  exerciseSummaries,
  latestWeekBalance,
  patternStrengthTrend,
  sessionTonnage,
  weightPrs,
  type AnalyticsSetRow,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { EXERCISE_BY_ID, PATTERN_LABEL } from "@/lib/strength/coefficients";
import { Card, CardLabel } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { ExerciseList, type ExerciseListItem } from "./exercise-list";
import { VolumeChart, type VolumeChartPoint } from "./volume-chart";

type AnalyticsQueryRow = {
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
    | {
        performed_at: string;
        finished_at: string | null;
        program_id: string | null;
      }
    | {
        performed_at: string;
        finished_at: string | null;
        program_id: string | null;
      }[]
    | null;
};

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    supabase
      .from("set_log")
      .select(
        "id, session_id, exercise_id, weight, reps, rir, e1rm, created_at, is_warmup, workout_session!inner(performed_at, finished_at, program_id)",
      )
      .eq("user_id", userId)
      .eq("is_warmup", false)
      .order("created_at", { ascending: true }),
    supabase.from("profile").select("bodyweight").eq("id", userId).maybeSingle(),
  ]);

  if (error) throw new Error(error.message);

  const analyticsRows = normalizeRows((rows ?? []) as AnalyticsQueryRow[]);
  const bodyweight = profile?.bodyweight ?? null;
  const volume = sessionTonnage(analyticsRows, EXERCISE_BY_ID, bodyweight);
  const summaries = exerciseSummaries(analyticsRows);
  const e1rmRecords = e1rmPrFeed(analyticsRows);
  const weightRecords = weightPrs(analyticsRows);

  const latestProgramId = [...volume].reverse().find((point) => point.programId)?.programId ?? null;
  const blockVolume = latestProgramId
    ? volume.filter((point) => point.programId === latestProgramId)
    : volume;
  const totalVolume = blockVolume.reduce((sum, point) => sum + point.tonnage, 0);
  const latestVolume = blockVolume.at(-1);
  const previousVolume = blockVolume.at(-2);
  const volumeDelta =
    latestVolume && previousVolume ? latestVolume.tonnage - previousVolume.tonnage : null;
  const excludedSets = volume.reduce((sum, point) => sum + point.excludedSetCount, 0);

  const chartData: VolumeChartPoint[] = volume.map((point) => ({
    date: shortDate(point.performedAt),
    tonnage: Math.round(point.tonnage),
  }));

  const balance = latestWeekBalance(analyticsRows, EXERCISE_BY_ID, bodyweight);
  const maxBalanceSets = balance
    ? Math.max(...balance.patterns.map((pattern) => pattern.sets))
    : 0;
  const strengthTrend = patternStrengthTrend(analyticsRows, EXERCISE_BY_ID);

  const gainers = summaries
    .filter((summary) => summary.delta != null && summary.delta > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 4);

  const recordFeed = [
    ...e1rmRecords.map((record) => ({ type: "e1rm" as const, ...record })),
    ...weightRecords.map((record) => ({ type: "weight" as const, ...record })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const listItems: ExerciseListItem[] = summaries.map((summary) => ({
    exerciseId: summary.exerciseId,
    name: exerciseName(summary.exerciseId),
    pattern: EXERCISE_BY_ID[summary.exerciseId]?.pattern ?? "unknown",
    currentE1rm: summary.currentE1rm,
    bestE1rm: summary.bestE1rm,
    lastPerformedAt: summary.lastPerformedAt,
    sessionCount: summary.sessionCount,
    delta: summary.delta,
  }));

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="text-display">Progress</h1>
        <p className="text-body text-muted">
          {volume.length} session{volume.length === 1 ? "" : "s"} · {summaries.length} lift
          {summaries.length === 1 ? "" : "s"} logged
        </p>
      </header>

      {analyticsRows.length === 0 ? (
        <Card>
          <CardLabel className="mb-2">No training data yet</CardLabel>
          <p className="text-body text-muted">
            Finish a workout and this hub will show volume, records, and exercise trends.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <CardLabel className="mb-1">Total volume</CardLabel>
                <p className="text-heading tabular-nums">{formatWhole(totalVolume)} lb</p>
                {volumeDelta != null ? (
                  <p className="text-caption text-muted">
                    <Delta value={volumeDelta} /> vs last session
                  </p>
                ) : (
                  <p className="text-caption text-muted">Log another session for a delta.</p>
                )}
              </div>
              {excludedSets > 0 && (
                <span className="max-w-32 text-right text-caption text-muted">
                  {excludedSets} bodyweight set{excludedSets === 1 ? "" : "s"} excluded
                </span>
              )}
            </div>
            {chartData.length >= 2 ? (
              <VolumeChart data={chartData} />
            ) : (
              <p className="text-body text-muted">
                One session so far — the chart appears after the next workout.
              </p>
            )}
          </Card>

          {balance && (
            <Card>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <CardLabel>Training balance</CardLabel>
                <span className="text-caption text-muted">week of {shortDate(balance.weekStart)}</span>
              </div>
              <ul className="flex flex-col gap-3">
                {balance.patterns.map((pattern) => (
                  <li key={pattern.pattern}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-body">{PATTERN_LABEL[pattern.pattern]}</span>
                      <span className="text-caption tabular-nums text-muted">
                        {pattern.sets} set{pattern.sets === 1 ? "" : "s"} · {pattern.hardSets} hard
                      </span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-border">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-faint"
                        style={{ width: `${(pattern.sets / maxBalanceSets) * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                        style={{ width: `${(pattern.hardSets / maxBalanceSets) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-caption text-muted">Hard = RIR ≤ 2 (near failure).</p>
            </Card>
          )}

          <Card>
            <CardLabel className="mb-3">e1RM progression highlights</CardLabel>
            {gainers.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {gainers.map((summary) => (
                  <li key={summary.exerciseId}>
                    <Link
                      href={`/history/${summary.exerciseId}`}
                      className="flex min-h-11 items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium">
                          {exerciseName(summary.exerciseId)}
                        </span>
                        <span className="block text-caption text-muted">
                          current {formatMaybe(summary.currentE1rm)} e1RM
                        </span>
                      </span>
                      <TrendPill delta={summary.delta} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">
                No lift has two e1RM sessions with a gain yet.
              </p>
            )}
          </Card>

          {strengthTrend.length > 0 && (
            <Card>
              <CardLabel className="mb-1">Pattern strength</CardLabel>
              <p className="mb-3 text-caption text-muted">
                Pooled across every variant you train in each pattern.
              </p>
              <ul className="flex flex-col gap-2">
                {strengthTrend.map((point) => (
                  <li
                    key={point.pattern}
                    className="flex min-h-11 items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body">
                        {PATTERN_LABEL[point.pattern]}
                      </span>
                      <span className="block text-caption tabular-nums text-muted">
                        {Math.round(point.current)} lb reference e1RM
                      </span>
                    </span>
                    {point.sessions >= 2 ? (
                      <TrendPill delta={point.delta} />
                    ) : (
                      <span className="text-caption text-muted">new</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardLabel className="mb-3">Records feed</CardLabel>
            {recordFeed.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {recordFeed.map((record) => (
                  <li key={`${record.type}-${record.id}`} className="text-body">
                    <Link href={`/history/${record.exerciseId}`} className="block">
                      <span className="block font-medium">{exerciseName(record.exerciseId)}</span>
                      <span className="text-muted">
                        {record.type === "e1rm" ? (
                          <>
                            new e1RM {Math.round(record.e1rm)} lb{" "}
                            {record.delta == null ? "· first mark" : <Delta value={record.delta} />}
                          </>
                        ) : (
                          <>new max {formatWeightRecord(record.exerciseId, record.weight)}</>
                        )}{" "}
                        · {longDate(record.date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">Records appear after your first e1RM set.</p>
            )}
          </Card>

          <Card>
            <CardLabel className="mb-3">All exercises</CardLabel>
            <ExerciseList items={listItems} />
          </Card>
        </>
      )}
    </div>
  );
}

function normalizeRows(rows: AnalyticsQueryRow[]): AnalyticsSetRow[] {
  return rows.flatMap((row) => {
    const session = Array.isArray(row.workout_session)
      ? row.workout_session[0]
      : row.workout_session;
    if (!session) return [];
    return [
      {
        id: row.id,
        sessionId: row.session_id,
        exerciseId: row.exercise_id,
        weight: row.weight,
        reps: row.reps,
        rir: row.rir,
        e1rm: row.e1rm,
        createdAt: row.created_at,
        performedAt: session.performed_at,
        finishedAt: session.finished_at,
        programId: session.program_id,
        isWarmup: row.is_warmup,
      },
    ];
  });
}

function exerciseName(exerciseId: string) {
  return EXERCISE_BY_ID[exerciseId]?.name ?? exerciseId;
}

function formatMaybe(value: number | null) {
  return value == null ? "no" : `${Math.round(value)} lb`;
}

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatWeightRecord(exerciseId: string, weight: number) {
  const def = EXERCISE_BY_ID[exerciseId];
  if (def?.equipment === "bodyweight") {
    if (weight < 0) return `${Math.abs(weight)} lb assist`;
    return `${weight} lb added`;
  }
  return `${weight} lb`;
}

function Delta({ value }: { value: number }) {
  const rounded = Math.round(value);
  const signed = rounded > 0 ? `+${formatWhole(rounded)}` : formatWhole(rounded);
  return (
    <span
      className={cx(
        "font-semibold tabular-nums",
        rounded > 0 && "text-overload-up",
        rounded < 0 && "text-overload-down",
        rounded === 0 && "text-muted",
      )}
    >
      {signed} lb
    </span>
  );
}

function TrendPill({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const rounded = Math.round(delta);
  const signed = rounded > 0 ? `+${rounded}` : `${rounded}`;
  return (
    <span
      className={cx(
        "rounded-full border px-2 py-0.5 text-caption tabular-nums",
        rounded > 0 && "border-overload-up text-overload-up",
        rounded < 0 && "border-overload-down text-overload-down",
        rounded === 0 && "border-border text-muted",
      )}
    >
      {signed} lb
    </span>
  );
}
