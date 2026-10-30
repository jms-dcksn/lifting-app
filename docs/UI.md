# UI conventions

Read before changing components, overlays, motion, or server/client boundaries.

Use `src/components/ui/` and semantic tokens in `src/app/globals.css`. The palette is
near-monochrome; color conveys overload, calibration, danger, or records (`--record` gold).
Preserve the shared type scale, card/control radii, `max-w-page` column, and Geist font
variables. `--text-recap` is the finish-recap hero only, not a fifth general scale step.

- `Sheet` is the native-dialog overlay with focus trapping, Escape/scrim/handle dismissal,
  and animated exit. `useSheetDismiss()` gives inner controls the same close behavior.
  Keep its JS exit delay aligned with CSS; unmount through `onClose` after exit completes.
  Program gallery tags use that Sheet behind a Filter control, not an always-on chip row.
- `InfoButton` is a 44px circle-i control that opens a read-only `Sheet` (`title` as h2,
  short body, Done). Helper copy lives behind it, not as a caption under the control.
- `Button` supplies pending state (`pending` or form status). `buttonClasses` lives in the
  plain `button-styles.ts` module so Server Components can style links. `IconButton` is the
  44px named glyph control (`aria-label` required, default/ghost, same pressed/disabled
  language) with `iconButtonClasses` for links. Calling helpers exported by a `"use client"`
  module from a Server Component can fail at runtime; a passing build alone does not prove
  the route works.
- Lift history buttons in the active workout and finish recap use `IconPastSets`: a set
  list with a backward arrow. Keep the exercise-specific `View history for …` accessible label.
- `Stepper` provides large touch targets, press-and-hold repeat, and keyboard activation.
  Keep ref access in events/effects rather than render. `Input` resets native date appearance
  and constrains sizing for narrow Safari layouts. A named `set-entry` container stacks
  the column stepper buttons below 18rem of available width, preserving 44px targets.
- `Card` tones distinguish current/completed work through border/opacity. Active workout
  slots instead use a soft surface background for completion so results and record pills
  retain contrast, plus a secondary `Add set` action. Their compact count and 12px checked
  dots share the prescription row (wrapping when needed); the next dot has a strong outline.
  Slot completion follows saved set counts and effective phase prescriptions; the count
  updates optimistically and reverts on failed writes.
- `ExerciseVisual` is the only exercise illustration. 16:9 `rounded-control` frame,
  `object-cover` (never square + contain). `sm` is 36×64 on rows/tiles and the compact
  planner, active workout, and program builder; `lg` is 64×114 on in-session history.
  Exercise review uses the compact `sm`
  visual beneath its title in the shared page header. Mapped catalog ids show art
  from `/exercises/{id}.jpg`; everything else uses `IconDumbbell` in the same box.
  Map by seeded / template id, not name. See
  [exercise visuals](superpowers/specs/2026-09-28-exercise-visuals-design.md).
  Current art uses charcoal backgrounds, ivory ink shading, and muted burgundy accents.
  640×360 JPEGs cover back squat, flat/incline barbell bench press, Romanian deadlift,
  dumbbell shoulder press, Bulgarian split squat, hack squat, lat pulldown, seated cable
  row, and seated leg curl. `EXERCISE_VISUAL_SRC` is the current asset inventory.
  Assets fill the 16:9 frame without extra CSS zoom so the athlete and equipment remain
  visible at both sizes. This replaces
  the cream-paper art and center zoom described in the historical spec.
  Use the [art generation specification](EXERCISE-ART.md) for reusable prompts, committed
  style references, exercise mechanics, export settings, and thumbnail review.
- `ExerciseCardLabel` shares the exercise-name → equipment-chip → supporting-details
  hierarchy across Active, Plan, program cards, the exercise picker, and Track board
  tiles. Track tiles reserve the name, chip, and brand rows so the e1RM lines up;
  other surfaces still omit an empty detail line. Always show the
  canonical equipment category (Machine, Cable, Dumbbell, Barbell or Bodyweight), even
  before station selection. Bench/rack/platform context complements Barbell. Brand/model
  and machine loading details stay secondary; use “Weight stack” rather than
  “Selectorized” on cards. Resolve variants through their catalog/base identity, never
  infer equipment from a name or brand. Labels and adjacent controls wrap at narrow
  widths; chips are read-only text, not buttons or color-only indicators. Its `compact`
  variant places the secondary identity beside the chip/context in the same wrapping row;
  it retains every identity field. Track tiles retain their default reserved rows.
- `PlannedSetSummary` is the shared semantic read-only table for the planner and active
  workout's More → Planned sets. Every set keeps its own bounds and Suggested / Your target /
  Weight not set provenance. Reps-only work has no pound column; assistance is positive
  and labeled, and ordinary bodyweight work labels pounds as added load.
- Active workouts keep exercise order stable and default entry focus to the first incomplete
  exercise. **Log this exercise** switches entry focus and moves keyboard focus into it.
  Other entries stay mounted but hidden, preserving typed numeric/tempo/note drafts. History,
  Swap, errors, results and compact setup/note/previous-note actions remain discoverable.
  **More** owns pins, last-used equipment, resolved station swaps and the planned-set table.
  Saved-set Edit has a named 44px control; Delete lives in the edit form. Finish lives in
  the sticky workout header and retains the feedback confirmation. The bottom rest area
  shows Ready or the shared countdown; its provider/timestamp persistence is unchanged.
