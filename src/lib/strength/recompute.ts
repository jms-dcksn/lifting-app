// Rebuild the derived current e1RM for one exercise from its logged sets.
//
// `set_log` is the source of truth; `user_exercise_stat.current_e1rm` is a cache that
// must always be rebuildable from it. Pure — verify with tsx, reuse on the server.

import { computeE1rm } from "./e1rm";
import type { ExerciseDef } from "./coefficients";

export interface LoggedSetInput {
  weight: number; // recorded load (added load for bodyweight; negative = assisted)
  reps: number;
  rir: number | null;
}

// Bodyweight/assisted convention: the bar is your body. The recorded weight is added
// load (negative = assisted), and e1RM is computed against bodyweight + added.
// Returns null when bodyweight is required but unknown — the load is not computable,
// and treating it as 0 would store garbage e1RMs that poison pattern strength.
export function effectiveLoad(
  def: ExerciseDef,
  weight: number,
  bodyweight: number | null,
): number | null {
  if (def.equipment === "bodyweight") {
    return bodyweight == null ? null : bodyweight + weight;
  }
  return weight;
}

export interface RecomputedStat {
  currentE1rm: number | null;
}

// current_e1rm is the best (highest) e1RM across all logged working sets — the user's
// demonstrated current strength on this exercise. Personal coefficient (machine
// calibration) is computed in recomputeAndUpsertStat (session/actions.ts), not here.
export function recomputeStat(
  def: ExerciseDef,
  sets: LoggedSetInput[],
  bodyweight: number | null,
): RecomputedStat {
  let best = 0;
  for (const s of sets) {
    if (s.reps <= 0) continue;
    const load = effectiveLoad(def, s.weight, bodyweight);
    if (load == null || load <= 0) continue;
    const e = computeE1rm(load, s.reps, s.rir ?? 2);
    if (e > best) best = e;
  }
  return { currentE1rm: best > 0 ? best : null };
}
