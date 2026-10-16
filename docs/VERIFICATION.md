# Project verification and hardening

Run `npm run verify` from a checkout with dependencies installed and no running dev
server/build. It regenerates both production and development route types, then runs
typecheck, lint, the indexed-access slice, Vitest and the production build. Both Next
validator directories are generated state: `next typegen` alone does not remove old
development validators after a route is deleted. Do not exclude validators to get a pass.

Explicit profiles can be combined: `npm run verify -- base agent database browser`.
Every selected command reports PASS, FAIL or BLOCKED; unselected/remaining checks report
SKIP. Failure or missing prerequisites returns a nonzero exit code. Base checks use local
placeholder public Supabase configuration only when environment variables are absent.
The existing production migration gate remains part of the build.

| Profile | Checks and prerequisites |
| --- | --- |
| `base` (default) | Fresh route types, TypeScript, ESLint, strict slice, Vitest, build |
| `agent` | Deterministic agent tests and generated Coach invariants; no model calls |
| `database` | Existing pgTAP and competing connections; running disposable local Supabase plus `COACH_TEST_DATABASE_URL` on loopback |
| `browser` | Real Auth → app action → PostgREST/RLS → DB → rendered UI; prerequisites below |
| `live` | Existing paid model evals, explicitly selected and with all eval credentials present; never selected by default |

## Browser smoke checks

With local Supabase running and Chromium installed (`npx playwright install chromium`),
run `node scripts/browser-local.mjs`. It reads only the local CLI's public URL/key
fields, uses the disposable local database and invokes the browser profile. CI uses this
same helper after database verification and installs Chromium with system dependencies.

For an independently configured disposable stack, set `E2E_DISPOSABLE=1`,
`E2E_DATABASE_URL`, `E2E_SUPABASE_URL` and `E2E_SUPABASE_KEY`, then run
`npm run verify -- browser`. All database, API and app URLs must be loopback.
`E2E_BASE_URL` defaults to `http://127.0.0.1:3100`; that port must be free.
`E2E_CHROMIUM_EXECUTABLE` optionally selects an installed Chromium. The runner starts
its own Next dev server and never reuses an unrelated server. Do not run base type
generation concurrently with it. Traces are retained only on failure and are ignored
by Git; treat them as local test artifacts.

The fixture signs up/logs in through real local Auth, seeds one synthetic owner's program,
and deletes only that owner in cleanup. It provisions the fixed synthetic
`browser-verification` Coach signing key only in that disposable database. The test
server uses the matching key; no key is installed in hosted environments. The journey
logs a set, reloads it, checks workout/program swap scope and preserved set identity,
finishes with significant pain, then opens/acknowledges the real generated notice across
reload. It also checks that acknowledging pain does not resolve it. Anonymous users
must still reach the sign-in screen. Email delivery and paid model quality are separate
checks; this suite proves the real authenticated app path using a test password login.

## Enforced boundaries

- `training-evidence.ts` validates saved set ownership, timestamps, explicit warmup/deload
  flags, exact loading identity and saved historical load context. Missing classification
  is invalid data, not a normal working set. `progressionEvidence()` shares the existing
  eligibility rule. Record loading/replay is the initial complete migration; activity is
  retained separately from progression evidence, including recovery and rep-only work.
- `resolveExactWorkoutTarget()` requires an exact identity object. Home/planner loading,
  active sessions, Coach evidence and next-workout tools use it. Comparison scopes remain
  separate; machine/cable comparisons and Card 2–4 decisions are unchanged. The original
  pure resolver remains the compatibility entry point for existing engine-level callers.
- `coach-storage.ts` validates existing unversioned JSON as the `episodes-v1` format,
  using the state row's defaults version and candidate policy version. Unknown versions
  and malformed data are explicit errors. Refresh converts them to retryable unavailable
  status outside the saved training transaction. Notice details receive parsed evidence;
  redacted original evidence stays null. No storage format/migration is introduced.
- `collectIdPages()` owns advancing unique-ID cursor mechanics. Inbox and stall loaders
  retain their typed table projections, owner filters and errors. Short server-capped pages
  do not end history; repeated IDs fail instead of looping or duplicating. Text exercise IDs
  retain database collation order rather than imposing JavaScript string ordering.
- The architectural ESLint rule rejects outside dependencies in production strength modules,
  direct lower-level target calculations in UI/agent adapters, production imports of eval
  helpers, and privileged Supabase credential access outside local live evals. Supported
  live starting-weight estimates and progression type imports remain allowed. Rule fixtures
  exercise aliases, relative imports, re-exports, dynamic imports and secret access.
- Fast-check lifecycle sequences use fixed seeds and shrink failures to reproducible
  counterexamples. They cover replay, correction/deletion, absent evidence, preferences,
  snooze, explicit recovery, pain precedence, immutability and noncompounding targets.
  Shared clock and least-privilege database fixtures prevent tests from granting the
  Coach executor Auth/extension schema access to mask a runtime permission failure.

## Incremental indexed-access checking

`npm run typecheck:indexed` checks identity, eligibility, e1RM, trend and pagination modules
with `noUncheckedIndexedAccess`. Their entire imported dependency closure remains checked.
An imported module automatically joins the slice. CI runs it through base verification.
Empty evidence and missing lookups are narrowed explicitly; casts and blanket assertions
are not a migration strategy. The exploratory whole-source count (717 diagnostics across
80 files on 2026-10-16, including tests) is historical evidence, not a count of known bugs.

To inspect the current wider backlog, first run `npm run typecheck`, then
`npx tsc --noEmit --incremental false --pretty false --noUncheckedIndexedAccess`.
Capture source diagnostics separately from generated files. This audit command is expected
to fail until wider adoption; it is not the enforced CI slice or a passing-check substitute.

Next batches: migrate statistical cache rebuilds and dashboard/review aggregation through
validated evidence; extend explicit identities to stall-data adapters; then add those
modules and their fixture helpers to the strict slice. Keep consumer compatibility wrappers
until each batch lands green. Global indexed-access enforcement follows those batches.
Do not widen exercise comparison scopes while changing types.

## Human review

Focus review on training policy/numeric interpretation, comparison scope, ownership/RLS,
migrations and external effects. Check that boundary changes preserve historical logs and
that verification covers real authorization rather than a more privileged fixture.
Mechanical internal edits should be supported by the executable checks above. Existing
security review and merge policies remain in force. No Poteto/Cursor skills are installed;
a future verification skill should select these commands instead of duplicating them.
