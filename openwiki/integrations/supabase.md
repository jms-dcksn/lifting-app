---
type: integration
title: "Supabase clients, auth, RLS, and RPCs"
description: How browser, server, and proxy clients share cookie SSR and getClaims gates, how owner RLS covers agent threads through a composite owner foreign key, and how the user-scoped agent path differs from the elevated Coach secret read and SECURITY INVOKER RPCs.
tags: [supabase, auth, rls, ssr, cookies, rpc, postgres, coach-api, agent, security]
verified:
  - by: openwiki/0.6.0
    at: 2026-09-29T00:58:03.170Z
sources:
  - id: openwiki-source-1a6effb048d19cdd34576d31
    resource: repo://DEPLOY.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-55416ab6e4db28879c533a75
    resource: repo://src/app/(app)/layout.tsx
  - id: openwiki-source-4025a316cb55867645e9b31e
    resource: repo://src/app/(app)/weight/actions.ts
  - id: openwiki-source-1014e63c55f76f798fc308f0
    resource: repo://src/app/api/agent/chat/route.ts
  - id: openwiki-source-09126fcfa8a06083d93c6001
    resource: repo://src/app/api/coach/v1/weekly/route.ts
  - id: openwiki-source-57b789394cf828e24da56d7f
    resource: repo://src/app/auth/callback/route.ts
  - id: openwiki-source-be930f087fa8d032e8662f5b
    resource: repo://src/lib/agent/chat-handler.test.ts
  - id: openwiki-source-cac3db37009e0f0d9759e6d0
    resource: repo://src/lib/agent/chat-handler.ts
  - id: openwiki-source-d6f7e8c86f423c580c8f6a59
    resource: repo://src/lib/agent/thread.ts
  - id: openwiki-source-9432db9bf4a6cc045b1f094e
    resource: repo://src/lib/agent/tools/index.ts
  - id: openwiki-source-9124b04d1362fc404e014c29
    resource: repo://src/lib/agent/tools/weekly-coach.ts
  - id: openwiki-source-d2647d60f789b9509ceb9eda
    resource: repo://src/lib/catalog.ts
  - id: openwiki-source-341cc1eb03b81a86675793d6
    resource: repo://src/lib/coach-api.ts
  - id: openwiki-source-88c16de37226f0856eaa8334
    resource: repo://src/lib/coach-weekly-data.ts
  - id: openwiki-source-05227b989b0dc31eec9eb475
    resource: repo://src/lib/current-bodyweight.ts
  - id: openwiki-source-912a05cb2ad8b6d48298f0c4
    resource: repo://src/lib/supabase/client.ts
  - id: openwiki-source-4c7726266572f5fcd2041ea9
    resource: repo://src/lib/supabase/middleware.ts
  - id: openwiki-source-b22459c0abfe5c0d18ee9ed7
    resource: repo://src/lib/supabase/server.ts
  - id: openwiki-source-06d9bbe6ed7b53833ea981eb
    resource: repo://src/lib/supabase/types.ts
  - id: openwiki-source-f34ac1e549d94dc3ac475ae4
    resource: repo://src/proxy.ts
  - id: openwiki-source-0479c4d807cfcaf49b8df86a
    resource: repo://supabase/migrations/0001_init.sql
  - id: openwiki-source-d3f09bc8a0182a75769e32fe
    resource: repo://supabase/migrations/20260911005629_exercise_swap_scope.sql
  - id: openwiki-source-7c7d167d2f6fb9b333f1efce
    resource: repo://supabase/migrations/20260912143620_bodyweight_calendar_writes.sql
  - id: openwiki-source-1915315531bbdb2a7a7c2327
    resource: repo://supabase/migrations/20260917000000_atomic_program_mutations.sql
  - id: openwiki-source-3048387bbf0f2ed4eb93764e
    resource: repo://supabase/migrations/20260920181553_agent_threads.sql
  - id: openwiki-source-5dcdbbd3bd4b962baf2a892a
    resource: repo://supabase/migrations/20260927170000_agent_multi_thread.sql
  - id: openwiki-source-6a6f4619e598bf058e2861d8
    resource: repo://supabase/tests/agent_thread_rls.sql
generated: { by: "openwiki/0.6.0", at: "2026-09-29T00:58:03.170Z" }
---

## Overview

