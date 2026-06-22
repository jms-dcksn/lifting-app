# Machine Brands, Types, and Custom Exercises — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user identify a machine by brand + type (each its own progression chain) and add custom exercises, by activating the dormant `exercise` table and a merged seeded+DB catalog.

**Architecture:** Exercise identity gains a layer — generic *templates* (seeded in `coefficients.ts`), *variants* (template × brand × machine_type, rows in the `exercise` table), and *custom exercises* (also `exercise` rows). A new `src/lib/catalog.ts` merges seeded templates with the user's DB rows into the `Record<id, ExerciseDef>` the pure engine already consumes; that merged map is threaded through every screen that today imports the static `EXERCISE_BY_ID`. Machines collapse from `machine_plate`/`machine_pin` to one `machine` equipment; `machine_type` is an identity attribute, not engine math.

**Tech Stack:** Next.js 16 (App Router, Server Actions, React 19), Supabase (Postgres + RLS), TypeScript, vitest. Supabase project id `jtcppebmosaffaajtgow`.

## Global Constraints

- Next.js 16: middleware lives in `src/proxy.ts`; auth uses `supabase.auth.getClaims()` — never `getUser()`/`getSession()`.
- Apply migrations via the Supabase MCP `apply_migration`, then **hand-edit** `src/lib/supabase/types.ts` (do not regenerate).
- Tests are vitest, scoped to `src/lib/**/*.test.ts` (node env, `@/` alias). Co-locate `*.test.ts` next to the module. UI and server actions are **not** unit-tested — verify them with `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a manual pass.
- `set_log` is the source of truth; `user_exercise_stat` is a rebuildable cache — never let it drift.
- Every table has RLS keyed on `auth.uid()`; every row carries `user_id`.
- No emojis. Keep comments concise.
- Verification commands (run from repo root): `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Commit message footer line: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Definitions used across tasks

**The 13 seeded slugs that change** (Task 2):

| Old id(s)                            | New generic template id   | Pattern          | coeff | incr |
|--------------------------------------|---------------------------|------------------|-------|------|
| `hs-chest-press`, `lf-chest-press`   | `machine-chest-press`     | horizontal_press | 0.9   | 5    |
| `pec-deck` (kept id)                 | `pec-deck`                | horizontal_press | 0.5   | 10   |
| `hs-shoulder-press`, `lf-shoulder-press` | `machine-shoulder-press` | vertical_press | 0.95  | 5    |
| `hs-iso-row`                         | `machine-row`             | horizontal_pull  | 0.9   | 5    |
| `hs-high-row`                        | `high-row`                | vertical_pull    | 1.1   | 5    |
| `hoist-lat-pulldown` (removed)       | — (use cable `lat-pulldown` or add custom) | — | — | — |
| `hack-squat` (kept id)               | `hack-squat`              | squat            | 1.1   | 10   |
| `leg-press` (kept id)                | `leg-press`               | squat            | 2.5   | 10   |
| `hs-glute-drive`                     | `glute-drive`             | hip_thrust       | 0.9   | 10   |
| `leg-extension` (kept id, ref)       | `leg-extension`           | knee_extension   | 1.0   | 10   |
| `seated-leg-curl` (kept id, ref)     | `seated-leg-curl`         | knee_flexion     | 1.0   | 10   |
| `standing-calf-raise` (kept id, ref) | `standing-calf-raise`     | calf             | 1.0   | 10   |
| `reverse-pec-deck` (kept id, ref)    | `reverse-pec-deck`        | rear_delt        | 1.0   | 10   |

All 13 are `equipment: "machine"`, `needsCalibration: true`, `machineTemplate: true`, and carry **no** `brand`. `seed.ts` references only kept ids (`reverse-pec-deck`, `leg-press`, `leg-extension`, `seated-leg-curl`, `standing-calf-raise`) — **no seed changes needed**.

**New `core` pattern** anchor: `cable-crunch` (core, cable, coeff 1.0, `isReference: true`, `needsCalibration: true`, increment 10).

**Brand list** (`KNOWN_BRANDS`): `Hammer Strength`, `Life Fitness`, `Cybex`, `Hoist`, `Technogym`, `Precor`, `Matrix`, `Nautilus`. Plus a free-text "Other".

---

### Task 1: Migration 0008 + DB types

**Files:**
- Create: `supabase/migrations/0008_machine_variants.sql`
- Modify: `src/lib/supabase/types.ts` (the `exercise` table `Row`/`Insert`/`Update`)

**Interfaces:**
- Produces: `exercise.machine_type text | null`, `exercise.base_exercise_id text | null`, unique index `exercise_variant_unique`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_machine_variants.sql`:

```sql
-- Machine variants & custom exercises: activate the dormant `exercise` table.
-- machine_type is an identity attribute (selectorized | plate_loaded), not engine math.
-- base_exercise_id is the seeded template a variant derives from; null for fully custom.

alter table exercise add column machine_type text;
alter table exercise add column base_exercise_id text;

-- One variant per (user, template, brand, type). Coalesce so nulls collapse (Postgres
-- treats NULLs as distinct, which would otherwise allow duplicates).
create unique index exercise_variant_unique on exercise (
  user_id, base_exercise_id, coalesce(brand, ''), coalesce(machine_type, '')
) where base_exercise_id is not null;

comment on column exercise.equipment is 'barbell|dumbbell|cable|machine|bodyweight';
comment on column exercise.machine_type is 'selectorized|plate_loaded|null';
comment on column exercise.base_exercise_id is 'seeded template id, or null for fully custom';
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool against project `jtcppebmosaffaajtgow` with name `0008_machine_variants` and the SQL above. Confirm success via `list_migrations` (it should list `0008_machine_variants`).

