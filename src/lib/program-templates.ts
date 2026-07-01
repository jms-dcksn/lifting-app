// Built-in program templates users can instantiate from /program (first-run offer and the
// gallery's Templates section). Pure data, framework-free. Exercise ids and patterns must
// match `coefficients.ts` — enforced by program-templates.test.ts.
//
// The five community programs are the consistently top-rated free routines (r/Fitness wiki,
// Lift Vault, Boostcamp), mapped into this app's rep-range/RIR model:
//   - Linear progression is encoded as repMin === repMax: hitting repMax on the first set
//     triggers the weight bump in progression.ts — exactly "add weight when you hit 5x5".
//   - Percent-based work (5/3/1 waves, GZCLP tiers) is approximated with RIR targets.
//   - `weeks` is this app's 4-6 week block length, not the program's total run; these
//     routines are meant to be repeated cycle after cycle.
//   - Machine slots reference generic templates; the session flow instantiates them to a
//     brand/type variant as usual.

import type { Pattern } from "@/lib/strength/coefficients";

export interface TemplateSlot {
  exerciseId: string;
  pattern: Pattern;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number | null;
}

export interface TemplateDay {
  name: string;
  slots: TemplateSlot[];
}

export interface ProgramTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  weeks: number;
  days: TemplateDay[];
}

