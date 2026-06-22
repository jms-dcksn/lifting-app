# Machine brands, machine types, and custom exercises

Date: 2026-06-21
Status: Approved (brainstorming) — ready for implementation plan

## Problem

Exercise identity is currently a flat text slug from `src/lib/strength/coefficients.ts`.
This conflates the *movement* with the *specific machine*. Two gaps:

1. **Machine identity.** A Hammer Strength plate-loaded chest press and a Life Fitness
   selectorized chest press are different machines with different absolute loads, but the
   same movement. The user wants to record weight against the *specific* machine (brand +
   type) and track progress on that machine separately, while still getting a cross-machine
   weight recommendation when walking up to a new one.
2. **Custom exercises.** The user wants to add an exercise on the fly — either a branded
   machine variant of a known movement ("Machine Incline Press, Cybex, plate-loaded") or a
   fully novel exercise not in the seeded catalog at all.

The seeded catalog already bakes specific brands into specific slugs (`hs-chest-press`,
`lf-chest-press`), which is rigid: there is no way to add a brand/type combination on the
fly, and the granularity is hardcoded.

## Current state (verified)

- The entire app reads exclusively from the static `coefficients.ts` catalog
  (`EXERCISES` / `EXERCISE_BY_ID`). The `exercise` table, `equipment_instance` table, and
  `set_log.equipment_instance_id` are defined in the schema and `types.ts` but are **never
  read or written anywhere** — dormant scaffolding from the original design.
- The pure strength modules (`recommend.ts`, `progression.ts`, `recompute.ts`, `analytics.ts`)
  already take `defs: Record<string, ExerciseDef>` as a parameter. They do not care where a
  def comes from.
- `Brand` is already a field on both `ExerciseDef` and the `exercise` table.
- **No engine or UI code branches on `machine_plate` vs `machine_pin`.** The only equipment
  branches are `equipment.startsWith("machine")` (`active-session.tsx`) and
  `equipment === "bodyweight"` (`recompute.ts`, `progression.ts`, `history`, `analytics`).
  Therefore the plate/pin distinction can be collapsed without changing any engine math.

## Decisions (from brainstorming)

1. **Identity model: movement + brand/type pickers.** Pick a generic movement, then select
   brand + machine type. Each `(movement, brand, type)` is its own progression chain and
   recommends from the same pattern's other variants. (Not a flat list of pre-named
   exercises.)
2. **Custom exercises always map to a pattern.** Every custom exercise picks one of the
   movement patterns and participates in the recommender. No "standalone / no pattern"
   option.
3. **Brand/type scoped to `machine` equipment only.** Cables stay single trackable
   exercises (out of scope). (Judgment call, approved.)
4. **Add a `core` pattern** so ab/core machines have a home. (Judgment call, approved.)

## Domain model

Three concepts, two storage locations.

### Templates (seeded, `coefficients.ts`)

The movement. Source of truth stays in app code.

- **Free-weight / cable templates** are unchanged — they are directly loggable, as today
  (e.g. `bb-bench`, `db-curl`, `lat-pulldown`, `seated-cable-row`).
- **Machine templates** become *generic*: one per machine movement, `equipment: "machine"`,
  no brand baked in. They carry the population `coefficient` prior, `needsCalibration: true`,
  `pattern`, default `increment`, and `isReference` where applicable. Machine templates are
  **not logged against directly** — they must be instantiated into a variant first.

  The existing brand-baked machine entries collapse into these generic templates:

  | New template (generic)        | Pattern           | Replaces                                  |
  |-------------------------------|-------------------|-------------------------------------------|
  | Machine Chest Press           | horizontal_press  | `hs-chest-press`, `lf-chest-press`        |
  | Pec Deck / Chest Fly          | horizontal_press  | `pec-deck`                                |
  | Machine Shoulder Press        | vertical_press    | `hs-shoulder-press`, `lf-shoulder-press`  |
  | Machine Row (ISO-Lateral)     | horizontal_pull   | `hs-iso-row`                              |
  | High Row                      | vertical_pull     | `hs-high-row`                             |
  | Hack Squat                    | squat             | `hack-squat`                              |
  | Leg Press                     | squat             | `leg-press`                               |
  | Glute Drive                   | hip_thrust        | `hs-glute-drive`                          |
  | Leg Extension (ref)           | knee_extension    | `leg-extension`                           |
  | Leg Curl (ref)                | knee_flexion      | `seated-leg-curl`                         |
  | Calf Raise (ref)              | calf              | `standing-calf-raise`                     |
  | Reverse Pec Deck (ref)        | rear_delt         | `reverse-pec-deck`                        |

  Cable machine entries that are pattern references stay as `cable` equipment and are
  unchanged: `lat-pulldown` (vertical_pull ref), `cable-pushdown` (elbow_extension ref),
  `seated-cable-row`, `cable-curl`, `cable-lateral-raise`.

