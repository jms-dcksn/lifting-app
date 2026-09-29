# Exercise visuals

**Status:** Implemented with this PR. One shared primitive on every individual-exercise surface.
**Date:** 2026-09-28

When a screen shows one exercise as the subject (card, row, header, tile), show its
illustration if we have one, otherwise a dumbbell fallback. Same frame everywhere.

## 1. Options considered

The ink drawings are 16:9 figures on cream paper. Three shapes were sketched before
locking one:

| | Leading square, contain | Circle crop | Banner + text-only lists |
| --- | --- | --- | --- |
| Dense picker / recap row | 44px box; figure stays whole | Clips the bar and head | Lists stay nameless marks |
| Review / session header | Same box, 72px on review only | Avatar language, wrong for lifts | Second visual system |
| Missing art | Same box, monochrome glyph | Empty circle | Inconsistent fallback |
| Verdict | Smallest design that works on both | Rejected | Rejected |

`object-cover` was rejected: it crops the lift. Per-screen `<img>` tags were rejected:
one primitive, one lookup.

## 2. Contract

`ExerciseVisual` (`src/components/ui/exercise-visual.tsx`) plus
`exerciseVisualSrc` (`src/lib/exercise-visual.ts`).

| Prop | Rule |
| --- | --- |
| `exerciseId` | Exact catalog / variant / custom id |
| `baseExerciseId` | Seeded template a station variant inherits from |
| `size` | `sm` = 44px (`size-11`) on rows, tiles, session/planner cards. `lg` = 72px on Exercise review only |

Lookup, in order: `baseExerciseId`, exact `exerciseId`, then the id prefix before `__`
(canonical `base__brand__tag`, plus the owned fourth segment). Custom ids (`custom-…`)
never inherit through that prefix. No free-text name matching.

- Mapped id → `/exercises/{id}.jpg` (`object-contain` in a `rounded-card` surface box).
- Missing map, custom, or empty id → `IconDumbbell` in the same box. Never a broken image.
- Decorative: `alt=""` and `aria-hidden`. The exercise name stays adjacent.

Assets live in `public/exercises/`. The repo-root `images/*.png` placeholders were JPEG
bytes; they were renamed, downscaled to 640×360, and served with the correct type. Do
not import rasters into client islands.

## 3. Surfaces

Consumers (individual exercise as the subject):

- Session slot header, in-session history sheet, Fluid swap candidates, swap confirm
- Program + volume exercise pickers (including the station-brand step)
- Exercise review header
- Track tiles (`BoardGrid`, including home preview), Explore All lifts, pin editor
- Recap rows, week PR rows
- Planner cards, program builder rows, program detail rows
- Month review lift / stall / achievement-group rows
- Coach recommendation cards that name an exercise
- Volume page header when one exercise is selected

Left alone: program/day aggregates, last-session recap chips, Coach four-exposure
caption lists, intra-slot PR captions.

## 4. Adding art

Drop a correctly typed JPEG or PNG in `public/exercises/` named for the seeded catalog
id, and add that id to `EXERCISE_VISUAL_SRC`. Variants inherit automatically.