- [ ] **Step 3: Hand-edit `types.ts`**

In `src/lib/supabase/types.ts`, find the `exercise` table block (`Tables.exercise`). Add `machine_type` and `base_exercise_id` to all three of `Row`, `Insert`, `Update`:

```ts
// In Row:
          machine_type: string | null
          base_exercise_id: string | null
// In Insert:
          machine_type?: string | null
          base_exercise_id?: string | null
// In Update:
          machine_type?: string | null
          base_exercise_id?: string | null
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_machine_variants.sql src/lib/supabase/types.ts
git commit -m "feat: migration 0008 — machine variants & custom exercises

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Catalog types & machine templates (`coefficients.ts`)

**Files:**
- Modify: `src/lib/strength/coefficients.ts`
- Modify: `src/lib/strength/recommend.test.ts:22,24,28,29,35,36,37,99` (rename `hs-chest-press` → `machine-chest-press`)
- Create: `src/lib/strength/coefficients.test.ts`

**Interfaces:**
- Produces:
  - `type Equipment = "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight"`
  - `type MachineType = "selectorized" | "plate_loaded"`
  - `type Brand = string`
  - `const KNOWN_BRANDS: readonly string[]`
  - `const MACHINE_TYPE_LABEL: Record<MachineType, string>`
  - `Pattern` adds `"core"`
  - `interface ExerciseDef` adds `machineType?: MachineType`, `baseExerciseId?: string`, `machineTemplate?: boolean`
  - The 13 machine templates + `cable-crunch` exist in `EXERCISES`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/strength/coefficients.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EXERCISES, EXERCISE_BY_ID, KNOWN_BRANDS, PATTERN_LABEL } from "./coefficients";

describe("catalog templates", () => {
  it("collapses machine equipment to a single 'machine' value", () => {
    const equipments = new Set(EXERCISES.map((e) => e.equipment));
    expect(equipments.has("machine" as never)).toBe(true);
    expect([...equipments]).not.toContain("machine_plate");
    expect([...equipments]).not.toContain("machine_pin");
  });

  it("flags every machine template and gives it no brand", () => {
    for (const e of EXERCISES.filter((e) => e.equipment === "machine")) {
      expect(e.machineTemplate, `${e.id} machineTemplate`).toBe(true);
      expect(e.needsCalibration, `${e.id} needsCalibration`).toBe(true);
      expect(e.brand, `${e.id} brand`).toBeUndefined();
    }
  });

  it("exposes the generic chest-press template", () => {
    const def = EXERCISE_BY_ID["machine-chest-press"];
    expect(def).toBeDefined();
    expect(def.pattern).toBe("horizontal_press");
    expect(def.coefficient).toBe(0.9);
    expect(EXERCISE_BY_ID["hs-chest-press"]).toBeUndefined();
  });

  it("adds a core pattern with a reference anchor", () => {
    expect(PATTERN_LABEL.core).toBe("Core");
    const ref = EXERCISES.find((e) => e.pattern === "core" && e.isReference);
    expect(ref?.id).toBe("cable-crunch");
  });

  it("lists the known brands", () => {
    expect(KNOWN_BRANDS).toContain("Hammer Strength");
    expect(KNOWN_BRANDS).toContain("Precor");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- coefficients`
Expected: FAIL (missing exports / old ids present).

- [ ] **Step 3: Edit `coefficients.ts` — types**

Replace the `Equipment` and `Brand` declarations and extend `Pattern` + `ExerciseDef`:

```ts
export type Pattern =
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "knee_extension"
  | "knee_flexion"
  | "hip_thrust"
  | "calf"
  | "elbow_flexion"
  | "elbow_extension"
  | "lateral_raise"
  | "rear_delt"
  | "core";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight";

export type MachineType = "selectorized" | "plate_loaded";

// Brand is open-ended (gyms have off-brands); KNOWN_BRANDS seeds the dropdown.
export type Brand = string;

export const KNOWN_BRANDS = [
  "Hammer Strength",
  "Life Fitness",
  "Cybex",
  "Hoist",
  "Technogym",
  "Precor",
  "Matrix",
  "Nautilus",
] as const;

export const MACHINE_TYPE_LABEL: Record<MachineType, string> = {
  selectorized: "Selectorized",
  plate_loaded: "Plate-loaded",
};

export interface ExerciseDef {
  id: string;
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  brand?: Brand;
  machineType?: MachineType;
  baseExerciseId?: string; // seeded template a DB variant derives from
  machineTemplate?: boolean; // seeded generic machine: must be instantiated to a variant before logging
  coefficient: number;
  isReference?: boolean;
  needsCalibration?: boolean;
  increment: number;
}
```

- [ ] **Step 4: Edit `coefficients.ts` — rewrite the machine entries**

Replace the machine/brand-baked rows with generic templates. The full machine set in `EXERCISES` becomes exactly these rows (free-weight and cable rows are unchanged; keep them as-is):

