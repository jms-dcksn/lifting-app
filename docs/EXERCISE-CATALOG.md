# Exercise catalog and machine models

The shared library contains 150 exercise templates: the original 60 plus 90 additions
approved on 2026-10-15. The 67 manufacturer model choices are station identities beneath
those templates. Shared templates live in application code; the database holds each
owner's resolved stations and custom exercises. No bulk owner-row insert is needed.

## Identity and compatibility

- Keep all existing template, custom, station, program and saved-set IDs. Existing custom
  reverse flys and overlapping personal exercises remain separate; no history is relabeled.
- A station is unique per `(user_id, base_exercise_id, brand, machine_type, station_model)`.
  `station_model` is optional; null keeps the original unknown-model station and its ID.
  Selecting a model creates a separate station, including when an unknown-model station
  already has history. Model choices never retroactively infer the machine used.
- Old canonical IDs remain `base__brand__tag`; modeled IDs append `__model-<UTF-8 hex>`.
  Hex is lossless, so punctuation and non-ASCII model names cannot collide through a slug.
  Global-ID conflicts append the owner UUID after the full model-aware canonical ID.
- Known model names normalize to stable registry keys; custom model text trims, collapses
  whitespace and lowercases. The database enforces nonempty normalized model values up to
  100 characters. Model lookups and insertion races use the same owner-scoped key.
- Known models must match the selected movement, brand and loading type. Other model
  names remain supported. Smith templates accept plate loading; assisted stations accept
  selectorized loading. Machine/cable models keep separate records and calibration.
- `catalog.ts` restores template-owned `loadMode` when hydrating DB variants, but leaves
  `stationProfile` unset: the concrete station is loggable. No duplicate load-mode column
  can drift from the canonical template.

## Movement and load rules

`chest_fly`, `hip_adduction`, `hip_extension`, `ankle_dorsiflexion` and `core_rotation`
have separate pattern anchors. New flys therefore do not predict bench-press weights,
and adduction/tibialis work does not borrow hip-thrust/calf strength. Existing templates'
patterns stay unchanged, including pec deck, pullover and seated hip abduction, to avoid
silently reinterpreting history. Hip-extension hard sets count toward glute specialization.

Barbells and machines log total external load; dumbbells log one dumbbell's weight. Cable
exercises log the working stack (one side for equal dual-pulley setups), consistently for
that station. Machine priors are rough starting values and require calibration, not
manufacturer-certified conversions. Manufacturer model names establish identity only.

Assisted pull-ups, chin-ups and dips use bodyweight equipment with a machine station:
the UI accepts positive assistance and stores negative added load. Effective load is
bodyweight minus assistance. Progression reduces assistance, stops at zero, and never
silently changes the movement into a weighted pull-up/dip. Unknown bodyweight withholds
estimates. Historical edits continue to recover the original bodyweight from saved e1RM.

Ab wheel, hanging straight-leg raise and glute-ham raise are rep-only. Store zero external
load and null e1RM; hide the weight control. Reps advance within the programmed range and
hold at its ceiling instead of inventing a load increase. Rep PRs remain eligible, while
weight/e1RM PRs, tonnage and pooled pattern-strength estimates stay absent. Working-set
and hard-set counts still include them. Their intentionally absent estimates are not a
monthly data-quality error. Existing hanging-knee-raise behavior is preserved.

## Discovery

The workout/program picker and catalog-backed Track, Volume and pin searches recognize
DB/BB, fly/flye spellings, common movement aliases and manufacturer/model names. Model
choices appear after brand/type selection, with an unspecified-model and free-text path.
Changing brand or loading type clears the prior model choice. The builder can still store
generic templates; workout/planner resolution still requires a concrete station.

AI Coach keeps new equipment alternatives visible. A bench-press query excludes flys
unless explicitly qualified as a fly; a flat query excludes decline and incline. RDL
queries can now return barbell, dumbbell and Smith alternatives. Equipment qualifiers,
explicit IDs, model identities and historical preference keep their existing boundaries.