Supabase is the app's only backend: Postgres for data, `auth.users` for identity, and
row-level security (RLS) as the default authorization model. The integration has five
moving parts documented here: (1) the three public cookie clients for browser, server,
and proxy contexts; (2) the trusted server-side auth check, `getClaims()`; (3)
owner-scoped RLS, including the agent tables and the composite foreign key that stops a
message from pointing at another user's thread; (4) the weekly Coach API, the only
secret-key read path; and (5) `SECURITY INVOKER` Postgres RPCs that perform multi-row
writes atomically under the caller's own RLS policies.

The agent is a second server-side client, not a second elevated one. `/api/agent/chat`
builds the cached publishable-key server client, checks `getClaims()`, and passes that
same client into thread persistence and read tools. It never uses `SUPABASE_SECRET_KEY`.

## Client construction

Three public Supabase constructors exist, each scoped to a different runtime context.
All three use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and therefore do not bypass RLS.
A fourth constructor, `createCoachApiClient()`, is private to the weekly Coach loader
and is the only secret-key client. The agent does not add a fifth constructor.

- `src/lib/supabase/client.ts` — `createClient()` builds a `createBrowserClient` for
  Client Components. It is a plain, unmemoized function; each call constructs a new client.
- `src/lib/supabase/server.ts` — `createClient()` builds a `createServerClient` bound to
  the request's cookies via `next/headers`. It is wrapped in React's `cache()`, so within a
  single request, layout, page, Server Action, and route-handler calls that invoke it all
  resolve to the same client instance. `setAll` writes are wrapped in a `try/catch` because
  Server Components cannot set cookies; that is safe because `src/proxy.ts` already refreshes
  and propagates the session on the underlying request.
- `src/lib/supabase/middleware.ts` — `updateSession(request)` builds a `createServerClient`
  bound to the request/response cookie pair and calls `supabase.auth.getClaims()` purely to
  trigger a token refresh, then returns the response with rotated cookies attached. The call
  to `getClaims()` must stay immediately after `createServerClient()`; any code placed between
  the two can break cookie propagation.

`cache()` keys on argument identity. Because `createClient()`, `getCatalogMap()`
(`src/lib/catalog.ts`), and `getCurrentBodyweight()` (`src/lib/current-bodyweight.ts`) are
all wrapped in `cache()`, and because callers pass the same memoized client instance into
the latter two, a single request loads the exercise catalog and the current bodyweight
exactly once no matter how many Server Components or actions need them. This memoization
is intentional and must be preserved when refactoring: breaking the shared client identity
(e.g., calling the unmemoized browser client from server code, or constructing a fresh
server client per call site) reintroduces duplicate queries per request. Agent read tools
that call `getCatalogMap` or `getCurrentBodyweight` participate in that same request cache
only when they receive this memoized server client.

```mermaid
sequenceDiagram
  participant Proxy as src/proxy.ts
  participant MW as updateSession()
  participant Layout as AppLayout
  participant SC as createClient() (server, cached)
  participant PG as Supabase/Postgres

  Proxy->>MW: every matched request
  MW->>PG: auth.getClaims() (refresh only)
  PG-->>MW: rotated session cookies
  MW-->>Proxy: response with refreshed cookies
  Proxy-->>Layout: request continues (no redirect)
  Layout->>SC: createClient()
  SC->>PG: auth.getClaims() (trusted check)
  PG-->>SC: claims or null
  alt claims present
    Layout-->>Layout: render AppShell
  else no claims
    Layout-->>Layout: redirect("/login")
  end
```
*Session refresh in the proxy is separate from, and does not gate, the layout's access check.*

## Auth flow: magic link, refresh, and the trusted check

Login is email magic-link. The link lands on `src/app/auth/callback/route.ts`, which
exchanges the PKCE `code` for a session via `supabase.auth.exchangeCodeForSession(code)`
using the server client, then redirects to a same-origin `next` path (rejecting any value
that doesn't start with a single `/`, to prevent open-redirect via `@evil.com` or `//evil.com`
style parameters) or falls back to `/login?error=auth`.

`src/proxy.ts` (the Next.js 16 successor to `middleware.ts`) runs `updateSession()` from
`src/lib/supabase/middleware.ts` on every request matched by its `config.matcher`, which
excludes Next internals, the manifest, the service worker, and static image assets. This
refreshes and re-propagates Supabase auth cookies on real navigations. **It does not gate
access** — it never inspects the claims result or redirects; it only keeps the session
token fresh so that server-side checks later in the request see valid cookies.