### Variants (DB `exercise` table)

A specific machine: `template × brand × machine_type`. The **trackable identity**. Its
`exercise_id` is what `set_log.exercise_id`, `user_exercise_stat`, history, and progression
key on. Created lazily the first time the user picks that combination ("find-or-create").

Row fields (see schema below): `name` (derived, e.g. "Machine Chest Press — Hammer Strength
(plate)"), `pattern` and `coefficient` and `increment` inherited from the template,
`equipment: "machine"`, `brand`, `machine_type`, `base_exercise_id` = the template id,
`needs_calibration: true`.

### Custom exercises (DB `exercise` table)

A user-invented movement. Same table and mechanism as a variant, but `base_exercise_id` is
null and the user supplies `name`, `pattern`, `equipment` (and `brand`/`machine_type` if
`equipment === "machine"`). `coefficient` defaults from the chosen pattern's reference
(1.0 if the pattern has no other anchor, else a sensible mid value; it self-corrects via
Bayesian shrinkage). `needs_calibration` is true only when `equipment === "machine"`.

## Why the engine needs no math changes

- **Recommendation for an un-used variant.** A new variant has no history → the recommender
  predicts `pattern_strength × template_coefficient` and inverts to a working weight. This is
  the cross-machine recommendation: a never-used Cybex chest press gets a starting weight
  pooled from the user's other chest-press machines.
- **Per-machine progression.** Each variant has its own `exercise_id`, so its own
  `user_exercise_stat` row, `currentE1rm`, calibrated `personal_coefficient`, and
  double-progression chain. Progress on one machine does not move another's logged weight.
- **Calibration is unchanged.** `recomputeAndUpsertStat` (`session/actions.ts`) already
  keys calibration on `exercise_id` and computes `personal_coefficient` from the pattern
  strength implied by *other* logged variants. Variants share a pattern, so this works as-is.
- **`machine_type` is identity, not math.** Nothing branches on plate vs pin; both log total
  load. `machine_type` exists for the user's tracking and for naming/disambiguation only.

## Schema (migration `0008_machine_variants.sql`)

The `exercise` table already exists with `id, user_id, name, pattern, equipment, brand,
coefficient, is_reference, needs_calibration, increment, created_at`. Changes:

```sql
alter table exercise add column machine_type text;        -- 'selectorized' | 'plate_loaded' | null
alter table exercise add column base_exercise_id text;    -- seeded template id, or null for fully custom

-- Find-or-create dedup: one variant per (user, template, brand, type).
create unique index exercise_variant_unique on exercise (
  user_id, base_exercise_id, coalesce(brand, ''), coalesce(machine_type, '')
) where base_exercise_id is not null;
```

`equipment` column comment updates to `barbell|dumbbell|cable|machine|bodyweight`. No data
backfill: existing demo `set_log` rows that reference retired slugs (`hs-chest-press`, etc.)
are disposable — the app is not deployed. RLS is unchanged (existing `own rows` policy on
`exercise` covers the new columns).

`types.ts` is hand-updated for the two new columns (per project convention: apply migration
via Supabase MCP, then hand-edit `types.ts`).

## Code: types (`coefficients.ts`)

- `Equipment` becomes `"barbell" | "dumbbell" | "cable" | "machine" | "bodyweight"`
  (drop `machine_plate` / `machine_pin`).
- `Brand` relaxes from a strict union to `string`. Add
  `export const KNOWN_BRANDS = ["Hammer Strength", "Life Fitness", "Cybex", "Hoist",
  "Technogym", "Precor", "Matrix", "Nautilus"] as const` for the dropdown; "Other" lets the
  user type a free-form brand.
- Add `export type MachineType = "selectorized" | "plate_loaded"` and
  `MACHINE_TYPE_LABEL`.
- `ExerciseDef` gains optional `machineType?: MachineType` and `baseExerciseId?: string`.
- `Pattern` gains `"core"`; add a `core` entry to `PATTERN_LABEL` and a seeded reference
  exercise for it (cable crunch).
- Rewrite the machine entries per the template table above (generic names, `equipment:
  "machine"`, no brand).

## Code: catalog merge layer (`src/lib/catalog.ts`, new)

The cross-cutting change. ~8 files currently import the static `EXERCISE_BY_ID`.

- `dbExerciseToDef(row): ExerciseDef` — maps an `exercise` row to an `ExerciseDef`.
- `getCatalogMap(supabase, userId): Promise<Record<string, ExerciseDef>>` — merges seeded
  `EXERCISES` with the user's `exercise` rows. Seeded ids win on collision.
- `getCatalogList(...)` — array form for the picker.

Threading:
- **Server components** that import `EXERCISE_BY_ID` today (`page.tsx`, `history/[id]/page.tsx`,
  `analytics/page.tsx`, `session/[id]/page.tsx`, `program/*` server pieces) fetch the merged
  map and pass it down, and pass it to the pure modules (which already accept `defs`).
- **Client components** (`active-session.tsx`, `exercise-picker.tsx`, `program-builder.tsx`)
  receive the catalog hydrated as a prop instead of importing the static one.
- `session/actions.ts` builds the merged map server-side for calibration/recompute.

This is the riskiest part of the work: mechanical, but touches every screen.

## Code: server actions (`src/app/(app)/exercise/actions.ts`, new)

- `resolveVariant({ baseExerciseId, brand, machineType }) -> ExerciseDef` — find-or-create a
  variant row (unique on user + template + brand + type), return its def. Idempotent.
- `createCustomExercise({ name, pattern, equipment, brand?, machineType? }) -> ExerciseDef` —
  insert a fully custom row (`base_exercise_id = null`), return its def.

Both validate inputs, set `user_id` from `getClaims()`, and generate a stable text `id`
(slug for variants, e.g. `<base>__<brand-slug>__<type>`; uuid or name-slug for custom).

## Code: UX flows

### Exercise picker (`program/exercise-picker.tsx`)

- Becomes catalog-driven: takes a `catalog: ExerciseDef[]` prop (merged templates + the
  user's existing variants/customs) instead of importing static `EXERCISES`.
- Picking a **free-weight / cable template or an existing variant** returns the def directly
  (current behavior).
- Picking a **machine template** opens a brand + type step (dropdown of `KNOWN_BRANDS` +
  Other, and selectorized/plate-loaded). On confirm → `resolveVariant()` → returns the
  variant def. The user's already-instantiated variants also appear in the list directly, so
  re-picking a known machine is one tap.
- An **"Add custom exercise"** affordance opens a small form (name, pattern, equipment,
  + brand/type when machine) → `createCustomExercise()` → returns the new def.

The picker is shared by the builder (add slot) and in-session swap; both follow the existing
`onPick`/`onClose` contract. `onPick` may now be async (awaits a server action) before the
sheet dismisses.

### In-session logging (`active-session.tsx`)

- Prescription and recommendation already operate at the pattern level, so the suggested
  number shows before a specific machine is chosen.
- If a slot's effective exercise is an **un-instantiated machine template**, the first
  **Log** tap opens the brand/type step to resolve a variant, then logs against the variant
  `exercise_id`. Subsequent sets reuse the resolved variant. This reuses the existing swap
  plumbing (a slot's effective exercise id is the most recently logged exercise in that
  slot).

### Builder

- Slots may default to a machine *template* (generic). Instantiation happens at log time, not
  build time, so a program is brand-agnostic and portable across gyms.

## Migration of seeded slugs and seed data

- `session/seed.ts` (template source for `createFromTemplate`) and any program-slot default
  `exercise_id`s that reference retired machine slugs move to the new generic template ids.
- No `set_log` backfill — demo data is disposable.

## Testing

Pure-module tests (vitest, `src/lib/**/*.test.ts`):
- `catalog.test.ts` — `dbExerciseToDef` mapping; merge precedence (seeded wins); variant +
  custom rows produce valid `ExerciseDef`s.
- Extend `recommend` / `progression` tests with a variant def that has no history
  (cross-machine recommendation) and one with its own history (independent progression).
- Confirm collapsing `machine_*` → `machine` keeps `equipment.startsWith("machine")` and the
  bodyweight branches correct.

Server actions and UI flows are not unit-tested (consistent with the current suite scope);
verify via typecheck, lint, build, and a manual session pass.

## Out of scope

- Brand/type on cables.
- Per-gym `equipment_instance` tracking (stays dormant).
- Backfilling demo `set_log` data.
- Standalone (pattern-less) custom exercises.

## Open risks

- **The catalog-merge threading is broad.** Every screen that names an exercise depends on
  the merged map. Plan should sequence this as its own step with a green typecheck/build gate
  before layering the UI flows on top.
- **Client hydration of the catalog** adds a server fetch to screens that were previously
  using a static import. Acceptable (users have a small catalog), but watch payload on the
  session page.
- **Async `onPick`.** The picker contract becomes async for machine templates / custom adds;
  ensure the sheet's animated-dismiss timing still holds when a server round-trip precedes it.
