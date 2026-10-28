# Project verification and hardening

## Git hooks

Use Node 22, Git and `npm ci` on every new checkout, including cloud coding environments.
Install dev dependencies and allow npm lifecycle scripts. The root `prepare` script runs
the pinned Lefthook binary to install `pre-commit` and `pre-push`; configuration lives in
`lefthook.yml`. No global hook tool, Docker, credentials or browser is needed for commit checks.

| Gate | Required checks |
| --- | --- |
| Commit | Full ESLint, strict indexed-access TypeScript slice, hook regression tests, deterministic Vitest suite |
| Push | Full `npm run verify`: fresh framework types, TypeScript, lint, strict slice, hook tests, Vitest, production build |
| PR CI | Base verification plus disposable database ownership/concurrency tests and authenticated browser journeys |

Commit checks run on every commit, including documentation changes. `scripts/git-hooks.mjs`
exports the Git index to a temporary directory, links the checkout's installed dependencies,
and runs the existing npm commands there. This checks staged additions/deletions and partial
staging without stashing, formatting, or changing working files. Temporary files are removed
afterward. Ignored local environment files and generated Next types are excluded. The strict
slice needs no generated route types, so commits are safe while the dev server runs. Install
dependencies again after changing the lockfile; the staged and working lockfiles must agree.

Push verification uses the current checkout: commit or stash tracked and untracked work
first, and stop the Next dev server/build. Next lock files block the push before generated
types can be removed. Push the checked-out HEAD; pushing a different commit/ref is rejected.
Ignored dependencies, environment files and build output can remain. Push checks are read-only
with respect to hosted databases: the existing hosted migration gate is preserved, and a
failure never authorizes a migration. Both hook runners force paid live evals off.

After `npm ci --ignore-scripts`, explicitly run `npm run prepare` once scripts are allowed.
`npm run prepare` also repairs missing hooks. If a managed environment blocks writes to
`.git/hooks`, obtain that filesystem permission and rerun it. A conflicting `core.hooksPath`
needs reconciliation with the environment's hook owner; preserve existing hooks rather than
silently replacing the configured path. Use `npx --no-install lefthook validate` to check the
configuration and `npm run check:commit` / `npm run check:push` to run gates manually.

Keep hooks enabled for agent and human commits. If prerequisites are unavailable, report
the blocked gate and resolve the environment instead of using `--no-verify`, `LEFTHOOK=0`,
or local skip overrides. Local hooks remain bypassable; repository administrators should
require the CI app and Database RLS checks on protected branches. The checked-in workflow
runs them, but branch protection is a separate GitHub setting.

## Compatibility review

For stricter validation, shared writes/RPCs, or a requirement moved earlier in a flow:

1. List affected callers and the existing valid states they send. Include untouched
   built-in programs, pending equipment, saved edits, resumed sessions and historical rows
   where relevant. Use shipped builders/data in fixtures; hand-picked resolved exercises
   alone do not establish compatibility.
2. State when each requirement becomes necessary. Starting a workout accepts known
   equipment templates; saving editor changes and logging new snapshot-backed sets require
   specific equipment. A shared validator must preserve these operation-specific rules.
3. Add a regression at the boundary that rejected the user, plus a browser journey through
   each affected entry point. Mocked RPC success proves argument forwarding, not SQL behavior.
   For a reported bug, verify the test fails for the original reason before the fix when a
   disposable reproduction is available; record any gap rather than claiming a reproduction.
4. Assert failure leaves existing data intact and gives a usable retry/recovery path.
   Keep ownership, exact exercise identity, resume/idempotency and historical evidence checks.
5. Run database/browser CI for the final PR head. Report which input states were exercised;
   a successful build or hosted migration-ledger check alone does not prove a user journey.

The #239 regression moved equipment selection from before logging to before Start. Tests
covered resolved exercises and editor flows, missing untouched programs on Home/planner.
`e2e/workout-start-station.spec.ts` now covers both buttons, pending bench/cable choices,
selection, logging and reload. `workout_start_station_rls.sql` checks Start versus Save/Log
rules against real authenticated SQL, including rejected writes and immutable captures.

`npm run test:db:compatibility` builds every shipped template with the gallery's
`buildProgramTreeFromTemplate`, in Classic and Fluid styles, saves through the authenticated
`save_program` RPC and starts/resumes every day of the first cycle through `start_workout_plan`.
It uses `editorSlot` without preselecting equipment, compares exact captures and checks that
Start creates no performance evidence. New templates automatically join this matrix. Each
case rolls back its synthetic data. The command requires `COACH_TEST_DATABASE_URL` on a
disposable loopback database, runs in the database verification profile and is an explicit
CI step. Later weeks, equipment selection and edited plans have separate tests; this matrix
checks the untouched path.