The actual access boundary is `getClaims()`, called directly against a Supabase client
(not the proxy). `src/app/(app)/layout.tsx` is the single top-level page gate: it builds the
memoized server client, calls `supabase.auth.getClaims()`, and redirects to `/login` when
`data?.claims` is missing. Every Server Action that reads or writes user data repeats a
narrower version of the same check — a `requireUser()`-style helper (e.g.
`src/app/(app)/weight/actions.ts`) that calls `getClaims()`, extracts `data?.claims?.sub` as
the user id, and throws a user-facing error if the id or the call itself is missing. Route
handlers do not inherit the layout gate, so `/api/agent/chat` repeats the check itself.
Authorization is therefore enforced at each entrypoint that can run independently: the layout
for page rendering, and again inside each Server Action and the agent route.

## Owner-scoped RLS as the default security model

Every user-owned table enables RLS with an "own rows" policy shaped as
`using (user_id = auth.uid()) with check (user_id = auth.uid())` (see
`supabase/migrations/0001_init.sql`); `profile` uses `id = auth.uid()` since its primary
key is the user id. New user-owned tables are expected to follow this same shape — for
example `body_measurement_log` mirrors `bodyweight_log`'s ownership policy, and
`agent_thread` / `agent_message` use the same owner predicate, granted only to
`authenticated`. Because the client library forwards the caller's JWT, Postgres itself —
not application code — is the enforcement point: a query the app forgets to filter by
`user_id` still cannot see another owner's rows, and a forged or missing `user_id` on
insert is rejected by the `with check` clause. The signup trigger (`handle_new_user()`,
`security definer`) is a narrow, deliberate exception that runs with elevated privilege only
to create the initial `profile` row after `auth.users` insert; it is not a precedent for
elevated reads elsewhere.

## Agent threads stay on the logged-in client

`agent_thread` and `agent_message` are ordinary owner-scoped tables, not a privileged
memory store. The chat route at `src/app/api/agent/chat/route.ts` authenticates with the
cached server client and `getClaims()`. Missing claims return 401 before any tool runs.
`createAgentChatHandlers()` then passes that same client and `claims.sub` into `loadChat()`,
`startTurn()`, and `bindReadTools()`. Read tools (`weeklyCoach`, `activeProgram`,
`exerciseReview`, `nextWorkout`) query through that client; `weeklyCoach` calls
`loadCoachUi(userId, supabase)`, not `loadCoachWeekly()`.

```mermaid
sequenceDiagram
  participant Route as /api/agent/chat
  participant SC as createClient() (server, cached)
  participant Auth as getClaims()
  participant Thread as thread persistence
  participant Tools as bindReadTools()
  participant PG as Postgres RLS

  Route->>SC: cookie session client
  Route->>Auth: trusted check
  alt no claims.sub
    Route-->>Route: 401 before tools or writes
  else signed in
    Route->>Thread: loadChat or startTurn(client, userId)
    Thread->>PG: agent_thread and agent_message as caller
    Route->>Tools: same client and userId
    Tools->>PG: owner-scoped reads, including Coach UI data
  end
```
*The agent reuses the logged-in publishable-key client. It does not call the Coach secret client.*

Thread ids are application-chosen UUID v7 values. The multi-thread migration drops the
database default on `agent_thread.id` and the original one-thread-per-user unique constraint,
replacing it with `agent_thread_id_user_key` on `(id, user_id)`. A user may own many titled
threads. `startTurn()` inserts the thread and its first user message, and deletes the new
thread if that first message insert fails, so a failed open does not leave an empty thread.
Continuing a thread that `findThread()` cannot see for this user returns null, which the
route surfaces as 404 without running the model. Each saved message then stamps
`agent_thread.updated_at`. The list is the 50 most recently updated owned threads.

RLS alone does not stop an authenticated user from inserting their own `user_id` with
someone else's `thread_id`. `agent_message_thread_owner_fkey` closes that gap: it is a
composite foreign key from `(thread_id, user_id)` to `agent_thread (id, user_id)` with
`on delete cascade`. Attaching a message to another user's thread, or moving an owned
message onto one, fails with `23503` even when the message row's own `user_id` matches
`auth.uid()`. The role and parts checks remain table constraints (`user`, `assistant`, or
`tool`; `parts` must be a JSON array). Grants are select/insert/update/delete for
`authenticated` only.

