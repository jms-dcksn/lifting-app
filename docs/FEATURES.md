# Features

An exhaustive inventory of what the app does, organized by area. This is a descriptive
catalog of shipped behavior — for the *why* behind design choices see `DECISIONS.md`, and
for architecture see [ARCHITECTURE.md](ARCHITECTURE.md).

The defining feature is **cross-exercise weight recommendation**: log sets with RIR, and when
you swap a movement (dumbbell → barbell → machine) the app recommends a working weight from
your logged history.

Programs come in two styles: **classic** (a fixed block of weeks with double-progression) and
**fluid/adaptive** (runs indefinitely; the engine detects per-movement plateaus and recommends
a rep-range change, then an exercise swap — the movement changes, not the cycle). See the
Adaptive plateau engine under §5.

---

## 1. Authentication & accounts

- **Email magic-link sign-in** — passwordless OTP via Supabase Auth (`login/page.tsx`).
  Enter an email, receive a sign-in link, open it on the same device.
- **Sign-in confirmation state** — after sending, the login screen shows a "Check your email"
  panel with the target address and a "Use a different email" reset.
- **Auth callback** — `/auth/callback` exchanges the magic-link code for a session.
- **Server-side session refresh** — handled in `proxy.ts` via `getClaims()`; protected routes
  redirect unauthenticated users to `/login`.
- **Auto-provisioned profile** — a DB trigger creates a `profile` row on signup (hardened
  against failures).
- **Sign out** — server action from You (`/settings`).
- **Per-user data isolation** — every table has Row-Level Security keyed on `auth.uid()`;
  every row carries `user_id`.

## 2. Home / dashboard (`/`)

- **No-program empty state** — when there's no active program, prompts "Build your program".
- **Program chip** — program name and week (classic) as a chip, not the display title.
- **Start next workout** — server action (`startNextSession`) that creates the next session
  for the right program day. Auto-pending so a double-tap can't start two sessions.
- **Resume workout** — if an unfinished session exists, the CTA becomes "Resume workout"
  linking back into it.
- **Today's work** — day name, lift count, and set count; tap opens `/workout/next` (or the
  open session). The full slot list is not always-on.
- **Track preview** — optional recent-PR compound tiles only; pin controls stay off home.
  Full Track stays on `/analytics`.
- **Last session** — `{n} PRs` when that workout earned records, else day name + set count,
  plus gold chips for that session's canonical `workoutRecords`. The card opens that
  workout's recap; **View workout** opens the editable sets. No top-e1RM paragraph.
  This week's full PR list lives on Track. Weight and Coach are not home jobs.
- **Next workout planner** — `/workout/next` previews effective prescriptions and saves
  workout-only exercise choices in this browser before Start; [contract](WORKOUT-PLANNING.md).
- **Block progress** — classic programs still show "{completed} of {total} sessions this block".
  Fluid programs show "Session N · Adaptive".

## 3. Programs (`/program`)

### Program grid and detail
- **Responsive program grid** — active program first, then newest first; tiles show days,
  weeks, exercise count, style, and primary tag.
- **Single-select tag filter** — chip row over the union of all program tags (plus "All");
  hidden entirely when no program has tags (`tag-filter.tsx`, `program-tags.ts`).
- **Dedicated detail screen** — `/program/[id]` shows description, tags, and a responsive
  day grid with Edit, Make active, and Clone actions.
- **Templates** — creation shortcuts remain separate below owned programs.
- **Make active** — `setActiveProgram`; a partial unique index enforces exactly one active
  program per user.
- **Clone program** — `cloneProgram` deep-copies a program (days, slots, per-slot rest
  overrides) into a new editable copy.
- **First-run template offer** — when a user has no programs, offers the built-in
  Push/Pull/Legs template via `createFromTemplate`.

### Builder (`/program/new`, `/program/[id]?mode=edit`)
- **Program metadata** — name, description textarea, and a chip-input tag editor
  (`tag-input.tsx`; Enter/comma to add, ×/Backspace to remove). Tags are normalized
  (trim, drop empties, case-insensitive dedupe).
- **Progression style toggle** — Classic vs Adaptive. Choosing Adaptive hides the weeks
  stepper (the program runs indefinitely) and reveals a per-slot patience control.
