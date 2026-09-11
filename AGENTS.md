# Next.js 16 Breaking Changes

## `middleware.ts` renamed to `proxy.ts`

In Next.js 16, the session/edge middleware convention changed:

- **File**: `src/proxy.ts` (was `src/middleware.ts`)
- **Export**: `export function proxy(...)` (was `export function middleware(...)`)
- **Matcher config**: still exported as `export const config = { matcher: [...] }`
- **Default runtime**: Node.js (was Edge)

Any docs or examples referencing `middleware.ts` / `middleware` for session refresh are
stale. This project uses `src/proxy.ts` → calls `updateSession()` from
`src/lib/supabase/middleware.ts`.

## Supabase SSR: use `getClaims()` not `getUser()`/`getSession()`

Modern `@supabase/ssr` uses `supabase.auth.getClaims()` to refresh and validate the session
server-side. `getSession()` does not refresh tokens; `getUser()` makes a network call.
`getClaims()` is the correct method for both refresh (in proxy) and auth gates (in layouts /
Server Actions).

## General guidance

Shared program templates live in `src/lib/program-templates.ts`; adding one does not
require a database seed or migration. Strong Foundations uses executable 12-week
phases; its time budget and coaching rationale are in `docs/STRONG-FOUNDATIONS.md`.

Before writing any framework code, check `node_modules/next/dist/docs/` for the installed
version's behavior — Next.js 16 has additional breaking changes beyond the ones listed here.

The weekly Coach API is the sole elevated read path. `GET /api/coach/v1/weekly` uses a
server-only Supabase secret and `COACH_API_USER_ID`; every query must retain an explicit user
predicate because the secret bypasses RLS. Its high-entropy capability auth must remain
read-only, no-store, and noindex.

---

@CLAUDE.md

## Session continuity

At the start of every session, read `.claude/LAST_SESSION.md` if it exists. It records what
shipped last session, the current phase, open threads, and gotchas. Use it to pick up where
the last session left off without repeating context-gathering.

## Ship-phase skill

This project has a `ship-phase` skill (`.agents/skills/ship-phase/SKILL.md`) for the
repeatable build-to-commit workflow. Use it when building or wrapping up a phase of work.
It covers: build → refresh docs → commit → reflect → write session summary. Do not skip
the summary step — it is how the next session knows what happened.

## Scoped exercise swaps

`workout_session.exercise_swaps` stores explicit per-slot exercise choices, including before
any set is logged. `swap_session_exercise` is a SECURITY INVOKER RPC that validates the open
session and slot ownership and atomically saves the choice plus an optional program-slot update.
Run `supabase/tests/exercise_swap_scope.sql` as postgres for rollback-only database regression checks.
Fluid `manual_swap` events preserve rep ranges and reset plateau state; keep them distinct from
coach `swap` interventions. See `docs/EXERCISE-SWAPS.md`.

## Pre-workout planning

`loadNextWorkout` shares sequence, phase/fluid prescriptions, catalog, and draft choices
across Home, `/workout/next`, and session creation. Planning writes only a validated,
HTTP-only browser cookie; never create a session to preview one. Draft identity includes
user, program, day, and completed count. Start inserts choices into `exercise_swaps` in the
same write as the session, then clears the cookie. See `docs/WORKOUT-PLANNING.md`.
