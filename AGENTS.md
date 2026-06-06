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
