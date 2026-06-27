// Fluid/adaptive plateau engine. Pure, framework-free (vitest-tested like the rest of the
// strength engine). Watches a movement's per-session e1RM trend within the current "phase"
// (a (slot, exercise, rep-range) period) and reports a plateau once progress has stalled,
// with hysteresis: at least `patience` stalled exposures AND the stall must span at least
// MIN_PLATEAU_DAYS of real training time. Double-progression (progression.ts) is untouched;
// this only fires on plateau.

import type { ExerciseDef } from "./coefficients";

export const PATIENCE_BARBELL = 4;
export const PATIENCE_DEFAULT = 3;
export const MIN_PLATEAU_DAYS = 14;
export const SNOOZE_EXPOSURES = 2;
export const RUNGS_BEFORE_SWAP = 1;

export interface RepBand {
  repMin: number;
  repMax: number;
}

export const REP_BANDS: RepBand[] = [
  { repMin: 5, repMax: 8 }, // heavy
  { repMin: 8, repMax: 12 }, // moderate
  { repMin: 12, repMax: 15 }, // light
];

// Heavy barbell compounds progress slowly and noisily, so they wait longer before we call a
// plateau. In this catalog barbell == compound, so equipment is a sufficient proxy.
export function defaultPatience(def: ExerciseDef): number {
  return def.equipment === "barbell" ? PATIENCE_BARBELL : PATIENCE_DEFAULT;
}

export interface PhaseExposure {
  sessionAt: string; // ISO timestamp of the session
  bestE1rm: number; // best working-set e1RM that session
}

export interface PlateauResult {
  plateaued: boolean;
  stalledExposures: number; // exposures since the last new running-best
  stalledSinceDays: number; // training days spanned since the last new running-best
}

const DAY_MS = 24 * 60 * 60 * 1000;
const defaultMargin = (best: number) => Math.max(best * 0.01, 1);

// exposures: chronological (oldest first), one per session, within the current phase.
export function detectPlateau(
  exposures: PhaseExposure[],
  patience: number,
  margin: (best: number) => number = defaultMargin,
): PlateauResult {
  if (exposures.length === 0) {
    return { plateaued: false, stalledExposures: 0, stalledSinceDays: 0 };
  }

  let runningBest = exposures[0].bestE1rm;
  let lastProgressIndex = 0;
  for (let i = 1; i < exposures.length; i++) {
    if (exposures[i].bestE1rm > runningBest + margin(runningBest)) {
      runningBest = exposures[i].bestE1rm;
      lastProgressIndex = i;
    }
  }

  const stalledExposures = exposures.length - 1 - lastProgressIndex;
  // Span of the stall = time from the last new-best session to the most recent session. Using
  // the exposure span (not wall-clock "now") keeps detection about training history, so a
  // movement hammered for four straight days can't plateau in three days.
  const stalledSinceDays = Math.floor(
    (new Date(exposures[exposures.length - 1].sessionAt).getTime() -
      new Date(exposures[lastProgressIndex].sessionAt).getTime()) /
      DAY_MS,
  );

  const plateaued = stalledExposures >= patience && stalledSinceDays >= MIN_PLATEAU_DAYS;
  return { plateaued, stalledExposures, stalledSinceDays };
}
