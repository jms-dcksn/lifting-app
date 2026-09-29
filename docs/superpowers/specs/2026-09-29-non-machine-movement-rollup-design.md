# Non-machine movement rollup for e1RM and PR records

**Status:** Design, awaiting James. Not shipped. Do not merge on approval alone.
**Date:** 2026-09-29
**Code on this branch:** pure key only (`src/lib/strength/movement.ts`). `set_log`, records, review, Track, pins, progression, Coach, Fluid, and monthly still use exact `exercise_id` until the slices below land.
**Supersedes, for ordinary-pound families:** the station-composition lock that records, progression, and review stay exact and that split PR chains are accepted. Cable and machine exactness stays. See the Decision Cards.

## Who this is for

The lifter who pins Barbell Incline Bench and changes gyms. Today Flex Fitness and Nautilus are two e1RM charts, two PR chains, and two Track numbers. After the slices, that pin is one strength story. Each logged set still names the bench.

The next engineer inherits one comparison key, not a second id column and not a special case in each screen.

## Decision Card 1. Revoke exact PR chains for ordinary pounds

**Recommendation.** Revoke "do not merge PR numbers across family members" for station profiles `bench`, `rack`, `platform`, and `none`. Compare e1RM, rep PRs, and top-weight on the seeded template id. Keep writing `set_log.exercise_id` as the station that was loaded.

**Reason.** Those profiles log ordinary pounds. A gym change was splitting one movement into silent parallel charts. The station spec split them so pad angle could not hide inside one number. James now wants that noise explained on the set, not by forking the record. Profile `none` (dumbbell, bodyweight, and barbell rows with no station) is already one id. The same key covers it with a member list of one.

**Risk.** Two benches are not the same implement. A higher e1RM can be the pad. Session targets for these families follow the family pounds, so a harsher bench can inherit last gym's load. The set row shows the brand. Stall evidence also continues across brands, so a geometry change does not reset a plateau series.

**Decision needed.** Approve this revocation. Reply `exact` to keep today's split chains for benches, racks, and platforms.

This card is the product reversal of [station composition](2026-09-21-station-composition-design.md) (James 2026-09-21, "split PR chains are accepted") and of [Architecture](../../ARCHITECTURE.md) ("Do not merge PR numbers across family members"). Those sentences stay in the old docs with a pointer. They are not the rule for ordinary-pound families once the slices ship.

## Decision Card 2. Cables stay exact

**Recommendation.** Do not roll cable families up. A Hoist stack and a Nautilus stack keep separate e1RM, rep-PR, and top-weight chains, separate calibration, and separate session targets. Same rule as machines.

**Reason.** Cable variants set `needs_calibration`. `personal_coefficient` is `observed e1RM / pattern strength` on that exact id (`recomputeAndUpsertStat` in `src/app/(app)/session/actions.ts`). `set_log.e1rm` is `computeE1rm` of the raw stack, not a pound. Maxing those numbers across brands invents a PR when the lifter changed columns. The station spec split cables for this reason. James included cable in "non-machine." The comparable quantity would be pattern strength, and that number is not the stack on the pin. Shipping it beside stack-unit PRs makes Track speak two languages. Reps at stack 50 are not a shared load either.

**Risk.** A gym change still splits the pulldown chart. In-session history already lists both brands via `exerciseFamilyIds`. The chart does not.

**Decision needed.** Accept this default. The one-word reverse is `rollup`.

`rollup` does not mean `rollsUp` returns true and the family takes `max(raw e1RM)`. It means a later slice whose family series is `stored e1RM / that station's personal_coefficient`, labeled as strength rather than stack weight, with rep PRs and top-weight still exact-station, and with session targets still exact-station. Sets logged before that station has a coefficient do not enter the family series. Until that word, cable code stays on Card 1's machine side.

## Principles that changed a choice

Only principles whose leaf was read for this design.

