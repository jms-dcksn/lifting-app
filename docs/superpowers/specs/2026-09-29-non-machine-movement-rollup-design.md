# Non-machine movement rollup for e1RM and PR records

**Status:** Design, awaiting James. Not shipped. Approving this PR does not answer the cards. Do not implement a slice until the card it depends on is answered. Do not merge.
**Date:** 2026-09-29
**Code on this branch:** pure key only (`src/lib/strength/movement.ts`). Nothing else imports it. If Card 1 comes back `exact`, delete that module. Do not wire it on the strength of this PR.
**Locks still in force:** station composition (James 2026-09-21), including split PR chains, exact progression, and exact review. This spec proposes changes. It does not replace those sentences.

## Who this is for

The lifter who pins Barbell Incline Bench and changes gyms. Today Flex Fitness and Nautilus are two e1RM charts, two PR chains, and two Track numbers. After the slices, that pin is one strength story. Each logged set still names the bench.

The next engineer inherits one comparison key, not a second id column and not a special case in each screen.

Each card has one reverse word. That word does not answer the other cards. Approving the PR answers none of them.

## Decision Card 1. Record and review story for ordinary pounds

**Recommendation.** For `bench`, `rack`, `platform`, and `none`, compare e1RM, rep PRs, and top-weight on the seeded template id. Exercise review, Track numbers, and All-lifts follow that key. Keep writing `set_log.exercise_id` as the station that was loaded.

**Reason.** Those profiles log ordinary pounds. A gym change splits one movement into parallel charts. Profile `none` is already one id. The same key covers it with a member list of one.

**Risk.** Two benches are not the same implement. A higher e1RM can be the pad. The set row shows the brand. This card does not change the next session's load and does not change Fluid.

**Decision needed.** Approve to merge that story. Reply `exact` to keep today's split chains, including the chart. `exact` does not mean "merge the chart and keep per-station targets." Targets are Card 3.

## Decision Card 2. Cables stay exact

**Recommendation.** Do not roll cable families up. A Hoist stack and a Nautilus stack keep separate e1RM, rep-PR, and top-weight chains, separate calibration, and separate session targets. Same rule as machines. The default Pulldown tile stays family-latest, one brand's number, not a blend.

**Reason.** Cable variants set `needs_calibration`. `personal_coefficient` is `observed e1RM / pattern strength from other exercises` on that exact id (`recomputeAndUpsertStat` in `src/app/(app)/session/actions.ts`). `set_log.e1rm` is `computeE1rm` of the raw stack. Maxing those numbers invents a PR when the lifter changed columns. The request named cable inside "non-machine." This card declines raw-stack rollup anyway. A lifter whose only vertical pull is pulldowns may never get a coefficient for the first brand, because the anchor uses other exercises' stats. Dividing by that coefficient is not a ready formula.

**Risk.** A gym change still splits the pulldown chart.

**Decision needed.** Accept this default by saying nothing about cables. Approving the PR is not a yes. The one-word reverse is `rollup`.

`rollup` means stop and redesign a pattern-strength series before any cable code changes. It does not mean `rollsUp` returns true. It does not mean `max(raw e1RM)`. Rep PRs, top-weight, and session targets stay on the exact station in that redesign. Sets with no coefficient stay out of the family series.

## Decision Card 3. Session targets stay on this station

**Recommendation.** Keep today's target. `selectProgressionReference` and `sessionTarget` see this station's first sets only. A new bench or cable brand takes `startingWeight()` (pattern estimate, low confidence, `rep_min`). It does not copy the other station's weight or rep rung.

**Reason.** The chart can be one story while the bar in front of the lifter is another implement. Alternating gyms in one slot is worse than a first visit. The latest same-slot exposure wins, then the higher e1RM inside that window. The easier pad's pounds land on the harder pad. A miss under `rep_min` then lowers the next target for the easier pad too. That seesaw is in `progression.ts` today once the input list contains both brands. Card 1 does not require it.

**Risk.** Track can say 200 lb while the first session on a new bench says "first time" and suggests a pattern load. The history sheet still lists both brands.

**Decision needed.** Accept per-station targets. Reply `family` to feed `movementMemberIds` into the session page, the agent next-workout tool, and Coach `exerciseProgressionReference`. `family` includes the seesaw above. If Card 1 is `exact`, this card does nothing.

## Decision Card 4. Stall and Fluid stay per station

