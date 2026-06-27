# Features

An exhaustive inventory of what the app does, organized by area. This is a descriptive
catalog of shipped behavior — for the *why* behind design choices see `DECISIONS.md`, and
for architecture see `CLAUDE.md`.

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
- **Sign out** — server action from the app shell.
- **Per-user data isolation** — every table has Row-Level Security keyed on `auth.uid()`;
  every row carries `user_id`.

## 2. Home / dashboard (`/`)

- **No-program empty state** — when there's no active program, prompts "Build your program".
- **Active program header** — shows program name and current block position: "Week X of N ·
  next: {day name}".
- **Block progress bar** — thin bar + "{completed} of {total} sessions this block" count.
  Block position (week/day) is *derived* from the count of finished sessions, not stored.
- **Fluid-program header variant** — adaptive programs have no fixed block, so the header drops
  the week count ("Next: {day}") and replaces the progress bar with "Session N · adaptive".
- **Start next workout** — server action (`startNextSession`) that creates the next session
  for the right program day. Auto-pending so a double-tap can't start two sessions.
- **Resume workout** — if an unfinished session exists, the CTA becomes "Resume workout"
  linking back into it.
- **Last session summary card** — day name, working-set count, and the top lift (highest
  e1RM) with its rounded e1RM, linking to that exercise's history.

## 3. Programs (`/program`)

### Gallery
- **Expandable program gallery** — all of a user's programs as cards; one expands at a time,
  the active program open by default (`program-gallery.tsx`).
- **Collapsed card** — name, "{weeks} wk · {days} days", tag chips, and an `active` pill.
- **Expanded card (inline)** — description + full day/slot detail + actions, animated in.
- **Single-select tag filter** — chip row over the union of all program tags (plus "All");
  hidden entirely when no program has tags (`tag-filter.tsx`, `program-tags.ts`).
- **Make active** — `setActiveProgram`; a partial unique index enforces exactly one active
  program per user.
- **Clone program** — `cloneProgram` deep-copies a program (days, slots, per-slot rest
  overrides) into a new editable copy.
- **First-run template offer** — when a user has no programs, offers the built-in
  Push/Pull/Legs template via `createFromTemplate`.

### Builder (`?id=new`, `?id=X&mode=edit`)
- **Program metadata** — name, description textarea, and a chip-input tag editor
  (`tag-input.tsx`; Enter/comma to add, ×/Backspace to remove). Tags are normalized
  (trim, drop empties, case-insensitive dedupe).
- **Progression style toggle** — Classic vs Adaptive. Choosing Adaptive hides the weeks
  stepper (the program runs indefinitely) and reveals a per-slot patience control.
- **Weeks stepper** — sets the block length (classic only).
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
  edits re-derive instantly with no server round-trip.
- **Set entry** — log weight × reps × RIR per set using large-hit-area steppers
  (press-and-hold auto-repeat, tick animation, select-all on focus).
- **Edit / delete sets** — inline; deletes play an exit animation before the optimistic
  removal commits. Failed writes surface a per-card error instead of silently reverting.
- **Progress dots** — filled-vs-target set count next to the prescription.
- **Slot hierarchy without color** — a completed slot recedes (`tone="done"`, dimmed); the
  current slot reads as current (`tone="active"`, stronger border); others are default.
- **Target line** — weight × reps with a "Start"/"Target" caption; suppressed once the first
  set is logged (it goes stale immediately).
- **Confidence states** — `calibrate` and `low` confidence render as their own instruction
  lines below the target.
- **Swap exercise** — a secondary button opens the picker filtered to the slot's pattern;
  subsequent sets log against the swapped `exercise_id` but the original `program_slot_id`,
  so the swap resumes its own progression chain. Swaps survive a page reload (the slot's
  effective exercise = the most recently logged exercise this session).
- **Plateau recommendation card** (fluid programs) — when a movement has stalled, the slot
  shows a "Plateau detected" card before set entry: a rep-range change (with starting weight)
  or ranked swap candidates, each with **Accept / Keep going / Other options**. Accepting
  applies the change for this and future sessions; the card self-clears once accepted.