| Principle | Choice it changed |
| --- | --- |
| Model the domain | One `comparisonScope` over movement vs station. Not a profile `if` copied into records, review, Track, stall, and Coach. Not a new id table. |
| Exhaust the design space | Three whole shapes (below). Locked read-time scope. Rejected a stored `rollup_exercise_id` and a third master row. |
| Redesign from first principles | Record scope is the movement for ordinary pounds, as if the station had always been an annotation on the set. Family-latest tile numbers are not kept beside a new rollup. |
| Subtract before you add | No `rollup_exercise_id`. No pin backfill. No revival of `equipment_instance` as station identity. `exerciseFamilyIds` stays browse-only. |
| Foundational thinking | `movement.ts` is the key, landed before any screen reads it. Later slices call it. They do not invent a second key. |
| Experience first | One review URL and family pounds on the next session for ordinary-lb families. Station chips on the set. Cable targets stay on this stack. |
| Sequence verifiable units | Slices 1–5 each end in a test from the matrix. This branch is the key only. |
| Prove it works | `movement.test.ts` asserts the incline key, machine isolation, cable isolation, and that the logged id is not rewritten. Later slices must extend that file's cases into the engine they touch. |

## Current contracts this design reconciles

Measured against `main` at `3c85823`.

- `set_log.exercise_id` is the logged identity. `logSet` rejects a `needsStation` template (`isLoggableExercise`) and inserts that exact id (`src/app/(app)/session/actions.ts`).
- A variant row stores `base_exercise_id` and does not store `stationProfile`. `dbExerciseToDef` never copies the profile. The template in `coefficients.ts` owns it.
- `exerciseFamilyIds` returns the template id plus every catalog row with that `baseExerciseId`, including machines and cables. Comment in `src/lib/exercise-history.ts` says browse only, do not merge PRs. `latestFamilyMember` is what Track default tiles use for numbers and href (`buildBoardLifts`).
- `recordScope` is `JSON.stringify([exercise_id, equipment_instance_id])`. `workoutRecords` never looks at `baseExerciseId`.
- `user_exercise_stat` is one row per exact `exercise_id`. Cable and machine coefficients live there. `recomputeStat` rebuilds `current_e1rm` from that id's sets only.
- Exercise review loads `.eq("exercise_id", exerciseId)` (`src/app/(app)/history/[exerciseId]/page.tsx`). `?equipment=` is an instance id, not a station switcher.
- Extra pins refuse an unresolved station template (`pin-actions.test.ts`). A pin on a variant stays exact (`buildBoardLifts` test "keeps an extra pin on a specific variant exact-id").
- Customs insert `base_exercise_id: null`. A custom cable is one row with brand and `needs_calibration`, not a template plus variants.
- `equipment_instance` is dormant. Station identity is the exercise id (station spec).
- Coach fixed-load progress, monthly best e1RM, and stall identity all say exact exercise. Stall's `recordScope` reset is how a brand change breaks a plateau series today.
- Default Track compounds are reference templates whose `stationProfile !== "machine"` (`bb-bench`, `bb-row`, `bb-ohp`, `bb-back-squat`, `bb-deadlift`, `lat-pulldown`). Incline bench is not a default. It shows up when pinned.

## Three shapes

Sketches, compared before the lock. Not production prototypes. This PR does not ship UI.

### Shape A. Read-time movement scope

`set_log` stays the station id. A pure function maps a set to a movement key or a station key. Records, review, tiles, and stall call that function. `user_exercise_stat` stays per station so calibration and "what do I load here" do not share a cache row.

Surface stays the catalog that already exists (`baseExerciseId`, `stationProfile`). No migration.

### Shape B. Stored `rollup_exercise_id`

Stamp the movement on `set_log` and on `user_exercise_stat` at write time. Reads become a filter on that column.

Rejected. The key is already derivable. A column can drift from `baseExerciseId`, and the stat cache stops being a pure rebuild of one station's sets. **Subtract before you add** cut this before it became a migration.

### Shape C. A new master exercise row

At resolve time, create a third row that owns the family, and point sets at both the station and the master.

Rejected. The seeded template is already that master. A new row is a third id scheme beside template id and variant id. **Redesign from first principles** uses the template. **Model the domain** refuses a parallel identity.

### Synthesis

