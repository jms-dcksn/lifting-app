import { exerciseFamilyIds, latestFamilyMember } from "./exercise-history";
import type { ExerciseDef, Pattern } from "./strength/coefficients";
import { movementId, movementMemberIds, movementTemplate, rollsUp } from "./strength/movement";
import { recapHeadline, recapLines, recordCounts, type ExerciseRecords } from "./strength/records";

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
  reviewExerciseId: string;
  equipmentInstanceId: string | null;
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
      (def) => def.isReference && def.pattern === pattern && def.stationProfile !== "machine",
    );
    return match ? [match.id] : [];
  });
}

export function pinDisplayKey(
  exerciseId: string,
  catalog: Record<string, ExerciseDef>,
): string {
  const def = catalog[exerciseId];
  if (!def) return exerciseId;
  const template = movementTemplate(def, catalog);
  return rollsUp(template) ? movementId(def) : exerciseId;
}

export function collapsePinRows(
  pins: PinRow[],
  catalog: Record<string, ExerciseDef>,
): PinRow[] {
  const seen = new Set<string>();
  const collapsed: PinRow[] = [];
  for (const pin of pins) {
    const key = pinDisplayKey(pin.exerciseId, catalog);
    if (seen.has(key)) continue;
    seen.add(key);
    collapsed.push({ exerciseId: key, position: pin.position });
  }
  return collapsed;
}

export function hiddenDefaultIds(
  pins: PinRow[],
  defaults: string[],
  _catalog: Record<string, ExerciseDef> = {},
) {
  const defaultSet = new Set(defaults);
  return new Set(pins.filter((pin) => defaultSet.has(pin.exerciseId)).map((pin) => pin.exerciseId));
}

export function extraPins(
  pins: PinRow[],
  defaults: string[],
  catalog: Record<string, ExerciseDef> = {},
) {
  const defaultSet = new Set(defaults);
  const hidden = hiddenDefaultIds(pins, defaults, catalog);
  const seen = new Set<string>();
  return collapsePinRows(pins, catalog)
    .filter((pin) => !defaultSet.has(pin.exerciseId) && !hidden.has(pin.exerciseId))
    .filter((pin) => {
      if (seen.has(pin.exerciseId)) return false;
      seen.add(pin.exerciseId);
      return true;
    })
    .sort((a, b) => a.position - b.position || a.exerciseId.localeCompare(b.exerciseId));
}

export function pinnedExerciseIds(
  pins: PinRow[],
  defaults: string[],
  catalog: Record<string, ExerciseDef> = {},
) {
  return [
    ...defaults.filter((id) => isExercisePinned(pins, defaults, id, catalog)),
    ...extraPins(pins, defaults, catalog).map((pin) => pin.exerciseId),
  ];
}

export function visibleBoardIds(
  pins: PinRow[],
  defaults: string[],
  historyIds: Iterable<string>,
  catalog: Record<string, ExerciseDef> = {},
) {
  const trained = trainedTileIds(historyIds, defaults, catalog);
  const hidden = hiddenDefaultIds(pins, defaults, catalog);
  const compounds = defaults.filter((id) => !hidden.has(id) && trained.has(id));
  const extra = extraPins(pins, defaults, catalog)
    .map((pin) => pin.exerciseId)
    .filter((id) => !defaults.includes(id));
  return [...compounds, ...extra];
}

export function canPinExercise(
  pins: PinRow[],
  defaults: string[],
  historyIds: Iterable<string>,
  exerciseId: string,
  catalog: Record<string, ExerciseDef> = {},
) {
  const visible = new Set(visibleBoardIds(pins, defaults, historyIds, catalog));
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
  catalog: Record<string, ExerciseDef> = {},
) {
  const key = pinDisplayKey(exerciseId, catalog);
  const hidden = hiddenDefaultIds(pins, defaults, catalog);
  if (defaults.includes(key)) return !hidden.has(key);
  return extraPins(pins, defaults, catalog).some((pin) => pin.exerciseId === key);
}

