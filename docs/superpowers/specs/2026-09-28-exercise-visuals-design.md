# Exercise visuals

**Status:** Implemented. Frame revised 2026-09-29 after dogfood letterboxing.
**Date:** 2026-09-28

When a screen shows one exercise as the subject (card, row, header, tile), show its
illustration if we have one, otherwise a dumbbell fallback. Same frame everywhere.

## 1. Options considered

The ink drawings are 16:9 figures on cream paper.

### First lock (2026-09-28)

| | Leading square, contain | Circle crop | Banner + text-only lists |
| --- | --- | --- | --- |
| Dense picker / recap row | 44px box; figure stays whole | Clips the bar and head | Lists stay nameless marks |
| Review / session header | Same box, 72px on review only | Avatar language, wrong for lifts | Second visual system |
| Missing art | Same box, monochrome glyph | Empty circle | Inconsistent fallback |
| Verdict | Shipped | Rejected | Rejected |

### Revision (2026-09-29)

Square + `object-contain` letterboxed the 16:9 drawings (black/surface bars above and
below on session and planner cards). James asked to fill the frame. Compared:

| | Square + cover | 16:9 frame + cover/zoom | Full-bleed banner |
| --- | --- | --- | --- |
| Letterbox | Gone | Gone | Gone |
| Dense list | Figure fills 44px; sides cropped | Wide thumb, figure readable | Too tall for a row |
| Session / planner | Still a crushed avatar | Photo thumb; `lg` can grow the card | Second layout |
| Verdict | Rejected — still reads as a circle | **Locked** | Rejected |

Locked combo: **16:9 `rounded-control` frame**, `object-cover` plus a modest center
zoom so cream padding does not dominate, **`lg` on session / planner / review /
in-session history**. Lists keep `sm`. Do not scale the type system — the larger
frame is the growth.

## 2. Contract

`ExerciseVisual` (`src/components/ui/exercise-visual.tsx`) plus
`exerciseVisualSrc` (`src/lib/exercise-visual.ts`).

| Prop | Rule |
| --- | --- |
| `exerciseId` | Exact catalog / variant / custom id |
| `baseExerciseId` | Seeded template a station variant inherits from |
| `size` | `sm` = 36×64 (`h-9 w-16`) on rows and tiles. `lg` = 64×114 (`h-16 w-[7.11rem]`) on session, planner, Exercise review, and in-session history |

Lookup, in order: `baseExerciseId`, exact `exerciseId`, then the id prefix before `__`
(canonical `base__brand__tag`, plus the owned fourth segment). Custom ids (`custom-…`)
never inherit through that prefix. No free-text name matching.

- Mapped id → `/exercises/{id}.jpg` (`object-cover` + `scale-[1.35]` in a 16:9
  `rounded-control` box). Never `object-contain` in a square — that is the letterbox.
- Missing map, custom, or empty id → `IconDumbbell` in the same box. Never a broken image.
- Decorative: `alt=""` and `aria-hidden`. The exercise name stays adjacent.

Assets live in `public/exercises/`. The repo-root `images/*.png` placeholders were JPEG
bytes; they were renamed, downscaled to 640×360, and served with the correct type. Do
not import rasters into client islands.

## 3. Surfaces

Consumers (individual exercise as the subject):

- Session slot header (`lg`), in-session history sheet (`lg`), Fluid swap candidates, swap confirm
- Program + volume exercise pickers (including the station-brand step)
- Exercise review header (`lg`)
- Track tiles (`BoardGrid`, including home preview), Explore All lifts, pin editor
- Recap rows, week PR rows
- Planner cards (`lg`), program builder rows, program detail rows
- Month review lift / stall / achievement-group rows
- Coach recommendation cards that name an exercise
- Volume page header when one exercise is selected

Left alone: program/day aggregates, last-session recap chips, Coach four-exposure
caption lists, intra-slot PR captions.

## 4. Adding art

Drop a correctly typed JPEG or PNG in `public/exercises/` named for the seeded catalog
id, and add that id to `EXERCISE_VISUAL_SRC`. Variants inherit automatically.