Shape A. `src/lib/strength/movement.ts` is that function. Nothing else imports it yet.

```ts
movementId(def) = def.baseExerciseId ?? def.id

rollsUp(template) =
  station profile is not machine and not cable
  (missing profile falls back from equipment: machine, cable, otherwise none)

comparisonScope(set, catalog) =
  unknown id, or template does not roll up
    -> { kind: "station", exerciseId, equipmentInstanceId }
  otherwise
    -> { kind: "movement", movementId }
```

`comparisonKey` is `movement:<id>` or `station:<exerciseId>:<instance>`. Movement keys omit `equipment_instance_id` so a dormant instance cannot split the story. Station keys keep it, which is today's machine behavior.

## Locked design

### 1. Rollup key

The rollup key is the seeded template id, reached through `baseExerciseId`, otherwise the row's own id.

- Leftover flat template rows (`bb-incline-bench` logged before a brand existed) share the key. No `UPDATE` of `set_log`.
- Owned variant ids (`base__brand__tag__userId`) share it because `base_exercise_id` is the template, not because the slug parses.
- A custom with `base_exercise_id` null is its own movement. It does not join a seeded family. Two custom cables do not merge.
- Dumbbell incline does not join barbell incline. Different template ids.
- Missing catalog row stays a station key of that raw id. Unknowns do not merge.

### 2. Which profiles roll up

| Profile | Seeds | Roll up raw e1RM / rep PR / top-weight? |
| --- | --- | --- |
| `bench` | `bb-bench`, `bb-incline-bench`, `bb-hip-thrust` | yes |
| `rack` | `bb-back-squat`, `bb-front-squat`, `bb-ohp` | yes |
| `platform` | `bb-deadlift`, `bb-rdl` | yes |
| `none` | dumbbells, bodyweight, `bb-row`, `bb-reverse-lunge`, `bb-shrug`, `bb-curl` | yes, member list is usually one id |
| `cable` | all 8 cable templates, plus custom cable | no, unless Decision Card 2 is reversed |
| `machine` | all 16 machine templates, plus custom machine | no |

`exerciseFamilyIds` is the wrong predicate. It includes machines and cables on purpose for the history sheet. Review and records use `movementMemberIds`, which returns siblings only when `rollsUp` is true.

### 3. What aggregates, and what stays exact

Aggregates, ordinary-pound families only, read from `set_log` with the existing eligibility rules (`eligibleRecordSet`, 0.001 lb load identity, 0.1 lb e1RM, historical bodyweight, warmups out, first observation of the **movement** quiet):

- e1RM series and session-best e1RM
- rep PRs at a shared pound load
- top-weight
- Track tile number, delta, and sparkline
- week-record flash if any member earned a canonical record
- monthly best stored e1RM and monthly PR totals that replay `workoutRecords`
- stall / Fluid / Coach series identity, so a brand change does not reset the series

Stays exact:

- `set_log.exercise_id`, weight, reps, RIR, stored `e1rm`, `is_calibration`
- `user_exercise_stat` rows, `personal_coefficient`, `coeff_confidence_n`
- `recommend()` direct-history match on exact id
- machine and cable record chains, calibration, and targets
- `equipment_instance` filter on non-rolling review
- program slot ids, swaps, and adaptation rows
- in-session history browse (`exerciseFamilyIds`, ten sets). It already shows the variant name.

Recap groups one movement into one scope. The group title is the template name. The line names the brand when the winning set is a variant, so the gold pill still says which bench.

### 4. Progression and session targets

**Experience first.** The lifter is about to load a bar. For ordinary-pound families the next target uses family first-set history (`selectProgressionReference` over `movementMemberIds`), then the same bump and floor rules. A new bench continues the pounds. The set still inserts the variant id. The first time the movement has no history, `startingWeight()` is unchanged.

Cable and machine targets stay exact-id. A new cable brand calibrates. It does not copy another brand's stack number.

This is the split Card 1 accepts. Reply `exact` on Card 1 if targets must stay per station even while the chart merges. That reply keeps the chart and makes the session treat a new bench as a first exposure. The default is the opposite, because a chart that says 200 lb and a session that says "first time" is two products.

