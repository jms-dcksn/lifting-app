// Hardcoded seed program for Phase 2 — shaped like the program/day/slot data the builder
// (Phase 3) will produce. Building the active-session screen against this proves logging
// before the builder exists. Replaced by the real active program in P3.
//
// Exercise ids and patterns must match `coefficients.ts`. Sessions run these days in order.

import type { Pattern } from "@/lib/strength/coefficients";

export interface SeedSlot {
  exerciseId: string;
  pattern: Pattern;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}

export interface SeedDay {
  name: string;
  slots: SeedSlot[];
}

export interface SeedProgram {
  name: string;
  weeks: number;
  days: SeedDay[];
}

const s = (
  exerciseId: string,
  pattern: Pattern,
  targetSets: number,
  repMin: number,
  repMax: number,
  targetRir = 2,
): SeedSlot => ({ exerciseId, pattern, targetSets, repMin, repMax, targetRir });

export const SEED_PROGRAM: SeedProgram = {
  name: "Push / Pull / Legs (seed)",
  weeks: 5,
  days: [
    {
      name: "Push",
      slots: [
        s("bb-bench", "horizontal_press", 3, 5, 8),
        s("bb-ohp", "vertical_press", 3, 6, 10),
        s("db-incline-bench", "horizontal_press", 3, 8, 12),
        s("cable-pushdown", "elbow_extension", 3, 10, 15),
        s("db-lateral-raise", "lateral_raise", 3, 12, 20, 1),
      ],
    },
    {
      name: "Pull",
      slots: [
        s("bb-row", "horizontal_pull", 3, 6, 10),
        s("lat-pulldown", "vertical_pull", 3, 8, 12),
        s("seated-cable-row", "horizontal_pull", 3, 10, 15),
        s("bb-curl", "elbow_flexion", 3, 8, 12),
        s("reverse-pec-deck", "rear_delt", 3, 12, 20, 1),
      ],
    },
    {
      name: "Legs",
      slots: [
        s("bb-back-squat", "squat", 3, 5, 8),
        s("bb-rdl", "hinge", 3, 6, 10),
        s("leg-press", "squat", 3, 10, 15),
        s("leg-extension", "knee_extension", 3, 12, 15),
        s("seated-leg-curl", "knee_flexion", 3, 10, 15),
        s("standing-calf-raise", "calf", 4, 8, 12),
      ],
    },
  ],
};
