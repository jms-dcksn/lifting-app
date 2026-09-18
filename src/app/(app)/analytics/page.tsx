import Link from "next/link";
import { redirect } from "next/navigation";
import { WeightTrendCard } from "./weight-trend-card";
import { loadWeightHistory } from "@/lib/weight-history";
import {
  exerciseSummaries,
  sessionTonnage,
  weeklyVolume,
  type AnalyticsSetRow,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { iconButtonClasses } from "@/components/ui/icon-button-styles";
import { IconCalendar } from "@/components/ui/icons";
import { ExerciseList, type ExerciseListItem } from "./exercise-list";
import { VolumeChart, type VolumeChartPoint } from "./volume-chart";
import { dateKey } from "@/lib/bodyweight";
import {
  buildBoardLifts,
  defaultCompoundIds,
  extraPins,
  isExercisePinned,
  pinnedExerciseIds,
} from "@/lib/board";
import { loadUserPinRows } from "@/lib/pins-data";
import { loadWeekRecordChips } from "@/lib/week-records-data";
import { PinEditorButton, type PinEditorItem } from "../pins/pin-editor";
import { BoardGrid } from "./board-grid";
import { BoardSheet } from "./board-sheet";

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
  program_slot_id: string | null;
  set_index: number;
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

  const today = dateKey(new Date());
  const [
    { data: rows, error },
    { data: profile, error: profileError },
    bodyweightEntries,
  ] = await Promise.all([
    supabase
      .from("set_log")
      .select(
        "id, session_id, program_slot_id, exercise_id, set_index, weight, reps, rir, e1rm, created_at, is_warmup, workout_session!inner(performed_at, finished_at, program_id)",
      )
      .eq("user_id", userId)
      .eq("is_warmup", false)
      .order("created_at", { ascending: true }),
    supabase.from("profile").select("bodyweight, goal_weight").eq("id", userId).maybeSingle(),
    loadWeightHistory(supabase, userId, today),
  ]);
  if (error) throw new Error(error.message);
  if (profileError) throw new Error(profileError.message);

  const catalog = await getCatalogMap(supabase, userId);
  const [pinRows, week] = await Promise.all([
    loadUserPinRows(supabase, userId),
    loadWeekRecordChips(supabase, userId, catalog),
  ]);
  const analyticsRows = normalizeRows((rows ?? []) as AnalyticsQueryRow[]);
  const bodyweight = bodyweightEntries[0]?.weight ?? profile?.bodyweight ?? null;
  const summaries = exerciseSummaries(analyticsRows);
  const sessionVolume = sessionTonnage(analyticsRows, catalog, bodyweight);
  const volume = weeklyVolume(sessionVolume);
  const totalVolume = volume.reduce((sum, point) => sum + point.tonnage, 0);
  const latestVolume = volume.at(-1);
  const previousVolume = volume.at(-2);
  const volumeDelta =
    latestVolume && previousVolume ? latestVolume.tonnage - previousVolume.tonnage : null;
  const excludedSets = sessionVolume.reduce((sum, point) => sum + point.excludedSetCount, 0);
  const chartData: VolumeChartPoint[] = volume.map((point) => ({
    date: formatWeekLabel(point.weekStart),
    tooltip: `${shortDate(point.weekStart)} - ${shortDate(point.weekEnd)}`,
    tonnage: Math.round(point.tonnage),
  }));
  const listItems: ExerciseListItem[] = summaries.map((summary) => ({
    exerciseId: summary.exerciseId,
    name: catalog[summary.exerciseId]?.name ?? summary.exerciseId,
    pattern: catalog[summary.exerciseId]?.pattern ?? "unknown",
    currentE1rm: summary.currentE1rm,
    bestE1rm: summary.bestE1rm,
    lastPerformedAt: summary.lastPerformedAt,
    sessionCount: summary.sessionCount,
    delta: summary.delta,
  }));
  const lifts = buildBoardLifts({
    catalog,
    pins: pinRows,
    summaries,
    weekExerciseIds: week.chips.map((chip) => chip.exerciseId),
  });
  const defaults = defaultCompoundIds(catalog);
  const pinnedIds = pinnedExerciseIds(pinRows, defaults);
  const historyIds = new Set(summaries.map((summary) => summary.exerciseId));
  const pinItems: PinEditorItem[] = [
    ...defaults.map((exerciseId) => ({
      exerciseId,
      name: catalog[exerciseId]?.name ?? exerciseId,
      group: "compound" as const,
      pinned: isExercisePinned(pinRows, defaults, exerciseId),
    })),
    ...[
      ...extraPins(pinRows, defaults).map((pin) => pin.exerciseId),
      ...[...historyIds].filter((id) => !defaults.includes(id) && !catalog[id]?.machineTemplate),
    ]
      .filter((id, index, all) => all.indexOf(id) === index)
      .map((exerciseId) => ({
        exerciseId,
        name: catalog[exerciseId]?.name ?? exerciseId,
        group: "extra" as const,
        pinned: isExercisePinned(pinRows, defaults, exerciseId),
      })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-display">Board</h1>
        <div className="flex">
          <Link href="/analytics/month" className={iconButtonClasses("ghost")} aria-label="Month review">
            <IconCalendar />
          </Link>
          <BoardSheet label="All lifts" icon="search" title="All lifts">
            <ExerciseList items={listItems} />
          </BoardSheet>
          <PinEditorButton items={pinItems} />
          <BoardSheet label="More" icon="more" title="More">
            <WeightTrendCard entries={bodyweightEntries} today={today} goal={profile?.goal_weight ?? null} />
            <Card>
              <div className="mb-3">
                <div className="mb-1 flex items-center gap-1">
                  <CardLabel>Total volume</CardLabel>
                  {excludedSets > 0 && (
                    <InfoButton title="Excluded sets" label="About excluded bodyweight sets">
                      Sets without a bodyweight reading are left out of tonnage.
                    </InfoButton>
                  )}
                </div>
                <p className="text-heading tabular-nums">{formatWhole(totalVolume)} lb</p>
                {volumeDelta != null && (
                  <p className="text-caption text-muted">{signedVolume(volumeDelta)} vs last week</p>
                )}
              </div>
              {chartData.length >= 2 ? (
                <VolumeChart data={chartData} />
              ) : (
                <p className="text-body text-muted">One week so far — the chart appears after the next week.</p>
              )}
            </Card>
          </BoardSheet>
        </div>
      </header>

      {analyticsRows.length === 0 && lifts.length === 0 ? (
        <Card>
          <CardLabel className="mb-2">No training data yet</CardLabel>
          <p className="text-body text-muted">Finish a workout and key compounds land here.</p>
        </Card>
      ) : (
        <BoardGrid lifts={lifts} pinnedIds={pinnedIds} />
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

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekLabel(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function signedVolume(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${formatWhole(rounded)} lb`;
}