- **Weekly phases** — classic programs can author, display, and clone ordered set/RIR
  overrides; workouts use their stored week to resolve effective prescriptions.
- **Weeks stepper** — sets a 4–12 week block length (classic only).
- **Days** — add / name / reorder / remove training days.
- **Slots per day** — each slot references a **movement pattern**, an exercise, rep range
  (`rep_min`/`rep_max`), target RIR, and weight increment.
- **Per-slot plateau patience** (adaptive only) — Auto (by movement type) or an explicit
  Low/Normal/High/Very-high stalled-exposure window before the engine intervenes.
- **Per-slot rest override** — optional "Rest (s)" field; empty = use the profile default
  (stored as `null`).
- **Drag/animated reorder** — day cards and slot rows reorder with view-transition tweening
  (`withViewTransition`, `vt-<id>` names).
- **Exercise picker** — `Sheet`-based picker filtered to the slot's pattern, with a "show all
  patterns" escape hatch (`exercise-picker.tsx`).
- **Add custom exercise from picker** — name + pattern + equipment (plus brand/type when
  equipment is machine).
- **Save** — `saveProgram` does an id-preserving upsert + delete-missing (not full replace),
  so `set_log.program_slot_id` continuity survives edits; saving always activates the program.

## 4. Active workout session (`/session/[id]`)

- **Slot cards** — one card per program slot for the day, each showing the prescribed
  exercise, rep/RIR prescription, and a target weight.
- **Client-side targets** — `sessionTarget()` runs in the browser (`useMemo`), so swaps and
  edits re-derive instantly with no server round-trip. For exercises performed on multiple
  weekly days, the target advances from the strongest first set since this slot's last exposure.
- **Set entry** — log weight × reps × RIR per set using large-hit-area steppers
  (press-and-hold auto-repeat, tick animation, select-all on focus).
- **Edit / delete sets** — inline; deletes play an exit animation before the optimistic
  removal commits. Failed writes surface a per-card error instead of silently reverting.
- **Progress dots** — filled-vs-target set count next to the prescription.
- **Slot hierarchy without color** — a completed slot recedes (`tone="done"`, dimmed); the
  current slot reads as current (`tone="active"`, stronger border); others are default.
- **Target line** — weight × reps with a "Start"/"Target" caption plus a compact Last line
  (`Last 225 × 8`). Best-recent stays behind ⓘ when it differs. The recommendation remains
  an editable default.
- **Confidence states** — `calibrate` and `low` confidence render as their own instruction
  lines below the target.
- **Swap / history / last-used** — 44px `IconButton`s open the existing picker, history
  Sheet, and last-used swap. Pin writes `user_exercise_pin` (display only).
- **Swap exercise** — picker filtered to the slot's pattern; subsequent sets log against
  the swapped `exercise_id` but the original `program_slot_id`, so the swap resumes its own
  progression chain. Explicit choices persist before logging and survive reload. Confirmation
  chooses This workout only or Remainder of program; explicit session choice precedes legacy
  logged exercise and the adaptive/program default.
  See [exercise swaps](EXERCISE-SWAPS.md).
- **Plateau recommendation card** (fluid programs) — when a movement has stalled, the slot
  shows a "Plateau detected" card before set entry: a rep-range change (with starting weight)
  or ranked swap candidates, each with **Accept / Keep going / Other options**. Accepting
  applies the change for this and future sessions; the card self-clears once accepted.
