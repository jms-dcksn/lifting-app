// Server-side composition: turns a fluid program's slots + logged history + adaptation log
// into a per-slot plateau suggestion. All policy lives in plateau.ts; this file only fetches
// and wires. Returns suggestions ONLY for slots that are plateaued and not snoozed.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";
import type { ExerciseStat } from "@/lib/strength/recommend";
import { startingWeight } from "@/lib/strength/progression";
import {
  detectPlateau,
  defaultPatience,
  nextLadderAction,
  pickRepBand,
  rankSwapCandidates,
  foldPrescription,
  SNOOZE_EXPOSURES,
  type PhaseExposure,
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

  const slotIds = slots.map((s) => s.programSlotId);

  // All adaptation rows for these slots (chronological), and exposure history per slot.
  const { data: adaptRows } = await supabase
    .from("movement_adaptation")
    .select("program_slot_id, exercise_id, action, new_exercise_id, new_rep_min, new_rep_max, created_at")
    .eq("user_id", userId)
    .in("program_slot_id", slotIds)
    .order("created_at", { ascending: true });

  const { data: setRows } = await supabase
    .from("set_log")
    .select("program_slot_id, exercise_id, e1rm, created_at")
    .eq("user_id", userId)
    .eq("is_warmup", false)
    .in("program_slot_id", slotIds);

  for (const slot of slots) {
    const def = catalog[slot.exerciseId];
    if (!def) continue;

    const rows: AdaptationRow[] = (adaptRows ?? [])
      .filter((r) => r.program_slot_id === slot.programSlotId)
      .map((r) => ({
        action: r.action as AdaptationRow["action"],
        newExerciseId: r.new_exercise_id,
        newRepMin: r.new_rep_min,
        newRepMax: r.new_rep_max,
        createdAt: r.created_at,
      }));

    const folded = foldPrescription(
      { exerciseId: slot.exerciseId, repMin: slot.repMin, repMax: slot.repMax },
      rows,
    );

    // Best e1RM per session for the current (slot, exercise) phase. One session per slot per
    // day, so bucket by the date portion of created_at.
    const phaseStart = folded.phaseStartAt ? new Date(folded.phaseStartAt).getTime() : 0;
    const bySession = new Map<string, PhaseExposure>();
    for (const r of setRows ?? []) {
      if (r.program_slot_id !== slot.programSlotId) continue;
      if (r.exercise_id !== folded.exerciseId) continue;
      if (r.e1rm == null) continue;
      if (new Date(r.created_at).getTime() < phaseStart) continue;
      const key = r.created_at.slice(0, 10);
      const prev = bySession.get(key);
      if (!prev || r.e1rm > prev.bestE1rm) bySession.set(key, { sessionAt: r.created_at, bestE1rm: r.e1rm });
    }
    const exposures = [...bySession.values()].sort(
      (a, b) => new Date(a.sessionAt).getTime() - new Date(b.sessionAt).getTime(),
    );

    const patience = slot.plateauPatience ?? defaultPatience(def);
    const result = detectPlateau(exposures, patience);
    if (!result.plateaued) continue;

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
          .map((r) => r.exercise_id), // exercises we swapped AWAY from
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
