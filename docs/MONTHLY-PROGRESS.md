# Monthly progress — first increment of #30

`/analytics/month?month=YYYY-MM` is an authenticated, read-only consumer of the pure
version 1.0 `buildMonthlyReport`. Progress links to it. No migration or new secrets.

## Contract

- Report timezone defaults to America/Chicago. Completed months compare complete
  calendar months; current month compares elapsed dates with the same prior-month
  dates, capped at the prior month's end. Both exact windows are displayed.
- Finished sessions are bucketed by performed date, never set creation date. Empty
  finished workouts count as workouts. Future, unfinished and foreign-owner sessions
  are excluded. Sets and sessions are deduplicated by ID.
- `workoutRecords` replays each selected workout with the complete earlier baseline,
  preserving its finish-before-start rules and historical bodyweight reconstruction.
  Rep PRs are final distinct workout/exact-exercise/equipment/normalized-load records;
  e1RM PRs are one best record per workout/exact identity. First observations and ties
  do not earn records. Later improvement within that first workout follows the existing
  recap contract and may earn a record with no historical delta.
- Monthly best estimated 1RM is the maximum **stored** eligible working-set estimate
  per exact exercise/equipment identity within each window, rounded to 0.1 lb.
  Session points and exposure counts support inspection. Missing stored estimates are
  counted as a quality limitation, not regenerated using current bodyweight.
- The existing recap engine recomputes external-load e1RM from the canonical formula
  but recovers bodyweight from stored values. Monthly trend values intentionally use
  persisted estimates as required by #30. If old persisted estimates differ from the
  formula, recap PR values and the monthly trend can differ; do not silently rewrite
  history or invent an alternate recap algorithm.
- No prior comparison means `new`/No prior comparison (not a gain). No current
  exposure means `not_trained` (not decline). Current exposure without a valid stored
  estimate means `unavailable`. Any signed change is descriptive, not a stall signal.
- Both reads use owner predicates, finished-session filtering and UUID keyset pages.
  Pagination continues until an empty page, even when the server returns fewer rows
  than requested. History through a broad end bound is loaded; the pure report applies
  the precise local-date cutoff. All earlier exercises are currently loaded to retain
  true baselines; incremental/materialized baselines are future optimization work.
- No application cache or persisted monthly aggregate: revisiting the route rebuilds
  from current saved sets. Existing weekly API/report contracts are unchanged.

## Sample

July: bench 100 × 6; August 2: 100 × 7; September 2: 100 × 8 then 100 × 11;
September 8: 100 × 9 (same RIR). September 1–13 has two workouts, one fixed-load
rep PR and one e1RM PR. The September 2 recap retains its achievement even after
September 8. August 1–13 has one of each PR against July's baseline. September's
strength comparison uses its best stored session estimate versus August 2.

## Remaining #30 work (issue stays open)

Share a context-aware stall contract before adding actionable signals. Inspection found
that weekly Coach `slotExposures` filters the latest exercise across all matching slots'
exposures, while Fluid's plateau path operates inside a folded adaptation phase. Coach
resolves phase prescriptions and suppresses a latest deload, but does not fully reset
its historical plateau series at phase/rep-range or away-and-back exercise boundaries.
Do not label monthly flatness as a plateau. Reconcile these paths with adaptation history,
phase changes, rep gains, 3/4 stalled-exposure patience and 14-day minimum, including
regressions for deloads and exercise swaps, in the next increment.

#31 remains the richer UI slice: ranked insights, sparklines, history-route filters/back
context, integrated weight trend and supported stall evidence. #32 is design only; #33
remains blocked. This first preview uses existing finished-session recaps as evidence.

## Verification / preview

Pure tests cover partial/completed months, February/leap/year boundaries, Chicago UTC
midnight/DST, recaps, historical edits/deletion, distant baselines, stored estimates,
bodyweight, equipment identity, ties, first marks, missing data, user isolation,
short pages, >1,000 rows and failed reads. Full suite: 272 passing tests.

Preview checklist: Progress → Review monthly strength & records; switch months, inspect
current/prior dates, expand supporting workouts and achievements, follow a recap and
use browser Back. Check narrow/mobile fit and keyboard month navigation. Authenticated
visual verification is still pending; no synthetic user records were written.