- **Workout records** — saved sets show exact-exercise rep/e1RM PRs; the finish recap
  replays the same records as a cinematic hero (`N PRs`, or the two-part count when mixing
  kinds) plus compact per-exercise lines and a 44px history `IconButton` to Exercise review
  with that group's equipment, and updates after set edits/deletions. Live cards stream
  those pills after the set persists, without resetting rest.
  [Eligibility](DECISIONS.md#workout-records).
- **Quick history** — a Sheet loads ten latest sets from previous workouts across explicitly
  linked exercise variants without resetting set entry or the rest timer.
- **Finish session** — `finishSession` stamps `finished_at` and navigates to
  `/session/{id}/recap`. The recap hero is the records (or `{day} done` when there are
  none). Joint pain / notes sit behind a details control. Home goes to Lift; View workout
  opens the editable sets.
- **Minimal session feedback** — a skippable 1–5 readiness tap appears before the first set;
  finish opens an optional joint-pain + short-note sheet. Recap and finished workouts keep
  the saved values behind a details control and allow pain/note edits without changing the
  original finish time.
- **Reopened workout** — `/session/{id}` for a finished session is the set list, not a
  second recap. Home and View recap sit in the sticky footer. Tab bar stays hidden on
  session routes, so those two actions are the way out.

### Rest timer
- **Auto-start on log** — logging a set starts a single session-wide rest countdown with
  duration `slot.restSeconds ?? profile.default_rest_seconds`.
- **Survives set logging** — the countdown stays running while saved sets refresh gold
  PR / e1RM chips. The first logged set of an exercise is the usual hitch: that is when
  record history is paged. Timer state lives in the session layout (not the page), and
  the end timestamp is stored in `sessionStorage`.
- **Accurate across throttling** — tracks an absolute end timestamp (not a decrementing
  counter), tick every 250ms.
- **Completion cues** — `navigator.vibrate` (always attempts), a system notification when
  the browser has granted permission, and two short in-app Web Audio beeps when rest ends
  (tone is Settings-gated, default on). AudioContext may no-op without a recent gesture.
  Settings **Rest complete tone** (`profile.rest_tone_enabled`) gates audio only.
  Notifications use the browser permission, requested on first rest start or Settings
  Enable, never on page load. A notification-only service worker (`/rest-sw.js`) schedules
  the same banner so supporting browsers can still alert if the tab is frozen.
- **Controls** — `+30s` and `Skip`; rendered in the sticky footer above Finish, absent when
  idle.
- **Screen wake lock** — keeps the screen on for the session so the timer fires reliably.

## 5. Strength engine — cross-exercise recommendation

The heart of the app (`src/lib/strength/`), pure TypeScript, runs client-side.

- **e1RM from every set** — converts `(weight, reps, RIR)` to an estimated 1RM via an
  RPE/RIR load model (RPE = 10 − RIR). The universal comparison unit; progressive overload =
  e1RM rising (`e1rm.ts`).
- **Pattern strength** — one latent "pattern strength" per user per movement pattern, pooled
  from every logged variant of that pattern (`recommend.ts`).
- **Weight recommendation for any exercise** — `predicted_e1RM = pattern_strength ×
  coefficient`, inverted to a working weight for the target reps/RIR.
- **Population priors with Bayesian shrinkage** — seeded coefficients shrink toward each
  user's observed ratios (`PRIOR_WEIGHT`).
- **Live recompute on edit** — the suggested weight recomputes as you edit reps/RIR before
  the first set.
- **Double-progression engine** (`progression.ts`):
  - No history → recommend a starting weight at `rep_min` (source `recommendation`).
  - Below `rep_min` → recalibrate load from the observed reps/RIR and target `rep_min`.
  - Has history → if first-set reps ≥ `rep_max`, bump weight by the slot increment and reset
    to `rep_min`; else hold weight and target +1 rep (source `progression`). Bump is
    reps-only.
- **Unit conventions baked in** — barbell/machine log total load; dumbbell logs one
  dumbbell's weight; bodyweight/assisted use effective load (bodyweight + added, added
  negative for assisted); recommender returns `null` rather than 0 when bodyweight is unknown.
- **Derived-cache integrity** — `set_log` is the source of truth; `user_exercise_stat`
  (current e1RM + personal coefficient) is fully rebuildable from it.

### Machines (special handling)
- **Machines don't predict like free weights** — arbitrary leverage/pin/stack units, so they
  can't be predicted from free-weight loads.
- **Calibrate confidence** — machine movements start at `calibrate` with a deliberately
  conservative number.
- **First-set anchoring** — the first logged set anchors that machine's personal coefficient
  (`currentE1rm / pattern strength from other variants`), re-anchored while only one session
  exists, then held fixed; later progress moves pattern strength, not the coefficient.
- **Graduation** — `coeff_confidence_n` (distinct sessions with working sets) feeds shrinkage
  and graduates the machine out of `calibrate` once it has its own e1RM history.

### Adaptive plateau engine (fluid programs)