### 5. Pins

Pin the movement, not the station.

- The pin key for a rolling exercise is `movementId`. Default compound tiles already use the template id. Their numbers and href stop following `latestFamilyMember` and start following the aggregate.
- A stored pin on `bb-incline-bench__flex-fitness__bench` displays as a pin on `bb-incline-bench`. Two variant pins of one movement are one tile. Cap 8 counts distinct keys.
- A variant pin whose movement is already a default compound does not hide that default and does not add a second tile. Hiding still requires a pin row whose id is the default id.
- Pinning a `bench` / `rack` / `platform` template is allowed. It is the display master. Logging that template stays rejected.
- Machine and cable templates stay unpinnable until resolved. Pins on those variants stay exact ids.
- No SQL backfill. Read-time collapse. Unpinning the tile deletes every pin row that resolves to that movement.

### 6. Exercise review

One URL, `/history/<movementId>`, for a rolling family.

- Opening a variant id redirects to the movement id. Query `month` is preserved.
- `?equipment=` does not split a rolling chart. Station identity is the chip, not the query. Non-rolling review keeps the instance switcher.
- Last, the 21-day window, the e1RM chart, and month-to-month all read `movementMemberIds`.
- Each working set shows a station chip from `catalog[set.exercise_id].brand` when brand is present. Leftover template rows have no brand and no chip.
- Session-best e1RM is the max stored eligible e1RM in that session across members. The chart is one series. It does not overlay two stations as two lines.
- Month compare PRs use the same movement scope as `workoutRecords`. Volume sums the member sets. It does not average them.
- Header title is the template name. The pin control writes the movement id.

### 7. Logging

Sets keep the exact variant id. Proved two ways.

1. `logSet` inserts `exercise_id: input.exerciseId` after `isLoggableExercise` rejects the template. This design does not change that function in the key slice.
2. `movement.test.ts` runs `comparisonScope` on a Flex incline set and asserts `exercise_id` is still `bb-incline-bench__flex-fitness__bench` while the key is `movement:bb-incline-bench`.

Slice 4 adds a regression that the insert payload's `exercise_id` is the variant when the target was chosen from family history.

### 8. Data model

Read-time aggregation. `set_log` is authoritative. Family e1RM is replayed, the same way workout records are replayed, not cached on a new column.

`user_exercise_stat` stays the per-station rebuild. Do not write a family `current_e1rm` there. Pattern strength already pools other exercises. A family stat row would double-count.

## What the lifter sees

**Track.** Pin Barbell Incline Bench. The tile is one e1RM, one delta, one sparkline, across Flex and Nautilus and any pre-brand rows. Tap opens `/history/bb-incline-bench`.

**Exercise review.** Last session lists sets with a Flex Fitness or Nautilus chip. The chart does not reset when the bench changes.

**Session.** Choose bench still runs before the first set. The suggested load follows the family's last pounds. The saved set name is the brand variant.

**Machines.** Hammer and Cybex chest press stay two tiles if both are pinned, two charts, two calibrations.

**Cables, under the default.** Same as machines for numbers. The history sheet can still show both brands when opened from a session.

## Superseded lines

Do not implement the old sentence and this spec at once.

| Old lock | Where | Replacement |
| --- | --- | --- |
| Records, progression, and review stay exact. Split PR chains are accepted. | Station spec history policy, open question 1, records section, mermaid "exact exercise_id" node | Exact for machine and cable. Movement scope for `bench` / `rack` / `platform` / `none`. |
| Do not merge PR numbers across family members. Pins on a variant stay exact. Family-latest numbers and href. | `docs/ARCHITECTURE.md` History and reporting. `docs/FEATURES.md` §6 and §8. Station spec Track section. `buildBoardLifts` tests that encode family-latest. | Movement aggregate for rolling families. Variant pins collapse to the template. Family-latest remains only for cable default tiles (`lat-pulldown`) until Card 2 is reversed. |
| Identity is `(exercise_id, equipment_instance_id)` for every record. | `docs/DECISIONS.md` Workout records. `recordScope`. | That pair remains the station key. Rolling sets use `movement:<templateId>` and ignore instance id. |
| Stall identity includes the exact exercise, so a brand change starts fresh evidence. | `docs/MONTHLY-PROGRESS.md` shared stall contract. `stall-report.ts`. | Brand change inside a rolling movement does not start fresh evidence. A different template, a machine, or a cable still does. |

