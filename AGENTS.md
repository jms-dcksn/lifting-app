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

Before writing any framework code, check `node_modules/next/dist/docs/` for the installed
version's behavior — Next.js 16 has additional breaking changes beyond the ones listed here.

---

## Session continuity

At the start of every session, read `.claude/LAST_SESSION.md` if it exists. It records what
shipped last session, the current phase, open threads, and gotchas. Use it to pick up where
the last session left off without repeating context-gathering.

## Ship-phase skill

This project has a `ship-phase` skill (`.agents/skills/ship-phase/SKILL.md`) for the
repeatable build-to-commit workflow. Use it when building or wrapping up a phase of work.
It covers: build → refresh docs → commit → reflect → write session summary. Do not skip
the summary step — it is how the next session knows what happened.