Pure module `plateau.ts` (vitest-tested), powering the **fluid** program style. The classic
style runs unchanged; the fluid layer is purely additive and only acts when a movement stalls.

- **Per-movement plateau detection** — tracks the best-e1RM-per-session series for the current
  movement *phase* (a `(slot, exercise, rep-range)` period) and flags a plateau with
  hysteresis: progress = a new running-best beyond max(1%, 1 lb), or more reps at a
  previously observed effective load (`detectPlateau`). Coach, Fluid and monthly review
  share completed-session evidence, exact equipment identity and phase/deload/swap resets.
- **Two-part hysteresis** — flags only when **both** hold: at least `patience` stalled
  exposures (sessions), and the stall spans at least `MIN_PLATEAU_DAYS` (14) of real training
  time. Frequency-independent; a movement hammered daily can't plateau in a few days.
- **Patience by movement type** — barbell compounds wait longer (4 exposures) than other
  movements (3), since they progress slowly; overridable per slot in the builder.
- **Laddered intervention** — on plateau, recommends the next rung: first a **rep-range
  change** to a contrasting band (heavy 5–8 / moderate 8–12 / light 12–15, picked for novelty
  via `pickRepBand`); if still stuck, an **exercise swap** (`nextLadderAction`). A swap resets
  to the slot's home band and restarts the ladder.
- **Ranked swap candidates** — other exercises in the slot's pattern, ranked novel-first
  (not recently plateaued, staler beats recent) with a starting weight each (`rankSwapCandidates`).
- **Recommend-and-confirm** — never auto-applied. The session surfaces a card (Accept / Keep
  going / Other options); accepting writes to the append-only `movement_adaptation` intent log,
  "Keep going" snoozes it for `SNOOZE_EXPOSURES` (2) more exposures.
- **Self-clearing** — the current prescription is the slot folded with accepted adaptations
  (`foldPrescription`); accepting advances the phase boundary, so the new phase has no
  exposures yet and the card disappears until a fresh plateau forms.
- **Composition** — double-progression still drives session-to-session targets *within* the
  active rep range; the plateau engine only governs when to change the range or the movement.

## 6. Exercise catalog: machines, brands, types, custom exercises

- **Seeded catalog** — exercises seeded in `coefficients.ts` with pattern, equipment
  (`barbell | dumbbell | cable | machine | bodyweight`), and a coefficient relative to the
  pattern's reference lift.
- **Generic machine templates** — machine movements seed as brand-agnostic templates
  (`machineTemplate: true`, no brand) carrying no absolute load identity until instantiated.
- **Machine variants** — a template × brand × machine type (`selectorized | plate_loaded`)
  becomes a concrete `exercise` row, ids `base__brand__machinetype` (or that slug plus the
  owner when another user already holds the global id). Find-or-created by `resolveVariant`,
  deduped by a partial unique index.
- **In-session machine instantiation** — picking a bare machine template opens a brand/type
  sub-step; a slot still on a template shows "Choose machine (brand & type)" instead of
  set-entry until resolved.
- **Custom exercises** — fully user-defined exercises (name + pattern + equipment, plus
  brand/type for machines) via `createCustomExercise`; ids `custom-<slug>-<rand>`.
- **Merged catalog** — `catalog.ts` merges seeded templates with the user's `exercise` rows
  (seeded ids win collisions); threaded through every screen via `getCatalogMap`, including
  the calibration-critical session actions.
- **Known brands & type labels** — `KNOWN_BRANDS`, `MACHINE_TYPE_LABEL` exported for the UI.

## 7. Exercise review (`/history/[exerciseId]`)

One screen for Track tiles, Explore All lifts, recap, in-session title links, week
PRs, Month review lift names, and Month review stalls. Optional `equipment` and
`month` query params stay on the URL. `equipment=<uuid>` is an exact instance;
`equipment=none` is explicitly no instance. When the param is omitted, the page
defaults to the latest finished identity and offers a switcher if several exist.
`month=YYYY-MM` seeds a **Back to {month} month review** link and the default
"this month" side of the month-to-month compare when the month is
valid. It does not swap in a monthly-history page. Invalid months are ignored.

- **Exact identity** — finished working sets for this exercise plus equipment
  instance. Header shows a human instance label (or gym) when one exists. Multiple
  instances get a text-link switcher; series never blend.
