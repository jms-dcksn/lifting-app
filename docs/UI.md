# UI conventions

Read before changing components, overlays, motion, or server/client boundaries.

Use `src/components/ui/` and semantic tokens in `src/app/globals.css`. The palette is
near-monochrome; color conveys overload, calibration, danger, or records (`--record` gold).
Preserve the shared type scale, card/control radii, `max-w-page` column, and Geist font
variables. `--text-recap` is the finish-recap hero only, not a fifth general scale step.

- `Sheet` is the native-dialog overlay with focus trapping, Escape/scrim/handle dismissal,
  and animated exit. `useSheetDismiss()` gives inner controls the same close behavior.
  Keep its JS exit delay aligned with CSS; unmount through `onClose` after exit completes.
- `InfoButton` is a 44px circle-i control that opens a read-only `Sheet` (`title` as h2,
  short body, Done). Helper copy lives behind it, not as a caption under the control.
- `Button` supplies pending state (`pending` or form status). `buttonClasses` lives in the
  plain `button-styles.ts` module so Server Components can style links. `IconButton` is the
  44px named glyph control (`aria-label` required, default/ghost, same pressed/disabled
  language) with `iconButtonClasses` for links. Calling helpers exported by a `"use client"`
  module from a Server Component can fail at runtime; a passing build alone does not prove
  the route works.
- `Stepper` provides large touch targets, press-and-hold repeat, and keyboard activation.
  Keep ref access in events/effects rather than render. `Input` resets native date appearance
  and constrains sizing for narrow Safari layouts.
- `Card` tones distinguish current/completed work through border/opacity. Slot completion
  follows saved set counts and effective phase prescriptions.
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

The app layout remains a Server Component. `AppShell` renders a bottom tab bar (Lift,
Track, Program, You) with `aria-current` on the active destination. Hide it on `/session/[id]`
(including `/session/[id]/recap`), `/workout/next`, `/program/new`, and program edit. Recap
and finished workouts therefore own Home (and View recap / View workout) as sticky exits.
Pathname-only hide covers session/planner/builder-new before `searchParams` resolve so those
routes never flash the tab bar. Sign out lives on You. Pins are a display preference:
`IconButton` pin/unpin on Track tiles, session slots, and history headers, plus an edit-pins
`Sheet`. Unpinning a default compound hides it; pinning an extra adds a tile. Cap 8 is
refused in the action. Charts, clipboard, search, and interactive controls are client
components; data loading and auth remain server-side.

The active workout owns one rest timer. It uses an absolute end timestamp to tolerate tab
throttling, starts optimistically when logging, and uses per-slot rest or the profile default.
Vibration, optional in-app Web Audio, a system notification when permitted, and wake lock
are best-effort. Background and lock-screen delivery depend on the browser; iPhone needs
the Home Screen app. See [rest timer rationale](DECISIONS.md#phase-b-decisions-rest-timer)
and [rest completion notifications](DECISIONS.md#rest-completion-notifications-104).