Commit hooks already run deterministic action/error tests; retain real database and browser
verification in CI where those prerequisites are supplied. Add behavior tests at the failing
boundary rather than source-text checks for SQL strings or a generic "test file changed" rule.
When replacing executor-owned functions, verify migration-role membership/inheritance and
function ownership; runtime fixtures must retain deployed non-bypass roles. See
[Deployment](../DEPLOY.md) for hosted migration verification and release ordering.

## Session continuity across local and cloud clones

`AGENTS.md` and `.agents/skills/close-session/SKILL.md` define the portable workflow.
Start from the assigned issue/PR, current Git status and branch, and relevant versioned docs.
At completion, update owning docs for durable changes and report checks, blocked verification,
commit/push status and remaining work. When publishing a PR is authorized, its description
also carries task-specific verification evidence. An ignored file is never the only home
for a changed contract, decision or actionable follow-up.

`.claude/LAST_SESSION.md` remains optional, ignored, checkout-local context. Fresh clones
normally have no file. Its `Commit:` and `Branch:` lines must exactly match HEAD and the
current branch (`DETACHED` for detached HEAD) before it is used; working-tree claims still
need checking. Older notes without branch metadata are skipped. Cloud sessions can finish
with the durable docs and self-contained final report, without generating a local note.

`.claude/settings.json` configures only Claude Code's optional startup loader. There is no
Stop gate requiring a local handoff or a matching HEAD. Codex follows `AGENTS.md` explicitly;
the Claude configuration does not install lifecycle hooks in Codex. Shared Git commit/push
gates are Lefthook's responsibility. `npm run test:hooks` covers staged checks, push guards,
fresh/matching/stale/other-branch/detached local notes, and the absence of a Stop gate.

## Verification profiles

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
| `database` | pgTAP, untouched-template compatibility and competing connections; running disposable local Supabase plus `COACH_TEST_DATABASE_URL` on loopback |
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
security review and merge policies remain in force. The [verify-change](../.agents/skills/verify-change/SKILL.md)
skill selects these profiles and commands. Do not copy this table into another doc.

## Episode conversation/action regression (#141)

`coach_conversations_rls.sql` checks both-owner link/receipt isolation, direct-write and
anonymous denial, private-helper/MAC boundaries, deterministic seed reuse/deletion and
history clearing. `scripts/test-coach-actions-concurrency.mjs` runs through the existing
`test:db:concurrency` command and uses real competing connections: simultaneous opens and
confirms, lost-response and expired-command replay, conflicting request intent, changed
source/open-session scope, a competing set write, injected receipt failure rollback, snooze
and atomic open-workout replacement. The executor retains its realistic non-bypass role.

`e2e/coach.spec.ts` uses real local Auth, Next actions, PostgREST/RLS and PostgreSQL. It covers
notice → one-click acceptance or explicit discussion → reused conversation → evidence →
cancellation/confirmation → persistent receipt. The test waits for the notice URL and
recommendation before saving its return destination. Discussion transport is stubbed with a saved
assistant response, so no paid model runs. Tests expect one initial request and no repeat
on reopen; handler tests verify the owned seed and fresh episode context. Before-workout confirmation creates no session; open-workout
review preserves typed set inputs and all saved history. 320px overflow is checked.
The local #141 run passed all 14 ownership suites / 178 assertions and both concurrency
scripts. Browser verification passed the pre-workout journey and the existing anonymous,
set/reload/swap/pain journey, then the final open-workout draft-preservation journey after
recording canonical default identities at session creation. Hosted migrations/keys, email
delivery and live-model language quality remain separate verification.

## Coach entry compatibility (#206)

Pure navigation/data tests verify encoded exercise/equipment/month focus, saved legacy tool
results, exact-identity matching, multi-slot choice, unavailable refresh and the on-demand
no-thread fallback. The retained report test asserts facts remain visible with no routine
review-write buttons. Focused chat/navigation tests retain stream/navigation locking.
`e2e/coach.spec.ts` extends both before/open-workout journeys with old Coach and settings
links, conversation reuse, focused URL reload, optional read-only report details and the
post-intervention ordinary draft. No model call or extra thread is created by these routes.