```ts
  // --- Machine templates (generic; instantiate to a brand+type variant before logging) ---
  { id: "machine-chest-press", name: "Machine Chest Press", pattern: "horizontal_press", equipment: "machine", coefficient: 0.9, needsCalibration: true, machineTemplate: true, increment: 5 },
  { id: "pec-deck", name: "Pec Deck / Chest Fly", pattern: "horizontal_press", equipment: "machine", coefficient: 0.5, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "machine-shoulder-press", name: "Machine Shoulder Press", pattern: "vertical_press", equipment: "machine", coefficient: 0.95, needsCalibration: true, machineTemplate: true, increment: 5 },
  { id: "machine-row", name: "Machine Row (ISO-Lateral)", pattern: "horizontal_pull", equipment: "machine", coefficient: 0.9, needsCalibration: true, machineTemplate: true, increment: 5 },
  { id: "high-row", name: "High Row", pattern: "vertical_pull", equipment: "machine", coefficient: 1.1, needsCalibration: true, machineTemplate: true, increment: 5 },
  { id: "hack-squat", name: "Hack Squat", pattern: "squat", equipment: "machine", coefficient: 1.1, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "leg-press", name: "Leg Press", pattern: "squat", equipment: "machine", coefficient: 2.5, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "glute-drive", name: "Glute Drive", pattern: "hip_thrust", equipment: "machine", coefficient: 0.9, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "leg-extension", name: "Leg Extension", pattern: "knee_extension", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "seated-leg-curl", name: "Seated Leg Curl", pattern: "knee_flexion", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "standing-calf-raise", name: "Standing Calf Raise", pattern: "calf", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "reverse-pec-deck", name: "Reverse Pec Deck (Rear Delt)", pattern: "rear_delt", equipment: "machine", coefficient: 1.0, isReference: true, needsCalibration: true, machineTemplate: true, increment: 10 },
  { id: "cable-crunch", name: "Cable Crunch", pattern: "core", equipment: "cable", coefficient: 1.0, isReference: true, needsCalibration: true, increment: 10 },
```

Remove these rows entirely: `hs-chest-press`, `lf-chest-press`, `hs-shoulder-press`, `lf-shoulder-press`, `hs-iso-row`, `hs-high-row`, `hoist-lat-pulldown`, and the old branded `pec-deck`/`hack-squat`/`leg-press`/`hs-glute-drive`/`leg-extension`/`seated-leg-curl`/`standing-calf-raise`/`reverse-pec-deck` rows (they are replaced above). Leave `lat-pulldown` (cable) as the vertical_pull reference unchanged.

- [ ] **Step 5: Edit `coefficients.ts` — `PATTERN_LABEL`**

Add `core` to `PATTERN_LABEL`:

```ts
  rear_delt: "Rear Delt",
  core: "Core",
```

- [ ] **Step 6: Update the header comment**

Update the logging-conventions comment block at the top: machines are now a single `machine` equipment (selectorized/pin and plate-loaded both log total load); brand and machine type live on user-created variants, not on seeded templates.

- [ ] **Step 7: Update `recommend.test.ts`**

In `src/lib/strength/recommend.test.ts`, replace every `"hs-chest-press"` with `"machine-chest-press"` (lines 22, 24, 28, 29, 35, 36, 37, 99). The coefficient is still `0.9`, so assertions are unchanged otherwise.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS (all suites, including the new `coefficients.test.ts` and the renamed ids).

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (Note: `active-session.tsx:166` `equipment.startsWith("machine")` and `equipment === "cable"` still type-check and behave correctly with the collapsed enum.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/strength/coefficients.ts src/lib/strength/coefficients.test.ts src/lib/strength/recommend.test.ts
git commit -m "feat: collapse machine equipment, add generic templates + core pattern

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Catalog merge layer (`src/lib/catalog.ts`)

**Files:**
- Create: `src/lib/catalog.ts`
- Create: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `EXERCISES`, `EXERCISE_BY_ID`, `ExerciseDef`, `Equipment`, `MachineType` from `coefficients.ts`; the Supabase server client type.
- Produces:
  - `dbExerciseToDef(row): ExerciseDef`
  - `mergeCatalog(rows): Record<string, ExerciseDef>` (pure: seeded templates + mapped rows, seeded wins)
  - `getCatalogMap(supabase, userId): Promise<Record<string, ExerciseDef>>`
  - `getCatalogList(supabase, userId): Promise<ExerciseDef[]>`
  - `type DbExerciseRow` (the subset of columns selected)

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dbExerciseToDef, mergeCatalog, type DbExerciseRow } from "./catalog";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const row = (over: Partial<DbExerciseRow> = {}): DbExerciseRow => ({
  id: "v1",
  name: "Machine Chest Press — Cybex (plate)",
  pattern: "horizontal_press",
  equipment: "machine",
  brand: "Cybex",
  machine_type: "plate_loaded",
  base_exercise_id: "machine-chest-press",
  coefficient: 0.9,
  is_reference: false,
  needs_calibration: true,
  increment: 10,
  ...over,
});

describe("dbExerciseToDef", () => {
  it("maps a variant row to an ExerciseDef", () => {
    const def = dbExerciseToDef(row());
    expect(def.id).toBe("v1");
    expect(def.equipment).toBe("machine");
    expect(def.brand).toBe("Cybex");
    expect(def.machineType).toBe("plate_loaded");
    expect(def.baseExerciseId).toBe("machine-chest-press");
    expect(def.needsCalibration).toBe(true);
    expect(def.machineTemplate).toBeUndefined(); // DB defs are concrete, never templates
  });

  it("maps a fully-custom row (no base, no brand)", () => {
    const def = dbExerciseToDef(row({ id: "c1", base_exercise_id: null, brand: null, machine_type: null, equipment: "barbell", needs_calibration: false }));
    expect(def.baseExerciseId).toBeUndefined();
    expect(def.brand).toBeUndefined();
    expect(def.machineType).toBeUndefined();
    expect(def.equipment).toBe("barbell");
  });
});

