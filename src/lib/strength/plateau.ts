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

export type AdaptationAction = "rep_change" | "swap";

const mid = (b: RepBand) => (b.repMin + b.repMax) / 2;
const sameBand = (a: RepBand, b: RepBand) => a.repMin === b.repMin && a.repMax === b.repMax;

// Nearest standard band to an arbitrary built range, by midpoint.
export function bandOf(repMin: number, repMax: number): RepBand {
  const m = (repMin + repMax) / 2;
  return REP_BANDS.reduce((best, b) =>
    Math.abs(mid(b) - m) < Math.abs(mid(best) - m) ? b : best,
  );
}

// The most novel band relative to the current one: furthest by index, tie-broken toward the
// heavier band (lower repMin). Skips any band in `recent` (recently used in this phase chain)
// unless that leaves nothing.
export function pickRepBand(current: RepBand, recent: RepBand[]): RepBand {
  const curBand = bandOf(current.repMin, current.repMax);
  const curIdx = REP_BANDS.findIndex((b) => sameBand(b, curBand));

  const ranked = REP_BANDS.map((b, i) => ({ b, i }))
    .filter(({ b }) => !sameBand(b, curBand))
    .sort((x, y) => {
      const dist = Math.abs(y.i - curIdx) - Math.abs(x.i - curIdx); // furthest first
      if (dist !== 0) return dist;
      return x.b.repMin - y.b.repMin; // tie -> heavier (lower repMin) first
    });

  const fresh = ranked.find(({ b }) => !recent.some((r) => sameBand(r, b)));
  return (fresh ?? ranked[0]).b;
}

export function nextLadderAction(ladderStep: number): AdaptationAction {
  return ladderStep < RUNGS_BEFORE_SWAP ? "rep_change" : "swap";
}

export interface SwapCandidateInput {
  exerciseId: string;
  name: string;
  recentlyPlateaued: boolean; // plateaued on / swapped away from recently — avoid ping-pong
  recencyRank: number; // 0 = trained most recently; larger = staler/more novel
}

// Novel-first: movements not recently plateaued beat ones that were; among equals, the staler
// (less recently trained) movement ranks higher. The current exercise must be excluded by the
// caller before ranking.
export function rankSwapCandidates(cands: SwapCandidateInput[]): SwapCandidateInput[] {
  return [...cands].sort(
    (a, b) =>
      Number(a.recentlyPlateaued) - Number(b.recentlyPlateaued) || b.recencyRank - a.recencyRank,
  );
}
