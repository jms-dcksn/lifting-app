# Unified Exercise review design

**Status:** Proposed. Spec only. No product UI in this PR. Awaiting James approval.

**Audited:** boarded product UI on `main` at `fc8a87a` (Lift tab rename). Surfaces:
`src/app/(app)/history/[exerciseId]/`, `src/app/(app)/analytics/` (Track tiles, Explore,
All lifts, week PRs), `src/app/(app)/analytics/month/` (Month review and lift-detail),
recap and in-session history links. Docs checked were `docs/FEATURES.md` sections 7 and 8,
`docs/MONTHLY-PROGRESS.md`, `docs/ARCHITECTURE.md` (History and reporting),
`docs/DECISIONS.md` (Track tiles funnel), and `docs/UI.md` (copy density and InfoButton).

**Companion issue:** [#113](https://github.com/jms-dcksn/lifting-app/issues/113).

James dogfooded Month review and rejected the raw per-lift dump. Accessory cards such as
Cable Curl show a floating **No prior comparison** label, a prior-to-current line that
renders as an em dash then an arrow then `75.3 lb` when prior is empty, exposure counts
such as `2 current / 0 prior exposures`, and a sparkline. That is too much data. It is
especially unintuitive when the prior month has no exposures.

---

## 1. Principles

Apply in this order. Prefer the earlier option.

1. **Experience first.** The lifter asks three questions about one exercise. The screen
   answers those questions in that order. Implementation convenience (reusing the monthly
   report widget as a whole page) lost to that order.
2. **Subtract before you add.** Delete the Month review per-lift dump and the
   `MonthlyHistory` fork before adding a month-to-month picker or extra chart labels.
   Do not stack a third exercise view on top of the two that already disagree.
3. **One screen.** James asked for one shared Exercise review as the core place for a
   lift. Every tap opens that same screen. Track tiles, Explore All lifts, Month review,
   recap, week PRs, and the in-session history control share that destination. Query
   params may set defaults (equipment, return month). They must not swap the template.
4. **Laziness.** Keep the route `/history/[exerciseId]`. Reuse `set_log`,
   `buildMonthlyReport`, `workoutRecords`, `exerciseSummaries`, `E1rmChart`, `InfoButton`,
   and `workout_session.program_id`. Do not add a review table, a cached aggregate, or a
   second chart library.
5. **Minimize reader load.** Collapse `HistoryPage` and `MonthlyHistory` into one
   Server Component tree. One identity rule (exact exercise plus equipment instance).
   One finished-session rule. One e1RM series helper. A new reader should answer "where
   does this number come from?" without tracing two pages.
6. **Copy density.** Visible helper text that is not a label, value, error, or
   confirmation is at most about 6 words or gone. How-it-works copy lives behind
   `InfoButton` and a read-only `Sheet` ([visual copy-density design](2026-09-16-visual-copy-density-design.md),
   [UI conventions](../../UI.md)).

---

## 2. Current fragmentation

Three experiences exist for one tap on a lift. They do not share identity rules, session
filters, or layout.

### 2.1 Track scoreboard and Explore All lifts

`/analytics` is Track. `BoardGrid` tiles (`src/app/(app)/analytics/board-grid.tsx`) link
to `/history/{exerciseId}` with no query string. `ExerciseList` in the Explore sheet
(**All lifts**) does the same. `WeekPrList`, recap `achievements.tsx`, and the in-session
history control also use `/history/{exerciseId}` only.

Each tile shows a short name, rounded current e1RM from `exerciseSummaries`, a signed
delta versus the previous session, and a sparkline of `e1rmSeries.slice(-12)`.
`exerciseSummaries` in `src/lib/analytics.ts` groups by `exerciseId` only.

Explore **All lifts** is a searchable list of logged exercises. **Keep that nav.** It is
the primary entry. It is not the Month review disclosure that uses the same words.

### 2.2 Unfiltered history route

`src/app/(app)/history/[exerciseId]/page.tsx` (`HistoryPage`) when `month` is absent:

- Selects `set_log` working sets for `user_id` and `exercise_id`.
- Does not filter `finished_at`. Unfinished sessions can appear.
- Does not select `equipment_instance_id`. Instances blend.
- Does not select `program_id`.
- The header shows catalog name, `{n} sessions logged`, rounded current e1RM, and pin.
- The overload badge is latest session-best stored e1RM versus the session before it.
- The **e1RM over time** card is Recharts `E1rmChart` of every session with a stored
  estimate, or the current empty copy ("One session so far" plus "log another to see
  your trend line").
- Empty history copy is "No working sets logged yet."
- Then every session as a card of sets (newest first).

There is no route-level test for this page. `src/lib/exercise-history.test.ts` covers
in-session quick history (`loadExerciseHistory`, family ids), not this route.

### 2.3 Month query replaces the page

When `?month=YYYY-MM` is present, `HistoryPage` **does not render** the layout above.
It validates the month, loads `loadMonthlyReport`, and returns `MonthlyHistory`.

`src/app/(app)/history/[exerciseId]/monthly-history.tsx`:

- Back link to `/analytics/month?month=...`.
- A caption shows comparison windows plus ⓘ.
- One card whose label is `liftStates[lift.state]`. For `new` that label is
  **No prior comparison**.
- Reuses `LiftTrend` from month lift-detail (sparkline, prior-to-current line, exposures,
  supporting workouts).
- Missing lift copy is "No working sets for this exact exercise and equipment in these windows."

`liftHref` in `src/app/(app)/analytics/month/lift-detail.tsx` is the only production
caller that passes `month` and `equipment`. `equipment=none` means no instance.

### 2.4 Month review dump

`MonthlyReview` (`src/app/(app)/analytics/month/review.tsx`) already has useful
summaries. Those are month nav, four metric cards, period overlay, **Where you improved**,
**Worth reviewing**, **Achievements**, and weight.

It also inlines `LiftRow`, which renders `LiftTrend`, in three places.

- **Where you improved** (top five `improving` lifts, full trend block).
- **Rep gains without a higher monthly best**.
- **All lifts (N)** disclosure. Every `report.lifts` row. This is the dogfood screenshot.

`liftStates.new` is the string "No prior comparison". `amount(null)` is an em dash, so a
first month of Cable Curl prints as that em dash, then an arrow, then `75.3 lb`. Caption:
`2 current / 0 prior exposures`.

`src/lib/monthly-review.test.ts` currently asserts the drill-down query
(`month=2026-09&equipment=none`) and the `140.0 lb → 150.0 lb` trend line. Those
assertions must move with the UI.

---

## 3. Information architecture

### 3.1 Routes

Keep `/history/[exerciseId]` as the Exercise review URL. Do not add `/review/` or
`/lifts/`. The page title stays the catalog exercise name.

| Query | Meaning |
| --- | --- |
| (none) | Exercise review. Default equipment if only one instance exists in history. If several exist, pick the latest finished exposure and offer a switcher. |
| `equipment=<uuid>` | Exact equipment instance. Required for machine identity. |
| `equipment=none` | Explicitly no instance (same as monthly today). |
| `month=YYYY-MM` | Optional. Sets the month-to-month widget default and a **Back to {month} month review** link. Does **not** replace the page. Invalid month ignores the param (stay on Exercise review). Do not redirect to `/analytics/month`. |

Track stays `/analytics`. Month review stays `/analytics/month?month=YYYY-MM`.
Explore All lifts stays a Sheet panel, not a route.

### 3.2 Entry points (same destination)

| From | Current href | After |
| --- | --- | --- |
| Track `BoardTile` | `/history/{id}` | `/history/{id}` plus `equipment` when the tile identity has one |
| Explore **All lifts** | `/history/{id}` | same as tiles |
| Explore **This week's PRs** exercise name | `/history/{id}` | plus `equipment` from `ExerciseRecords.equipmentInstanceId` |
| Recap / `achievements.tsx` | `/history/{id}` | plus equipment from the record group |
| In-session history control | `/history/{id}` | plus the slot's current equipment |
| Month review lift name | `/history/{id}?month=&equipment=` | same URL shape, but the page is Exercise review with that month preselected |
| Month review stall name | Coach settings only (in-progress) | add Exercise review link. Keep the in-progress Coach link. |

Home last-session opens recap, not history. Recap then uses the table above. No extra
home shortcut.

### 3.3 Month review keeps versus removes

**Keep**

- Month navigation and "Choose a month".
- Window dates plus the existing comparison-window ⓘ.
- Period × performance card when eligible.
- Four summary cards (Workouts, Rep PRs, e1RM PRs, Lifts improving).
- How-PRs-are-counted ⓘ.
- Empty-month card plus weight jump link.
- **Where you improved.** At most five names with percent. No sparkline, no
  prior-to-current line, no exposure counts, no supporting-workouts disclosure.
  The name is the path into Exercise review (`month` + `equipment`).
- **Rep gains without a higher monthly best.** Names and the rep-gain line only.
  Same tap target.
- **Worth reviewing.** Stall evidence stays. Add an Exercise review link. Keep the
  in-progress Coach next-steps link.
- **Achievements.** Grouped by exact identity, recap links. Unchanged.
- Weight card.
- Data-coverage ⓘ when quality counts are nonzero.

**Remove**

- The **All lifts (N)** disclosure and its full `LiftRow` list.
- `LiftTrend` (sparkline, prior-to-current, exposures, supporting workouts) from the
  month page.
- Always-visible **No prior comparison** as a classification label on month rows.
- `MonthlyHistory` as a separate page template.

**Rename collision.** Track Explore **All lifts** stays. Month review must not keep a
control with that label. After subtraction, the month page has no all-lifts list.

---

## 4. Screen hierarchy

One column, `max-w-page`, existing tokens. Sections in this order. Later sections stay
below the fold on purpose.

### 4.1 Header

- Catalog name as `h1.text-display`.
- Equipment instance label only when an instance exists (human `equipment_instance`
  label or gym, not a raw uuid if a label exists).
- Pin `IconButton` for non-template exercises (same as today).
- If `month` arrived from Month review, a back link to that month.

No session-count essay in the header. That number lives in Today or behind ⓘ.

### 4.2 Today (where am I)

One card. Live values, not a paragraph.

- Last finished session date (local, America/Chicago like monthly).
- Session-best stored e1RM, rounded the way the current history header rounds
  (`Math.round`).
- Signed delta versus the previous finished exposure of the **same** identity, or omit
  the delta when there is no previous exposure. Do not print "No prior comparison".
- The working sets from that last session (weight × reps @ RIR), same line format as
  today's session cards.

If there is no finished working set for this identity: "No working sets logged yet."
No chart. No month widget.

### 4.3 Past two to three weeks

One compact block under Today.

**Recommended default (Decision 2):** last 21 local days.

Visible:

- `{n} workouts` in the window (finished sessions that include this identity).
- Best stored e1RM in the window, if any.
- Signed change from the first to the last session-best in the window, if at least two
  points exist.

If the window has zero sessions, one line: `Last trained {date}` when history exists,
or omit the block when Today already said there is no history.

If the window has one session, show that one date and e1RM. Do not invent a trend.

No sparkline here. The chart section is next.

### 4.4 Time slice chart

Default: session-best stored e1RM for the **last 8 finished workouts** of this identity
(Decision 3). That sits in the requested 5 to 10 range without a stepper on day one.

Control, two options only in v1:

- **Last 8 workouts** (default)
- **All history**

Reuse `E1rmChart`. Do not add a date-range picker, a 30/90-day segmented control, or a
second chart type in v1. Month-to-month is a separate widget, not a third line on this
chart.

Fewer than two points: keep "One session so far. Log another to see the trend." (shorten
the current em-dash sentence). Hide the empty chart.

Period bands (when period tracking is on) apply only to **All history**, matching the
monthly chart overlay contract. The 8-workout default stays unmarked.

### 4.5 Month to month

A card the lifter can ignore until they want it.

- Two month controls. Defaults: inbound `month` versus the previous calendar month, or
  the current local month versus the previous month when no `month` query exists.
- Either control may be any month up to the current local month (same bounds as
  `monthlyWindows`).
- Metrics, each as a pair of numbers (month A, month B), not an arrow from empty:

  1. Canonical PRs for this identity (rep PR count + e1RM PR count from
     `workoutRecords` and monthly achievements filtered to the lift key).
  2. Best stored e1RM in each month (monthly `currentBest` for that window).
  3. Volume (effective load × reps, same `effectiveLoad` path as `sessionTonnage`).
  4. Exposures (finished sessions in each window).

If James wants one fewer metric, drop exposures (Decision 4). Do not add pattern
strength, stalls, or Coach copy here.

When one month has no finished sets for this identity, show that month's values as
absent without a fake comparison. Example: `Sep 75 lb e1RM` and `Aug none`. Never
**No prior comparison**. Never an em-dash-to-value arrow as the primary line.

### 4.6 Program in the slice

Under the active chart window and under the month-to-month card, one muted caption.

- Collect distinct `program.name` values from `workout_session.program_id` in that
  slice.
- One program: `Program: {name}`.
- Several: `Programs: {name}, {name}` in performed-at order, unique.
- All sessions missing `program_id` (deleted program, or no program): omit the caption.
  Do not print "No program".

ⓘ on the section label, not a second sentence of caption.

### 4.7 Session list

After the widgets, the finished sessions for this identity, newest first, same set lines
as today. This is the expand-the-workouts path. Do not paginate in v1 (single-user scans
are the existing monthly/history pattern). If the list is long, the chart default of 8
already did the glanceable job.

---

## 5. Data sources to reuse

Do not invent parallel stores. `set_log` stays authoritative. Statistics stay
rebuildable.

| Need | Reuse |
| --- | --- |
| Working sets | `set_log` (owner predicate, `is_warmup = false`) |
| Session dates, finish, program | `workout_session.performed_at`, `finished_at`, `program_id` |
| Program names | `program.name` via `program_id` (Track already selects `program_id`; history does not yet) |
| Exact identity | `exercise_id` + `equipment_instance_id`, same key as `MonthlyLift.key` and `ExerciseRecords.key` |
| Session-best e1RM | stored `set_log.e1rm` max per session. Do not recompute with current bodyweight. Same rule as monthly trends (`docs/MONTHLY-PROGRESS.md`) |
| Canonical PRs | `workoutRecords` / monthly `achievements` |
| Month windows and lift stats | `monthlyWindows`, `buildMonthlyReport`, `loadMonthlyReport` |
| Track list and tiles | `exerciseSummaries` + `buildBoardLifts` for **entry**. Exercise review itself must not use the blended-by-exerciseId summary as the source of truth |
| Volume | `effectiveLoad` from `src/lib/strength/recompute.ts`, same exclusions as `sessionTonnage` (bodyweight sets without a stored bodyweight count as excluded, not zero) |
| Pins | `user_exercise_pin` / `PinButton` |
| Period overlay | existing monthly overlay helpers, only on All history |
| Catalog names | `getCatalogMap` |

**Align filters with monthly and records, not with today's history page.** Exercise
review includes only finished sessions (`finished_at` set, not in the future). It never
blends equipment instances. The current unfiltered `HistoryPage` violates both. That is
a bug to close in the unify slice, not a behavior to preserve.

**Arbitrary two months.** `buildMonthlyReport` always compares a month to the previous
calendar month. For a picker of any two months, call the pure helper twice (or slice one
history load with two `monthlyWindows` results) and read each month's `lifts[]` row and
`achievements` for this identity. Do not add a new report version for v1. Optional later:
an explicit `compareMonth` argument on the existing helper.

**Volume helper.** `sessionTonnage` is per session, all exercises. Add a small pure
function next to it that sums effective load × reps for one identity in a date window.
Co-locate the test in `src/lib/analytics.ts` tests. No SQL aggregate.

**In-session quick history** (`loadExerciseHistory`, family ids) stays a Sheet of ten
recent sets during a workout. It is not Exercise review. Do not merge those families
into this screen. Progression and records already use exact identity
([Architecture](../../ARCHITECTURE.md#history-and-reporting)).

---

## 6. Empty and no-prior states

Never show a useless **No prior comparison** label. Never lead with an empty-to-value
arrow when one side is missing.

| Situation | UI |
| --- | --- |
| No finished working sets for this identity | Header + "No working sets logged yet." Stop. |
| One finished session | Today shows that session. Skip the 21-day trend numbers. Chart empty copy. Month widget may still show that month versus another month. |
| Several sessions, none in the last 21 days | Today as usual. Recent block: `Last trained {date}` only. |
| First month of this lift (the dogfood case) | Month widget shows the trained month's PRs, e1RM, volume, exposures. The other month reads as none. No `new` label on the card. |
| Selected compare month has data, the other does not | Same as above, for whichever side is empty. |
| Missing stored e1RM | Skip that session on the chart (today already drops null bests). If Today has sets but no estimate, show the sets and omit the e1RM number. Do not print **No stored estimate** as a headline. Coverage ⓘ may mention omitted estimates when the monthly quality counts are nonzero. |
| Multiple equipment instances | Switcher. Never a blended series. |
| Unfinished session in flight | Hidden here. It still lives on Lift / the open session route. |

`liftStates` may remain an internal monthly classification for tests and for "Where you
improved" filtering (`improving` versus `repGains`). It must not be a user-facing label
on Exercise review or on month rows after subtraction.

---

## 7. InfoButton copy outlines

Reuse `InfoButton` (`src/components/ui/info-button.tsx`) and `Sheet`. Body at most about
50 words. Read-only. Done to dismiss. No second overlay.

Drafts for approval. Visible labels stay short. The Sheet is the only prose.

**Today**

- Title: `Today`
- Body: `This is the last finished workout for this exact exercise and equipment. Estimated 1RM uses the stored value from that day, not today's bodyweight.`

**Past three weeks**

- Title: `Past three weeks`
- Body: `Workouts in the last 21 days in Chicago time. Change is first to last session in that window. A gap is a last-trained date, not a decline.`

**e1RM chart**

- Title: `e1RM chart`
- Body: `Each point is the best stored estimate in a finished workout. Last 8 workouts is the default. All history is every finished workout of this exact lift.`

**Month to month**

- Title: `Month to month`
- Body: `Pick any two months. PRs match the recap rules. Volume skips sets that have no usable load. An empty month is empty, not a drop.`

**Program**

- Title: `Program`
- Body: `Names come from the workouts in this window. A deleted program leaves no name, so the line is hidden.`

Do not add ⓘ on Pin, on set lines, or on the back link. Do not relocate developer notes
(Recharts, pagination, full-history scan cost) into Sheets.

Month review already has comparison-window, PR-count, improvement-legend, stall, all-lifts,
and coverage ⓘ. After the All lifts disclosure dies, delete that ⓘ with it. Shorten
**Where you improved** ⓘ so it no longer describes dashed versus solid trends.

---

## 8. Implementation slices

Do not build these in this PR. Open them after James approves. Each slice is one PR.
Update owning docs in the slice that changes the behavior.

**Slice A. Subtract the month dump.**
Remove `LiftTrend` from `MonthlyReview`. **Where you improved** and rep-gain rows become
name plus percent (or the rep-gain sentence) plus the existing `liftHref`. Delete the
**All lifts (N)** disclosure. Keep achievements and stalls. Update
`src/lib/monthly-review.test.ts`. This is the dogfood fix even before Exercise review is
rich.

**Slice B. One destination.**
Stop branching `HistoryPage` on `month`. `month` becomes a default for the month widget
and a back link. Delete `monthly-history.tsx` once its bits live on the unified page.
Require `finished_at` and exact equipment identity. Update monthly-history assertions.

**Slice C. Today and past three weeks.**
Header, Today card, 21-day block. Extract a pure session-grouping helper the route and
tests share. Do not copy the grouping loop that currently lives inline in `page.tsx`.

**Slice D. Chart window.**
Default last 8 session-bests. Toggle All history. Reuse `E1rmChart`. Period overlay only
on All history when tracking is enabled.

**Slice E. Month to month plus program caption.**
Two-month picker. PR, e1RM, volume, exposures. Program names from `program_id`. Pure
volume-by-identity helper beside `sessionTonnage`.

**Slice F. Entry equipment query params.**
Board, Explore All lifts, week PRs, recap, in-session history. Pass `equipment` when
known. Tiles that today blend instances must pick one identity (latest finished) rather
than a blended series. If that changes tile numbers, say so in that PR. Do not silently
keep blended tile e1RM while the review screen splits instances.

**Docs in each slice.** `docs/FEATURES.md` §7, `docs/MONTHLY-PROGRESS.md` (dashboard
paragraph that says every lift links into monthly history mode),
`docs/ARCHITECTURE.md` History, `docs/DECISIONS.md` Track-tiles funnel,
`docs/README.md` index. `docs/UI.md` only if a new control appears (month pair, 8-versus-all
toggle). Keep `CLAUDE.md` as `@AGENTS.md`.

Suggested order is A, then B, then C and D (can stack), then E, then F. A is independently
valuable.

---

## 9. Decisions for James

Comment to change a recommendation. Silence on a row means the implementer uses the
recommendation.

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Keep URL `/history/[exerciseId]` or rename? | Keep. Less churn. The screen is the exercise name. |
| 2 | Treat "past 2 to 3 weeks" as calendar 21 days or last 3 exposures? | 21 local days (Chicago). Last-trained date when the window is empty. |
| 3 | Default chart 5, 8, or 10 workouts? | 8. Two-option toggle with All history. No extra presets in v1. |
| 4 | Fourth month-compare metric? | Exposures. Drop it if the card feels busy in review. Do not add a fifth. |
| 5 | Month review **Where you improved** | Keep top five names and percent as paths in. No trends on the month page. |
| 6 | Stalls on Month review | Keep the card. Add Exercise review link. Keep in-progress Coach link. |
| 7 | Period bands | All history only, when tracking is on. Not on the 8-workout default. |
| 8 | Track tiles and blended equipment | Slice F. Tile shows latest instance, not a blend. Call out number changes. |
| 9 | Invalid `month` query | Ignore and show Exercise review. Do not bounce to Month review. |

---

## 10. Out of scope

- In-app AI coach (#44)
- AI program generator
- Cheap-model classification spike (#107)
- Native iOS (#43)
- New e1RM formulas, new record eligibility, new stall rules
- New tables, RPCs, or persisted monthly aggregates
- Merging in-session family history into this screen
- Date-range pickers beyond two months and the 8-versus-all chart toggle
- Offline or sync

---

## 11. Verification for later slices (not this PR)

This PR adds documentation only. Check that the spec paths and copy quotes still match
`main` at `fc8a87a` (or the merge-base when reviewing).

Later product PRs:

- Unit tests. Update `monthly-review.test.ts` after Slice A. Add pure grouping and
  volume-by-identity tests beside `src/lib/analytics.ts` and the monthly helpers. Add
  route markup tests in the same server-render style as `monthly-review.test.ts`
  (`renderToStaticMarkup`).
- Live. Open Track, then Explore, then All lifts, then one lift (Today, 21-day,
  8-workout chart). Month review no longer lists every accessory with **No prior
  comparison**. Tap an improved lift, land on Exercise review (not `MonthlyHistory`),
  and use Back to month. A first-month lift shows the month widget without a fake
  comparison label. Two equipment instances do not blend. Program caption appears when
  `program_id` is set.
- Authenticated browser review still needs a preview. Server-render tests do not
  replace that.

---

## 12. Doc index

After approval, implementation slices update the owning feature docs. This file stays
the design record under `docs/superpowers/specs/`.