**Recommendation.** A brand change still starts a new stall series, as `recordScope` does today. Fluid keeps matching assessments on exact exercise id.

**Reason.** Continuing the series is the one rollup effect that changes the program. A harsher bench can pile up no-gain exposures and trigger a rep-band change or a swap. An easier bench can hide a plateau behind a pad-driven e1RM jump. `fluid.ts` ranks other loggable exercises in the pattern as swap candidates, and a sibling brand is loggable, so it can be offered as a new movement. That ranking is a separate bug from the chart.

**Risk.** A gym change still looks like a new lift on the stall card, even when Card 1 has merged the chart.

**Decision needed.** Accept the reset. Reply `continue` to use the movement key in `stall-report` and in `buildExerciseTrends` / `slotExposures`. `continue` also requires Fluid to match the assessment on the movement and to exclude sibling stations from the swap pool. If Card 1 is `exact`, this card does nothing.

## Principles that changed a choice

Only principles whose leaf was read this session, from the uploaded skill files. Those files are not in the repo.

| Principle | Choice it changed |
| --- | --- |
| Model the domain | One `comparisonScope` over movement vs station. Not a profile `if` copied into records, review, Track, stall, and Coach. Not a new id table. |
| Exhaust the design space | Three whole shapes (below). Locked read-time scope. Rejected a stored `rollup_exercise_id` and a third master row. |
| Redesign from first principles | Record scope is the movement for ordinary pounds, as if the station had always been an annotation on the set. Family-latest tile numbers are not kept beside a new rollup. |
| Subtract before you add | No `rollup_exercise_id`. No pin backfill. No revival of `equipment_instance` as station identity. `exerciseFamilyIds` stays browse-only. |
| Foundational thinking | `movement.ts` is the key, landed before any screen reads it. Later slices call it. They do not invent a second key. |
| Experience first | One review URL for the chart. Targets stay on this station after the seesaw case. The earlier family-pounds choice is withdrawn unless James replies `family`. |
| Sequence verifiable units | Slices 1–5 each end in a test from the matrix. This branch is the key only. |
| Prove it works | `movement.test.ts` asserts keys. It does not run `logSet`. The old "logged id is not rewritten" test only checked a local object. Slice 4 is the insert proof. |

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
- stall, Fluid, and Coach series identity only if Card 4 is `continue`

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

Card 3 default is today's exact station. `movementMemberIds` is not a target input.

`recommend()` keeps matching `stats.find(s => s.exerciseId === target.id)`. Do not stuff a sibling's `current_e1rm` into that match.

The session page buckets first sets by exact `exercise_id` and the card reads `progressionByExercise[exerciseId]` (`src/app/(app)/session/[id]/page.tsx`, `active-session.tsx`). That stays. Only a `family` reply widens the session page, the agent next-workout tool, and Coach `exerciseProgressionReference` to `movementMemberIds`, and that reply includes the seesaw in Card 3. Those three callers move together so the proposal and the bar match. The input is the first-set list, not a synthetic stat row.

### 5. Pins

Pin the movement, not the station.

- The pin key for a rolling exercise is `movementId`. Default compound tiles already use the template id. Their numbers and href stop following `latestFamilyMember` and start following the aggregate.
- A stored pin on `bb-incline-bench__flex-fitness__bench` displays as a pin on `bb-incline-bench`. Two variant pins of one movement are one tile. Cap 8 counts distinct keys.
- A variant pin whose movement is already a default compound does not hide that default and does not add a second tile. Hiding still requires a pin row whose id is the default id.
- Pinning a `bench` / `rack` / `platform` template is allowed. It is the display master. Logging that template stays rejected.
- Machine and cable templates stay unpinnable until resolved. Pins on those variants stay exact ids.
- No SQL backfill. Read-time collapse.
- A pin row whose id is a default compound id means that tile is hidden (`hiddenDefaultIds`). It does not mean "pinned extra." Unpinning a variant, or collapsing variant pins, never deletes that hide row. Showing the default again deletes only the default id. A Rogue bench pin plus a hidden Bench tile stays hidden. The Rogue row does not add a second tile and does not unhide Bench.

### 6. Exercise review

One URL, `/history/<movementId>`, for a rolling family.