const s = (
  exerciseId: string,
  pattern: Pattern,
  targetSets: number,
  repMin: number,
  repMax: number,
  targetRir = 2,
  restSeconds: number | null = null,
): TemplateSlot => ({ exerciseId, pattern, targetSets, repMin, repMax, targetRir, restSeconds });

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: "ppl-simple",
    name: "Push / Pull / Legs",
    description:
      "A straightforward 3-day Push/Pull/Legs cycle: one compound-led day per movement " +
      "direction, everything double-progressed. The easiest place to start.",
    tags: ["beginner", "hypertrophy", "3-day"],
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
  },
  {
    id: "reddit-ppl",
    name: "Reddit PPL (Metallicadpa)",
    description:
      "The r/Fitness-recommended 6-day Push/Pull/Legs linear progression by u/Metallicadpa. " +
      "Main barbell lift each day progresses every session (5x5 pattern); accessories run " +
      "8-12 and 15-20. Face pulls mapped to reverse pec deck; hammer + regular curls kept " +
      "as two curl slots. Repeat the cycle for as long as it progresses.",
    tags: ["beginner", "strength", "hypertrophy", "6-day"],
    weeks: 4,
    days: [
      {
        name: "Pull A",
        slots: [
          s("bb-deadlift", "hinge", 1, 5, 8, 1, 180),
          s("lat-pulldown", "vertical_pull", 3, 8, 12),
          s("seated-cable-row", "horizontal_pull", 3, 8, 12),
          s("reverse-pec-deck", "rear_delt", 5, 15, 20, 2, 90),
          s("db-curl", "elbow_flexion", 4, 8, 12, 1, 90),
          s("cable-curl", "elbow_flexion", 4, 8, 12, 1, 90),
        ],
      },
      {
        name: "Push A",
        slots: [
          s("bb-bench", "horizontal_press", 5, 5, 5, 2, 180),
          s("bb-ohp", "vertical_press", 3, 8, 12),
          s("db-incline-bench", "horizontal_press", 3, 8, 12),
          s("cable-pushdown", "elbow_extension", 3, 8, 12, 1, 90),
          s("db-lateral-raise", "lateral_raise", 3, 15, 20, 1, 90),
          s("db-skullcrusher", "elbow_extension", 3, 8, 12, 1, 90),
        ],
      },
      {
        name: "Legs A",
        slots: [
          s("bb-back-squat", "squat", 3, 5, 5, 2, 180),
          s("bb-rdl", "hinge", 3, 8, 12),
          s("leg-press", "squat", 3, 8, 12),
          s("seated-leg-curl", "knee_flexion", 3, 8, 12, 2, 90),
          s("standing-calf-raise", "calf", 5, 8, 12, 1, 90),
        ],
      },
      {
        name: "Pull B",
        slots: [
          s("bb-row", "horizontal_pull", 5, 5, 5, 2, 180),
          s("lat-pulldown", "vertical_pull", 3, 8, 12),
          s("seated-cable-row", "horizontal_pull", 3, 8, 12),
          s("reverse-pec-deck", "rear_delt", 5, 15, 20, 2, 90),
          s("db-curl", "elbow_flexion", 4, 8, 12, 1, 90),
          s("cable-curl", "elbow_flexion", 4, 8, 12, 1, 90),
        ],
      },
      {
        name: "Push B",
        slots: [
          s("bb-ohp", "vertical_press", 5, 5, 5, 2, 180),
          s("bb-bench", "horizontal_press", 3, 8, 12),
          s("db-incline-bench", "horizontal_press", 3, 8, 12),
          s("db-lateral-raise", "lateral_raise", 3, 15, 20, 1, 90),
          s("cable-pushdown", "elbow_extension", 3, 8, 12, 1, 90),
          s("db-skullcrusher", "elbow_extension", 3, 8, 12, 1, 90),
        ],
      },
      {
        name: "Legs B",
        slots: [
          s("bb-back-squat", "squat", 3, 5, 5, 2, 180),
          s("bb-rdl", "hinge", 3, 8, 12),
          s("leg-press", "squat", 3, 8, 12),
          s("seated-leg-curl", "knee_flexion", 3, 8, 12, 2, 90),
          s("standing-calf-raise", "calf", 5, 8, 12, 1, 90),
        ],
      },
    ],
  },
  {
    id: "gzclp",
    name: "GZCLP",
    description:
      "Cody Lefever's GZCL linear progression, the r/Fitness step after a basic 5x5. " +
      "Each day: one T1 heavy compound (5 sets of 3-5), one T2 volume compound (3 sets of " +
      "6-10), one T3 pump accessory (3 sets of 15-20). Repeat the cycle.",
    tags: ["beginner", "strength", "4-day"],
    weeks: 4,
    days: [
      {
        name: "A1 · Squat",
        slots: [
          s("bb-back-squat", "squat", 5, 3, 5, 1, 180),
          s("bb-bench", "horizontal_press", 3, 6, 10, 2, 120),
          s("lat-pulldown", "vertical_pull", 3, 15, 20, 1, 90),
        ],
      },
      {
        name: "B1 · OHP",
        slots: [
          s("bb-ohp", "vertical_press", 5, 3, 5, 1, 180),
          s("bb-deadlift", "hinge", 3, 6, 10, 2, 120),
          s("db-row", "horizontal_pull", 3, 15, 20, 1, 90),
        ],
      },
      {
        name: "A2 · Bench",
        slots: [
          s("bb-bench", "horizontal_press", 5, 3, 5, 1, 180),
          s("bb-back-squat", "squat", 3, 6, 10, 2, 120),
          s("lat-pulldown", "vertical_pull", 3, 15, 20, 1, 90),
        ],
      },
      {
        name: "B2 · Deadlift",
        slots: [
          s("bb-deadlift", "hinge", 5, 3, 5, 1, 180),
          s("bb-ohp", "vertical_press", 3, 6, 10, 2, 120),
          s("db-row", "horizontal_pull", 3, 15, 20, 1, 90),
        ],
      },
    ],
  },
  {
    id: "531-bbb",
    name: "5/3/1 Boring But Big",
    description:
      "Jim Wendler's most popular 5/3/1 template. One heavy main lift per day (mapped here " +
      "to 3 sets of 3-5 near-max), then 5x10 of the same lift at an easy load (BBB " +
      "supplemental, RIR ~3), plus one assistance movement. Canonical cycle is 3 weeks + " +
      "deload; repeat.",
    tags: ["intermediate", "strength", "hypertrophy", "4-day"],
    weeks: 4,
    days: [
      {
        name: "OHP Day",
        slots: [
          s("bb-ohp", "vertical_press", 3, 3, 5, 1, 180),
          s("bb-ohp", "vertical_press", 5, 10, 12, 3, 90),
          s("lat-pulldown", "vertical_pull", 5, 10, 12, 2, 90),
        ],
      },
      {
        name: "Deadlift Day",
        slots: [
          s("bb-deadlift", "hinge", 3, 3, 5, 1, 180),
          s("bb-deadlift", "hinge", 5, 10, 12, 3, 90),
          s("cable-crunch", "core", 5, 10, 15, 2, 60),
        ],
      },
      {
        name: "Bench Day",
        slots: [
          s("bb-bench", "horizontal_press", 3, 3, 5, 1, 180),
          s("bb-bench", "horizontal_press", 5, 10, 12, 3, 90),
          s("db-row", "horizontal_pull", 5, 10, 12, 2, 90),
        ],
      },
      {
        name: "Squat Day",
        slots: [
          s("bb-back-squat", "squat", 3, 3, 5, 1, 180),
          s("bb-back-squat", "squat", 5, 10, 12, 3, 90),
          s("seated-leg-curl", "knee_flexion", 5, 10, 15, 2, 60),
        ],
      },
    ],
  },
  {
    id: "phul",
    name: "PHUL",
    description:
      "Brandon Campbell's Power Hypertrophy Upper Lower: every muscle twice a week — two " +
      "heavy power days (3-5 reps on compounds), two hypertrophy days (8-15 reps). Walking " +
      "lunges mapped to hack squat (no lunge in catalog); flyes to pec deck.",
    tags: ["intermediate", "strength", "hypertrophy", "4-day"],
    weeks: 4,
    days: [
      {
        name: "Upper Power",
        slots: [
          s("bb-bench", "horizontal_press", 4, 3, 5, 1, 180),
          s("db-incline-bench", "horizontal_press", 4, 6, 10, 2, 120),
          s("bb-row", "horizontal_pull", 4, 3, 5, 1, 180),
          s("lat-pulldown", "vertical_pull", 4, 6, 10, 2, 120),
          s("bb-ohp", "vertical_press", 3, 5, 8, 2, 120),
          s("bb-curl", "elbow_flexion", 3, 6, 10, 1, 90),
          s("db-skullcrusher", "elbow_extension", 3, 6, 10, 1, 90),
        ],
      },
      {
        name: "Lower Power",
        slots: [
          s("bb-back-squat", "squat", 4, 3, 5, 1, 180),
          s("bb-deadlift", "hinge", 4, 3, 5, 1, 180),
          s("leg-press", "squat", 4, 10, 15, 2, 120),
          s("seated-leg-curl", "knee_flexion", 4, 6, 10, 2, 90),
          s("standing-calf-raise", "calf", 4, 6, 10, 1, 60),
        ],
      },
      {
        name: "Upper Hypertrophy",
        slots: [
          s("bb-incline-bench", "horizontal_press", 4, 8, 12, 2, 120),
          s("pec-deck", "horizontal_press", 4, 8, 12, 1, 90),
          s("seated-cable-row", "horizontal_pull", 4, 8, 12, 2, 90),
          s("db-row", "horizontal_pull", 4, 8, 12, 2, 90),
          s("db-lateral-raise", "lateral_raise", 4, 8, 12, 1, 60),
          s("db-curl", "elbow_flexion", 4, 8, 12, 1, 60),
          s("cable-pushdown", "elbow_extension", 4, 8, 12, 1, 60),
        ],
      },
      {
        name: "Lower Hypertrophy",
        slots: [
          s("bb-front-squat", "squat", 4, 8, 12, 2, 150),
          s("hack-squat", "squat", 4, 8, 12, 2, 120),
          s("leg-extension", "knee_extension", 4, 10, 15, 1, 90),
          s("seated-leg-curl", "knee_flexion", 4, 10, 15, 1, 90),
          s("standing-calf-raise", "calf", 4, 8, 12, 1, 60),
        ],
      },
    ],
  },
  {
    id: "phat",
    name: "PHAT (Layne Norton)",
    description:
      "Layne Norton's 5-day Power Hypertrophy Adaptive Training: two power days (3-5 rep " +
      "compounds), three hypertrophy days (8-20 reps, high volume). Speed work replaced " +
      "with straight hypertrophy sets; rack chins/dips mapped to nearest catalog movements.",
    tags: ["advanced", "hypertrophy", "strength", "5-day"],
    weeks: 4,
    days: [
      {
        name: "Upper Power",
        slots: [
          s("bb-row", "horizontal_pull", 3, 3, 5, 1, 180),
          s("weighted-pullup", "vertical_pull", 2, 6, 10, 2, 120),
          s("machine-row", "horizontal_pull", 2, 6, 10, 2, 120),
          s("db-bench", "horizontal_press", 3, 3, 5, 1, 180),
          s("db-shoulder-press", "vertical_press", 3, 3, 5, 1, 150),
          s("bb-curl", "elbow_flexion", 3, 6, 10, 1, 90),
          s("db-skullcrusher", "elbow_extension", 3, 6, 10, 1, 90),
        ],
      },
      {
        name: "Lower Power",
        slots: [
          s("bb-back-squat", "squat", 3, 3, 5, 1, 180),
          s("hack-squat", "squat", 2, 6, 10, 2, 120),
          s("leg-extension", "knee_extension", 2, 6, 10, 2, 90),
          s("bb-rdl", "hinge", 3, 5, 8, 1, 150),
          s("seated-leg-curl", "knee_flexion", 2, 6, 10, 2, 90),
          s("standing-calf-raise", "calf", 3, 6, 10, 1, 60),
        ],
      },
      {
        name: "Back & Shoulders Hypertrophy",
        slots: [
          s("bb-row", "horizontal_pull", 4, 8, 12, 2, 120),
          s("lat-pulldown", "vertical_pull", 3, 8, 12, 2, 90),
          s("seated-cable-row", "horizontal_pull", 3, 8, 12, 2, 90),
          s("db-row", "horizontal_pull", 2, 12, 15, 1, 90),
          s("high-row", "vertical_pull", 2, 15, 20, 1, 90),
          s("db-shoulder-press", "vertical_press", 3, 8, 12, 2, 90),
          s("cable-lateral-raise", "lateral_raise", 2, 12, 15, 1, 60),
          s("db-lateral-raise", "lateral_raise", 3, 12, 20, 1, 60),
        ],
      },
      {
        name: "Lower Hypertrophy",
        slots: [
          s("bb-back-squat", "squat", 4, 8, 12, 2, 150),
          s("hack-squat", "squat", 3, 8, 12, 2, 120),
          s("leg-press", "squat", 2, 12, 15, 2, 120),
          s("leg-extension", "knee_extension", 3, 15, 20, 1, 60),
          s("bb-rdl", "hinge", 3, 8, 12, 2, 120),
          s("seated-leg-curl", "knee_flexion", 2, 12, 15, 1, 90),
          s("standing-calf-raise", "calf", 4, 12, 20, 1, 60),
        ],
      },
      {
        name: "Chest & Arms Hypertrophy",
        slots: [
          s("db-bench", "horizontal_press", 4, 8, 12, 2, 120),
          s("db-incline-bench", "horizontal_press", 3, 8, 12, 2, 90),
          s("machine-chest-press", "horizontal_press", 3, 12, 15, 2, 90),
          s("pec-deck", "horizontal_press", 2, 15, 20, 1, 60),
          s("bb-curl", "elbow_flexion", 3, 8, 12, 1, 60),
          s("db-curl", "elbow_flexion", 2, 12, 15, 1, 60),
          s("cable-curl", "elbow_flexion", 2, 15, 20, 1, 60),
          s("db-skullcrusher", "elbow_extension", 3, 8, 12, 1, 60),
          s("cable-pushdown", "elbow_extension", 2, 12, 15, 1, 60),
        ],
      },
    ],
  },
];

export const TEMPLATE_BY_ID: Record<string, ProgramTemplate> = Object.fromEntries(
  PROGRAM_TEMPLATES.map((t) => [t.id, t]),
);
