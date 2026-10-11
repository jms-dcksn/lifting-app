# Coach check-in report v1

`src/lib/coach-check-in.ts` defines the versioned `CoachCheckInReport`. It is the single
derived contract for the Track Coach snapshot, its clipboard text, and the agent’s
`weeklyCoach` tool. Both app consumers use the session-scoped `loadCoachUi`.

The builder is pure: callers supply sessions, working sets, program days/slots/phases, the
exercise catalog, and bodyweight context. It returns facts and classifications only. It does
not recommend programming changes or mutate training data.

## Time windows

- The default reporting timezone is `America/Chicago`.
- The current window is seven calendar dates ending on `generatedAt` (inclusive).
- The prior comparison window is the immediately preceding seven calendar dates. The windows
  never overlap.
- A session belongs to a window by `performed_at`. Future sessions are excluded.
- Only sessions with `finished_at` contribute to execution metrics. Open sessions are excluded
  and counted as data-quality warnings.

## Metric definitions

- **Adherence:** completed sessions versus the supplied weekly plan count.
- **Duration:** `finished_at - performed_at`, with 45 minutes as the comparison target. Values
  below 5 or above 240 minutes are excluded and flagged.
- **Set execution:** completed non-warmup sets versus the effective prescribed set count for
  each completed session. The session's stored `week_index` selects its phase; deload set
  multipliers and RIR ranges therefore apply to that historical exposure.
- **RIR execution:** actual RIR is compared with the effective phase RIR range. Missing RIR and
  sets that cannot be matched to a program slot are reported explicitly.
- **Hard sets:** non-warmup sets at RIR 0–1. Specialization totals use the explicit mappings
  below. Mappings intentionally overlap because one compound set may provide meaningful volume
  to more than one specialization group. Each group also carries `prescribedSets`: the
  effective target-set count from finished sessions in that window, using the programmed
  slot exercise and skipping prescriptions whose target RIR floor is above 1 (deload / easy
  phases). This field is additive on schema 1.0. When hard sets miss that count, the check-in
  and clipboard surface a one-line flag (`Hard-set shortfall: Hamstrings 5/6 · Glutes 6/7`).
  The flag does not rewrite the program.
- **Fixed-load progress:** shipped code compares the best reps at an exact exercise
  and exact raw logged weight in the current window with the best reps in the prior
  window. Ordinary-pound families share the template movement key
  (`src/lib/strength/movement.ts`). Machine and cable stay exact.

| Group | Included movement patterns |
| --- | --- |
| Delts | Vertical press, lateral raise, rear delt |
| Biceps | Elbow flexion |
| Triceps | Elbow extension |
| Quads | Squat, lunge, knee extension |
| Hamstrings | Hinge, knee flexion |
| Glutes | Squat, hinge, lunge, hip thrust |
| Calves | Calf |

## Exercise trend classification

Each exercise needs four completed exposures with valid e1RM values. The last two exposures
form the recent pair and the preceding two form the comparison pair. `gaining` or `declining`
requires both recent marks to clear both comparison marks by the 1% noise margin. Otherwise the
classification is `flat`; fewer than four valid exposures is `insufficient_data`. This prevents
one unusually good or poor session from becoming a trend. The snapshot and clipboard hide the
per-exercise insufficient-data list and collapse it to a count (`N waiting on 4 exposures`)
until an exercise has four comparable marks.

## Privacy and compatibility

The report contains exercise slugs and display names but no email addresses, auth claims, user
IDs, session IDs, program IDs, program-day IDs, or program-slot IDs. Consumers should key on
`version` before relying on its shape. Additive or breaking contract changes require an explicit
version decision and matching fixture coverage.

The current schema does not snapshot a slot prescription when a workout starts. The report uses
the current definition of the historical slot plus the session's stored week. If a slot is
edited after training, the old session's displayed prescription can reflect that edit; unmatched
or deleted slots are surfaced as data-quality warnings rather than guessed.

## Reviewable recommendations

`src/lib/coach-recommendations.ts` is a separate deterministic proposal layer over this factual
report and its source rows. Keeping it separate preserves the v1 report contract while allowing
the Track Coach workflow and clipboard export to add coaching actions.

- Normal load and rep proposals call `sessionTarget()` with the same bounded best-recent reference
  as the active workout. The slot's latest exact-exercise exposure anchors the window; a stronger
  first set on another program day after that anchor may advance the target, but an older all-time
  best cannot.