`supabase/tests/agent_thread_rls.sql` is the pgTAP regression for this boundary. As the
authenticated owner it expects one visible thread and one visible message, allows an insert
and update on the owned thread, allows a second owned thread, rejects a cross-user thread
or message insert with `42501`, requires an app-supplied thread id (`23502`), and rejects
both a cross-owner attach and a cross-owner move with `23503`. `src/lib/agent/chat-handler.test.ts`
covers the route contract with a memory client that imitates the same owner foreign key:
unauthenticated POST returns 401 before tools, a missing gateway key returns 503 before
insert, another user's thread returns 404 without a model call, and a failed first-message
insert removes the new thread.

## The elevated read path: weekly Coach API

`GET /api/coach/v1/weekly` is the one place the app reads with a privileged key that
bypasses RLS. It is not the only non-browser client: the agent, Server Actions, and other
server loaders use the cookie client above. The Coach call chain is:

`route.ts` → `createCoachWeeklyHandler()` (`src/lib/coach-api.ts`) → `loadCoachWeekly()` /
`loadCoachWeeklyWithClient()` (`src/lib/coach-weekly-data.ts`) → a `@supabase/supabase-js`
client built by `createCoachApiClient()` using `SUPABASE_SECRET_KEY` (a revocable
`sb_secret_...` key, never the publishable key) with `autoRefreshToken: false` and
`persistSession: false`.

Invariants that keep this path safe despite bypassing RLS:

- `createCoachWeeklyHandler()` requires a configured `expectedToken` (≥32 characters) and a
  configured, UUID-shaped `userId` before doing anything else; missing or malformed server
  configuration returns 503 rather than silently reading data.
- The caller must present a matching bearer token (`Authorization: Bearer <COACH_API_TOKEN>`)
  or, for clients that cannot set headers, the same token as a `?token=` query parameter
  (a scoped capability URL, treated as a secret). Token comparison is constant-time
  (`constantTimeTokenEqual`, SHA-256 digest + `timingSafeEqual`) to avoid timing side
  channels. Missing and invalid credentials both return a generic 401.
- Every single query inside `loadCoachWeeklyWithClient()` — `set_log`, `profile`,
  `workout_session`, `bodyweight_log`, `program_day`, `program_slot`, `program_phase`,
  `exercise`, `program` — carries an explicit `.eq("user_id", userId)` (or `.eq("id", userId)`
  for `profile`) predicate, even though the secret key would return all rows regardless.
  This is a deliberate defense-in-depth rule, not an artifact of RLS: since the secret key
  bypasses RLS entirely, the explicit predicate is the *only* thing scoping every read to
  `COACH_API_USER_ID`. A query added to this loader without that predicate would leak all
  users' data through this one endpoint.
- Responses set `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`,
  `Vary: Authorization`, and `X-Robots-Tag: noindex, nofollow`, and a loader failure returns
  503 rather than a partial or error-detail body.
- The endpoint serializes the same canonical `CoachCheckInReport` (`src/lib/coach-check-in.ts`)
  used by the in-app Track Coach snapshot rather than re-deriving aggregation logic, and adds
  deterministic proposals from `src/lib/coach-recommendations.ts`. See
  [Coach and AI agent workflow](../workflows/coach-and-ai-agent.md) for the report contract,
  privacy shape, and recommendation semantics, and
  [deployment and config](../operations/deployment-and-config.md) for the required
  `SUPABASE_SECRET_KEY` / `COACH_API_USER_ID` / `COACH_API_TOKEN` environment variables and
  rotation procedure.

No other server code path uses `SUPABASE_SECRET_KEY`. The agent must not be pointed at
`createCoachApiClient()` or `loadCoachWeekly()` to "see more data": that would replace the
caller's RLS session with a key that can read every user, scoped only by the hardcoded
`COACH_API_USER_ID`.

## SECURITY INVOKER RPCs for atomic multi-row writes

