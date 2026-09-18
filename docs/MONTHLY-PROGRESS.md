# Monthly progress — canonical metrics (#30)

`/analytics/month?month=YYYY-MM` is an authenticated, read-only consumer of the pure
version 1.2 `buildMonthlyReport`. Board links to it. No migration or new secrets.

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

## Shared stall contract

`stall-report.ts` prepares one contiguous series for each program slot. Monthly review,
weekly Coach (UI/export/API), and Fluid all consume it. `strength/plateau.ts` retains the
shared threshold calculation and Fluid's intervention ladder.

- Only completed, owner-scoped workouts count, grouped by session ID and ordered by
  `performed_at`. Logging several workouts on one date does not collapse their exposures.
- Identity includes the exact exercise and equipment instance. A swap away and back,
  a mixed-identity workout, a phase change, or a recorded adaptation starts fresh evidence.
  Phase/rep-range/RIR/set-count context comes from the stored session week and adaptation
  history. Adaptation rows are ordered by timestamp with ID as a deterministic tie-break.
- Deloads break the series. A latest deload is internally `deload`; the first subsequent
  normal workout establishes a new baseline. Invalid/missing estimates and unknown weeks
  in phased programs also break continuity. Warmups never contribute.
- Normal patience remains four stalled exposures for barbell and three for other equipment,
  in addition to the initial baseline, spanning at least 14 elapsed days of training.
  Existing explicit per-slot patience overrides are honored consistently by all consumers.
- A running-best e1RM improvement must exceed max(1%, 1 lb), as before. A rep increase
  at a previously observed canonical effective load also resets the stall clock, even if
  stored e1RM is flat. First observations at a new load are not rep gains. Bodyweight load
  is reconstructed from the historical set, never the current profile.
- Evidence includes dated session links, stored session-best estimates, normalized-load rep
  bests/gains, last improvement or baseline, exposures, elapsed days, phase, and rep range.
  `monitoring` and `insufficient_data` are internal states; only `plateau` becomes a card.
- A change accepted after the latest workout clears the former plateau immediately.
  Historical monthly views ignore adaptations after the selected window. Late entry of an
  old workout uses its performed date for context rather than borrowing later adaptations.
- Monthly best change and plateau status remain separate. A lower monthly best alone
  cannot trigger this signal. Only series whose latest exposure falls within the selected
  month/window appear in that monthly report; skipped lifts never become declines/stalls.
- No recommendation or program change is applied by this report. Coach still prioritizes
  pain, deload, and repeated effort misses. Fluid retains its dismiss/snooze and confirmation
  behavior; the report shows the underlying evidence independently of dismissal state.

### Reconciled differences and limits

Previously Coach filtered all history to the latest exercise, potentially joining history
across an away-and-back swap. Fluid grouped by set creation date and included unfinished
work. Both now use the same complete, phase-aware session series and rep-progress rule.
Coach's repeated-effort/decline comparisons also respect the resulting contiguous series.

The schema does not retain snapshots of arbitrary program-builder prescription edits.
Historical context can only use the stored session week, current phase/slot definitions,
and recorded adaptations; unrecorded old builder values cannot be reconstructed. Deleted
slots are omitted from stall classification, while their sets still contribute PR totals.
Missing/invalid data fails conservatively instead of inventing evidence.

All session, set, slot, day, phase, and adaptation reads use explicit owner predicates and
keyset pagination, including short server pages. Monthly replay shares its history with
stall loading. Coach currently loads an additional complete strength history for reliable
stall evidence; broader weekly-report query pagination remains a separate existing limit.
Failed reads surface an error rather than a partial, apparently authoritative report.
No persisted monthly cache; finish/edit/delete revalidate the monthly and Board routes.
Weekly response schema/version and record semantics remain unchanged.

## Monthly dashboard (#31)

Month review shows four compact summary cards, the five largest percentage improvements,
fixed-effective-load rep gains, supported stall evidence, expandable achievements grouped by
exact exercise/equipment, and an expandable all-lifts comparison. Stable, lower-best, new,
not-trained and missing-estimate states stay distinct. Only supported plateaus get a review
card; current-month signals link to the existing Coach next steps filtered to that exercise.
Historical monthly signals are not presented as current recommendations.

Version 1.2 adds `repGains` to the canonical lift report: best eligible reps at the same
normalized effective load in each comparison window. This reuses record eligibility and
historical bodyweight rules. These monthly gains need not be all-time PRs and do not change
record totals or e1RM classification. Editing/removing source sets rebuilds the result.