- **Finish session** — `finishSession` stamps `finished_at` and returns a per-lift summary
  with overload deltas (latest session vs that exercise's previous session).

### Rest timer
- **Auto-start on log** — logging a set starts a single session-wide rest countdown with
  duration `slot.restSeconds ?? profile.default_rest_seconds`.
- **Accurate across throttling** — tracks an absolute end timestamp (not a decrementing
  counter), tick every 250ms.
- **Completion cues** — `navigator.vibrate` + a short WebAudio beep (both best-effort).
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
  hysteresis: progress = a new running-best beyond a ~1% noise margin (`detectPlateau`).
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
  becomes a concrete `exercise` row, ids `base__brand__machinetype`. Find-or-created by
  `resolveVariant`, deduped by a partial unique index.
- **In-session machine instantiation** — picking a bare machine template opens a brand/type
  sub-step; a slot still on a template shows "Choose machine (brand & type)" instead of
  set-entry until resolved.
- **Custom exercises** — fully user-defined exercises (name + pattern + equipment, plus
  brand/type for machines) via `createCustomExercise`; ids `custom-<slug>-<rand>`.
- **Merged catalog** — `catalog.ts` merges seeded templates with the user's `exercise` rows
  (seeded ids win collisions); threaded through every screen via `getCatalogMap`, including
  the calibration-critical session actions.
- **Known brands & type labels** — `KNOWN_BRANDS`, `MACHINE_TYPE_LABEL` exported for the UI.

## 7. Exercise history (`/history/[exerciseId]`)

- **Per-session e1RM series** — fetches that exercise's working sets, groups by session,
  computes best-e1RM-per-session.
- **Overload badge** — latest session vs the session before it.
- **Line chart** — Recharts e1RM-over-time chart (`e1rm-chart.tsx`).

## 8. Progress analytics (`/analytics`, nav label "Progress")

Pure analytics in `src/lib/analytics.ts`; the page renders five server-side cards:

1. **Total volume** — session tonnage chart (`sessionTonnage`, sums `effectiveLoad × reps`;
   bodyweight sets with unknown bodyweight are excluded and counted, never zeroed).
2. **Training balance** — latest training week's per-pattern horizontal bars: total working
   sets with the hard-set portion (RIR ≤ 2) overlaid; "{n} sets · {m} hard".
3. **e1RM progression highlights** — top gainers with signed-delta trend pills.
4. **Pattern strength** — trained patterns with current reference-lift e1RM and a signed
   trend; patterns with <2 sessions show "new" (`patternStrengthTrend`, replays sessions
   chronologically).
5. **All exercises** — searchable list funneling into `history/[exerciseId]`.

Other pure analytics available: `e1rmPrFeed` (chronological PR events), `weightPrs` (all-time
heaviest raw load per exercise), `exerciseSummaries`, `patternWeekStats`, `latestWeekBalance`.

## 9. Settings (`/settings`)

- **Bodyweight (lb)** — used for pull-ups and assisted lifts.
- **Goal weight (lb)**.
- **Default rest between sets (seconds)** — default 120; per-slot overrides take precedence.

## 10. App shell & navigation

- **Top-level nav** — Lift (home), Progress (`/analytics`), Program, Settings; active route
  marked via `usePathname()` + `aria-current` (`nav-links.tsx`).
- **Auth gate** — layout is a Server Component gating on `getClaims()`.
- **Route-level loading skeletons** — `loading.tsx` fallbacks for home, session, history, and
  analytics so server navigations never flash a blank screen.

## 11. Design system & UI primitives (`src/components/ui/`)

- **Semantic design tokens** in `globals.css` — near-monochrome palette where color is
  *semantic only* (overload up/down, calibrate, danger); one type scale, one card radius, one
  control radius, a single content-column width (`max-w-page`); Geist fonts.
- **Motion tokens** — `animate-tick/row-in/rise`, `[data-exiting]` exit animation, skeleton
  pulse; a global `prefers-reduced-motion` kill-switch.
- **`Sheet`** — the one overlay primitive: native `<dialog>` bottom sheet with focus trap,
  scrim/Escape/swipe-down dismiss, animated exit.
- **`Button`** — primary/secondary/destructive/ghost × sm/md/lg with built-in pending state
  (spinner + `aria-busy`); a Server-Component-safe class builder for styling `<Link>`s.
- **`Stepper`** — the most-touched mid-workout control: 44px hit areas, press-and-hold
  auto-repeat, tick animation, select-all on focus; column and row layouts.
- **`Card`** — `tone` prop (`default | active | done`) carrying hierarchy without color.
- **`Skeleton`**, **`Input`**, **`view-transition` helper**, classname utility.

## 12. Platform & PWA

- **Installable PWA** — web manifest (standalone display, "Lift" short name, black theme);
  SVG app icon + Apple touch icon.
- **Stack** — Next.js 16 (App Router, Server Actions, React 19) + Supabase (Postgres + Auth +
  RLS), deployed on Vercel.
- **Online by design** — assumes connectivity during workouts; there is intentionally **no**
  offline/local-first layer (see `DECISIONS.md`).
</content>
</invoke>