The final #206 browser run passed all four tests: both full entry/conversation/intervention
journeys (before and during a workout), anonymous redirect, and the existing real set/reload,
scoped-swap and pain-acknowledgement flow. Legacy routes render the resolver directly rather
than issuing a streamed redirect; completing entry performs document navigation. The browser
suite runs with a fresh dev server and then exits before generated-type/base verification;
`scripts/typecheck.mjs` must not clean generated validators while a dev server is running.

Final #206 base verification passed fresh framework types, TypeScript, lint (the existing
`board.ts` unused-variable warning remains), indexed-access checks, 1,193 tests with one gated
live test skipped, and the production build. No hosted rollout or paid model evaluation ran.


## Complete workout editor (#238)

`workout-editor.test.ts` checks the versioned plan boundary, equipment load rules, recovery
row retention, seed-to-performance progression and independent set identity/context.
`workout-editor-ui.test.tsx` checks draft-only removal/Undo, Cancel, failed-save request reuse,
invalid-field focus and normal-week effort/volume during recovery editing. The shared picker
suite prevents duplicate selection during dismissal. Target tests also check active swap
projection without carrying the captured exercise's manual load.

`workout_editor_rls.sql` uses authenticated owners to check direct/anonymous denial, complete
scope writes, request receipts, stale revisions, failed-save/start rollback, immutable session
captures, retired historical references and stable added-slot IDs. The concurrency command
now includes `test-workout-editor-concurrency.mjs`, which uses competing real connections for
save conflicts and exactly one captured/resumed start.

`e2e/workout-editor.spec.ts` runs real Auth → Next actions → PostgREST/RLS → PostgreSQL → UI
at 390px mobile and 1280px desktop. It covers global edits, deferred station creation and
Cancel, remove/Undo, keyboard reorder, supersets/round rest, distinct rows, navigation/reload
protection, both scopes/starts, snapshot logging, historical stability, a 4-to-2 recovery week
with 3–4 RIR, and a return to four normal sets with edited 1 RIR and independently progressed
heavy/lighter loads. Browser fixtures are synthetic and owner-cleaned; paid model calls and
hosted deployment/migration behavior remain separate. The PR records exact executed results.

## Tempo (#236)

`tempo.test.ts` checks explicit/default precedence, station inheritance, validation and
plan serialization. The active-card tests exercise logging controls; the workout editor's
RLS fixture now preserves an explicit tempo. `workout_tempo_rls.sql` checks database
validation, unspecified legacy sets, numeric-edit preservation and owner isolation.
`e2e/workout-details.spec.ts` runs real Auth → program edit → planner → captured workout →
performed override → numeric edit → finish/history at mobile and desktop widths. This
session passed all 16 ownership suites / 202 assertions and the tempo browser journey;
base verification passed 1,300 tests, typecheck, lint, strict slice and production build.
The existing board unused-variable lint warning remains. No hosted migration ran.

The #242 CI database job exposed a browser selector that counted the new Tempo legend
as a planned set. Planner set-count assertions now select only numbered Set legends.
The tempo journey also scopes saved values to set rows and awaits committed Finish/recap
before reading history. These fixes belong to the tempo PR independently of notes/setup.

Set-entry fields stay disabled for the entire pending save, including optimistic
advancement to the next planned row. This prevents early next-set input from being
reset by the committed form replacement; the progress test checks pending/recovery state.

## Workout setup and notes (#240)

`workout-details.test.ts` checks canonical machine/cable eligibility and Unicode text
limits without truncation. Action tests cover note-only preservation (including historical
null RIR/e1RM), numeric edits, lost-response replays, explicit unspecified tempo and stale
revision rejection. Sheet tests cover failed drafts, deliberate Clear/Save, guarded
dismissal and Strict Mode navigation. `workout_details_rls.sql` checks independent duplicate
occurrences, machine/cable and physical equipment identity, snapshots, owner isolation,
validation and original associations after swaps. The concurrency profile includes
`test-workout-details-concurrency.mjs` for competing text/numeric saves and atomic setup
capture during a concurrent set log.

`e2e/workout-notes.spec.ts` uses real local Auth/actions/PostgREST/RLS. It checks notes
before sets, 2,000-character validation, long previews, explicit clearing, an aborted
write and retry, stale-save recovery, saved-content discovery, focus restoration,
remembered setup, per-set text/tempo, numeric edits, an unchanged rest timestamp, reload,
swap associations, finish/history and next-workout reuse at 320px and desktop widths.
Viewport tests exercise responsive/keyboard focus behavior; physical iOS/Android keyboard
and device safe-area behavior still require device QA. No hosted rollout or paid eval ran.
