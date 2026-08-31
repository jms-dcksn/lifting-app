// Built-in program templates users can instantiate from /program (first-run offer and the
// gallery's Templates section). Pure data, framework-free. Exercise ids and patterns must
// match `coefficients.ts` — enforced by program-templates.test.ts.
//
// The five community programs are the consistently top-rated free routines (r/Fitness wiki,
// Lift Vault, Boostcamp), mapped into this app's rep-range/RIR model:
//   - Linear progression is encoded as repMin === repMax: hitting repMax on the first set
//     triggers the weight bump in progression.ts — exactly "add weight when you hit 5x5".
//   - Percent-based work (5/3/1 waves, GZCLP tiers) is approximated with RIR targets.
//   - `weeks` is this app's 4-12 week block length, not necessarily the program's total run; these
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
    id: "james-hit-specialization",
    name: "James · HIT Upper / Lower",
    description:
      "A 12-week, four-day HIT hypertrophy block built for 45-minute sessions with extra " +
      "delts, arms, and legs. Run in order: Upper A Tuesday, Lower A Wednesday, Upper B " +
      "Friday, Lower B Saturday. Weeks 1 and 7 calibrate at 2 RIR; weeks 2-3 and 8-9 use " +
      "1 RIR; weeks 4-5 and 10-11 use 0-1 RIR. Weeks 6 and 12 are deloads: perform half " +
      "the listed sets at 3-4 RIR. Log actual RIR on every working set.",
    tags: ["personal", "HIT", "hypertrophy", "4-day", "specialization"],
    weeks: 12,
    days: [
      {
        name: "Tue · Upper A",
        slots: [
          s("bb-incline-bench", "horizontal_press", 2, 6, 10, 1, 150),
          s("lat-pulldown", "vertical_pull", 2, 8, 12, 1, 120),
          s("machine-row", "horizontal_pull", 2, 8, 12, 1, 120),
          s("machine-shoulder-press", "vertical_press", 1, 8, 12, 1, 120),
          s("cable-lateral-raise", "lateral_raise", 2, 12, 20, 1, 75),
          s("cable-curl", "elbow_flexion", 2, 8, 12, 1, 75),
          s("cable-pushdown", "elbow_extension", 2, 8, 12, 1, 75),
        ],
      },
      {
        name: "Wed · Lower A",
        slots: [
          s("seated-leg-curl", "knee_flexion", 2, 8, 12, 1, 90),
          s("hack-squat", "squat", 2, 6, 10, 1, 180),
          s("leg-press", "squat", 1, 10, 15, 1, 150),
          s("leg-extension", "knee_extension", 1, 10, 15, 1, 90),
          s("standing-calf-raise", "calf", 2, 8, 12, 1, 75),
          s("cable-lateral-raise", "lateral_raise", 2, 12, 20, 1, 75),
        ],
      },
      {
        name: "Fri · Upper B",
        slots: [
          s("machine-shoulder-press", "vertical_press", 1, 6, 10, 1, 150),
          s("weighted-pullup", "vertical_pull", 1, 6, 10, 1, 150),
          s("machine-chest-press", "horizontal_press", 1, 8, 12, 1, 120),
          s("seated-cable-row", "horizontal_pull", 1, 10, 15, 1, 120),
          s("cable-lateral-raise", "lateral_raise", 2, 12, 20, 1, 75),
          s("reverse-pec-deck", "rear_delt", 1, 12, 20, 1, 75),
          s("bb-curl", "elbow_flexion", 2, 8, 12, 1, 90),
          s("db-skullcrusher", "elbow_extension", 2, 8, 12, 1, 90),
          s("db-curl", "elbow_flexion", 1, 10, 15, 1, 75),
          s("cable-pushdown", "elbow_extension", 1, 10, 15, 1, 75),
        ],
      },
      {
        name: "Sat · Lower B",
        slots: [
          s("bb-rdl", "hinge", 2, 6, 10, 1, 180),
          s("hack-squat", "squat", 2, 8, 12, 1, 150),
          s("db-split-squat", "lunge", 1, 8, 12, 1, 120),
          s("seated-leg-curl", "knee_flexion", 2, 8, 12, 1, 90),
          s("leg-extension", "knee_extension", 1, 12, 15, 1, 90),
          s("standing-calf-raise", "calf", 2, 10, 15, 1, 75),
          s("reverse-pec-deck", "rear_delt", 2, 12, 20, 1, 75),
        ],
      },
    ],
  },
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
    id: "kino-strength-density",
    name: "Ripped Artiste — Strength & Density",
    description:
      "Greg O'Gallagher's Kinobody Ripped Artiste, Protocol One. Three heavy, low-volume " +
      "days a week built around big progressive lifts. The original uses Reverse Pyramid " +
      "Training (top set heavy, drop ~10-15% per set) — this app double-progresses instead, " +
      "so the near-failure top-set intent is encoded as low RIR over the 6-10 range with long " +
      "rest. Incline press mapped to barbell incline; chin-ups to weighted pull-ups; chest " +
      "fly to pec deck; face pulls to reverse pec deck. Repeat the cycle as long as it climbs.",
    tags: ["intermediate", "strength", "3-day", "kinobody"],
    weeks: 5,
    days: [
      {
        name: "Upper Body A",
        slots: [
          s("bb-incline-bench", "horizontal_press", 3, 6, 10, 1, 180),
          s("bb-curl", "elbow_flexion", 3, 6, 10, 1, 120),
          s("db-skullcrusher", "elbow_extension", 2, 8, 10, 1, 120),
          s("db-lateral-raise", "lateral_raise", 2, 6, 10, 1, 90),
        ],
      },
      {
        name: "Lower Body",
        slots: [
          s("db-split-squat", "lunge", 3, 6, 8, 2, 150),
          s("bb-rdl", "hinge", 3, 8, 10, 2, 150),
          s("leg-extension", "knee_extension", 2, 8, 12, 1, 90),
          s("bb-shrug", "traps", 2, 10, 15, 1, 90),
        ],
      },
      {
        name: "Upper Body C",
        slots: [
          s("bb-ohp", "vertical_press", 3, 6, 10, 1, 180),
          s("weighted-pullup", "vertical_pull", 3, 4, 10, 1, 150),
          s("pec-deck", "horizontal_press", 2, 6, 10, 1, 90),
          s("reverse-pec-deck", "rear_delt", 2, 6, 10, 1, 90),
        ],
      },
    ],
  },
  {
    id: "kino-physique-mastery",
    name: "Ripped Artiste — Physique Mastery",
    description:
      "Greg O'Gallagher's Kinobody Ripped Artiste, Protocol Two. Same three days and heavy " +
      "progression as Strength & Density, with a little more isolation for detail and " +
      "fullness — two upper days and one leg day. Reverse-Pyramid intent encoded as low RIR " +
      "over 6-10; each day's final rest-pause set is modeled as a single near-failure set " +
      "(RIR 0). Optionally add Machine Crunches (2x8-12) on either upper day for direct abs.",
    tags: ["intermediate", "hypertrophy", "3-day", "kinobody"],
    weeks: 5,
    days: [
      {
        name: "Upper Body A",
        slots: [
          s("bb-incline-bench", "horizontal_press", 3, 6, 10, 1, 180),
          s("bb-curl", "elbow_flexion", 3, 6, 10, 1, 120),
          s("db-skullcrusher", "elbow_extension", 2, 6, 10, 1, 90),
          s("seated-cable-row", "horizontal_pull", 2, 6, 10, 2, 120),
          s("db-lateral-raise", "lateral_raise", 1, 6, 10, 0, 90),
        ],
      },
      {
        name: "Lower Body",
        slots: [
          s("standing-calf-raise", "calf", 2, 6, 10, 1, 90),
          s("leg-extension", "knee_extension", 2, 6, 10, 1, 90),
          s("db-step-up", "lunge", 2, 6, 10, 2, 120),
          s("back-extension", "hinge", 2, 8, 12, 2, 90),
          s("cable-shrug", "traps", 2, 8, 12, 1, 90),
        ],
      },
      {
        name: "Upper Body B",
        slots: [
          s("bb-ohp", "vertical_press", 2, 6, 10, 1, 150),
          s("lat-pulldown", "vertical_pull", 2, 6, 10, 2, 120),
          s("pec-deck", "horizontal_press", 2, 6, 10, 1, 90),
          s("cable-pushdown", "elbow_extension", 2, 6, 10, 1, 90),
          s("reverse-pec-deck", "rear_delt", 1, 6, 10, 0, 90),
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
  // --- Programs transcribed from docs/ (Nippard spreadsheets/PDF + Kinobody PDF). ---
  // Same mapping conventions as above: RIR = 10 - RPE, dropsets/intensity techniques
  // encoded as straight near-failure sets, specialty variations mapped to the nearest
  // catalog movement, stretch holds and unloadable AMRAP push-ups dropped.
  {
    id: "essentials-3x",
    name: "Essentials 3x (Jeff Nippard)",
    description:
      "Jeff Nippard's Essentials Program, 3 days: Full Body / Upper / Lower. One heavy " +
      "top set plus a back-off on the main lift, then tight accessory volume near failure. " +
      "Dropsets encoded as straight RIR-0 sets; T-bar row mapped to machine row, seated calf " +
      "raise to standing calf raise, EZ-bar work to barbell/dumbbell equivalents.",
    tags: ["intermediate", "hypertrophy", "3-day", "nippard"],
    weeks: 4,
    days: [
      {
        name: "Full Body",
        slots: [
          s("hack-squat", "squat", 1, 4, 6, 1, 180),
          s("hack-squat", "squat", 1, 8, 10, 1, 180),
          s("db-incline-bench", "horizontal_press", 2, 8, 10, 1, 120),
          s("seated-leg-curl", "knee_flexion", 1, 10, 12, 0, 90),
          s("machine-row", "horizontal_pull", 2, 10, 12, 1, 90),
          s("db-curl", "elbow_flexion", 1, 12, 15, 0, 90),
          s("db-lateral-raise", "lateral_raise", 1, 12, 15, 0, 90),
          s("cable-crunch", "core", 1, 12, 15, 0, 90),
        ],
      },
      {
        name: "Upper",
        slots: [
          s("db-bench", "horizontal_press", 1, 4, 6, 1, 180),
          s("db-bench", "horizontal_press", 1, 8, 10, 1, 180),
          s("lat-pulldown", "vertical_pull", 2, 10, 12, 1, 120),
          s("db-shoulder-press", "vertical_press", 2, 10, 12, 1, 120),
          s("seated-cable-row", "horizontal_pull", 2, 10, 12, 1, 120),
          s("db-skullcrusher", "elbow_extension", 2, 12, 15, 0, 60),
          s("bb-curl", "elbow_flexion", 2, 12, 15, 0, 90),
        ],
      },
      {
        name: "Lower",
        slots: [
          s("bb-rdl", "hinge", 2, 10, 12, 1, 120),
          s("leg-press", "squat", 3, 10, 12, 1, 120),
          s("leg-extension", "knee_extension", 1, 10, 12, 1, 90),
          s("standing-calf-raise", "calf", 2, 12, 15, 0, 60),
          s("cable-crunch", "core", 2, 12, 15, 0, 90),
        ],
      },
    ],
  },
  {
    id: "essentials-4x",
    name: "Essentials 4x (Jeff Nippard)",
    description:
      "Jeff Nippard's Essentials Program, 4 days: Upper / Lower / Upper / Lower. Same " +
      "heavy-top-set-plus-back-off structure and mappings as the 3x version; cable chest " +
      "press mapped to machine chest press, hanging leg raise to cable crunch.",
    tags: ["intermediate", "hypertrophy", "4-day", "nippard"],
    weeks: 4,
    days: [
      {
        name: "Upper A",
        slots: [
          s("db-bench", "horizontal_press", 1, 4, 6, 1, 180),
          s("db-bench", "horizontal_press", 1, 8, 10, 1, 180),
          s("lat-pulldown", "vertical_pull", 2, 10, 12, 1, 120),
          s("db-shoulder-press", "vertical_press", 2, 10, 12, 1, 120),
          s("seated-cable-row", "horizontal_pull", 2, 10, 12, 1, 120),
          s("db-skullcrusher", "elbow_extension", 2, 12, 15, 0, 60),
          s("bb-curl", "elbow_flexion", 2, 12, 15, 0, 90),
        ],
      },
      {
        name: "Lower A",
        slots: [
          s("hack-squat", "squat", 1, 4, 6, 1, 180),
          s("hack-squat", "squat", 1, 8, 10, 1, 180),
          s("seated-leg-curl", "knee_flexion", 1, 10, 12, 0, 90),
          s("standing-calf-raise", "calf", 2, 10, 12, 1, 60),
          s("cable-crunch", "core", 2, 10, 12, 1, 90),
        ],
      },
      {
        name: "Upper B",
        slots: [
          s("bb-row", "horizontal_pull", 2, 8, 10, 1, 120),
          s("machine-shoulder-press", "vertical_press", 2, 10, 12, 1, 120),
          s("weighted-pullup", "vertical_pull", 2, 8, 10, 1, 120),
          s("machine-chest-press", "horizontal_press", 2, 10, 12, 1, 120),
          s("cable-curl", "elbow_flexion", 2, 12, 15, 0, 60),
          s("cable-pushdown", "elbow_extension", 2, 12, 15, 0, 90),
          s("db-lateral-raise", "lateral_raise", 1, 12, 15, 0, 90),
        ],
      },
      {
        name: "Lower B",
        slots: [
          s("bb-rdl", "hinge", 2, 10, 12, 1, 120),
          s("leg-press", "squat", 3, 10, 12, 1, 120),
          s("leg-extension", "knee_extension", 1, 10, 12, 1, 90),
          s("standing-calf-raise", "calf", 2, 12, 15, 0, 60),
          s("cable-crunch", "core", 2, 12, 15, 0, 90),
        ],
      },
    ],
  },
  {
    id: "essentials-5x",
    name: "Essentials 5x (Jeff Nippard)",
    description:
      "Jeff Nippard's Essentials Program, 5 days: Upper / Lower / Push / Pull / Legs. Same " +
      "structure and mappings as the 3x/4x versions; the close-grip push-up AMRAP finisher " +
      "is dropped (unloadable), facepulls mapped to reverse pec deck.",
    tags: ["intermediate", "hypertrophy", "5-day", "nippard"],
    weeks: 4,
    days: [
      {
        name: "Upper",
        slots: [
          s("db-bench", "horizontal_press", 1, 4, 6, 1, 180),
          s("db-bench", "horizontal_press", 1, 8, 10, 1, 180),
          s("lat-pulldown", "vertical_pull", 2, 10, 12, 1, 120),
          s("db-shoulder-press", "vertical_press", 2, 10, 12, 1, 120),
          s("seated-cable-row", "horizontal_pull", 2, 10, 12, 1, 120),
          s("db-skullcrusher", "elbow_extension", 2, 12, 15, 0, 60),
          s("bb-curl", "elbow_flexion", 2, 12, 15, 0, 90),
        ],
      },
      {
        name: "Lower",
        slots: [
          s("hack-squat", "squat", 1, 4, 6, 1, 180),
          s("hack-squat", "squat", 1, 8, 10, 1, 180),
          s("seated-leg-curl", "knee_flexion", 1, 10, 12, 0, 90),
          s("standing-calf-raise", "calf", 2, 10, 12, 1, 60),
          s("cable-crunch", "core", 2, 10, 12, 1, 90),
        ],
      },
      {
        name: "Push",
        slots: [
          s("machine-shoulder-press", "vertical_press", 3, 8, 10, 1, 120),
          s("machine-chest-press", "horizontal_press", 2, 10, 12, 1, 120),
          s("cable-pushdown", "elbow_extension", 2, 12, 15, 1, 90),
          s("db-lateral-raise", "lateral_raise", 2, 12, 15, 0, 90),
        ],
      },
      {
        name: "Pull",
        slots: [
          s("lat-pulldown", "vertical_pull", 1, 10, 12, 2, 90),
          s("weighted-pullup", "vertical_pull", 3, 6, 8, 1, 120),
          s("bb-row", "horizontal_pull", 2, 8, 10, 1, 120),
          s("cable-curl", "elbow_flexion", 2, 12, 15, 0, 90),
          s("reverse-pec-deck", "rear_delt", 2, 10, 12, 0, 90),
        ],
      },
      {
        name: "Legs",
        slots: [
          s("bb-rdl", "hinge", 2, 10, 12, 1, 120),
          s("leg-press", "squat", 3, 10, 12, 1, 120),
          s("leg-extension", "knee_extension", 1, 10, 12, 1, 90),
          s("standing-calf-raise", "calf", 2, 12, 15, 0, 60),
          s("cable-crunch", "core", 2, 12, 15, 0, 90),
        ],
      },
    ],
  },
  {
    id: "ultimate-ppl-4x",
    name: "Ultimate PPL 4x (Jeff Nippard)",
    description:
      "Phase 1 (Base Hypertrophy) of Jeff Nippard's Ultimate Push Pull Legs System, 4 days: " +
      "Legs / Push / Pull / Full Body. Top-set + back-off barbell work; feeder-set ramps " +
      "simplified to straight sets; specialty cable variations mapped to the nearest catalog " +
      "movement; stretch holds and AMRAP push-ups dropped. Phases 2-3 shift intensity and " +
      "volume, not structure — adjust RIR if you want to run them.",
    tags: ["intermediate", "hypertrophy", "4-day", "nippard"],
    weeks: 4,
    days: [
      {
        name: "Legs",
        slots: [
          s("bb-back-squat", "squat", 1, 2, 4, 1, 180),
          s("bb-back-squat", "squat", 2, 5, 5, 1, 180),
          s("bb-rdl", "hinge", 3, 8, 10, 1, 150),
          s("db-step-up", "lunge", 2, 10, 10, 1, 150),
          s("seated-leg-curl", "knee_flexion", 3, 10, 12, 1, 90),
          s("standing-calf-raise", "calf", 4, 10, 12, 1, 90),
          s("cable-crunch", "core", 3, 10, 12, 1, 90),
        ],
      },
      {
        name: "Push",
        slots: [
          s("bb-bench", "horizontal_press", 1, 3, 5, 1, 180),
          s("bb-bench", "horizontal_press", 2, 10, 10, 1, 180),
          s("db-shoulder-press", "vertical_press", 3, 8, 10, 1, 150),
          s("pec-deck", "horizontal_press", 2, 12, 15, 1, 90),
          s("cable-lateral-raise", "lateral_raise", 3, 12, 15, 1, 90),
          s("cable-pushdown", "elbow_extension", 3, 12, 15, 1, 90),
          s("db-skullcrusher", "elbow_extension", 2, 10, 12, 0, 90),
        ],
      },
      {
        name: "Pull",
        slots: [
          s("lat-pulldown", "vertical_pull", 4, 10, 10, 2, 150),
          s("machine-row", "horizontal_pull", 3, 10, 12, 1, 150),
          s("reverse-pec-deck", "rear_delt", 3, 12, 15, 1, 90),
          s("bb-curl", "elbow_flexion", 3, 6, 8, 1, 90),
          s("cable-curl", "elbow_flexion", 2, 10, 12, 0, 90),
        ],
      },
      {
        name: "Full Body",
        slots: [
          s("bb-deadlift", "hinge", 1, 5, 5, 1, 180),
          s("bb-rdl", "hinge", 2, 8, 8, 1, 180),
          s("bb-incline-bench", "horizontal_press", 3, 8, 12, 1, 180),
          s("weighted-pullup", "vertical_pull", 2, 8, 10, 1, 150),
          s("leg-press", "squat", 3, 10, 12, 1, 150),
          s("db-row", "horizontal_pull", 2, 10, 12, 1, 150),
        ],
      },
    ],
  },
  {
    id: "pure-bodybuilding-ul",
    name: "Pure Bodybuilding Upper/Lower (Jeff Nippard)",
    description:
      "The 5-week Build Phase of Jeff Nippard's Pure Bodybuilding Program, Upper/Lower " +
      "split, 5 days: two upper days, two lower days, and an arms + weak-point day. " +
      "Intensity techniques (myo-reps, dropsets, long-length partials) encoded as straight " +
      "RIR 0-1 sets; assisted pull-ups/dips log assistance as negative added weight; hip " +
      "adduction and the choose-your-own weak-point slots are omitted — add your own.",
    tags: ["advanced", "hypertrophy", "5-day", "nippard"],
    weeks: 5,
    days: [
      {
        name: "Upper #1",
        slots: [
          s("cable-lateral-raise", "lateral_raise", 3, 10, 12, 1, 90),
          s("lat-pulldown", "vertical_pull", 3, 10, 12, 1, 150),
          s("bb-incline-bench", "horizontal_press", 4, 8, 10, 1, 150),
          s("machine-row", "horizontal_pull", 3, 8, 10, 1, 150),
          s("cable-pushdown", "elbow_extension", 2, 8, 10, 1, 150),
          s("lat-pulldown", "vertical_pull", 3, 12, 15, 1, 90),
          s("pec-deck", "horizontal_press", 3, 12, 15, 1, 90),
        ],
      },
      {
        name: "Lower #1",
        slots: [
          s("seated-leg-curl", "knee_flexion", 3, 8, 10, 1, 150),
          s("hack-squat", "squat", 3, 4, 8, 1, 180),
          s("leg-extension", "knee_extension", 3, 10, 12, 1, 90),
          s("standing-calf-raise", "calf", 3, 12, 15, 1, 90),
        ],
      },
      {
        name: "Upper #2",
        slots: [
          s("seated-cable-row", "horizontal_pull", 3, 10, 12, 1, 90),
          s("machine-shoulder-press", "vertical_press", 3, 10, 12, 1, 90),
          s("weighted-pullup", "vertical_pull", 3, 8, 10, 1, 150),
          s("weighted-dip", "horizontal_press", 3, 8, 10, 1, 150),
          s("db-curl", "elbow_flexion", 2, 10, 12, 1, 90),
          s("db-lateral-raise", "lateral_raise", 3, 12, 15, 1, 60),
          s("reverse-pec-deck", "rear_delt", 3, 10, 12, 0, 90),
        ],
      },
      {
        name: "Lower #2",
        slots: [
          s("seated-leg-curl", "knee_flexion", 3, 8, 10, 1, 90),
          s("leg-press", "squat", 3, 8, 8, 1, 90),
          s("bb-rdl", "hinge", 2, 8, 8, 3, 180),
          s("leg-extension", "knee_extension", 3, 10, 12, 2, 60),
          s("standing-calf-raise", "calf", 3, 10, 12, 1, 90),
        ],
      },
      {
        name: "Arms & Weak Points",
        slots: [
          s("cable-curl", "elbow_flexion", 3, 10, 12, 1, 90),
          s("db-skullcrusher", "elbow_extension", 3, 10, 10, 1, 90),
          s("db-curl", "elbow_flexion", 2, 12, 15, 1, 90),
          s("cable-pushdown", "elbow_extension", 2, 12, 15, 1, 90),
          s("cable-crunch", "core", 3, 10, 12, 1, 90),
        ],
      },
    ],
  },
  {
    id: "warrior-shred",
    name: "Warrior Shred Protocol (Kinobody)",
    description:
      "Greg O'Gallagher's Warrior Shred lifting routine: three heavy, low-volume days — " +
      "chest/biceps/rear delts, lower body/abs, shoulders/back/triceps — each muscle hit " +
      "hard once a week. Reverse Pyramid Training encoded as low RIR over the rep range " +
      "with long rest, as with the Ripped Artiste protocols. Bent-over flyes mapped to " +
      "reverse pec deck, side-to-side knee raises to cable crunch, one-arm overhead " +
      "triceps to dumbbell skullcrusher.",
    tags: ["intermediate", "strength", "3-day", "kinobody"],
    weeks: 4,
    days: [
      {
        name: "Chest & Arms",
        slots: [
          s("db-incline-bench", "horizontal_press", 2, 6, 10, 1, 180),
          s("weighted-dip", "horizontal_press", 1, 8, 10, 1, 180),
          s("db-curl", "elbow_flexion", 3, 4, 8, 1, 150),
          s("reverse-pec-deck", "rear_delt", 2, 8, 15, 1, 120),
        ],
      },
      {
        name: "Lower Body & Abs",
        slots: [
          s("db-split-squat", "lunge", 3, 6, 8, 1, 180),
          s("bb-rdl", "hinge", 3, 10, 12, 1, 180),
          s("leg-extension", "knee_extension", 2, 10, 12, 1, 120),
          s("cable-crunch", "core", 2, 10, 15, 1, 120),
        ],
      },
      {
        name: "Shoulders & Back",
        slots: [
          s("db-shoulder-press", "vertical_press", 2, 6, 10, 1, 180),
          s("weighted-pullup", "vertical_pull", 2, 4, 6, 1, 180),
          s("db-skullcrusher", "elbow_extension", 2, 8, 12, 1, 120),
          s("db-lateral-raise", "lateral_raise", 2, 8, 15, 1, 90),
        ],
      },
    ],
  },
];

export const TEMPLATE_BY_ID: Record<string, ProgramTemplate> = Object.fromEntries(
  PROGRAM_TEMPLATES.map((t) => [t.id, t]),
);
