# UI conventions

Read before changing components, overlays, motion, or server/client boundaries.

Use `src/components/ui/` and semantic tokens in `src/app/globals.css`. The palette is
near-monochrome; color conveys overload, calibration, or danger. Preserve the shared type
scale, card/control radii, `max-w-page` column, and Geist font variables.

- `Sheet` is the native-dialog overlay with focus trapping, Escape/scrim/handle dismissal,
  and animated exit. `useSheetDismiss()` gives inner controls the same close behavior.
  Keep its JS exit delay aligned with CSS; unmount through `onClose` after exit completes.
- `Button` supplies pending state (`pending` or form status). `buttonClasses` lives in the
  plain `button-styles.ts` module so Server Components can style links. Calling helpers
  exported by a `"use client"` module from a Server Component can fail at runtime; a passing
  build alone does not prove the route works.
- `Stepper` provides large touch targets, press-and-hold repeat, and keyboard activation.
  Keep ref access in events/effects rather than render. `Input` resets native date appearance
  and constrains sizing for narrow Safari layouts.
- `Card` tones distinguish current/completed work through border/opacity. Slot completion
  follows saved set counts and effective phase prescriptions.
- `Skeleton` supports route loading states. `withViewTransition` animates builder reorder
  with a plain-update fallback. All motion respects reduced-motion preferences.
- `Calendar` supplies the shared date grid; [weight calendar](WEIGHT-CALENDAR.md) owns its
  keyboard, mutation, replacement-confirmation, and error contracts.

The app layout remains a Server Component. `NavLinks` handles active route state for Lift,
Progress, Program, and Settings. Charts, clipboard, search, and interactive controls are
client components; data loading and auth remain server-side.

The active workout owns one rest timer. It uses an absolute end timestamp to tolerate tab
throttling, starts optimistically when logging, and uses per-slot rest or the profile default.
Vibration, audio, and wake lock are best-effort; lock/background execution is not guaranteed.
See [rest timer rationale](DECISIONS.md#phase-b-decisions-rest-timer).
