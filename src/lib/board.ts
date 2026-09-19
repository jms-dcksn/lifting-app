import type { ExerciseDef, Pattern } from "./strength/coefficients";
import { recapLines, recordCounts, type ExerciseRecords } from "./strength/records";

export const PIN_CAP = 8;

export const BOARD_PATTERNS = [
  "squat",
  "hinge",
  "horizontal_press",
  "vertical_press",
  "horizontal_pull",
  "vertical_pull",
] as const satisfies readonly Pattern[];

export type BoardPattern = (typeof BOARD_PATTERNS)[number];

export interface PinRow {
  exerciseId: string;
  position: number;
}

export interface BoardLift {
  exerciseId: string;
  name: string;
  shortName: string;
  isCompound: boolean;
  currentE1rm: number | null;
  delta: number | null;
  e1rmSeries: number[];
  recentRecord: boolean;
}

const SHORT_NAME: Record<string, string> = {
  "bb-bench": "Bench",
  "bb-deadlift": "Deadlift",
  "bb-back-squat": "Squat",
  "bb-ohp": "OHP",
  "bb-row": "Row",
  "lat-pulldown": "Pulldown",
};

export function boardShortName(def: Pick<ExerciseDef, "id" | "name">) {
  return SHORT_NAME[def.id] ?? def.name.replace(/^(Barbell|Dumbbell|Machine|Cable)\s+/i, "");
}

export function isBoardCompound(def: ExerciseDef | undefined) {
  return !!def?.isReference && BOARD_PATTERNS.includes(def.pattern as BoardPattern);
}

export function defaultCompoundIds(catalog: Record<string, ExerciseDef>) {
  return BOARD_PATTERNS.flatMap((pattern) => {
    const match = Object.values(catalog).find(
      (def) => def.isReference && def.pattern === pattern && !def.machineTemplate,
    );
    return match ? [match.id] : [];
  });
}

export function hiddenDefaultIds(pins: PinRow[], defaults: string[]) {
  const defaultSet = new Set(defaults);
  return new Set(pins.filter((pin) => defaultSet.has(pin.exerciseId)).map((pin) => pin.exerciseId));
}

export function extraPins(pins: PinRow[], defaults: string[]) {
  const defaultSet = new Set(defaults);
  return pins
    .filter((pin) => !defaultSet.has(pin.exerciseId))
    .sort((a, b) => a.position - b.position || a.exerciseId.localeCompare(b.exerciseId));
}

export function pinnedExerciseIds(pins: PinRow[], defaults: string[]) {
  return [
    ...defaults.filter((id) => isExercisePinned(pins, defaults, id)),
    ...extraPins(pins, defaults).map((pin) => pin.exerciseId),
  ];
}

export function visibleBoardIds(
  pins: PinRow[],
  defaults: string[],
  historyIds: Iterable<string>,
) {
  const trained = new Set(historyIds);
  const hidden = hiddenDefaultIds(pins, defaults);
  const compounds = defaults.filter((id) => !hidden.has(id) && trained.has(id));
  return [...compounds, ...extraPins(pins, defaults).map((pin) => pin.exerciseId)];
}

export function canPinExercise(
  pins: PinRow[],
  defaults: string[],
  historyIds: Iterable<string>,
  exerciseId: string,
) {
  const visible = new Set(visibleBoardIds(pins, defaults, historyIds));
  if (visible.has(exerciseId)) return { ok: true as const };
  if (visible.size >= PIN_CAP) {
    return { ok: false as const, error: `Pin cap is ${PIN_CAP}. Unpin something first.` };
  }
  return { ok: true as const };
}

export function isExercisePinned(
  pins: PinRow[],
  defaults: string[],
  exerciseId: string,
) {
  const hidden = hiddenDefaultIds(pins, defaults);
  if (defaults.includes(exerciseId)) return !hidden.has(exerciseId);
  return extraPins(pins, defaults).some((pin) => pin.exerciseId === exerciseId);
}

export function nextExtraPosition(pins: PinRow[], defaults: string[]) {
  const extras = extraPins(pins, defaults);
  return extras.reduce((max, pin) => Math.max(max, pin.position), 0) + 1;
}

export function signedDelta(delta: number | null) {
  if (delta == null) return null;
  if (delta === 0) return "held";
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export interface WeekRecordChip {
  sessionId: string;
  exerciseId: string;
  name: string;
  label: string;
}

export function sessionRecordChips(sessionId: string, groups: ExerciseRecords[]) {
  const chips: WeekRecordChip[] = [];
  for (const group of groups) {
    for (const line of recapLines(group)) {
      chips.push({
        sessionId,
        exerciseId: group.exerciseId,
        name: group.name,
        label: `${boardShortName({ id: group.exerciseId, name: group.name })} ${line}`,
      });
    }
  }
  return chips;
}

export function weekRecordChips(sessions: { sessionId: string; groups: ExerciseRecords[] }[]) {
  return sessions.flatMap((session) => sessionRecordChips(session.sessionId, session.groups));
}

export function sessionRecordSummary(groups: ExerciseRecords[]) {
  const { reps, e1rm } = recordCounts(groups);
  const count = reps + e1rm;
  if (count === 0) return null;
  return `${count} PR${count === 1 ? "" : "s"}`;
}

export function recentRecordExerciseIds(chips: WeekRecordChip[]) {
  return new Set(chips.map((chip) => chip.exerciseId));
}

export function buildBoardLifts({
  catalog,
  pins,
  summaries,
  weekExerciseIds,
}: {
  catalog: Record<string, ExerciseDef>;
  pins: PinRow[];
  summaries: Array<{
    exerciseId: string;
    currentE1rm: number | null;
    delta: number | null;
    e1rmSeries: number[];
  }>;
  weekExerciseIds: Iterable<string>;
}): BoardLift[] {
  const defaults = defaultCompoundIds(catalog);
  const visible = visibleBoardIds(
    pins,
    defaults,
    summaries.map((summary) => summary.exerciseId),
  );
  const byId = new Map(summaries.map((summary) => [summary.exerciseId, summary]));
  const recent = new Set(weekExerciseIds);
  return visible.map((exerciseId) => {
    const def = catalog[exerciseId];
    const summary = byId.get(exerciseId);
    return {
      exerciseId,
      name: def?.name ?? exerciseId,
      shortName: boardShortName(def ?? { id: exerciseId, name: exerciseId }),
      isCompound: defaults.includes(exerciseId),
      currentE1rm: summary?.currentE1rm ?? null,
      delta: summary?.delta ?? null,
      e1rmSeries: summary?.e1rmSeries ?? [],
      recentRecord: recent.has(exerciseId),
    };
  });
}
