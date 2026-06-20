# Program gallery + tags, and rest timer — design

Date: 2026-06-20

Two related additions to the program-management surface, shipped as independent phases,
each with its own migration so they can land separately.

- **Phase A — Program gallery + tags.** `/program` becomes a card gallery. Cards expand
  inline to reveal full detail. Programs gain a description and user-defined free-text tags,
  filterable by chips.
- **Phase B — Rest timer.** A global default rest with per-slot override, surfaced as an
  auto-starting countdown during a workout.

The existing multi-program plumbing already exists: a single active program is enforced by
the partial unique index `program_one_active_per_user`, and `setActiveProgram` /
`cloneProgram` already work. This spec reframes the *presentation* (gallery-first) and adds
metadata (description, tags) and the timer; it does not change the active-program invariant.

---

## Phase A — Program gallery + tags

### Data model

Migration `0006_program_metadata.sql`:

- `alter table program add column description text;` (nullable)
- `alter table program add column tags text[] not null default '{}';`

No new tables. Tags are free text on the program row — appropriate for a single-user app.
RLS is unchanged (the existing `program` policies already key on `auth.uid()`).

`src/lib/supabase/types.ts` regenerated to include the new columns.

### Program loader (`src/lib/program.ts`)

- `Program` gains `description: string | null` and `tags: string[]`.
- `assemble()` and `getProgram` / `getActiveProgram` select and pass through the new columns.
- `listPrograms()` is extended to return `{ id, name, weeks, isActive, description, tags,
  dayCount }`. `dayCount` is a cheap aggregate (count of `program_day` rows per program),
  **not** a full day/slot assembly — the gallery must not assemble every program's tree.
  Implementation: one `program_day` query filtered to the user's program ids, counted in JS,
  or a grouped count. Keep it to a single extra query for the whole list.

### Routing (`/program`)

- `/program` (no params) → **gallery index** (new). Replaces today's "active-program view +
  saved-programs list" split.
- `/program?id=new` → builder, blank. (unchanged)
- `/program?id=X&mode=edit` → builder, editing program X. (unchanged)
- The first-run template offer (no programs yet → "Start with Push / Pull / Legs" /
  "Build from scratch") is preserved, shown when the user has zero programs.

`/program?id=X` (read-only single-program view) is **removed** as a destination — detail now
lives inline in the expanded card. The builder's post-save redirect (`afterSaveHref`) and
cancel target (`cancelHref`) point back to `/program` (the gallery). After save, the gallery
may optionally auto-expand the just-saved program; if that adds complexity, returning to a
collapsed gallery is acceptable.

`ProgramView.tsx` is **retired**. Its day/slot rendering (the day `Card`s with per-slot
sets/reps/RIR `StaticMetric`s, `exerciseName`/`slotMeta`/`repRange` helpers) moves into the
expanded-card detail component so there is exactly one detail-rendering path.

### Components

- **`program-gallery.tsx`** (client) — owns which card is expanded (one at a time) and the
  active tag filter. Renders the tag filter bar + the filtered list of cards. Receives the
  `listPrograms()` rows + the per-program detail needed for expansion (see note below).
- **`program-card.tsx`** —
  - *Collapsed:* program name, `{weeks} wk · {dayCount} days`, tag chips, and an `active`
    pill when `isActive`. Tapping the card toggles expansion.
  - *Expanded (inline, animated):* description (if present), the full day/slot detail
    (reused from retired `ProgramView`), and actions: `Edit` (→ `?id=X&mode=edit`), and when
    inactive, `Make active` (`setActiveProgram`) and `Clone` (`cloneProgram`). The `active`
    pill shows here too.
  - Expansion uses existing motion tokens / `Card` primitives; respects
    `prefers-reduced-motion`.
- **`tag-filter.tsx`** — a horizontal chip row. Chips are the **union of all tags across the
  user's programs**, plus an "All" chip. Single-select: tapping a tag filters the gallery to
  programs carrying it; "All" clears. Filtering is **client-side** over the already-loaded
  rows. Hidden entirely when no program has any tags.