- **Finished sessions** — working sets from sessions with `finished_at` (not in the
  future), grouped by `groupReviewSessions`. Dates use Chicago `dateKey`. Stored e1RM
  displays at 0.1 lb on this screen.
- **Today** — last finished session date, session-best e1RM, signed delta vs the previous
  session when both have estimates, and that session's working sets. No "No prior
  comparison" label. How-it-works copy is behind ⓘ.
- **Past three weeks** — last 21 Chicago days: workout count, best e1RM, first-to-last
  change when two session-bests exist. One session in the window shows date and e1RM.
  None in the window shows `Last trained {date}`. Omitted when history has only one
  session. No sparkline.
- **e1RM chart** — Recharts `E1rmChart`. Default last 8 session-bests; **All history**
  toggle. Period bands only on All history when tracking is on (female + opt-in). Fewer
  than two points: "One session so far. Log another to see the trend." Program names
  from `workout_session.program_id` appear as a muted caption under the visible window.
- **Month to month** — two month pickers. Defaults: inbound `month` vs the previous
  calendar month, or the current Chicago month vs previous. Metrics are paired values
  (PRs, best stored e1RM at 0.1 lb, volume, exposures), not an empty-to-value arrow.
  An untrained month reads as `none`. Volume uses Chicago `monthlyWindows` dates and
  `identityVolume` (not UTC `weeklyVolume`). Canonical PRs reuse `workoutRecords` /
  monthly achievements for this exact exercise and equipment.
- **Session list** — newest first; each date links to `/session/{id}`.
- **Pin** — header `IconButton` writes `user_exercise_pin` (display preference only).
- **Empty states** — missing catalog exercise vs no working sets. Load failures use
  Exercise review error copy, not Month review's.
- **Tab** — Track is `aria-current` on `/history/...`.

## 8. Track (`/analytics`, nav label "Track")

`/analytics` is Track: a 2-column scoreboard of key compounds (squat, hinge, horizontal
press, vertical press, horizontal pull, vertical pull). Each tile shows the catalog reference
lift when it has history (otherwise it stays hidden), current e1RM, signed delta or "held",
a sparkline, and a `--record` flash when that lift earned a canonical record this week.
Numbers and the tap target use the **latest finished equipment instance** for that
exercise, not a blend of machines. Tap opens `/history/{id}?equipment=...`
(`none` when there is no instance). Pins are owner-scoped display preferences (`user_exercise_pin`,
cap 8 in the server action): unpinning a default hides it; pinning an extra adds a tile.

Secondary, not equal cards, behind Explore:
- This week's PRs — full canonical `workoutRecords` list over the last seven local days
  (every recap line, grouped by session); tap a date for recap or an exercise for history
  with that group's equipment
- All-lifts search (`ExerciseList`) — one row per exercise, latest-instance numbers and
  the same `equipment` query as tiles
- Month review: summary cards, period × performance week overlay when tracking is enabled
  (observed period days, weekly weight change, and PR counts on one card), compact
  name-plus-percent improvements and rep-gain sentences (no all-lifts dump or SVG trends),
  stalls (name links to Exercise review with `month` and `equipment`; session evidence and
  in-progress Coach stay), achievements, and the shared weight card
- Coach (`/analytics/coach`) — check-in snapshot, ranked next-step proposals (Do first / Also),
  collapsed insufficient-data trends, a one-line hard-set shortfall flag, and clipboard export.
  Stall links use `?exercise=`. `/settings?coachExercise=` redirects here.
- Body (`/analytics/body`) — weight trend chart and tape measurements (waist, neck, arm, thigh, chest)
- Volume (`/analytics/volume`) — weekly tonnage for all training or one logged
  exercise (`?exercise=`). Search matches All lifts (one row per exercise). Unknown
  ids fall back to all training. Mixed machines share one series.

Coach check-in and proposals live on Track Explore, not You. The weekly API
(`GET /api/coach/v1/weekly`) is unchanged. Canonical eligibility stays `workoutRecords`
and monthly contracts; the old Progress records feed is gone.

Pure helpers in `src/lib/analytics.ts` still compute volume, summaries, and (unused on the
Track landing) training balance / pattern strength. See `docs/COACH-REPORT.md` for the
Coach contract.