`exerciseFamilyIds` comments stay true for browse.

## Implementation slices

Code slices are for Composer 2.5. Architecture questions stay with Grok and this spec. Each slice is green on its own. Do not start slice N+1 on a red slice N. None of them add a column.

1. **Wire the key into records.** `workoutRecords` groups with `comparisonKey`. Eligibility stays `eligibleRecordSet`. Tests from the matrix for two benches, two machines, two cables, leftover template plus variant, and bodyweight historical load still reconstructed per set. No UI.
2. **Exercise review read.** Load `movementMemberIds`. Redirect variant URLs. Station chip on Last and the session list. Chart, 21-day window, and month compare use those rows. Agent exercise-review tool uses the same id list and still must not blend machines. `?equipment=` unchanged for non-rolling.
3. **Track and pins.** Rolling tiles aggregate session-bests. Replace the family-latest assertion for benches. Keep it for `lat-pulldown`. Read-time pin collapse. Allow pinning a rolling template. Cap counts movement keys.
4. **Session targets.** Ordinary-pound `sessionTarget` input is family history. Cable and machine inputs stay one id. Assert the `logSet` insert id is still the variant.
5. **Coach, Fluid, monthly.** `stall-report` context uses `comparisonKey`. Monthly PR totals follow `workoutRecords`. Monthly best e1RM uses the movement key for rolling families. Coach fixed-load rows use the same key. Update FEATURES from "specified" to "shipped" only in this slice.

Slice 1 can import `movement.ts` as it exists. If Card 2 comes back `rollup`, stop and redesign the cable value before flipping `rollsUp`. Do not treat the reverse as a one-line predicate change.

## Test matrix

Must pass before the feature is called shipped. Rows marked **now** are in `movement.test.ts` on this branch. The rest belong to the slice named.

| Behavior | Expect | Slice |
| --- | --- | --- |
| Flex incline 185×8, then Nautilus incline 185×9, same user | one rep PR on movement `bb-incline-bench` | 1 |
| Flex e1RM 200, later Nautilus e1RM 205 | one e1RM PR, improvement from 200 | 1 |
| Same two sets on two chest-press machines | no shared PR | 1, **now** for the key |
| Hoist pulldown and Nautilus pulldown | different keys, no shared PR | 1, **now** for the key |
| Leftover `bb-incline-bench` row plus a later variant | one movement key, set id unchanged | **now** |
| Dumbbell incline vs barbell incline | different keys | **now** |
| Custom cable, no base | its own station key | **now** |
| Two equipment instances of one machine | different station keys | **now** |
| Two equipment instances of one incline variant | same movement key | **now** |
| Unknown id | station key, no family | **now** |
| Review of either incline URL | one page, both brands as chips, one chart | 2 |
| Machine review | still one exact id, instance switcher intact | 2 |
| Pin incline variant | tile numbers are the family, href is `/history/bb-incline-bench` | 3 |
| Pin two incline brands | one tile, one cap slot | 3 |
| Default bench tile | aggregate, not `latestFamilyMember` | 3 |
| Default pulldown tile | still family-latest, not a blend | 3 |
| New bench, family has history | target uses family pounds | 4 |
| New cable brand | target does not copy the other stack | 4 |
| Saved set | `exercise_id` is the variant | 4, **now** for the pure scope |
| Stall series across two benches | one series | 5 |
| Stall series across two machines | reset | 5 |

## Out of scope

- Shipping slices 1–5 in this PR.
- Exercise art.
- Rewriting historical `set_log` rows.
- Activating `equipment_instance` as a station.
- Merging movement patterns (bench press and incline are different templates).
- AI Coach product slices other than the review tool's id list in slice 2.
- Changing e1RM math in `e1rm.ts`.
