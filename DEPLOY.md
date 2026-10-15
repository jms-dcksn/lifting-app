# Deployment

The repository uses Vercel's GitHub integration for `jms-dcksn/lifting-app`: `main` is the
production branch and other branches receive previews. The recorded production domain is
https://lifting-app-plum.vercel.app. Resolve current deployments through the Vercel dashboard
or GitHub deployment/check status; do not treat an old deployment-specific URL as current.
Remote deployment health, Auth settings, and applied migration state were not verified in
the 2026-09-13 documentation review.

## Configuration

`.env.local.example` lists the configuration read by the application:

| Variable | Used by |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/SSR clients and local live evals |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/SSR clients; owner access enforced by RLS |
| `SUPABASE_SECRET_KEY` | Local live agent evals only; bypasses RLS |
| `AI_GATEWAY_API_KEY` | Server-only Vercel AI Gateway key for the in-app agent. Vercel deployments may use `VERCEL_OIDC_TOKEN` instead |
| `LANGSMITH_API_KEY` | Server-only LangSmith key. Agent traces go here |
| `LANGSMITH_TRACING` | Set `true` to emit traces. The route also enables this when a LangSmith key is present |
| `LANGSMITH_PROJECT` | Dedicated project name. Default and recommended: `lifting-app-agent` |
| `AGENT_MODEL` | Optional Gateway model id (`provider/model`). Default `openai/gpt-5.4` |

The first two are required for the app and exposed in the browser bundle.
`SUPABASE_SECRET_KEY` stays server-only for `npm run eval:agent`; the application
does not use it. The retired weekly HTTP export has no deployment configuration.

The AI Coach / agent keys are also server-only. Never prefix them with `NEXT_PUBLIC_`.
Without a Gateway key (or OIDC token), `POST /api/agent/chat` returns 503. Apply both
agent migrations before dogfooding chat. `20260920181553_agent_threads.sql` creates
`agent_thread` / `agent_message`. `20260927170000_agent_multi_thread.sql` allows many
threads per user. It deletes threads that have no messages (Slice 0 left one whenever
chat opened) and backfills thread titles. Thread inserts then need an app-chosen id and
a title, and the app now writes both, so ship the migration with the app version that
expects it. Use the dedicated LangSmith project `lifting-app-agent`; do not share it
with other apps.

Keep real values in ignored `.env.local` or Vercel environment settings. Configure Production
and Preview separately; verify which database a preview uses before writing test data.
Changes to public variables require rebuilding the client bundle.

## Database and Auth

For a new environment, provision Supabase, link the intended project, then apply migrations:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

