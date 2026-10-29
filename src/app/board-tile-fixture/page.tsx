import { notFound } from "next/navigation";
import { BoardGrid } from "@/app/(app)/analytics/board-grid";
import { buildBoardLifts, type PinRow } from "@/lib/board";
import { EXERCISE_BY_ID, type ExerciseDef } from "@/lib/strength/coefficients";

// Layout regression surface for Track tiles. Not linked from the app.
// Production 404s; Playwright hits this from `next dev`.

function variant(baseId: string, id: string, extra: Partial<ExerciseDef> = {}): ExerciseDef {
  const base = EXERCISE_BY_ID[baseId];
  return { ...base, id, baseExerciseId: baseId, isReference: false, ...extra };
}

const longBase: ExerciseDef = {
  ...EXERCISE_BY_ID["machine-incline-chest-press"],
  id: "long-incline-base",
  name: "Single-Arm Incline Chest Press With Pause",
};

const catalog: Record<string, ExerciseDef> = {
  ...EXERCISE_BY_ID,
  [longBase.id]: longBase,
  "long-incline": variant("machine-incline-chest-press", "long-incline", {
    baseExerciseId: longBase.id,
    name: "Single-Arm Incline Chest Press With Pause — Life Fitness (plate)",
    brand: "Life Fitness",
    machineType: "plate_loaded",
    stationModel: "lf-insignia-dual-chest",
  }),
  "hack-squat__cybex__plate": variant("hack-squat", "hack-squat__cybex__plate", {
    name: "Hack Squat — Cybex (plate)",
    brand: "Cybex",
    machineType: "plate_loaded",
  }),
  "seated-leg-curl__hammer": variant("seated-leg-curl", "seated-leg-curl__hammer", {
    name: "Seated Leg Curl — Hammer Strength (stack)",
    brand: "Hammer Strength",
    machineType: "selectorized",
    stationModel: "Select Series Seated Leg Curl",
  }),
};

const pins: PinRow[] = [
  { exerciseId: "long-incline", position: 1 },
  { exerciseId: "bb-rdl", position: 2 },
  { exerciseId: "hack-squat__cybex__plate", position: 3 },
  { exerciseId: "seated-leg-curl__hammer", position: 4 },
];

export default function BoardTileFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const lifts = buildBoardLifts({
    catalog,
    pins,
    summaries: [
      {
        exerciseId: "long-incline",
        equipmentInstanceId: null,
        currentE1rm: 265,
        delta: -12.2,
        e1rmSeries: [240, 255, 270, 265],
      },
      {
        exerciseId: "bb-rdl",
        equipmentInstanceId: null,
        currentE1rm: 136,
        delta: null,
        e1rmSeries: [],
      },
      {
        exerciseId: "hack-squat__cybex__plate",
        equipmentInstanceId: "cybex",
        currentE1rm: 185,
        delta: 5.4,
        e1rmSeries: [170, 178, 185],
      },
      {
        exerciseId: "seated-leg-curl__hammer",
        equipmentInstanceId: "hammer",
        currentE1rm: null,
        delta: null,
        e1rmSeries: [163],
      },
    ],
    weekExerciseIds: ["hack-squat__cybex__plate"],
  });

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-5 px-4 py-4">
      <h1 className="text-heading">Track</h1>
      <BoardGrid lifts={lifts} pinnedIds={lifts.map((lift) => lift.exerciseId)} />
    </div>
  );
}