**Detail-data note:** the expanded card needs each program's full day/slot tree. Two viable
approaches — (a) assemble all programs up front in the page (simple, fine for a personal app
with a handful of programs), or (b) lazy-load a program's detail on first expand via a server
action. Default to **(a)** for simplicity; revisit only if program counts grow. The plan
should pick one explicitly.

### Builder changes (`program-builder.tsx`, `actions.ts`)

- Add a metadata block at the top of the builder:
  - **Name** — existing input.
  - **Description** — new optional `textarea`.
  - **Tags** — chip input: type a tag + Enter/comma to add, `×` to remove. Stored as a
    deduped, trimmed `string[]`. Empty strings dropped.
- `SaveProgramInput` gains `description: string | null` and `tags: string[]`.
- `saveProgram` persists both on the **existing** program upsert (one extra field each on a
  call that already runs — no new round-trips). Tags normalized server-side: trim, drop
  empties, dedupe.

**Card metadata is exactly:** name · `{weeks} wk · {dayCount} days` · tags · `active` pill.
A derived "Week N of M" block-progress line is intentionally **excluded** to keep the gallery
query cheap (it would require a finished-session count per program).

---

## Phase B — Rest timer

### Data model

Migration `0007_rest_timer.sql`:

- `alter table profile add column default_rest_seconds int not null default 120;`
- `alter table program_slot add column rest_seconds int;` (nullable — `null` = use the
  profile default)

`src/lib/supabase/types.ts` regenerated.

### Settings

Add a **Default rest** control (a `Stepper`, e.g. 30–300s in 15s steps) to the existing
settings actions/form, persisting `profile.default_rest_seconds`.

### Builder

Each slot gains an optional **rest override** field. Empty/unset shows "default" and stores
`null`; a value stores `rest_seconds`. Carried through `SaveSlotInput` →
`program_slot.rest_seconds`.

### In-workout (`active-session.tsx`)

- Logging a set **auto-starts** a countdown for that slot, duration = `slot.rest_seconds ??
  profile.default_rest_seconds`.
- A dismissible **rest bar** shows time remaining with `skip` and `+30s` controls.
- On reaching zero: `navigator.vibrate(...)` (guarded — not all browsers/devices support it)
  + an **optional** short WebAudio beep. A user setting to mute the sound is acceptable but
  not required for the first cut.
- Timer state is **pure client state** — nothing persisted per session. Starting a new set's
  timer replaces any running one.

### Known limitation (must be documented)

Web timers throttle when the tab is backgrounded or the phone is locked, so a locked-pocket
countdown may drift or not fire reliably. **No** Screen Wake Lock and **no** push/service-
worker notification in this phase — explicitly a non-goal. Document this in
`docs/DECISIONS.md` alongside the existing "no offline layer" rationale.

---

## Testing

Framework-free logic lands in the vitest suite (`src/lib/**/*.test.ts`), consistent with the
existing engine/analytics tests:

- A `formatRestRemaining(seconds)` formatter (`m:ss`) — pure, unit-tested.
- A tag union/filter helper (union of tags across programs; filter programs by selected tag)
  if it ends up extracted as a pure function — unit-tested.

UI wiring (gallery expansion, builder metadata block, the in-workout rest bar) is verified
manually, per the project's existing convention (no React test harness).

`npm test`, `npm run lint`, and `npx tsc --noEmit` must be clean at the end of each phase.

---

## Out of scope / explicitly deferred

- **`saveProgram` atomicity.** The action runs ~7 sequential Supabase calls with no
  transaction (a pre-existing risk; last session's open thread #1). Adding two columns to the
  existing program upsert does **not** worsen it, and fixing it (a Postgres `save_program`
  RPC) is **not** part of this work. Flagged so it can be folded in deliberately if desired.
- Normalized tag table, tag colors/usage counts, renaming a tag everywhere.
- Multi-select tag filtering (single-select only for now).
- Screen Wake Lock, service-worker/push rest notifications, persisting timer state across
  reloads.
- Auto-expanding the just-saved program in the gallery is a nicety, not a requirement.