describe("mergeCatalog", () => {
  it("includes every seeded template", () => {
    const map = mergeCatalog([]);
    expect(map["machine-chest-press"]).toEqual(EXERCISE_BY_ID["machine-chest-press"]);
  });

  it("adds DB rows alongside seeded templates", () => {
    const map = mergeCatalog([row()]);
    expect(map["v1"].brand).toBe("Cybex");
    expect(map["machine-chest-press"]).toBeDefined();
  });

  it("lets seeded templates win an id collision", () => {
    const map = mergeCatalog([row({ id: "machine-chest-press", brand: "Hacked" })]);
    expect(map["machine-chest-press"].brand).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- catalog`
Expected: FAIL ("Cannot find module './catalog'").

- [ ] **Step 3: Implement `catalog.ts`**

Create `src/lib/catalog.ts`:

```ts
// Merged exercise catalog: seeded templates (coefficients.ts) + the user's DB exercise
// rows (brand/type variants and fully-custom exercises). The pure strength engine consumes
// the resulting Record<id, ExerciseDef>; seeded ids win any collision.

import type { createClient } from "@/lib/supabase/server";
import {
  EXERCISES,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type Pattern,
} from "@/lib/strength/coefficients";

export interface DbExerciseRow {
  id: string;
  name: string;
  pattern: string;
  equipment: string;
  brand: string | null;
  machine_type: string | null;
  base_exercise_id: string | null;
  coefficient: number;
  is_reference: boolean;
  needs_calibration: boolean;
  increment: number;
}

const SELECT =
  "id, name, pattern, equipment, brand, machine_type, base_exercise_id, coefficient, is_reference, needs_calibration, increment";

export function dbExerciseToDef(row: DbExerciseRow): ExerciseDef {
  return {
    id: row.id,
    name: row.name,
    pattern: row.pattern as Pattern,
    equipment: row.equipment as Equipment,
    brand: row.brand ?? undefined,
    machineType: (row.machine_type as MachineType | null) ?? undefined,
    baseExerciseId: row.base_exercise_id ?? undefined,
    coefficient: Number(row.coefficient),
    isReference: row.is_reference,
    needsCalibration: row.needs_calibration,
    increment: Number(row.increment),
  };
}

// Pure: seeded templates first, then DB rows that don't collide with a seeded id.
export function mergeCatalog(rows: DbExerciseRow[]): Record<string, ExerciseDef> {
  const map: Record<string, ExerciseDef> = {};
  for (const def of EXERCISES) map[def.id] = def;
  for (const row of rows) {
    if (map[row.id]) continue; // seeded wins
    map[row.id] = dbExerciseToDef(row);
  }
  return map;
}

export async function getCatalogMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Record<string, ExerciseDef>> {
  const { data } = await supabase.from("exercise").select(SELECT).eq("user_id", userId);
  return mergeCatalog((data ?? []) as DbExerciseRow[]);
}

export async function getCatalogList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ExerciseDef[]> {
  return Object.values(await getCatalogMap(supabase, userId));
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- catalog`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat: merged seeded+DB exercise catalog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Exercise server actions (`exercise/actions.ts`)

**Files:**
- Create: `src/app/(app)/exercise/actions.ts`
- Create: `src/lib/exercise-id.ts` (pure id/name helpers)
- Create: `src/lib/exercise-id.test.ts`

**Interfaces:**
- Consumes: `dbExerciseToDef`, `EXERCISE_BY_ID`, `KNOWN_BRANDS`/`MachineType`.
- Produces:
  - `variantId(baseId, brand, machineType): string`
  - `variantName(baseName, brand, machineType): string`
  - `slugifyCustom(name): string`
  - `resolveVariant({ baseExerciseId, brand, machineType }): Promise<ExerciseDef>`
  - `createCustomExercise({ name, pattern, equipment, brand?, machineType? }): Promise<ExerciseDef>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/exercise-id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { variantId, variantName, slugifyCustom } from "./exercise-id";

describe("variantId", () => {
  it("builds a stable slug from base + brand + type", () => {
    expect(variantId("machine-chest-press", "Hammer Strength", "plate_loaded")).toBe(
      "machine-chest-press__hammer-strength__plate_loaded",
    );
  });
  it("handles a missing brand", () => {
    expect(variantId("leg-press", null, "selectorized")).toBe("leg-press____selectorized");
  });
});

describe("variantName", () => {
  it("appends brand and a short type tag", () => {
    expect(variantName("Machine Chest Press", "Cybex", "plate_loaded")).toBe(
      "Machine Chest Press — Cybex (plate)",
    );
    expect(variantName("Leg Press", "Hoist", "selectorized")).toBe("Leg Press — Hoist (stack)");
  });
  it("omits brand when absent", () => {
    expect(variantName("Leg Press", null, "plate_loaded")).toBe("Leg Press (plate)");
  });
});

describe("slugifyCustom", () => {
  it("slugs a custom name with a prefix", () => {
    expect(slugifyCustom("Landmine Press!")).toMatch(/^custom-landmine-press/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- exercise-id`
Expected: FAIL ("Cannot find module './exercise-id'").

- [ ] **Step 3: Implement `exercise-id.ts`**

Create `src/lib/exercise-id.ts`:

```ts
import type { MachineType } from "@/lib/strength/coefficients";

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const TYPE_TAG: Record<MachineType, string> = { plate_loaded: "plate", selectorized: "stack" };

export function variantId(baseId: string, brand: string | null, machineType: MachineType): string {
  return `${baseId}__${slug(brand ?? "")}__${machineType}`;
}

export function variantName(
  baseName: string,
  brand: string | null,
  machineType: MachineType,
): string {
  const tag = TYPE_TAG[machineType];
  return brand ? `${baseName} — ${brand} (${tag})` : `${baseName} (${tag})`;
}

export function slugifyCustom(name: string): string {
  return `custom-${slug(name)}-${Math.random().toString(36).slice(2, 7)}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- exercise-id`
Expected: PASS.

- [ ] **Step 5: Implement `exercise/actions.ts`**

Create `src/app/(app)/exercise/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EXERCISE_BY_ID,
  type Equipment,
  type ExerciseDef,
  type MachineType,
  type Pattern,
} from "@/lib/strength/coefficients";
import { dbExerciseToDef, type DbExerciseRow } from "@/lib/catalog";
import { variantId, variantName, slugifyCustom } from "@/lib/exercise-id";

const SELECT =
  "id, name, pattern, equipment, brand, machine_type, base_exercise_id, coefficient, is_reference, needs_calibration, increment";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

export interface ResolveVariantInput {
  baseExerciseId: string;
  brand: string | null;
  machineType: MachineType;
}

// Find-or-create the variant for (template, brand, type). Idempotent: the unique index
// exercise_variant_unique backs the dedup; a concurrent insert resolves to a re-select.
export async function resolveVariant(input: ResolveVariantInput): Promise<ExerciseDef> {
  const { supabase, userId } = await requireUser();
  const base = EXERCISE_BY_ID[input.baseExerciseId];
  if (!base) throw new Error(`Unknown template: ${input.baseExerciseId}`);

  const id = variantId(base.id, input.brand, input.machineType);
  const existing = await supabase.from("exercise").select(SELECT).eq("id", id).maybeSingle();
  if (existing.data) return dbExerciseToDef(existing.data as DbExerciseRow);

  const insert = await supabase
    .from("exercise")
    .insert({
      id,
      user_id: userId,
      name: variantName(base.name, input.brand, input.machineType),
      pattern: base.pattern,
      equipment: "machine",
      brand: input.brand,
      machine_type: input.machineType,
      base_exercise_id: base.id,
      coefficient: base.coefficient,
      is_reference: false,
      needs_calibration: true,
      increment: base.increment,
    })
    .select(SELECT)
    .maybeSingle();

  if (insert.data) return dbExerciseToDef(insert.data as DbExerciseRow);

  // Lost a race on the unique index — re-select the winner.
  const after = await supabase.from("exercise").select(SELECT).eq("id", id).single();
  return dbExerciseToDef(after.data as DbExerciseRow);
}

export interface CreateCustomInput {
  name: string;
  pattern: Pattern;
  equipment: Equipment;
  brand?: string | null;
  machineType?: MachineType | null;
}

export async function createCustomExercise(input: CreateCustomInput): Promise<ExerciseDef> {
  const { supabase, userId } = await requireUser();
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  const isMachine = input.equipment === "machine";

  const { data, error } = await supabase
    .from("exercise")
    .insert({
      id: slugifyCustom(name),
      user_id: userId,
      name,
      pattern: input.pattern,
      equipment: input.equipment,
      brand: isMachine ? (input.brand ?? null) : null,
      machine_type: isMachine ? (input.machineType ?? null) : null,
      base_exercise_id: null,
      coefficient: 1.0,
      is_reference: false,
      needs_calibration: isMachine,
      increment: input.equipment === "barbell" ? 5 : 10,
    })
    .select(SELECT)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create exercise");
  return dbExerciseToDef(data as DbExerciseRow);
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/exercise-id.ts src/lib/exercise-id.test.ts "src/app/(app)/exercise/actions.ts"
git commit -m "feat: resolveVariant + createCustomExercise server actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Thread merged catalog through display surfaces

**Files:**
- Modify: `src/app/(app)/page.tsx:4,154`
- Modify: `src/app/(app)/history/[exerciseId]/page.tsx:3,25`
- Modify: `src/app/(app)/analytics/page.tsx:13,65,86,90,107,319,342`
- Modify: `src/app/(app)/program/program-gallery.tsx` + `program-card.tsx:8,166,170` (pass a name/def map down)

**Interfaces:**
- Consumes: `getCatalogMap` (Task 3).
- Produces: each surface resolves exercise names/defs from the merged map instead of `EXERCISE_BY_ID`.

Each of these is a Server Component (except `program-card.tsx`, a client child of the gallery). Pattern: build `const catalog = await getCatalogMap(supabase, userId)` once near the top, replace `EXERCISE_BY_ID` with `catalog`.

- [ ] **Step 1: Home (`page.tsx`)**

Replace the import and usage:

```ts
// remove: import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { getCatalogMap } from "@/lib/catalog";
```
After the existing `userId` is resolved and `supabase` exists, add `const catalog = await getCatalogMap(supabase, userId);` and change line ~154 to `name: catalog[s.exercise_id]?.name ?? s.exercise_id,`.

- [ ] **Step 2: History (`history/[exerciseId]/page.tsx`)**

```ts
import { getCatalogMap } from "@/lib/catalog";
```
Add `const catalog = await getCatalogMap(supabase, userId);` after `userId`, then `const def = catalog[exerciseId];` (line ~25). The `def?.equipment === "bodyweight"` branch at line 27 is unchanged.

- [ ] **Step 3: Analytics (`analytics/page.tsx`)**

```ts
import { PATTERN_LABEL } from "@/lib/strength/coefficients";
import { getCatalogMap } from "@/lib/catalog";
```
Add `const catalog = await getCatalogMap(supabase, userId);` after `userId`. Replace every `EXERCISE_BY_ID` with `catalog` at lines 65, 86, 90, 107, 319, 342. (Pure functions `sessionTonnage`, `latestWeekBalance`, `patternStrengthTrend` already accept the map.)

- [ ] **Step 4: Program gallery/card**

In the gallery server page (`src/app/(app)/program/page.tsx`), build `const catalog = await getCatalogMap(supabase, userId);` and pass `nameById={Object.fromEntries(Object.values(catalog).map((d) => [d.id, d.name]))}` (a plain `Record<string,string>`) into `ProgramGallery`, which forwards it to each `ProgramCard`. In `program-card.tsx`, replace the `EXERCISE_BY_ID` import with a `nameById: Record<string,string>` prop; line 166 becomes `nameById[id] ?? id`, and line 170 `const exercise = ... ` resolves via the prop (carry the def fields it needs, or pass the full `Record<string,ExerciseDef>` if the card reads `equipment`/`pattern`). Inspect `program-card.tsx:170` first; if it only renders the name, the string map suffices.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/page.tsx" "src/app/(app)/history" "src/app/(app)/analytics/page.tsx" "src/app/(app)/program/page.tsx" "src/app/(app)/program/program-gallery.tsx" "src/app/(app)/program/program-card.tsx"
git commit -m "refactor: resolve exercise names from merged catalog on display surfaces

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Thread merged catalog through `session/actions.ts`

**Files:**
- Modify: `src/app/(app)/session/actions.ts`

**Interfaces:**
- Consumes: `getCatalogMap` (Task 3).
- Produces: `logSet`, `editSet`, `deleteSet`, `finishSession`, and `recomputeAndUpsertStat` resolve defs from the merged catalog, so variant and custom `exercise_id`s calibrate and progress correctly.

This is the calibration-critical path. The current code uses `EXERCISE_BY_ID` at lines 6 (import), 49, 82, 164, 242, 344.

- [ ] **Step 1: Swap the import**

```ts
// remove: import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { getCatalogMap } from "@/lib/catalog";
import type { ExerciseDef } from "@/lib/strength/coefficients";
```

- [ ] **Step 2: Make `recomputeAndUpsertStat` take the catalog**

Change its signature to accept the map and use it for both the def lookup and pattern-strength estimation:

```ts
async function recomputeAndUpsertStat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exerciseId: string,
  bodyweight: number | null,
  catalog: Record<string, ExerciseDef>,
) {
  const def = catalog[exerciseId];
  if (!def) return;
  // ...unchanged...
  // line 82 becomes:
      const patternStrength = estimatePatternStrength(def.pattern, catalog, others);
  // ...unchanged...
}
```

- [ ] **Step 3: `logSet` — build and pass the catalog**

After `requireUser()`, replace `const def = EXERCISE_BY_ID[input.exerciseId];` with:

```ts
  const catalog = await getCatalogMap(supabase, userId);
  const def = catalog[input.exerciseId];
  if (!def) throw new Error(`Unknown exercise: ${input.exerciseId}`);
```
At the `recomputeAndUpsertStat(...)` call (line ~220), pass `catalog` as the final argument.

- [ ] **Step 4: `editSet` and `deleteSet`**

In each, build `const catalog = await getCatalogMap(supabase, userId);` after `requireUser()`. In `editSet`, replace `const def = EXERCISE_BY_ID[existing.exercise_id];` with `const def = catalog[existing.exercise_id];`. In both, pass `catalog` to `recomputeAndUpsertStat(...)`.

- [ ] **Step 5: `finishSession` — name lookup**

Build `const catalog = await getCatalogMap(supabase, userId);` after `requireUser()`, and change line ~344 to `name: catalog[exerciseId]?.name ?? exerciseId,`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/session/actions.ts"
git commit -m "feat: session actions resolve defs from merged catalog (variants calibrate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Picker — catalog-driven, brand/type step, add-custom

**Files:**
- Modify: `src/app/(app)/program/exercise-picker.tsx`

**Interfaces:**
- Consumes: `resolveVariant`, `createCustomExercise` (Task 4); `KNOWN_BRANDS`, `MACHINE_TYPE_LABEL`, `MachineType`, `PATTERN_LABEL`, `Equipment`, `ExerciseDef`.
- Produces: `ExercisePicker` props become
  `{ catalog: ExerciseDef[]; recentIds?: string[]; patternFilter?: Pattern; resolveMachines?: boolean; onPick: (def: ExerciseDef) => void; onClose: () => void }`.
  `onPick` always receives a **concrete, loggable** def when `resolveMachines` is true (never a bare machine template).

- [ ] **Step 1: Replace the static list with the `catalog` prop**

Change the component signature to take `catalog: ExerciseDef[]` and `resolveMachines?: boolean`, and filter `catalog` instead of importing `EXERCISES`:

```ts
import {
  type ExerciseDef,
  type Pattern,
  type MachineType,
  type Equipment,
  KNOWN_BRANDS,
  MACHINE_TYPE_LABEL,
  PATTERN_LABEL,
} from "@/lib/strength/coefficients";
import { resolveVariant, createCustomExercise } from "../exercise/actions";
```
In `PickerBody`, `const results = useMemo(... catalog.filter(...) ...)` (replace `EXERCISES`). Thread `catalog`, `resolveMachines`, and `onClose`-driven dismissal through `PickerBody`.

- [ ] **Step 2: Add a view state for the sub-steps**

`PickerBody` gains `const [view, setView] = useState<{ kind: "list" } | { kind: "machine"; template: ExerciseDef } | { kind: "custom" }>({ kind: "list" });` and a pending flag for the server round-trip.

Row tap behavior (`ExerciseRow.onPick`):
- If `resolveMachines && e.machineTemplate` → `setView({ kind: "machine", template: e })` (do **not** dismiss yet).
- Else → `onPick(e); dismiss();` (current behavior).

- [ ] **Step 3: Brand/type sub-view**

When `view.kind === "machine"`, render (in place of the list) a small form: a brand `<select>` over `KNOWN_BRANDS` plus an "Other" option that reveals a text `Input`, and two `Chip`s for `selectorized` / `plate_loaded` (labels from `MACHINE_TYPE_LABEL`). A confirm `Button` (with `pending`) calls:

```ts
const def = await resolveVariant({
  baseExerciseId: view.template.id,
  brand: brand || null,
  machineType,
});
onPick(def);
dismiss();
```
A back control returns to `{ kind: "list" }`.

- [ ] **Step 4: Add-custom entry + form**

Add a persistent footer row in the list view: a full-width `Button variant="secondary"` "Add custom exercise" → `setView({ kind: "custom" })`. The custom form fields: name `Input`; pattern `<select>` over `Object.entries(PATTERN_LABEL)`; equipment `<select>` over `["barbell","dumbbell","cable","machine","bodyweight"] satisfies Equipment[]`; and, when equipment === "machine", the same brand + type controls from Step 3. Confirm calls:

```ts
const def = await createCustomExercise({ name, pattern, equipment, brand: brand || null, machineType });
onPick(def);
dismiss();
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/program/exercise-picker.tsx"
git commit -m "feat: catalog-driven picker with brand/type + add-custom flows

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Active session — catalog state, machine instantiation

**Files:**
- Modify: `src/app/(app)/session/[id]/page.tsx`
- Modify: `src/app/(app)/session/[id]/active-session.tsx`

**Interfaces:**
- Consumes: `getCatalogMap` (server), the Task 7 picker (`catalog` + `resolveMachines` + concrete-`onPick`).
- Produces: `ActiveSession` takes a `catalog: Record<string, ExerciseDef>` prop, holds it in state so newly-resolved variants can be merged in, and only renders the set-entry UI once a slot's exercise is concrete (not a `machineTemplate`).

- [ ] **Step 1: Hydrate the catalog from the session page**

In `session/[id]/page.tsx`, add `import { getCatalogMap } from "@/lib/catalog";`, build `const catalog = await getCatalogMap(supabase, userId);` (after `userId`), and pass `catalog={catalog}` to `<ActiveSession>`.

- [ ] **Step 2: Catalog state in `ActiveSession`**

Replace `import { EXERCISE_BY_ID, type Pattern } from "@/lib/strength/coefficients";` with `import type { ExerciseDef, Pattern } from "@/lib/strength/coefficients";`. Add `catalog: Record<string, ExerciseDef>` to the props. Inside `ActiveSession`:

```ts
const [catalog, setCatalog] = useState(props.catalog);
const addToCatalog = useCallback(
  (def: ExerciseDef) => setCatalog((c) => (c[def.id] ? c : { ...c, [def.id]: def })),
  [],
);
```
Pass `catalog` and `addToCatalog` to each `SlotCard`.

- [ ] **Step 3: `SlotCard` uses the catalog + resolution callback**

Add `catalog` and `onResolve` to `SlotCard` props. Replace `const def = EXERCISE_BY_ID[exerciseId];` with `const def = catalog[exerciseId];`. Replace the two `EXERCISE_BY_ID` arguments to `sessionTarget` (line ~176) and `startingWeight` (line ~188) with `catalog`. Add:

```ts
const isTemplate = !!def?.machineTemplate;
```

- [ ] **Step 4: Picker call becomes resolving + concrete**

Change the swap picker usage to pass the catalog list, enable machine resolution, and merge the result:

```tsx
{swapping && (
  <ExercisePicker
    catalog={Object.values(catalog)}
    recentIds={recentIds}
    patternFilter={slot.pattern}
    resolveMachines
    onPick={(def) => {
      onResolve(def);
      setExerciseId(def.id);
    }}
    onClose={() => setSwapping(false)}
  />
)}
```

- [ ] **Step 5: Gate set entry behind a concrete exercise**

When `isTemplate`, render a "Choose machine (brand & type)" `Button` that opens the same picker (`setSwapping(true)`), and **do not** render `SetEntry`. The `TargetLine`/recommendation still computes from the template def (pattern-level), so the suggested number shows before the machine is chosen. Concretely, wrap the existing set-entry block (lines ~340-353):

```tsx
{isTemplate ? (
  <div className="mt-3">
    <Button type="button" className="w-full" onClick={() => setSwapping(true)}>
      Choose machine (brand &amp; type)
    </Button>
  </div>
) : editingId === null ? (
  <div className="mt-3">{/* existing SetEntry */}</div>
) : null}
```
Adjust the Swap button label too: when `isTemplate`, the heading-row button can read "Choose machine"; otherwise "Swap" (both call `setSwapping(true)`).

- [ ] **Step 6: Import `useCallback`**

Add `useCallback` to the React import on line 4.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 8: Manual smoke (dev server)**

Run `npm run dev`, open a session whose slot defaults to a machine template (e.g. Leg Press). Confirm: the target weight shows; "Choose machine" opens the picker; selecting brand + type creates a variant and reveals set entry; logging a set persists and the rest timer starts; reloading keeps the resolved variant (it is now the slot's most-recently-logged exercise).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/session/[id]/page.tsx" "src/app/(app)/session/[id]/active-session.tsx"
git commit -m "feat: in-session machine instantiation (brand/type variant on first set)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Program builder — catalog-driven picker (templates allowed)

**Files:**
- Modify: `src/app/(app)/program/program-builder.tsx`
- Modify: `src/app/(app)/program/page.tsx` (pass catalog list to the builder where it's rendered) and/or the builder's server entry

**Interfaces:**
- Consumes: the Task 7 picker.
- Produces: the builder picks **templates** (machine templates stored as-is — programs stay brand-agnostic), so it passes `resolveMachines={false}` (the default). Custom exercises created from the builder are concrete and allowed.

- [ ] **Step 1: Pass a catalog list to the builder**

Wherever `ProgramBuilder` is rendered server-side, build `const catalog = await getCatalogMap(supabase, userId);` and pass `catalog={Object.values(catalog)}`. Add the prop to `ProgramBuilder`.

- [ ] **Step 2: Builder name lookup + picker call**

Replace `import { EXERCISE_BY_ID, type ExerciseDef } from "@/lib/strength/coefficients";` with `import type { ExerciseDef } from "@/lib/strength/coefficients";`. Build a local `const byId = useMemo(() => Object.fromEntries(catalog.map((d) => [d.id, d])), [catalog]);` and change `exerciseName` (line 333) to read `byId[id]?.name ?? id`. Update the picker usage (line ~320):

```tsx
<ExercisePicker
  catalog={catalog}
  recentIds={recentIds}
  onPick={(ex) => addSlot(pickerDayId, ex)}
  onClose={() => setPickerDayId(null)}
/>
```
(`resolveMachines` omitted → templates returned as-is, which is correct for a program.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

In the builder, add a machine movement to a slot — confirm it stores the generic template (no brand/type prompt), and "Add custom exercise" creates a usable exercise.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/program/program-builder.tsx" "src/app/(app)/program/page.tsx"
git commit -m "feat: program builder picks brand-agnostic templates from merged catalog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Docs refresh + full verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/DECISIONS.md`
- Verify: whole repo

- [ ] **Step 1: Run the docs-freshness-keeper**

Dispatch the `docs-freshness-keeper` agent (or update by hand) to reconcile: migration list → 8 (`0008_machine_variants`); the new templates/variants/custom-exercises model in the strength-engine and data-model sections; the `machine` equipment collapse and `machine_type`/`baseExerciseId`/`machineTemplate` fields on `ExerciseDef`; `src/lib/catalog.ts`, `src/lib/exercise-id.ts`, and `src/app/(app)/exercise/actions.ts`; the picker's brand/type + add-custom flows; the in-session machine-instantiation behavior; vitest coverage line (adds `catalog`, `exercise-id`, `coefficients`). Add a DECISIONS.md entry recording the identity model and the two judgment calls (brand/type scoped to machines; `core` pattern).

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: ALL PASS. Capture the vitest count (should exceed the prior 43).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md docs/DECISIONS.md
git commit -m "docs: machine brands/types + custom exercises

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- Identity model (templates/variants/customs) → Tasks 2, 3, 4.
- Movement + brand/type pickers → Task 7 (`resolveMachines`), Task 8 (in-session).
- Custom exercises always map to a pattern → Task 7 custom form (pattern `<select>` required) + Task 4 `createCustomExercise`.
- Brand/type scoped to machines; cables stay single → Task 2 (only `machine` templates flagged), Task 7 (brand/type shown only for `equipment === "machine"`).
- `core` pattern → Task 2.
- Schema 0008 + types → Task 1.
- Equipment collapse, `machine_type` as identity → Task 2 (verified no engine branch on plate/pin).
- Catalog merge threading (~8 files) → Tasks 5, 6, 8, 9.
- Engine needs no math changes → confirmed; recommender/progression/recompute unchanged, only their `defs` argument source changes.
- No seed backfill; seed.ts unaffected → noted (kept ids only).
- Testing (catalog mapping, merge precedence, variant recommendation via shared pattern) → Tasks 2, 3, 4 unit tests; cross-machine recommendation is exercised by existing `recommend.test.ts` (no-history → pattern strength path), now keyed on `machine-chest-press`.

**Placeholder scan:** No TBD/TODO; every code step shows concrete code. Task 5 Step 4 and Task 9 Step 1 say "wherever rendered server-side / inspect first" — these are genuine lookups the implementer must do against the current file; the exact edit is specified once the host is found.

**Type consistency:** `ExerciseDef` fields (`machineType`, `baseExerciseId`, `machineTemplate`) are defined in Task 2 and consumed identically in Tasks 3/4/7/8/9. `DbExerciseRow`/`dbExerciseToDef`/`mergeCatalog`/`getCatalogMap` names match across Tasks 3–9. `variantId`/`variantName`/`slugifyCustom` signatures match between Task 4's test and implementation. `resolveVariant`/`createCustomExercise` input shapes match between Task 4 and Task 7's calls.

**Open risk carried from the spec:** the picker's `onPick` is now async-resolving for machine templates/custom adds — Task 7 dismisses the sheet only after the server action resolves; ensure the `pending` flag blocks double-submits during the round-trip.
```