- Program create/edit uses one capped column, named day buttons (`aria-pressed`), visible
  Change/reorder and Sets / Rep range / RIR. Program settings retains description, tags,
  progression style, weeks and phases behind a summary. Range and More options use local
  sheet drafts: Apply updates the program draft, Cancel/Escape discard the sheet's changes.
  More retains rest, tempo, superset, Adaptive patience and removal. Equipment choice is
  optional; saving a program still accepts unresolved station templates.
- Program tiles wrap visible content in their detail `Link`; the Remove control is a
  positioned sibling. An empty overlay link beneath positioned text lets that text
  intercept taps, making the tile appear intermittently unresponsive.
- `Skeleton` supports route loading states. `withViewTransition` animates builder reorder
  with a plain-update fallback. All motion respects reduced-motion preferences.
- `Calendar` supplies the shared date grid; [weight calendar](WEIGHT-CALENDAR.md) owns its
  keyboard, mutation, replacement-confirmation, and error contracts.
- Finish recap reuses `animate-rise` (staggered 70ms delays) for the hero and record
  rows. Record gold is only for actual `workoutRecords` lines, never for a no-record finish.

## Copy density

Follow [visual copy-density design](superpowers/specs/2026-09-16-visual-copy-density-design.md)
when adding helper text.

1. **Labels first** — fix unclear labels before adding captions.
2. **Delete developer notes** — implementation caveats (Web Audio, Notification API, Coach
   internals) belong in docs, not on screen.
3. **Helper prose behind InfoButton** — how-it-works, chart legends, and "why this exists"
   use the one ⓘ pattern (`InfoButton` → read-only `Sheet`), not captions under controls.
4. **Privacy copy stays in confirmation Sheets** — period consent, disable, and delete;
   not on the Settings card surface.

Visible helper text that is not a label, value, error, or confirmation should be ≤ ~6 words
or gone.

The app layout remains a Server Component. Standard screens use `PageHeader` for one
sticky, safe-area-aware header: the title sits left, screen actions and a 44px ghost-style
Coach inbox bell sit right, and relevant pills/context sit beneath. Keep page containers
at `px-4` without top padding; the header owns top spacing, a subtle bottom divider and
the translucent background. Keep titles wrapping within `min-w-0` while action touch
targets remain 44px. Text actions that crowd the title use named icons (New program,
Coach preferences). `AppShell` owns one `CoachInboxProvider`, so changing headers does
not reset unread state or add refresh listeners. It adds no notification spacer.
Coach pages share the header; immersive flows retain their own chrome and hide the bell.
`AppShell` renders a bottom tab bar (Lift,
Track, Program, You) with `aria-current` on the active destination. Track is current on
`/analytics`, `/analytics/*`, and `/history/...`. Hide it on `/session/[id]`
(including `/session/[id]/recap`), `/workout/next`, `/program/new`, and program edit. Recap
and finished workouts therefore own Home (and View recap / View workout) as sticky exits.
Pathname-only hide covers session/planner/builder-new before `searchParams` resolve so those
routes never flash the tab bar. Sign out lives on You. Pins are a display preference:
`IconButton` pin/unpin on Track tiles, session slots, and history headers, plus an edit-pins
`Sheet`. Unpinning a default compound hides it; pinning an extra adds a tile. Cap 8 is
refused in the action. Charts, clipboard, search, and interactive controls are client
components; data loading and auth remain server-side. Exercise review's e1RM card uses a
two-option **Last 8 workouts** / **All history** toggle (`aria-pressed`), same `Button`
language as the weight range control. Month-to-month uses two `Input type="month"`
controls (this month / other month) with paired metric columns, not an empty-to-value
arrow. Program names are a muted caption under the chart window and under the compare
card. When an exercise has more than one equipment instance, Exercise review offers a
row of text links (`aria-current` on the selected identity). Not a select or a third
chart control.

The active workout owns one rest timer. It uses an absolute end timestamp to tolerate tab
throttling, starts optimistically when logging, and uses per-slot rest or the profile default.
Timer state lives in the `session/[id]` layout so a logged-set refresh (PR / e1RM chips)
cannot clear it; the end timestamp is also stored in `sessionStorage` for a remount. The
session `loading.tsx` and `error.tsx` render the same rest bar. Vibration, optional in-app
Web Audio, a system notification when permitted, and wake lock are best-effort. Background
and lock-screen delivery depend on the browser; iPhone needs the Home Screen app. See
[rest timer rationale](DECISIONS.md#phase-b-decisions-rest-timer)
and [rest completion notifications](DECISIONS.md#rest-completion-notifications-104).

`TempoFields` supplies four labeled second inputs and the shared phase explanation;
`TempoLabel` displays the same notation. Active set logging keeps performed tempo under
**Set details**. Saved sets show their recorded value, or **unspecified** for older sets.

Workout cards keep history/swap/pin actions below the title on phone widths. A separate
labeled **Setup** / **Exercise note** row distinguishes editable personal text from history,
station swapping and technique help. Setup appears only for canonical machine/cable
identities (including custom and assisted stations). Saved/remembered status and two-line
previews stay compact. **Set details** contains optional performed tempo and the set's own
note; expanded saved details show **Setup used** and **Set note** as separate fields.

`EditableTextSheet` uses the shared Sheet and IconButton controls, labeled textarea,
explicit Save/Cancel and unsaved Clear. It retains failed drafts, guards dismissal/Back and
reload, disables changes while saving, accommodates the visual viewport and safe area, and
restores focus without scrolling. The Sheet's optional dismissal guard also covers Escape,
scrim and handle. Back-history installation is deferred to tolerate React Strict Mode replay.