export function nextExtraPosition(
  pins: PinRow[],
  defaults: string[],
  catalog: Record<string, ExerciseDef> = {},
) {
  const extras = extraPins(pins, defaults, catalog);
  return extras.reduce((max, pin) => Math.max(max, pin.position), 0) + 1;
}

function aggregateMovementSummary(
  movementExerciseId: string,
  catalog: Record<string, ExerciseDef>,
  summaries: Array<{
    exerciseId: string;
    lastPerformedAt?: string;
    equipmentInstanceId?: string | null;
    currentE1rm: number | null;
    delta: number | null;
    e1rmSeries: number[];
  }>,
) {
  const members = new Set(movementMemberIds(movementExerciseId, catalog));
  const family = summaries
    .filter((summary) => members.has(summary.exerciseId))
    .sort((a, b) => (a.lastPerformedAt ?? "").localeCompare(b.lastPerformedAt ?? ""));
  if (family.length === 0) return undefined;
  const e1rmSeries = family.flatMap((summary) => summary.e1rmSeries);
  const withCurrent = family.filter((summary) => summary.currentE1rm != null);
  const latest = withCurrent.at(-1);
  const previous = withCurrent.at(-2);
  const latestSummary = family.at(-1)!;
  return {
    exerciseId: movementExerciseId,
    lastPerformedAt: latestSummary.lastPerformedAt,
    equipmentInstanceId: latestSummary.equipmentInstanceId ?? null,
    currentE1rm: latest?.currentE1rm ?? null,
    delta: latest && previous
      ? latest.currentE1rm! - previous.currentE1rm!
      : latest?.delta ?? null,
    e1rmSeries,
  };
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
  return recapHeadline(recordCounts(groups));
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
    lastPerformedAt?: string;
    equipmentInstanceId?: string | null;
    currentE1rm: number | null;
    delta: number | null;
    e1rmSeries: number[];
  }>;
  weekExerciseIds: Iterable<string>;
}): BoardLift[] {
  const defaults = defaultCompoundIds(catalog);
  const defaultSet = new Set(defaults);
  const visible = visibleBoardIds(
    pins,
    defaults,
    summaries.map((summary) => summary.exerciseId),
    catalog,
  );
  const byId = new Map(summaries.map((summary) => [summary.exerciseId, summary]));
  const recent = new Set(
    [...weekExerciseIds].map((id) => pinDisplayKey(id, catalog)),
  );
  return visible.map((exerciseId) => {
    const def = catalog[exerciseId];
    const template = def ? movementTemplate(def, catalog) : undefined;
    const summary = defaultSet.has(exerciseId)
      ? (template && rollsUp(template)
        ? aggregateMovementSummary(exerciseId, catalog, summaries)
        : latestFamilyMember(exerciseId, catalog, summaries))
      : byId.get(exerciseId);
    const reviewExerciseId = defaultSet.has(exerciseId)
      ? (template && rollsUp(template) ? exerciseId : (summary?.exerciseId ?? exerciseId))
      : (summary?.exerciseId ?? exerciseId);
    const movementKey = pinDisplayKey(reviewExerciseId, catalog);
    return {
      exerciseId,
      reviewExerciseId,
      equipmentInstanceId: summary?.equipmentInstanceId ?? null,
      name: def?.name ?? exerciseId,
      shortName: boardShortName(def ?? { id: exerciseId, name: exerciseId }),
      isCompound: defaultSet.has(exerciseId),
      currentE1rm: summary?.currentE1rm ?? null,
      delta: summary?.delta ?? null,
      e1rmSeries: summary?.e1rmSeries ?? [],
      recentRecord: recent.has(movementKey),
    };
  });
}

function trainedTileIds(
  historyIds: Iterable<string>,
  defaults: string[],
  catalog: Record<string, ExerciseDef>,
) {
  const trained = new Set<string>();
  const defaultSet = new Set(defaults);
  for (const id of historyIds) {
    trained.add(id);
    for (const familyId of exerciseFamilyIds(id, catalog)) {
      if (defaultSet.has(familyId)) trained.add(familyId);
    }
  }
  return trained;
}