- Opening a variant id redirects to the movement id. Query `month` is preserved.
- `?equipment=` does not split a rolling chart. Station identity is the chip, not the query. Non-rolling review keeps the instance switcher.
- Last, the 21-day window, the e1RM chart, and month-to-month all read `movementMemberIds`.
- Each working set shows a station chip from `catalog[set.exercise_id].brand` when brand is present. Leftover template rows have no brand and no chip.
- Session-best e1RM is the max stored eligible e1RM in that session across members. The chart is one series. It does not overlay two stations as two lines.
- Month compare PRs use the same movement scope as `workoutRecords`. Volume sums the member sets. It does not average them.
- Header title is the template name. The pin control writes the movement id. The page currently hides that control when `!isLoggableExercise` (`history/[exerciseId]/page.tsx`). A rolling template is not loggable and still shows the pin.
- Info copy that says the screen is one exact exercise changes on a rolling page. Last today says "this exact exercise and equipment" (`exercise-review.tsx`). The chart says "this exact lift" (`review-chart.tsx`). Those sentences become the movement, with the station named on the set. Machine and cable pages keep the exact wording.

### 7. Logging

Sets keep the exact variant id. `logSet` inserts `exercise_id: input.exerciseId` after `isLoggableExercise` rejects the template (`session/actions.ts`). This PR does not execute that function. The pure scope returns `movement:bb-incline-bench` for a set whose `exercise_id` is the Flex variant. That is a key assertion, not an insert test.

Slice 4, and only if Card 3 is `family`, adds a regression that the insert payload's `exercise_id` is the variant when the target was chosen from family history. Card 1 does not need that regression. Logging is already exact.

### 8. Data model

Read-time aggregation. `set_log` is authoritative. Family e1RM is replayed, the same way workout records are replayed, not cached on a new column.

`user_exercise_stat` stays the per-station rebuild. Do not write a family `current_e1rm` there. Pattern strength already pools other exercises. A family stat row would double-count.

## What the lifter sees

**Track.** Pin Barbell Incline Bench. The tile is one e1RM, one delta, one sparkline, across Flex and Nautilus and any pre-brand rows. Tap opens `/history/bb-incline-bench`.

**Exercise review.** Last session lists sets with a Flex Fitness or Nautilus chip. The chart does not reset when the bench changes.

**Session.** Choose bench still runs before the first set. The suggested load stays this station's own rung. A new bench uses the pattern estimate. The saved set name is the brand variant. Family pounds on the next set happen only if Card 3 is `family`.

**Machines.** Hammer and Cybex chest press stay two tiles if both are pinned, two charts, two calibrations.

**Cables, under the default.** Same as machines for numbers. The history sheet can still show both brands when opened from a session.

## Proposed replacements

The old sentences stay in force until the named card is answered. Do not delete them in the owning doc.

| Old lock | Where | Replacement |
| --- | --- | --- |
| Records, progression, and review stay exact. Split PR chains are accepted. | Station spec history policy, open question 1, records section, mermaid "exact exercise_id" node | Exact for machine and cable. Movement scope for `bench` / `rack` / `platform` / `none`. |
| Do not merge PR numbers across family members. Pins on a variant stay exact. Family-latest numbers and href. | `docs/ARCHITECTURE.md` History and reporting. `docs/FEATURES.md` §6 and §8. Station spec Track section. `buildBoardLifts` tests that encode family-latest. | Movement aggregate for rolling families. Variant pins collapse to the template. Family-latest remains only for cable default tiles (`lat-pulldown`) until Card 2 is reversed. |
| Identity is `(exercise_id, equipment_instance_id)` for every record. | `docs/DECISIONS.md` Workout records. `recordScope`. | That pair remains the station key. Rolling sets use `movement:<templateId>` and ignore instance id. |
| Stall identity includes the exact exercise, so a brand change starts fresh evidence. | `docs/MONTHLY-PROGRESS.md` shared stall contract. `stall-report.ts`. | Brand change inside a rolling movement does not start fresh evidence. A different template, a machine, or a cable still does. |

`exerciseFamilyIds` comments stay true for browse.

## Implementation slices

Code slices are for Composer 2.5. Architecture questions stay with Grok and this spec. Each slice is green on its own. Do not start slice N+1 on a red slice N. None of them add a column.

Slices 1–3 run only after Card 1 is approved. They do not import `movement.ts` before that. If Card 1 is `exact`, delete the module. Slice 4 runs only after `family`. Slice 5's stall work runs only after `continue`. Monthly totals follow `workoutRecords` with slices 1–3 and do not wait on Card 4.