## 9. You (`/settings`)

- **Bodyweight history** — quick date/weight logging, edit/remove, recent readings, latest value,
  sparse seven-day average, and change from the preceding seven days. You, Track Body, and
  the shared calendar all log weight; moves onto occupied dates require explicit replacement
  confirmation and use an atomic RPC. See [weight calendar](WEIGHT-CALENDAR.md).
- **Current bodyweight rule** — the newest dated observation drives pull-up/assisted calculations;
  the pre-existing `profile.bodyweight` remains the baseline when no history exists.
- **Goal weight (lb)**.
- **Default rest between sets (seconds)** — default 120; per-slot overrides take precedence.
- **Rest complete tone** — checkbox (`profile.rest_tone_enabled`, default on); uncheck to
  silence in-tab beeps at rest end. Vibration is independent. Optional ⓘ holds short
  how-it-works copy (not a caption under the control).
- **Rest complete notifications** — browser permission, not a profile column. Settings
  shows off / on / blocked / unavailable and an Enable button while undecided. Denied
  degrades to vibrate and optional tone; ⓘ explains how to re-enable and iPhone Home
  Screen limits.
- **Period tracking (optional)** — female-only opt-in menstrual period tracking. Mark observed
  bleeding days; they appear as context bands on monthly charts and as the period × performance
  week overlay on month review. Design spec: [PERIOD-TRACKING.md](PERIOD-TRACKING.md).
  Implementation: #33 and #105. Period data stays in-app and is not sent to Coach.
- **Sign out**. Coach lives on Track Explore (`/analytics/coach`).

## 10. App shell & navigation

- **Bottom tabs** — Lift (`/`), Track (`/analytics` and `/history/...`), Program (`/program`), You (`/settings`);
  icons plus labels, `aria-current` on the active tab (`app-shell.tsx`). Hidden on session
  routes (active workout, recap, finished sets), next-workout planner, and program builder.
- **Auth gate** — layout is a Server Component gating on `getClaims()`.
- **Route-level loading skeletons** — `loading.tsx` fallbacks for home, session, recap,
  history, and analytics so server navigations never flash a blank screen. Session loading
  and session error keep the rest bar from the session layout.

## 11. Design system & UI primitives (`src/components/ui/`)

- **Semantic design tokens** in `globals.css` — near-monochrome palette where color is
  *semantic only* (overload up/down, calibrate, danger, record gold); one type scale, one card radius, one
  control radius, a single content-column width (`max-w-page`); Geist fonts. `--text-recap`
  is the finish-recap hero only.
- **Motion tokens** — `animate-tick/row-in/rise`, `[data-exiting]` exit animation, skeleton
  pulse; a global `prefers-reduced-motion` kill-switch.
- **`Sheet`** — the one overlay primitive: native `<dialog>` bottom sheet with focus trap,
  scrim/Escape/swipe-down dismiss, animated exit.
- **`InfoButton`** — 44px circle-i control opening a read-only `Sheet` for helper copy
  ([copy-density rules](UI.md#copy-density)).
- **`Button`** — primary/secondary/destructive/ghost × sm/md/lg with built-in pending state
  (spinner + `aria-busy`); a Server-Component-safe class builder for styling `<Link>`s.
- **`IconButton`** — 44px named glyph control (default/ghost) with the same pending/disabled
  language; `iconButtonClasses` for links.
- **`Stepper`** — the most-touched mid-workout control: 44px hit areas, press-and-hold
  auto-repeat, tick animation, select-all on focus; column and row layouts.
- **`Card`** — `tone` prop (`default | active | done`) carrying hierarchy without color.
- **`Skeleton`**, **`Input`**, **`view-transition` helper**, classname utility.

## 12. Platform & PWA

- **Installable PWA** — web manifest (standalone display, "Lift" short name, black theme);
  SVG app icon + Apple touch icon. `/rest-sw.js` is a notification helper only; it does
  not cache or serve the app offline.
- **Stack** — Next.js 16 (App Router, Server Actions, React 19) + Supabase (Postgres + Auth +
  RLS), deployed on Vercel.
- **Online by design** — assumes connectivity during workouts; there is intentionally **no**
  offline/local-first layer (see `DECISIONS.md`).
