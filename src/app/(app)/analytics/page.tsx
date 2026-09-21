import { redirect } from "next/navigation";
import {
  exerciseSummaries,
  type AnalyticsSetRow,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { Card, CardLabel } from "@/components/ui/card";
import { ExerciseList, type ExerciseListItem } from "./exercise-list";
import {
  buildBoardLifts,
  defaultCompoundIds,
  extraPins,
  isExercisePinned,
  pinnedExerciseIds,
} from "@/lib/board";
import { loadUserPinRows } from "@/lib/pins-data";
import { isLoggableExercise } from "@/lib/station";
import { loadWeekRecordChips } from "@/lib/week-records-data";
import { PinEditorButton, type PinEditorItem } from "../pins/pin-editor";
import { BoardGrid } from "./board-grid";
import { TrackExploreMenu } from "./track-explore-menu";
import { WeekPrList } from "./week-pr-list";

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

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: rows, error } = await supabase
    .from("set_log")
    .select(
      "id, session_id, program_slot_id, exercise_id, equipment_instance_id, set_index, weight, reps, rir, e1rm, created_at, is_warmup, workout_session!inner(performed_at, finished_at, program_id)",
    )
    .eq("user_id", userId)
    .eq("is_warmup", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const catalog = await getCatalogMap(supabase, userId);
  const [pinRows, week] = await Promise.all([
    loadUserPinRows(supabase, userId),
    loadWeekRecordChips(supabase, userId, catalog),
  ]);
  const analyticsRows = normalizeRows((rows ?? []) as AnalyticsQueryRow[]);
  const summaries = exerciseSummaries(analyticsRows);
  const listItems: ExerciseListItem[] = summaries.map((summary) => ({
    exerciseId: summary.exerciseId,
    equipmentInstanceId: summary.equipmentInstanceId,
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
      ...[...historyIds].filter((id) => !defaults.includes(id) && isLoggableExercise(catalog[id])),
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
        <h1 className="text-display">Track</h1>
        <div className="flex">
          <TrackExploreMenu
            weekPrs={<WeekPrList sessions={week.sessions} />}
            allLifts={<ExerciseList items={listItems} />}
          />
          <PinEditorButton items={pinItems} />
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
