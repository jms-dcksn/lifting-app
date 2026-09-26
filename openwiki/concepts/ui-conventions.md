---
type: concept
title: UI primitives, design tokens, and copy density
description: How the app's shared UI primitives (Sheet, InfoButton, Button/IconButton, Stepper, Card, Skeleton, Calendar), semantic design tokens, motion rules, copy-density conventions, and the tab-shell/hideAppChrome logic fit together.
tags: [ui, design-system, accessibility, tailwind, next-js, copy-density, app-shell]
verified:
  - by: openwiki/0.6.0
    at: 2026-09-25T19:18:52.086Z
---

## Scope

This page documents the shared visual language of the app: the primitives in
`src/components/ui/`, the semantic design tokens in `src/app/globals.css`, the
copy-density rules that keep screens glanceable, the Server/Client Component
boundary that the primitives are built around, and the tab-shell logic
(`src/lib/app-chrome.ts`) that hides the bottom navigation on immersive routes
(session, recap, planner, program builder).

The canonical source is `docs/UI.md` ("read before changing components,
overlays, motion, or server/client boundaries") plus the copy-density spec
`docs/superpowers/specs/2026-09-16-visual-copy-density-design.md`.

## Design tokens

`src/app/globals.css` defines a near-monochrome palette as CSS custom
properties (`--background`, `--foreground`, `--surface`, `--border`,
`--border-strong`, `--muted`, `--faint`, `--accent`, `--accent-foreground`),
each with a light and a `prefers-color-scheme: dark` value. Color is reserved
for semantic meaning only: `--overload-up` / `--overload-down` (progression
direction), `--calibrate` (a machine still calibrating to the lifter), and
`--record` (gold, PR/record rows only). Tailwind's `@theme inline` block
re-exports these as `--color-*` tokens (e.g. `--color-danger` aliases
`--overload-down`) so utility classes like `text-danger` or `border-border`
stay themeable from one place.

A second `@theme` block fixes the type scale to four steps —
`--text-display`, `--text-heading`, `--text-body`, `--text-caption` — plus one
named exception, `--text-recap` (2.75rem, tight line-height/letter-spacing),
reserved for the finish-recap hero. It is explicitly *not* a fifth general
scale step; using it elsewhere would break the "four sizes carry all
hierarchy" contract. Radii are similarly singular: `--radius-card` (1rem) and
`--radius-control` (0.75rem) are the only two radii in the app, applied via
`Card` and every `*-control` class. `--container-page` (32rem, exposed as the
`max-w-page` utility) caps the single content column on wide viewports while
staying full-width on phones.

Motion tokens (`--animate-tick`, `--animate-row-in`, `--animate-rise`, the
`.skeleton` pulse, and the sheet's `dialog.sheet` transform transition) are
all transform/opacity animations in the 150–320ms range using one easing
curve, `--ease-snap`. A global `@media (prefers-reduced-motion: reduce)` rule
collapses every animation/transition duration to near-zero, so no component
needs its own reduced-motion branch except `withViewTransition` (see below),
which checks the media query directly because View Transitions are opt-in
JS, not CSS.

## Primitives (`src/components/ui/`)

```mermaid
flowchart TD
    Button["Button (client, useFormStatus pending)"] --> ButtonStyles["button-styles.ts (plain module)"]
    IconButton["IconButton (client, useFormStatus pending)"] --> IconButtonStyles["icon-button-styles.ts (plain module)"]
    InfoButton["InfoButton (client)"] --> Sheet["Sheet (client, native dialog)"]
    InfoButton --> Button
    PinEditor["PinEditorButton / PinButton"] --> Sheet
    PinEditor --> IconButton
    Calendar["Calendar (client)"] --> Button
    Calendar --> Input["Input (plain module)"]
    Card["Card / CardLabel (plain module)"]
    Skeleton["Skeleton (plain module)"]
    Stepper["Stepper (client)"]
```
*Component dependency graph: plain (non-`"use client"`) style modules can be imported by Server Components; the interactive wrappers around them cannot.*

- **`Sheet`** (`src/components/ui/sheet.tsx`) is the app's single overlay
  primitive: a native `<dialog>` driven with `showModal()`, giving a real
  focus trap for free. Escape (the dialog `cancel` event), a scrim tap, and a
  swipe-down past 90px on the drag handle all funnel into one `dismiss()`
  function that sets `data-closing`, waits `EXIT_MS` (250ms, which must stay
  numerically aligned with the `dialog.sheet` CSS transition duration in
  `globals.css`), then calls `dialog.close()` and the caller's `onClose`.
  Content inside a Sheet reads the same dismiss handler via the
  `useSheetDismiss()` hook/`DismissContext`, so an inner "Cancel" or "Done"
  button animates out identically to Escape or scrim-tap. Because the parent
  owns `onClose`, a Sheet is conditionally rendered (`{open && <Sheet .../>}`)
  and unmounts only after the exit animation finishes — unmounting immediately
  on click would skip the animation.
- **`InfoButton`** (`src/components/ui/info-button.tsx`) is the one ⓘ
  pattern for helper prose: a 44px (`min-h-11 min-w-11`) circle-i button that
  opens a read-only `Sheet` whose body renders `title` as an `h2.text-heading`,
  short prose, and a ghost "Done" button wired to `useSheetDismiss()`. It
  takes no `variant`/actions — info Sheets never carry Enable/Disable/Save;
  those stay on the originating control's own confirmation Sheet.
- **`Button`** (`button.tsx`, `"use client"`) and its class builder
  `buttonClasses` (`button-styles.ts`, a *plain* module without `"use client"`)
  are deliberately split so that Server Components can style a `<Link>` as a
  button by importing only `buttonClasses`/`iconButtonClasses`, without
  pulling in client-only hooks. `Button` derives its `pending`/busy state from
  either an explicit `pending` prop or `useFormStatus()` when it is a
  `type="submit"` inside a `<form action>`, so a server action submit never
  feels unresponsive even without local state. Variants (`primary`,
  `secondary`, `destructive`, `ghost`) and sizes (`sm`, `md`, `lg`) are fixed
  enums, not open strings, so new call sites cannot introduce ad hoc styling.
  **`IconButton`** (`icon-button.tsx` / `icon-button-styles.ts`) mirrors this
  split for the 44px (`size-11`) named-glyph control and requires an
  `aria-label` in its prop type; it shares the same pressed/disabled/pending
  language as `Button`.
- **`Stepper`** (`stepper.tsx`) is the most-touched control in the gym flow:
  large (`h-11 min-w-11`) −/+ targets, press-and-hold auto-repeat
  (`HOLD_DELAY_MS` / `HOLD_REPEAT_MS`, driven off a `valueRef` read in
  events/effects rather than in render, to avoid stale closures during a
  hold), a `tick` remount that replays the `animate-tick` value animation on
  every change, and a local text draft so the field can hold transient states
  like `"52."` or `"-"` mid-edit before committing a clamped numeric value on
  blur.
- **`Card`/`CardLabel`** (`card.tsx`, plain module) is the one shared surface:
  one radius, one border, one padding. The `tone` prop (`default` | `active` |
  `done`) is the only way hierarchy is expressed — `active` uses a stronger
  border, `done` recedes via opacity — never a second radius or extra
  drop-shadow. Slot/session UIs derive `tone` from saved-set counts and the
  currently effective phase prescription rather than storing tone as data.
- **`Skeleton`** (`skeleton.tsx`, plain module) renders a pulsing placeholder
  block for route `loading.tsx` files, driven by the `.skeleton` keyframes
  (which respect the global reduced-motion override).
- **`Calendar`** (`calendar.tsx`, `"use client"`) supplies the shared month
  grid — keyboard navigation (arrow keys move a day, Home/End move to the
  week's edges, PageUp/PageDown change month), `role="grid"`/`gridcell`
  semantics, and a `markers` map for day dots. It is intentionally generic:
  callers (e.g. the weight calendar) own the mutation, replacement-conflict,
  and error contracts on top of this shared grid.
- **`withViewTransition`** (`view-transition.ts`) wraps a state update in
  `document.startViewTransition` (when supported) so elements carrying a
  `viewTransitionName` animate positionally between old and new layout
  positions — used by the program builder for drag/reorder. It falls back to
  a plain synchronous update when `startViewTransition` is unavailable or
  `prefers-reduced-motion: reduce` is set, so reordering is never silently
  broken on older browsers or for motion-sensitive users.
- **`cx`** (`cx.ts`) is a minimal class-name joiner (`filter(Boolean).join(" ")`)
  used by every primitive instead of a class-merging library.

## Server/Client Component boundary

The primitives are deliberately split into **plain modules** (no `"use
client"` directive: `button-styles.ts`, `icon-button-styles.ts`, `card.tsx`,
`skeleton.tsx`, `cx.ts`) and **client modules** (`"use client"`: `button.tsx`,
`icon-button.tsx`, `sheet.tsx`, `info-button.tsx`, `stepper.tsx`,
`calendar.tsx`, `view-transition.ts`'s consumers). A Server Component may
import a plain module's style function (e.g. `buttonClasses`) directly to
render a styled `<Link>` without becoming a Client Component, but it must
never import a helper exported from a `"use client"` module — that can fail
at runtime even though the build succeeds, because the framework only
enforces the boundary when the import is actually exercised on the server. A
passing `next build` therefore does not prove a route works; the primitives'
plain/client split exists specifically to keep this class of mistake out of
reach for the common cases (button/link styling, tone lookups).

The route-level embodiment of this boundary is `src/app/(app)/layout.tsx`
(a Server Component: it awaits Supabase auth via `createClient()` and
`getClaims()`, redirecting unauthenticated users to `/login`) wrapping
`AppShell` (`src/app/(app)/app-shell.tsx`, `"use client"`, since it reads
`usePathname()`/`useSearchParams()`). Charts, clipboard access, search boxes,
and other interactive controls are client components throughout the app;
data loading and auth stay server-side.

## Tab shell and `hideAppChrome`

`AppShell` renders `TabBar`, a fixed bottom navigation with four destinations
— Lift (`/`), Track, Program, You (`/settings`) — each using `aria-current`
via a per-tab `match(pathname)` predicate. `isTrackPath` (in
`src/lib/app-chrome.ts`) makes Track match on `/analytics`, `/analytics/*`,
and `/history/...`, so Exercise review pages read as part of Track even
though their URL segment is `/history`.

`hideAppChrome(pathname, search)` decides when the tab bar (and its
`pb-[calc(4.25rem+…)]` content padding) disappear entirely, for routes that
already own a sticky primary CTA of their own:

```mermaid
flowchart TD
    Start["pathname, search"] --> Session{"starts with /session/ ?"}
    Session -- yes --> Hide["hide tab bar"]
    Session -- no --> Planner{"== /workout/next or starts with it?"}
    Planner -- yes --> Hide
    Planner -- no --> BuilderNew{"== /program/new or starts with it?"}
    BuilderNew -- yes --> Hide
    BuilderNew -- no --> Edit{"starts with /program/ and ?mode=edit ?"}
    Edit -- yes --> Hide
    Edit -- no --> Show["show tab bar"]
```
*`hideAppChrome` decision order in `src/lib/app-chrome.ts`; the `mode=edit` branch is the only one that needs `search`.*

This covers the active-workout session (`/session/[id]`, including its
finish recap at `/session/[id]/recap`), the workout planner (`/workout/next`),
new-program creation (`/program/new`), and program edit mode
(`/program/[id]?mode=edit`) — each of which owns Home (and, on recap, "View
recap"/"View workout") as its sticky exit instead of the tab bar. Because
`AppShell` calls the pathname-only overload first (inside a `Suspense`
fallback, before `useSearchParams()` resolves) and only calls the
search-aware overload once search params are available, `/session/*`,
`/workout/next`, and `/program/new` are hidden immediately on navigation —
they never flash the tab bar while search params are still loading. Only the
`mode=edit` check genuinely needs the resolved search string, and until it
resolves, `/program/[id]` briefly shows the tab bar (acceptable, since that
route isn't otherwise immersive).

`src/lib/app-chrome.ts` also exports date-window helpers (`addDateKey`,
`inLocalDays`) used elsewhere for local-day windows; these are unrelated to
chrome visibility but live in the same module and are covered by
`app-chrome.test.ts` alongside `hideAppChrome`/`isTrackPath`.

## Pins as a display preference

Pins are a per-user display preference layered on top of `IconButton` and
`Sheet`, not a data-model concept: `PinButton`
(`src/app/(app)/pins/pin-button.tsx`) is a ghost `IconButton` with
`aria-pressed` and an optimistic-with-rollback pending state via
`useTransition`, calling the `toggleExercisePin` server action. Track tiles,
session slots, and history headers each render their own `PinButton`, plus a
shared `PinEditorButton` (`pin-editor.tsx`) that opens an edit-pins `Sheet`
listing compound and extra exercises with a search filter. Unpinning a
default compound exercise hides its tile; pinning an extra exercise adds one.
A cap of 8 pinned tiles is enforced in the `toggleExercisePin` action itself
(refused server-side), not merely disabled in the UI.

## Rest timer as a primitive-composition example

The active workout owns exactly one rest timer, and its implementation
threads through several of the conventions above: it is driven by an
absolute end timestamp (so `setInterval` drift and background-tab throttling
cannot desync the displayed countdown), starts optimistically the moment a
set is logged, and uses the per-slot rest override or the profile default
rest length. Its state lives in the `session/[id]` layout (not a leaf page),
so a logged-set data refresh — e.g. re-fetching PR/e1RM chips — cannot
unmount and reset it; the same end timestamp is mirrored into
`sessionStorage` so a hard remount (tab discard, PWA relaunch) can resume the
same countdown. The session route's `loading.tsx` and `error.tsx` both render
the same rest bar so a transient navigation or error state never visually
drops the timer. Vibration, an optional in-tab Web Audio "rest complete" tone,
a system notification when permission was already granted, and a wake lock
are all best-effort enhancements layered on top of the countdown; none of
them gate the core timer, and background/lock-screen delivery depends on the
browser (iPhone needs the app added to the Home Screen to get any of it).

## Copy density

The copy-density rules (`docs/superpowers/specs/2026-09-16-visual-copy-density-design.md`)
exist because product screens had accumulated always-visible captions that
were really developer notes (Web Audio internals, notification-permission
caveats, Coach API mentions) or restated what the control's own label already
said. The rules, in priority order:

1. **Labels first.** If a control's purpose is unclear, fix the label; do not
   add a caption to compensate for an unclear label.
2. **Delete developer/implementation notes** (Web Audio, Notification API,
   Coach internals, cookie persistence) outright — they belong in docs, not
   product copy, and are not candidates for relocation behind an InfoButton
   either.
3. **Helper prose goes behind `InfoButton` → `Sheet`.** How-it-works
   explanations, chart legends, and "why this exists" content use the single
   ⓘ pattern; never a caption under the control, a tooltip, or a second
   overlay type.
4. **Privacy/consent copy stays in dedicated confirmation Sheets** — period
   tracking consent, disable, and delete explanations — not on the Settings
   card surface itself, and not converted into an InfoButton (those Sheets
   carry destructive/consent actions, which read-only info Sheets never do).

The catch-all budget: any visible helper text that is not a label, a live
value, an error/status, or a confirmation should be **≤ ~6 words, or removed
entirely**. The canonical worked example is the rest-complete-tone setting on
`/settings`: the caption explaining Web Audio/notification-permission/
vibration behavior was deleted, and the remaining "why" (two short beeps in
this tab; vibration is separate) moved into an `InfoButton` Sheet next to the
checkbox label.

## Finish recap and record styling

The finish-recap screen reuses `--animate-rise` for its hero number and its
list of record rows, each entering with a staggered ~70ms delay so the payoff
reads as a cascade rather than a single flash. `--text-recap` is used only
for that hero number. Record gold (`--record`) is applied only to rows that
correspond to an actual entry in `workoutRecords`; a finish with no records
must not borrow the gold token just to look celebratory.

## Related pages

- `/openwiki/architecture/overview.md` for how these primitives fit into the
  overall Next.js app structure.
- `/openwiki/workflows/workout-session-lifecycle.md` for how the rest timer,
  Sheet-based swap/finish flows, and `hideAppChrome` session/recap hiding
  compose during an actual workout.