## Migration and release

Apply `20261015122122_exercise_station_models.sql` before deploying this app version.
It adds the optional column and widens the existing partial uniqueness index without
changing rows, RLS, grants or historical sets. The production migration gate enforces
application order. The old application remains compatible with the additive schema,
but the new application requires it. Preview environments also need this migration.

After explicit approval on 2026-10-15, the exact migration was applied through Supabase
MCP to `lifting-app-dev` (`uggyizzzczwwxkgnwuse`), verified, then applied and verified on
`lifting-app` (`jtcppebmosaffaajtgow`). MCP-generated ledger timestamps were reconciled
to repository version `20261015122122` without replaying SQL. Both deployment-check
RPCs recognize that version. Application release remains a separate operation.

The new `exercise_station_models_rls.sql` pgTAP script is included in the existing CI
ownership suite. It covers legacy/null-model uniqueness, distinct same-brand models,
normalization, owner-local duplicate prevention and cross-owner read/write isolation.

## Research sources

The audit reviewed these sources for exercise existence and setup distinctions. Inclusion
in the catalog is not a claim that every exercise is equally effective or recommended by
all authors. Product catalogs also do not establish availability at a particular gym.

- [Jeff Nippard: biceps](https://www.youtube.com/watch?v=GNO4OtYoCYk),
  [chest](https://www.youtube.com/watch?v=fGm-ef-4PVk),
  [back](https://www.youtube.com/watch?v=jLvqKgW-_G8),
  [triceps](https://www.youtube.com/watch?v=OpRMRhr0Ycc).
- [Matt Ogus: public exercise tutorial index](https://mattogus.teachable.com/p/exercise-tutorial-vault).
- [StrengthLog exercise directory](https://www.strengthlog.com/exercise-directory/) and
  [dumbbell curl variations](https://www.strengthlog.com/different-types-of-dumbbell-curls/).
- [Muscle & Strength exercise library](https://www.muscleandstrength.com/exercises/all.html).
- [Hammer Strength plate-loaded catalog](https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded),
  [MTS catalog](https://www.lifefitness.com/en-us/brands/hammer-strength),
  [unsupported T-bar row](https://shop.lifefitness.com/products/hammer-strength-plate-loaded-t-bar-row),
  [D.Y. row](https://shop.lifefitness.com/products/hammer-strength-plate-loaded-iso-lateral-d-y-row),
  [Glute Ham / Reverse Hyper](https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/glute-ham-reverse-hyper-combo).
- [Life Fitness Insignia lineup](https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/insignia-series-triceps-press).
- [Cybex Eagle NX](https://locator.lifefitness.com/virtualcoach/eagle-nx.aspx),
  [Squat Press](https://locator.lifefitness.com/plate-loaded-squat-press.aspx).
- [Hoist ROC-IT catalog](https://www.hoistfitness.com/collections/roc-it),
  [RPL-5356 three-movement station](https://www.hoistfitness.com/collections/all/products/rpl-5356-hack-squat-dead-lift-shrug),
  [RS-2201 pulldown](https://www.hoistfitness.com/products/rs-2201-lat-pulldown),
  [RS-2204 low back](https://www.hoistfitness.com/products/low-back),
  [RS-2102 biceps](https://www.hoistfitness.com/pages/rs-2102-biceps-curl),
  [selectorized model index](https://www.hoistfitness.com/pages/roc-it-selectorized-qr-code-content).

## New exercise inventory

| ID | Exercise | Pattern | Station | Tracking |
| --- | --- | --- | --- | --- |
| `db-spider-curl` | Dumbbell Spider Curl | `elbow_flexion` | none | loaded |
| `ez-spider-curl` | EZ-Bar Spider Curl | `elbow_flexion` | none | loaded |
| `db-incline-curl` | Incline Dumbbell Curl | `elbow_flexion` | none | loaded |
| `db-concentration-curl` | Dumbbell Concentration Curl | `elbow_flexion` | none | loaded |
| `db-preacher-curl` | Dumbbell Preacher Curl | `elbow_flexion` | none | loaded |
| `ez-preacher-curl` | EZ-Bar Preacher Curl | `elbow_flexion` | none | loaded |
| `ez-curl` | EZ-Bar Curl | `elbow_flexion` | none | loaded |
| `db-hammer-curl` | Dumbbell Hammer Curl | `elbow_flexion` | none | loaded |
| `db-hammer-preacher-curl` | Dumbbell Hammer Preacher Curl | `elbow_flexion` | none | loaded |
| `cable-bayesian-curl` | Bayesian Cable Curl | `elbow_flexion` | cable | loaded |
| `cable-bayesian-hammer-curl` | Bayesian Cable Hammer Curl | `elbow_flexion` | cable | loaded |
| `cable-preacher-curl` | Cable Preacher Curl | `elbow_flexion` | cable | loaded |
| `cable-lying-low-curl` | Lying Cable Curl (Low Pulley) | `elbow_flexion` | cable | loaded |
| `cable-lying-high-curl` | Lying Cable Curl (High Pulley) | `elbow_flexion` | cable | loaded |
| `ez-reverse-curl` | Reverse EZ-Bar Curl | `elbow_flexion` | none | loaded |
| `db-incline-hammer-curl` | Incline Dumbbell Hammer Curl | `elbow_flexion` | none | loaded |
| `cable-high-curl` | High Cable Double-Biceps Curl | `elbow_flexion` | cable | loaded |
| `db-zottman-curl` | Dumbbell Zottman Curl | `elbow_flexion` | none | loaded |
| `db-lying-curl` | Lying Dumbbell Curl | `elbow_flexion` | none | loaded |
| `db-flat-fly` | Flat Dumbbell Fly | `chest_fly` | none | loaded |
| `db-incline-fly` | Incline Dumbbell Fly | `chest_fly` | none | loaded |
| `db-decline-fly` | Decline Dumbbell Fly | `chest_fly` | none | loaded |
| `cable-mid-fly` | Standing Cable Fly (Mid-Height) | `chest_fly` | cable | loaded |
| `cable-low-high-fly` | Standing Cable Fly (Low-to-High) | `chest_fly` | cable | loaded |
| `cable-high-low-fly` | Standing Cable Fly (High-to-Low) | `chest_fly` | cable | loaded |
| `cable-flat-bench-fly` | Flat Bench Cable Fly | `chest_fly` | cable | loaded |
| `cable-incline-bench-fly` | Incline Bench Cable Fly | `chest_fly` | cable | loaded |
| `cable-decline-bench-fly` | Decline Bench Cable Fly | `chest_fly` | cable | loaded |
| `cable-seated-fly` | Seated Cable Fly | `chest_fly` | cable | loaded |
| `cable-press-around` | Single-Arm Cable Press-Around | `chest_fly` | cable | loaded |
| `smith-bench` | Smith Machine Flat Bench Press | `horizontal_press` | machine | loaded |
| `smith-incline-bench` | Smith Machine Incline Bench Press | `horizontal_press` | machine | loaded |
| `smith-decline-bench` | Smith Machine Decline Bench Press | `horizontal_press` | machine | loaded |
| `bb-decline-bench` | Barbell Decline Bench Press | `horizontal_press` | bench | loaded |
| `db-decline-bench` | Dumbbell Decline Bench Press | `horizontal_press` | none | loaded |
| `cable-chest-press` | Cable Chest Press | `horizontal_press` | cable | loaded |
| `bb-seal-row` | Barbell Seal Row | `horizontal_pull` | none | loaded |
| `db-seal-row` | Dumbbell Seal Row | `horizontal_pull` | none | loaded |
| `db-chest-supported-row` | Incline Chest-Supported Dumbbell Row | `horizontal_pull` | none | loaded |
| `bb-pendlay-row` | Pendlay Row | `horizontal_pull` | none | loaded |
| `bb-underhand-row` | Underhand Barbell Row / Yates Row | `horizontal_pull` | none | loaded |
| `db-bent-over-row` | Bent-Over Dumbbell Row | `horizontal_pull` | none | loaded |
| `landmine-t-bar-row` | Landmine T-Bar Row | `horizontal_pull` | none | loaded |
| `machine-chest-supported-t-bar-row` | Chest-Supported T-Bar Row | `horizontal_pull` | machine | loaded |
| `machine-standing-t-bar-row` | Standing T-Bar Row Machine | `horizontal_pull` | machine | loaded |
| `landmine-meadows-row` | Meadows Row | `horizontal_pull` | none | loaded |
| `cable-single-arm-row` | Single-Arm Cable Row | `horizontal_pull` | cable | loaded |
| `cable-straight-arm-pulldown` | Straight-Arm Cable Pulldown | `vertical_pull` | cable | loaded |
| `db-pullover` | Dumbbell Pullover | `vertical_pull` | none | loaded |
| `weighted-chinup` | Weighted Chin-Up | `vertical_pull` | none | loaded |
| `cable-overhead-triceps` | Cable Overhead Triceps Extension | `elbow_extension` | cable | loaded |
| `db-overhead-triceps` | Dumbbell Overhead Triceps Extension | `elbow_extension` | none | loaded |
| `ez-skullcrusher` | EZ-Bar Skullcrusher | `elbow_extension` | none | loaded |
| `bb-close-grip-bench` | Close-Grip Barbell Bench Press | `horizontal_press` | bench | loaded |
| `cable-triceps-kickback` | Cable Triceps Kickback | `elbow_extension` | cable | loaded |
| `db-reverse-fly` | Dumbbell Reverse Fly | `rear_delt` | none | loaded |
| `db-incline-reverse-fly` | Incline-Supported Dumbbell Reverse Fly | `rear_delt` | none | loaded |
| `cable-reverse-fly` | Cable Reverse Fly | `rear_delt` | cable | loaded |
| `cable-face-pull` | Cable Face Pull | `rear_delt` | cable | loaded |
| `db-arnold-press` | Dumbbell Arnold Press | `vertical_press` | none | loaded |
| `db-shrug` | Dumbbell Shrug | `traps` | none | loaded |
| `db-goblet-squat` | Dumbbell Goblet Squat | `squat` | none | loaded |
| `db-rdl` | Dumbbell Romanian Deadlift | `hinge` | none | loaded |
| `db-reverse-lunge` | Dumbbell Reverse Lunge | `lunge` | none | loaded |
| `db-walking-lunge` | Walking Dumbbell Lunge | `lunge` | none | loaded |
| `bb-sumo-deadlift` | Sumo Deadlift | `hinge` | platform | loaded |
| `bb-stiff-leg-deadlift` | Stiff-Leg Deadlift | `hinge` | platform | loaded |
| `bb-good-morning` | Barbell Good Morning | `hinge` | rack | loaded |
| `smith-squat` | Smith Machine Squat | `squat` | machine | loaded |
| `smith-rdl` | Smith Machine Romanian Deadlift | `hinge` | machine | loaded |
| `smith-split-squat` | Smith Machine Bulgarian Split Squat | `lunge` | machine | loaded |
| `smith-shoulder-press` | Smith Machine Shoulder Press | `vertical_press` | machine | loaded |
| `ab-wheel-rollout` | Ab Wheel Rollout | `core` | none | reps_only |
| `hanging-leg-raise` | Hanging Straight-Leg Raise | `core` | none | reps_only |
| `belt-squat` | Belt Squat | `squat` | machine | loaded |
| `pendulum-squat` | Pendulum Squat | `squat` | machine | loaded |
| `v-squat` | V-Squat | `squat` | machine | loaded |
| `reverse-v-squat` | Reverse V-Squat | `squat` | machine | loaded |
| `squat-press` | Machine Squat Press | `squat` | machine | loaded |
| `machine-shrug` | Machine Seated / Standing Shrug | `traps` | machine | loaded |
| `machine-deadlift` | Machine Deadlift | `hinge` | machine | loaded |
| `assisted-pullup` | Machine-Assisted Pull-Up | `vertical_pull` | machine | assisted |
| `assisted-chinup` | Machine-Assisted Chin-Up | `vertical_pull` | machine | assisted |
| `assisted-dip` | Machine-Assisted Dip | `horizontal_press` | machine | assisted |
| `hip-adduction` | Machine Hip Adduction | `hip_adduction` | machine | loaded |
| `machine-glute-kickback` | Machine Glute Kickback / Hip Extension | `hip_extension` | machine | loaded |
| `machine-torso-rotation` | Machine Torso Rotation | `core_rotation` | machine | loaded |
| `machine-tibialis-raise` | Machine Tibialis Raise / Dorsi-Flexion | `ankle_dorsiflexion` | machine | loaded |
| `reverse-hyper` | Machine Reverse Hyperextension | `hinge` | machine | loaded |
| `glute-ham-raise` | Glute-Ham Raise | `knee_flexion` | none | reps_only |

## Manufacturer model inventory

| Brand | Model key | Model | Loading | Exercise templates |
| --- | --- | --- | --- | --- |
| Hammer Strength | `hs-iso-horizontal-bench` | Iso-Lateral Horizontal Bench Press | plate_loaded | `machine-chest-press` |
| Hammer Strength | `hs-iso-incline` | Iso-Lateral Incline Press | plate_loaded | `machine-incline-chest-press` |
| Hammer Strength | `hs-super-incline` | Iso-Lateral Super Incline Press | plate_loaded | `machine-incline-chest-press` |
| Hammer Strength | `hs-wide-chest` | Iso-Lateral Wide Chest | plate_loaded | `machine-chest-press` |
| Hammer Strength | `hs-iso-decline` | Iso-Lateral Decline Press | plate_loaded | `machine-decline-chest-press` |
| Hammer Strength | `hs-iso-row` | Iso-Lateral Row | plate_loaded | `machine-row` |
| Hammer Strength | `hs-dy-row` | Iso-Lateral D.Y. Row | plate_loaded | `machine-row` |
| Hammer Strength | `hs-iso-high-row` | Iso-Lateral High Row | plate_loaded | `high-row` |
| Hammer Strength | `hs-iso-low-row` | Iso-Lateral Low Row | plate_loaded | `machine-low-row` |
| Hammer Strength | `hs-front-pulldown` | Iso-Lateral Front Lat Pulldown | plate_loaded | `machine-lat-pulldown` |
| Hammer Strength | `hs-wide-pulldown` | Iso-Lateral Wide Pulldown | plate_loaded | `machine-lat-pulldown` |
| Hammer Strength | `hs-pullover` | Plate-Loaded Pullover | plate_loaded | `machine-pullover` |
| Hammer Strength | `hs-seated-biceps` | Plate-Loaded Seated Biceps | plate_loaded | `machine-preacher-curl` |
| Hammer Strength | `hs-seated-dip` | Plate-Loaded Seated Dip | plate_loaded | `machine-seated-dip` |
| Hammer Strength | `hs-mts-chest` | MTS Iso-Lateral Chest Press | selectorized | `machine-chest-press` |
| Hammer Strength | `hs-mts-incline` | MTS Iso-Lateral Incline Press | selectorized | `machine-incline-chest-press` |
| Hammer Strength | `hs-mts-decline` | MTS Iso-Lateral Decline Press | selectorized | `machine-decline-chest-press` |
| Hammer Strength | `hs-mts-row` | MTS Iso-Lateral Row | selectorized | `machine-row` |
| Hammer Strength | `hs-mts-high-row` | MTS Iso-Lateral High Row | selectorized | `high-row` |
| Hammer Strength | `hs-mts-pulldown` | MTS Iso-Lateral Front Pulldown | selectorized | `machine-lat-pulldown` |
| Hammer Strength | `hs-mts-biceps` | MTS Iso-Lateral Biceps Curl | selectorized | `machine-preacher-curl` |
| Hammer Strength | `hs-mts-triceps` | MTS Iso-Lateral Triceps Extension | selectorized | `machine-triceps-extension` |
| Hammer Strength | `hs-mts-shoulder` | MTS Iso-Lateral Shoulder Press | selectorized | `machine-shoulder-press` |
| Hammer Strength | `hs-t-bar` | Plate-Loaded T-Bar Row (Unsupported) | plate_loaded | `machine-standing-t-bar-row` |
| Hammer Strength | `hs-belt-squat` | Plate-Loaded Belt Squat | plate_loaded | `belt-squat` |
| Hammer Strength | `hs-pendulum-x` | Pendulum-X Squat | plate_loaded | `pendulum-squat` |
| Hammer Strength | `hs-reverse-v` | Reverse V-Squat | plate_loaded | `reverse-v-squat` |
| Hammer Strength | `hs-super-squat-press` | Super Squat Press | plate_loaded | `squat-press` |
| Hammer Strength | `hs-shrug` | Seated / Standing Shrug | plate_loaded | `machine-shrug` |
| Hammer Strength | `hs-glute-ham-reverse-hyper` | Glute Ham / Reverse Hyper | plate_loaded | `reverse-hyper` |
| Hammer Strength | `hs-tibialis` | Tibia Dorsi-Flexion | plate_loaded | `machine-tibialis-raise` |
| Hammer Strength | `hs-assist-dip-chin` | Select Assist Dip Chin | selectorized | `assisted-pullup`, `assisted-chinup`, `assisted-dip` |
| Life Fitness | `lf-insignia-chest` | Insignia Chest Press | selectorized | `machine-chest-press` |
| Life Fitness | `lf-insignia-dual-chest` | Insignia Dual Axis Chest Press | selectorized | `machine-chest-press` |
| Life Fitness | `lf-insignia-pulldown` | Insignia Pulldown | selectorized | `machine-lat-pulldown` |
| Life Fitness | `lf-insignia-dual-pulldown` | Insignia Dual Axis Pulldown | selectorized | `machine-lat-pulldown` |
| Life Fitness | `lf-insignia-biceps` | Insignia Biceps Curl | selectorized | `machine-preacher-curl` |
| Life Fitness | `lf-insignia-dependent-biceps` | Insignia Biceps Curl — Dependent | selectorized | `machine-preacher-curl` |
| Life Fitness | `lf-insignia-triceps-press` | Insignia Triceps Press | selectorized | `machine-seated-dip` |
| Life Fitness | `lf-insignia-triceps-extension` | Insignia Triceps Extension | selectorized | `machine-triceps-extension` |
| Life Fitness | `lf-insignia-assist` | Insignia Assist Dip Chin | selectorized | `assisted-pullup`, `assisted-chinup`, `assisted-dip` |
| Life Fitness | `lf-insignia-adduction` | Insignia Hip Adduction | selectorized | `hip-adduction` |
| Life Fitness | `lf-insignia-glute` | Insignia Glute | selectorized | `machine-glute-kickback` |
| Life Fitness | `lf-insignia-rotation` | Insignia Torso Rotation | selectorized | `machine-torso-rotation` |
| Life Fitness | `lf-signature-cable` | Signature Cable Motion | selectorized | `cable-chest-press`, `seated-cable-row`, `lat-pulldown` |
| Cybex | `cybex-eagle-chest` | Eagle NX Dual Axis Chest Press | selectorized | `machine-chest-press` |
| Cybex | `cybex-eagle-pulldown` | Eagle NX Dual Axis Pulldown | selectorized | `machine-lat-pulldown` |
| Cybex | `cybex-eagle-row` | Eagle NX Row | selectorized | `machine-row` |
| Cybex | `cybex-squat-press` | Plate-Loaded Squat Press | plate_loaded | `squat-press` |
| Cybex | `cybex-eagle-rotation` | Eagle NX Torso Rotation | selectorized | `machine-torso-rotation` |
| Hoist | `hoist-rpl-5356` | ROC-IT RPL-5356 Hack Squat / Dead Lift / Shrug | plate_loaded | `hack-squat`, `machine-deadlift`, `machine-shrug` |
| Hoist | `hoist-rpl-5403` | ROC-IT RPL-5403 Dual Action Leg Press | plate_loaded | `leg-press` |
| Hoist | `hoist-rpl-5301` | ROC-IT RPL-5301 Chest Press | plate_loaded | `machine-chest-press` |
| Hoist | `hoist-rpl-5303` | ROC-IT RPL-5303 Incline Chest Press | plate_loaded | `machine-incline-chest-press` |
| Hoist | `hoist-rpl-5305` | ROC-IT RPL-5305 Decline Chest Press | plate_loaded | `machine-decline-chest-press` |
| Hoist | `hoist-rpl-5201` | ROC-IT RPL-5201 Lat Pulldown | plate_loaded | `machine-lat-pulldown` |
| Hoist | `hoist-rpl-5203` | ROC-IT RPL-5203 Mid Row | plate_loaded | `machine-row` |
| Hoist | `hoist-rpl-5102` | ROC-IT RPL-5102 Biceps Curl | plate_loaded | `machine-preacher-curl` |
| Hoist | `hoist-rpl-5101` | ROC-IT RPL-5101 Seated Dip | plate_loaded | `machine-seated-dip` |
| Hoist | `hoist-rs-2102` | ROC-IT RS-2102 Biceps Curl | selectorized | `machine-preacher-curl` |
| Hoist | `hoist-rs-2204` | ROC-IT RS-2204 Low Back | selectorized | `back-extension` |
| Hoist | `hoist-rs-2101` | ROC-IT RS-2101 Seated Dip | selectorized | `machine-seated-dip` |
| Hoist | `hoist-rs-1103` | ROC-IT RS-1103 Triceps Extension | selectorized | `machine-triceps-extension` |
| Hoist | `hoist-rs-2203` | ROC-IT RS-2203 Seated Mid Row | selectorized | `machine-row` |
| Hoist | `hoist-rs-2201` | ROC-IT RS-2201 Lat Pulldown | selectorized | `machine-lat-pulldown` |
| Hoist | `hoist-rs-1406` | ROC-IT RS-1406 Inner Thigh | selectorized | `hip-adduction` |
| Hoist | `hoist-rs-1602` | ROC-IT RS-1602 Rotary Torso | selectorized | `machine-torso-rotation` |

## Verification for this expansion

- `npm test`: 1,017 passed, one opt-in live test skipped. Focused picker tests were
  rerun after final accessible-label changes.
- `npm run lint`: no errors; existing unused `_catalog` warning in `board.ts`.
- `npx tsc --noEmit` and `npm run build`: passed.
- Chromium at a 390×844 viewport exercised the actual picker with a stubbed station
  resolver: DB/plural/fly search, manufacturer discovery, model-aware selection,
  loading-type reset and Escape dismissal. No page errors. Server persistence is covered
  by mocked action tests; this was not an authenticated hosted end-to-end test.
- An isolated PGlite PostgreSQL 18.6 database executed the actual baseline exercise
  schema/policy, variant migration and new model migration. Fourteen assertions passed,
  covering unchanged legacy rows, uniqueness/normalization and owner isolation/rollback.
  This is additional SQL validation; it does not replace the Supabase/Postgres 17 pgTAP
  suite in CI. Local Supabase startup failed while unpacking its large Postgres image.
- Hosted verification on both development and production: nullable model column,
  validated normalization constraint, valid unique model index, unchanged exercise
  fingerprints and saved-set counts, unchanged owner policy with RLS enabled, one
  migration ledger entry at the repository version, and successful migration-check RPC
  under the `anon` role. Existing rows retain null models; no bulk exercises were inserted.