For an existing project, inspect migration history before pushing. Migrations are tracked
applications, not scripts to replay indiscriminately. All files in `supabase/migrations/`
are relevant, including phases, feedback, bodyweight history, Coach decisions, exercise swaps,
and atomic calendar writes. Period tracking (#33) adds `profile.sex`, consent columns, and
`period_observation`; apply that migration before deploying the You (`/settings`) UI that
reads those fields. Rest-complete tone (`profile.rest_tone_enabled`, default true) is a
later profile column; apply its migration before relying on the Settings checkbox.

The production build runs `scripts/check-hosted-migrations.ts` before `next build`.
That script reads `deployment_applied_migration_versions` with the publishable key. It does not apply SQL.
If a file in `supabase/migrations` is missing from the hosted ledger, the build exits 1 and the previous production deployment keeps serving.
Clear it with `npx supabase db push` from a linked checkout of main, then redeploy.
The first production deploy of this change fails until that push, because the read function is itself a migration. CI, local, and preview builds do not call the hosted project.
`npm run test:db` still only proves a local stack.

Breaking consent-copy
changes should bump `period_consent_version` and require re-consent.

Enable email magic-link Auth. Set Site URL and allowed redirect URLs for the production
and intended preview origins. The app exchanges the callback code at `/auth/callback`;
`src/proxy.ts` refreshes cookies, while the app layout and actions authenticate with `getClaims()`.
Verify dashboard/email settings in the actual environment instead of relying on old checkboxes.

## Verify and release

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Vitest includes pure-module tests and mocked action/data-boundary tests. A passing build does
not replace authenticated route testing.

SQL regression scripts under `supabase/tests/` cover real ownership and atomic writes. The
pgTAP ownership suite (`*_rls.sql`) runs against a local stack and needs Docker:

```bash
npx supabase start
npm run test:db
npx supabase stop
```

`npm run test:db` targets `supabase/tests/*_rls.sql`. The remaining scripts in that directory
are psql-style checks that emit no TAP output; run them individually with `psql -f` and
consult each feature doc for execution requirements.

Within an approved release, push the branch for a preview, inspect deployment checks, and
smoke-test login/callback, program creation, planning/Start, logging/swapping/finishing,
Track/monthly review, and weight calendar edits relevant to the change. Preview writes
reach whichever Supabase project its environment selects. Merge/push to `main` releases
through Vercel's integration. `.github/workflows/ci.yml` runs lint, typecheck, Vitest, and the
build on every pull request, plus the pgTAP ownership suite against a local Supabase stack, so
an RLS regression on a covered table fails the build.

## Pull request security review

The Cursor workflow is temporarily disabled in GitHub Actions as of 2026-10-06,
pending a replacement. Its workflow and SDK runner remain for reference. Re-enable it
only when the replacement is ready; the behavior below describes the enabled workflow.

`.github/workflows/security-review.yml` runs when a pull request is opened from a branch in
this repository, and again when new commits are pushed to it. A newer push cancels the
in-flight Actions job, and the runner cancels that cloud run. The job stays green when the
agent finishes, including when it opens a follow-up pull request. It fails when the agent
cannot start or the run errors.

The agent resolves Composer 2.5 with `Cursor.models.list()` on each run. If it changes
code, Cursor opens a follow-up pull request from the source pull request's head. The
review prompt tells the agent to retarget that pull request onto the source branch. The
workflow does not receive the key on fork pull requests. It skips a follow-up whose body
contains `security-review-follow-up`, and a `cursor/` branch titled `Security review for #`.

The workflow reads the Actions secret `CURSOR_API_KEY`. Mint a user key at
[Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations), or a team
service-account key under Team Settings → Service accounts. Team Admin API keys do not
work. The GitHub connection for that key must include `jms-dcksn/lifting-app`, with
permission to push branches and open pull requests. Store the key as a repository secret
named `CURSOR_API_KEY`. Do not commit it.

## Operations

- Application rollback does not undo database migrations; use a reviewed forward migration
  when schema repair is necessary.
- Rotate the Supabase secret independently in Supabase and local eval settings. Updating
  a publishable key requires a rebuild/redeploy of clients that embed it.
- Check `package.json` and deployment settings for build/runtime configuration. This checkout
  has no pinned Node engine, `.nvmrc`, or `vercel.json`; CI uses Node 22 for Supabase's native
  WebSocket support. Verify the selected deployment runtime at release.

### Deload progression migration

Apply `20261010171247_deload_progression.sql` before deploying the deload-aware app.
It adds phase/session/set flags and invoker triggers, updates `save_program`, backfills
unambiguous surviving phase/week context and rebuilds affected strength caches. It preserves
saved e1RMs and RLS. Affected personal calibration coefficients are cleared and re-anchored
on the next eligible stat write. Existing open sessions are included in the backfill.

Review `supabase/tests/deload_legacy_review.sql` for missing context or ambiguous custom
phases. Historical classification cannot be reconstructed reliably after phase edits or
program deletion; the migration does not infer it from low loads or high RIR. The report
is read-only; corrections require an explicitly scoped follow-up migration. Changing a
phase in the builder only classifies future sessions.

SQL checks: run `supabase/tests/deload_backfill.sql` with `psql -v ON_ERROR_STOP=1` on a
checkout/database immediately before this migration (the test applies it transactionally
and rolls back); run `supabase/tests/deload_progression_rls.sql` after migrations to verify
inheritance, RPC persistence, edits/deletion, calibration suppression and cross-user denial.


## Local AI Coach evals

Live experiments require the development URL and that project's local-only
`SUPABASE_SECRET_KEY`, plus AI Gateway, LangSmith and Jev credentials. The runner checks
`EVAL_DB_PROJECT_REF` against the URL and rejects the known production project.
`EVAL_USER_EMAIL` selects the test user's owner-scoped reads. Browser/server app paths
continue to use the signed-in client and RLS.

Source sync and execution are separate. Preview with `npm run eval:agent:sync -- --adopt`;
apply reviewed source-row adoption with `--adopt --apply`. `npm run eval:agent` runs 11 first-turn
cases from an immutable dataset version without overwriting examples. `eval:agent:follow-ups`
runs four multi-turn scenarios; `eval:agent:all` runs all 15. Optional `EVAL_DATASET_VERSION`
selects an as-of timestamp; clear an old pin after sync. Experiments record the scenario set, configured models, rubric/version, code SHA,
DB/user, as-of and hashed data summaries, including a before/after drift check.
`JEV_MODEL` may choose a supported fixed model; default `jev-latest` is marked floating.
See [AI Coach evals](docs/AI-COACH.md#evals) for ownership, per-turn budgets and archived-output
regrading. No eval command is part of deployment or ordinary `npm test`.

## Coach inbox rollout (#195)

Keep `COACH_INBOX_ENABLED=false` until the target is ready. Apply
`20261015012412_coach_exception_inbox.sql` through the normal reviewed migration release.
This creates four inbox tables, source revision guards and restricted RPCs; it creates no key.
Check the hosted schema/function grants, extension version and private-schema exposure.

The signing key is a new shared secret for this feature. The app attaches an HMAC
(a tamper-detection signature) to each calculated inbox update; the database checks it
before accepting that update. RLS still checks which user's rows may change. This prevents
a signed-in browser from inventing its own Coach conclusions through the public RPC.
It is separate from Supabase API/JWT keys and AI provider keys, and is not needed for CI:
the database tests use a synthetic, transaction-scoped key.

Provision a separate random 32-byte key per Local/Preview/Production environment using the
secret manager. Store its 64 hexadecimal characters in server-only
`COACH_COMMAND_SIGNING_KEY`, its identifier in `COACH_COMMAND_SIGNING_KEY_ID`, and the same
bytes/identifier in `private.coach_command_key` using restricted administrator access. The
table requires `valid_from` and `valid_until`; choose an explicit operational expiry. Do not
put keys in migrations, seed files, browser variables, logs, traces, PRs or URLs. The signing
key cannot access Supabase data; no service-role key is added to the application.

Verify exact UTF-8 Node/pgcrypto HMAC parity and a signed owner-scoped refresh in that
environment before enabling `COACH_INBOX_ENABLED=true`. Rotation installs the new DB key
first, deploys the matching server key ID/key, then expires/revokes the prior key within
65 seconds of cutover. Keep the private schema out of PostgREST exposed schemas.

Run application checks, all ownership tests and `npm run test:db:concurrency` against a
disposable local database first; the last script requires `COACH_TEST_DATABASE_URL` and
rejects non-loopback hosts. Verify source guards and lock ordering in the hosted rollout.
An absent/mismatched key fails closed with retryable inbox refresh; saved training remains.

Rollback disables the flag/arrival entry first and deploys compatible UI, retaining additive
state and its protections. If a source-trigger defect blocks training, disable Coach commits
and ship a reviewed forward repair; invalidate/rebootstrap before re-enabling. Do not drop
training records or future applied-action receipts to roll back inbox delivery.