Small server-rendered SVG trends show dated session points, prior dashed and current solid,
with separate lines and no interpolated bridge across comparison windows. Exact values,
period labels and workout recap links are in the keyboard-accessible disclosure. Every
lift links into `/history/[exerciseId]?month=YYYY-MM&equipment=...`; `none` explicitly means
no equipment instance. This mode consumes the same report and offers a selected-month return
link. It never blends instances or borrows the older all-history route's aggregate. The
unfiltered history route retains its existing behavior.

The shared weight card follows the selected month, including rolling lookback before the
first day. Its summary is as of the selected end date; the goal is explicitly the current
Settings value, since historical goals are not stored. Log weight remains available with
zero workouts. Weight edits refresh the monthly route; workout edits/completion also
invalidate the history drill-down. Period tracking design (#32) specifies optional context
bands on weight and e1RM charts; see [PERIOD-TRACKING.md](PERIOD-TRACKING.md) for the complete
contract. Implementation in #33 adds the view toggle and chart overlays.

## Period × performance weeks (#105)

When period tracking is enabled, month review shows one glanceable card above the summary
metrics. It joins the selected month window, observed `period_observation` dates, weekly
bodyweight averages, finished workouts, and canonical PR counts. Each row is a Monday-Sunday
week clipped to the month (and to today when the month is in progress).

- Purple day marks are observed period days only. Gaps are not filled. Days outside the
  month window stay empty even when the ISO week spills.
- Weight is that week's logged average versus the previous ISO week, using the same
  `bodyweightTrend` helper as the weight card. Missing averages stay blank.
- Strength is canonical PR count from `workoutRecords` in that week. Workout ticks on the
  day strip are finished sessions, including sessions with no records.
- Period weeks / Other weeks totals are descriptive counts and mean weekly weight change.
  They do not classify stalls, change PR totals, infer a cycle, or recommend training.
- The card is omitted unless `sex = female` and `period_tracking_enabled`. Coach, exports,
  and the weekly API are unchanged and still receive no period data.

`buildPeriodPerformanceOverlay` is the pure join. `MonthlyReport.currentWorkouts` lists
finished sessions in the current window so the overlay can count training days without a
second query. No migration or new secrets.

No new tables, secrets, dependencies or migrations. Existing paginated reads retain the
complete historical record baseline through the selected cutoff; this slice does not add
materialized baselines or solve the documented full-history read cost. #32 remains design
only; #33 waits for its resolved specification.

Verification for #31: 303 tests (including server-rendered review/history checks), lint,
TypeScript and production build. Authenticated phone/keyboard/screen-reader review remains
part of the Vercel preview review; server-rendered tests do not replace browser verification.

Preview checklist:
1. Open Board → Month review; compare current and completed months and their dates.
2. Open an improved lift, inspect supporting workouts, and return to the selected month.
3. Expand achievements and All lifts; verify machine names and rep-only improvements.
4. Follow a supported current stall to the filtered Coach next steps, then Show all.
5. Review weight in the same month; edit a reading and verify its rolling average updates.
6. Choose an empty month: weight access remains and unsupported insight cards stay absent.

### Stall example

Five completed barbell sessions on September 1, 6, 11, 16 and 21, each with stored
130 lb e1RM and 100 × 8, produce four stalled exposures over 20 days, with September 1
as the baseline. If September 21 is 100 × 9, the stall clock resets despite the same
stored 130 lb estimate. If September 16 is a deload or another machine, September 21
is a fresh baseline and no review card appears.

## Verification / preview

Pure tests cover partial/completed months, February/leap/year boundaries, Chicago UTC
midnight/DST, recaps, historical edits/deletion, distant baselines, stored estimates,
bodyweight, equipment identity, ties, first marks, missing data, user isolation,
short pages, >1,000 rows and failed reads. The first increment had 272 passing tests. Shared-stall coverage adds phase/deload resets,
rep gains, adaptations, swaps/equipment, incomplete/foreign history, metadata pagination,
historical month cutoffs, and Fluid integration.

Preview checklist: Board → Review monthly strength & records; switch months, inspect
current/prior dates, expand supporting workouts and achievements, follow a recap and
use browser Back. Supported stalls appear in Worth reviewing with expandable workout evidence;
unsupported signals stay hidden. Check narrow/mobile fit and keyboard month navigation. Validation: 296 tests, ESLint, TypeScript and production build pass. The new context
columns/joins were checked read-only against the live schema. Browser access reaches
the magic-link sign-in screen; authenticated visual verification remains pending.
No synthetic user records were written.
