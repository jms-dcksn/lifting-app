import { loadStallHistory } from "./stall-data";
import { buildStallAssessments } from "./stall-report";
// Server-side composition: turns a fluid program's slots + logged history + adaptation log
// into a per-slot plateau suggestion. All policy lives in plateau.ts; this file only fetches
// and wires. Returns suggestions ONLY for slots that are plateaued and not snoozed.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { startingWeight } from "@/lib/strength/progression";
import {
  nextLadderAction,
  pickRepBand,
  rankSwapCandidates,
  foldPrescription,
  SNOOZE_EXPOSURES,
  type AdaptationRow,
  type SwapCandidateInput,
} from "@/lib/strength/plateau";

type Client = SupabaseClient<Database>;

export interface PendingSuggestion {
  action: "rep_change" | "swap";
  ladderStep: number;
  stalledExposures: number;
  repBand?: { repMin: number; repMax: number };
  weight?: number | null;
  candidates?: { exerciseId: string; name: string; weight: number | null }[];
}

export interface FluidSlotInput {
  programSlotId: string;
  exerciseId: string; // current effective exercise (from session page's folded prescription)
  pattern: Pattern;
  repMin: number;
  repMax: number;
  targetRir: number;
  plateauPatience: number | null;
}

const MAX_SWAP_CANDIDATES = 3;

export async function loadPendingSuggestions(
  supabase: Client,
  userId: string,
  slots: FluidSlotInput[],
  catalog: Record<string, ExerciseDef>,
  stats: ExerciseStat[],
  bodyweight: number | null,
): Promise<Record<string, PendingSuggestion>> {
  const out: Record<string, PendingSuggestion> = {};
  if (slots.length === 0) return out;

  const now = new Date();
  const history = await loadStallHistory(supabase, userId, now);
  const assessments = buildStallAssessments(history, catalog, now);
  const adaptRows = history.adaptations;
  const setRows = history.sets;

  for (const slot of slots) {
    const def = catalog[slot.exerciseId];
    if (!def) continue;

    const rows: AdaptationRow[] = adaptRows.filter(r => r.slotId === slot.programSlotId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

    const folded = foldPrescription(
      { exerciseId: slot.exerciseId, repMin: slot.repMin, repMax: slot.repMax },
      rows,
    );

    const result = assessments.find(a => a.slotId === slot.programSlotId && a.exerciseId === slot.exerciseId);
    if (result?.state !== "plateau") continue;
    const exposures = result.points;

    // Snooze: if the user dismissed within the last SNOOZE_EXPOSURES exposures, stay quiet.
    if (folded.lastDismissAt) {
      const dismissT = new Date(folded.lastDismissAt).getTime();
      const since = exposures.filter((e) => new Date(e.sessionAt).getTime() > dismissT).length;
      if (since < SNOOZE_EXPOSURES) continue;
    }

    const action = nextLadderAction(folded.ladderStep);

    if (action === "rep_change") {
      const band = pickRepBand({ repMin: folded.repMin, repMax: folded.repMax }, folded.recentBands);
      const weight = startingWeight(def, band.repMin, slot.targetRir, catalog, stats, bodyweight)?.weight ?? null;
      out[slot.programSlotId] = {
        action,
        ladderStep: folded.ladderStep,
        stalledExposures: result.stalledExposures,
        repBand: band,
        weight,
      };
    } else {
      // Swap: rank other exercises in the pattern by novelty.
      const recentlyPlateauedIds = new Set(
        (adaptRows ?? [])
          .filter((r) => r.action === "swap")
          .map((r) => r.exerciseId), // exercises we swapped AWAY from
      );
      const trained = new Map<string, number>(); // exerciseId -> recency rank (0 = most recent)
      let rank = 0;
      for (const r of [...(setRows ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )) {
        if (!trained.has(r.exercise_id)) trained.set(r.exercise_id, rank++);
      }

      const pool: SwapCandidateInput[] = Object.values(catalog)
        .filter((d) => d.pattern === slot.pattern && d.id !== folded.exerciseId)
        .map((d) => ({
          exerciseId: d.id,
          name: d.name,
          recentlyPlateaued: recentlyPlateauedIds.has(d.id),
          recencyRank: trained.get(d.id) ?? Number.MAX_SAFE_INTEGER,
        }));

      const candidates = rankSwapCandidates(pool)
        .slice(0, MAX_SWAP_CANDIDATES)
        .map((c) => {
          const cdef = catalog[c.exerciseId];
          const weight = cdef
            ? startingWeight(cdef, folded.repMin, slot.targetRir, catalog, stats, bodyweight)?.weight ?? null
            : null;
          return { exerciseId: c.exerciseId, name: c.name, weight };
        });

      out[slot.programSlotId] = {
        action,
        ladderStep: folded.ladderStep,
        stalledExposures: result.stalledExposures,
        candidates,
      };
    }
  }

  return out;
}