- A first set below `rep_min` produces a rep-floor target, with load recalibrated from the
  observed reps/RIR (including bodyweight for weighted movements); generated targets never
  prescribe repetitions outside the slot's range.
- The first working set must be harder than the effective RIR range in two consecutive comparable
  slot exposures before proposing a one-increment load reduction. Harder back-off sets and one
  isolated first-set miss never trigger it.
- Plateau review calls the existing `detectPlateau()` and equipment-specific patience rule; one
  down exposure explicitly produces a keep-the-movement recommendation instead.
- An effective deload phase suppresses normal overload. Significant pain in the current report
  window suppresses all progression advice and surfaces a conservative review prompt, not a
  diagnosis.
- With no finished slot-linked exposure, the engine returns `insufficient_data` rather than using
  cross-exercise estimates for a weekly progression decision.

Every proposal carries an opaque key, program-day context, action, rationale, evidence
window/count, supporting first-set summary, confidence, and a plain-language data-sufficiency
statement. Accept, dismiss, and defer
write only to `coach_recommendation_decision`; they never alter a program, slot, set, or session.
A deferred proposal is hidden for seven days, while a new exposure produces a new proposal key.

The Proposed next steps UI shows only actionable proposals awaiting review. Accepted and
dismissed items disappear after a successful save and stay hidden across reloads; active
deferrals stay hidden until their deadline. The list applies a decision immediately so Accept,
Later, Dismiss, and Accept all do not stay pending on the Coach page refresh; a failed save
restores the proposal and shows an error. Insufficient-data kinds or confidence never render
as next-step cards. The remaining section is collapsible (initially open), with an actionable
count and rationale/evidence collapsed per suggestion. If nothing needs review, one compact
empty-state line replaces the list. The API and coaching export retain the full diagnostic
recommendations; this is a presentation change, not a change to the recommendation engine.

After generation, proposals are ranked by confidence × impact so the list is not slot order.
Medium-or-better `add_load` on compounds (press, pull, squat, hinge, lunge, hip thrust) scores
as `now`; low-confidence hold-load / chase-reps on isolation scores as `next`. Pain, repeated
effort misses, and plateau reviews stay at the top. Mixed lists use Do first / Also tiers in
the UI and clipboard. Double-progression still comes from `sessionTarget()`; ranking does not
invent a second progression rule.

## Shared stall evidence

Plateau reviews now consume `stall-report.ts` through the complete owner-scoped loader,
shared with Fluid and monthly review. Phase/deload/identity/adaptation boundaries reset
comparison history, and fixed-load rep gains reset the stall clock. Pain/deload/effort
priorities and the report schema remain unchanged. See the detailed
[contract and history limits](MONTHLY-PROGRESS.md#shared-stall-contract).

## HTTP export retirement (#182, 2026-10-08)

The unused private weekly HTTP export, bearer/query-token handler, and route-only
secret-client loader were removed. Track Coach and `weeklyCoach` still use
`loadCoachUi`; `SUPABASE_SECRET_KEY` remains for local live agent evals.

Caller audit before removal:

- Repository callers: only the route and its tests referenced the HTTP handler/loader.
- GitHub: all three hosted workflows inspected; no scheduled trigger or export caller.
- Vercel: lifting-app project API returned `crons.definitions: []`; the dashboard agreed.
  Project environment settings already lacked both `COACH_API_*` variables.
- ChatGPT Scheduled: no active or paused tasks in the signed-in account.
- Local: no user crontab, Codex automation files, or matching LaunchAgent references.
- Vercel runtime logs: no route-path matches in the latest 50-minute window; filtering
  by path covers bearer and query-token calls without reading credentials. A query
  from October 1 failed because Hobby retention is one hour. This does not prove
  absence of older calls or callers on other accounts/services. The owner’s October 1
  unused confirmation is recorded in issue #182.

No deployment settings needed deletion. Local route variables were removed where
present; the Supabase secret was preserved. This audit does not deploy the removal.

Saved session/set deload flags suppress normal overload and exclude recovery from strength
and fixed-load progress comparisons. Volume, adherence and executed-set evidence remain
visible. Stall series still reset at recovery, including after phase edits. Historical
deload classification is snapshotted; full historical slot prescriptions remain mutable.
