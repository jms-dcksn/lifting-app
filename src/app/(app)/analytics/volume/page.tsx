import { redirect } from "next/navigation";
import Link from "next/link";
import {
  sessionTonnage,
  weeklyVolume,
  type AnalyticsSetRow,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { getCurrentBodyweight } from "@/lib/current-bodyweight";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { VolumeChart, type VolumeChartPoint } from "../volume-chart";

type AnalyticsQueryRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  equipment_instance_id: string | null;
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

export default async function VolumePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [{ data: rows, error }, bodyweight] = await Promise.all([
    supabase
      .from("set_log")
      .select(
        "id, session_id, program_slot_id, exercise_id, equipment_instance_id, set_index, weight, reps, rir, e1rm, created_at, is_warmup, workout_session!inner(performed_at, finished_at, program_id)",
      )
      .eq("user_id", userId)
      .eq("is_warmup", false)
      .order("created_at", { ascending: true }),
    getCurrentBodyweight(supabase, userId),
  ]);
  if (error) throw new Error(error.message);

  const catalog = await getCatalogMap(supabase, userId);
  const analyticsRows = normalizeRows((rows ?? []) as AnalyticsQueryRow[]);
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

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <Link href="/analytics" className="min-h-11 py-2 text-body text-muted">← Track</Link>
      <h1 className="text-display">Volume</h1>
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
        equipmentInstanceId: row.equipment_instance_id,
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
