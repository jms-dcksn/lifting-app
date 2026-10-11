# Machine exercise catalog research — 2026-10-08

Status: James approved all 12 additions on 2026-10-08. Implemented as shared templates on
`codex/expand-machine-exercise-catalog`; database variants are created through the existing
owner-scoped station flow. No schema change or bulk database write.

## Recommendation

Add the 12 templates below. Preserve existing exercise IDs and historical sets. Reuse
the current station picker for brand and selectorized/plate-loaded identity rather than
creating a separate template for every brand or loading mechanism.

## Catalog evidence

Checked at repository HEAD `33a042957d11d811ddd1af8e3be9fd68ccbc7a2e` on `main`.
The linked hosted Supabase project is `jtcppebmosaffaajtgow`.

- `src/lib/strength/coefficients.ts` contains 48 shared templates, including 16 machines.
- A read-only query of `public.exercise` returned 72 project-wide rows, 52 machine rows.
  These counts cover all owners, not one user's visible catalog. No owner identifiers,
  workout records, or personal strength values were queried or copied into this note.
- `src/lib/catalog.ts` merges shared templates with rows filtered to the current owner.
  Templates live in code; the database holds owned station variants and custom exercises.
- `src/app/(app)/exercise/actions.ts` resolves templates into owned database variants.
  Adding universal choices therefore primarily requires catalog code, not bulk DB inserts.
- `src/app/(app)/program/exercise-picker.tsx` searches display names and pattern strings.
  The existing name can explain why a search for "horizontal row" finds no result.

The successful query selected `id, name, pattern, equipment, base_exercise_id, brand,
machine_type, needs_calibration` ordered by equipment, name and ID. An initial query
also requested nonexistent `is_custom` and failed without changing data; it was corrected.

## Proposed additions

Manufacturer pages establish that these machines exist and describe their construction.
The names and template boundaries below are recommendations based on that evidence.

| Proposed template | Current catalog status | Distinction and primary source |
| --- | --- | --- |
| Machine Preacher Curl | Missing from templates and DB rows | Supported-arm guided curl; [Precor Biceps Curl](https://www.precor.com/en-US/strength/selectorized/resolute). |
| Machine Triceps Extension (Preacher Pad) | Missing from both | Supported-arm extension; [Precor Triceps Extension](https://www.precor.com/en-GB/products/RSL0208). |
| Machine Lat Pulldown | Missing from both | Guided lever arms; existing `lat-pulldown` is cable equipment; [Precor Diverging Lat Pulldown](https://www.precor.com/en-US/products/RSL0314). |
| Machine Pullover | Missing from both | Dedicated pullover station; [Hammer Strength Pullover](https://www.lifefitness.com.au/commercial/pullover-plpo). |
| Machine Incline Chest Press | Missing from both | Incline machine press; existing incline presses are barbell/dumbbell; [Hammer Strength Incline Press](https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-incline-press). |
| Machine Decline Chest Press | Missing from both | Decline machine press; [Hammer Strength Decline Press](https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/iso-lateral-decline-chest-press). |
| Machine Seated Dip / Triceps Press | Missing from both | Dip-style seated press, distinct from supported-arm extension and bodyweight dip; [Life Fitness Triceps Press](https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/insignia-series-triceps-press). |
| Machine Low Row | Missing as a distinct template and DB exercise | Separate low-row machine path, retain generic horizontal row; [Hammer Strength Low Row](https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/plate-loaded-iso-lateral-low-row). |
| Lying Leg Curl | Owner-specific custom DB row only | Shared prone-curl template, distinct from existing seated curl; [Precor Prone Leg Curl](https://www.precor.com/en-US/strength/selectorized/resolute). |
| Kneeling Leg Curl | Missing from both | Supported unilateral kneeling curl; [Life Fitness Kneeling Leg Curl](https://www.lifefitness.com/en-gb/catalog/strength-training/plate-loaded/life-fitness-kneeling-leg-curl). |
| Seated Calf Raise | Missing from both | Bent-knee station with thigh pad; [Hammer Strength Seated Calf Raise](https://shop.lifefitness.com/products/hammer-strength-plate-loaded-seated-calf-raise). |
| Machine Calf Extension / Calf Press | Owner-specific custom DB rows only | Footplate calf extension; distinguish from thigh-pad seated raise; [Precor Calf Extension](https://www.precor.com/en-US/strength/selectorized/resolute). |

## Existing coverage and naming

"Machine Horizontal Row" already has a shared template: `machine-row`, displayed as
"Machine Row (ISO-Lateral)". The hosted DB has six variants across Hammer Strength,
Life Fitness, Nautilus and Technogym, including both loading types. Do not create another
generic horizontal-row identity. Consider a clearer template name or search alias in the
approved implementation; preserve IDs and account for stored variant display names.

Other existing machine templates: chest press, pec deck, shoulder press, high row,
hack squat, leg press, back extension, glute drive, seated hip abduction, leg extension,
seated leg curl, standing calf raise, lateral raise, reverse pec deck and abdominal crunch.
An absent DB variant does not mean a shared template is missing.

Machine shrug is another verified optional addition:
[Hammer Strength Seated/Standing Shrug](https://shop.lifefitness.com/products/hammer-strength-plate-loaded-seated-standing-shrug).
Hip adduction also exists commercially ([Precor Inner Thigh](https://www.precor.com/en-US/strength/selectorized/resolute)),
but the current pattern taxonomy has no adduction group. Defer it for a separate modeling
decision rather than silently sharing hip-thrust strength.

## Approved implementation

All 12 templates use machine station profiles and calibration. Pullover uses `vertical_pull`,
and seated dip uses `horizontal_press` like the existing weighted dip. Coefficients and
increments are rough initial defaults, not manufacturer-verified strength conversions.
Existing custom IDs/history remain separate. The existing horizontal row ID is retained;
its shared display name now includes "Horizontal". Stored variant names remain unchanged.

No schema change is expected for this list. Brand/type variants should continue to be
created through the authenticated app flow. Review downstream catalog inventories and
exercise display support, then run the required application checks on the feature branch.

## Verification limits

This is a dated catalog snapshot, not proof that any candidate is installed at a particular
gym. Manufacturer product pages were researched; live DB rows and repository catalog/merge/
picker sources were cross-referenced. Implementation passed 818 tests (one skipped), lint
(existing unused-variable warning in `board.ts`), TypeScript and build. The build's migration
gate allowed non-production; no hosted migration was required or applied. Mocked action tests
verify persistence and reuse for all 12 templates and both loading types. Authenticated browser
verification was unavailable: no app tab was open. Production has not been deployed and no
real owner-specific database variants were pre-created.