1. **Wire the key into records.** `workoutRecords` groups with `comparisonKey`. Eligibility stays `eligibleRecordSet`. `finishSession`'s best and previous-best maps (`session/actions.ts`, keyed today by `exercise_id` only) use the same key so one movement is one overload line. Replace these tests in the same slice, or they will force the old split back in. `records.test.ts` ("isolates exact exercises...") expects two equipment instances of one barbell id to share no record. `station-calibration-records.test.ts` ("does not merge leftover template PRs into a new family variant") expects a leftover `bb-incline-bench` row and the Flex variant to share no record. Keep the cable and machine cases in that file. Bodyweight historical load stays reconstructed per set. No review UI.
2. **Exercise review read.** Load `movementMemberIds`. Redirect variant URLs. Station chip on Last and the session list. Those rows are `weight × reps` today. The brand is not on the line. Chart, 21-day window, and month compare use the same rows. Rewrite the Last and chart info sentences that say "exact exercise" / "exact lift" on rolling pages only. Show the pin on a rolling template even though `isLoggableExercise` is false. Agent exercise-review tool uses the same id list and still must not blend machines. Update `docs/ai-coach.html` in this slice. `?equipment=` unchanged for non-rolling.
3. **Track and pins.** Rolling tiles aggregate session-bests. Replace the family-latest assertion for benches. Keep it for `lat-pulldown`. `exerciseSummaries`, `e1rmPrFeed`, and `weightPrs` are one row per exact id today. All-lifts and those feeds collapse a rolling family to the movement id so Flex and Nautilus are not two incline rows. Read-time pin collapse that never deletes a default-id hide row. `toggleExercisePin` already allows a default-compound template and rejects every other `needsStation` id (`pins/actions.ts`). Allow a rolling template (`bb-incline-bench` and the other non-default bench, rack, and platform seeds). Keep refusing machine and cable templates. Cap counts movement keys.
4. **Session targets, only if Card 3 is `family`.** Widen `progressionByExercise` in the session page, the agent next-workout tool, and Coach `exerciseProgressionReference` together. Cable and machine inputs stay one id. Do not write a family stat for `recommend()`. Assert the `logSet` insert id is still the variant. Update `docs/ai-coach.html` because the next-workout tool's inputs change.
5. **Coach, Fluid, monthly.** Monthly PR totals and monthly best e1RM follow the Card 1 key. Coach fixed-load rows for ordinary pounds use that key too. Stall, `buildExerciseTrends`, and `slotExposures` change only if Card 4 is `continue`, and then Fluid's assessment match and swap pool change with them. Update FEATURES from "proposed" to "shipped" only for the cards that were approved.

If Card 2 comes back `rollup`, stop and redesign the cable value before any predicate change. Do not treat that word as a one-line flip of `rollsUp`.

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
| Unknown id | station key, no family | **now** |
| Review of either incline URL | one page, both brands as chips, one chart | 2 |
| Rolling review info copy | does not say the page is one exact exercise | 2 |
| All-lifts incline | one row for the template, not one per brand | 3 |
| Nautilus card after Flex history | pattern estimate, not Flex pounds, unless Card 3 is `family` | 4 |
| Coach proposal for that slot | same rule as the session card | 4 |
| Machine review | still one exact id, instance switcher intact | 2 |
| Pin incline variant | tile numbers are the family, href is `/history/bb-incline-bench` | 3 |
| Pin two incline brands | one tile, one cap slot | 3 |
| Default bench tile | aggregate, not `latestFamilyMember` | 3 |
| Default pulldown tile | still family-latest, not a blend | 3 |
| New bench, family has history | pattern estimate, not the other bench's pounds | default |
| New cable brand | target does not copy the other stack | default |
| Saved set | `logSet` insert id stays the variant | already true |
| Leftover incline template plus Flex variant in `workoutRecords` | one chain after Card 1 | 1 |
| Two equipment instances of `bb-bench` in `records.test.ts` | one chain after Card 1 | 1 |
| Stall series across two benches | still resets, unless Card 4 is `continue` | 5 |
| Stall series across two machines | reset | 5 |

## Out of scope

- Shipping slices 1–5 in this PR.
- Exercise art.
- Rewriting historical `set_log` rows.
- Activating `equipment_instance` as a station.
- Merging movement patterns (bench press and incline are different templates).
- Agent tool changes outside slices 2 and 4. Those two slices update `docs/ai-coach.html`.
- Changing e1RM math in `e1rm.ts`.