Several writes touch more than one table, or more than one row, in a way that must not be
observed half-applied. Rather than perform these as sequential client-side statements
(risking partial application on failure, or races between concurrent requests), they are
implemented as Postgres functions called via `supabase.rpc(...)` from Server Actions. All of
them are declared `language plpgsql security invoker set search_path = ''`: they run with the
*calling user's* privileges and RLS policies, not elevated ones, and the empty `search_path`
prevents search-path hijacking of unqualified identifiers. Ownership is still re-derived
inside each function from `auth.uid()`, and every function `revoke`s execute from `public`
and `anon`, granting it only to `authenticated`.

- **`save_bodyweight_entry(p_entry_id, p_logged_on, p_weight, p_replace_entry_id)`**
  (`src/app/(app)/weight/actions.ts` → `writeWeightEntry`) — validates the date and weight
  range, takes a per-owner `pg_advisory_xact_lock` to serialize calendar writes (including
  writes to a previously empty date), and inside that lock inserts, updates, or explicitly
  replaces the one-entry-per-user-per-date row. An unconfirmed collision with an existing
  date raises `23505`, which the action layer turns into a "replace it?" confirmation prompt
  rather than a silent overwrite; a missing target row raises `P0002`.
- **`swap_session_exercise(p_session_id, p_slot_id, p_exercise_id, p_pattern, p_scope)`**
  (`src/app/(app)/session/actions.ts`) — writes a workout-scoped exercise substitution into
  `workout_session.exercise_swaps` (jsonb) and, when `p_scope = 'program'`, also updates the
  one target `program_slot` row and records a `movement_adaptation` row for Fluid programs —
  all atomically, and only after re-verifying that the session belongs to the caller, is not
  yet finished, and that the slot belongs to that session's program day. It never rewrites
  `set_log`, preserving historical prescriptions for already-logged sets.
- **`save_program(p_tree)`** and **`set_active_program(p_program_id)`**
  (`src/app/(app)/program/actions.ts`) — `save_program` upserts an entire program tree
  (program row, phases, days, nested slots) from a single JSONB payload in one transaction,
  preserving `program_slot_id` continuity across edits (slot ids are referenced by `set_log`
  foreign keys) and deleting rows no longer present in the payload. When the payload marks
  the program active, activation is a single `update ... set is_active = (id = v_program_id)
  where user_id = v_user` statement so there is never an intermediate state with zero or two
  active programs. `set_active_program` performs the same single-statement activation for the
  "make this program active" action without a full tree rewrite, after verifying ownership of
  the target program.

Because these functions run as the invoking user under `security invoker`, they do not
introduce a new trust boundary the way the Coach API's secret client does — a malicious
payload still cannot touch another owner's rows, since the underlying table RLS policies
still apply inside the function body. Their value is purely transactional atomicity and
server-side invariant enforcement (single active program, one bodyweight reading per date,
no swap on a finished session) that would otherwise require multiple round-trips from
application code with a race window between them. Agent thread writes are not in this RPC
set: they are ordinary owner-scoped inserts and updates on the logged-in client, with the
composite foreign key supplying the cross-row ownership invariant.

## Testing

`supabase/tests/*_rls.sql` are pgTAP-style ownership regressions run against a local
Supabase stack (`npx supabase start && npm run test:db`); CI runs this suite on every pull
request, so an RLS regression on a covered table fails the build. `agent_thread_rls.sql` is
part of that glob and is the regression for agent visibility, cross-user writes, and the
composite owner foreign key. The remaining scripts under `supabase/tests/` (e.g.
`program_mutations.sql`, `bodyweight_calendar_writes.sql`, `exercise_swap_scope.sql`) are
psql-style checks — including the `swap_session_exercise` regression that asserts
workout-scoped swaps don't touch the program slot, program-scoped swaps don't touch prior
`set_log` rows, and independent slot swaps coexist in the same `exercise_swaps` jsonb —
that emit no TAP output and are run individually with `psql -f`. Vitest-level coverage
exercises the token/authorization and response-shape contract of the Coach handler with a
mocked `loadWeekly` (`src/lib/coach-api.test.ts`) and the agent route's auth, ownership,
and persistence contract with a memory client (`src/lib/agent/chat-handler.test.ts`), not
real database access. See [testing strategy](../testing/testing-strategy.md) for how these
layers fit together and [data model](../architecture/data-model.md) for the full schema and
RLS table inventory.
