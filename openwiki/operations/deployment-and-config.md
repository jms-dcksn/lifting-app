---
type: operations
title: "Deployment, environment configuration, and release operations"
description: How the app deploys via Vercel's GitHub integration, which environment variables are public or server-only, how Supabase migrations are pushed by hand, what CI verifies, and the smoke-test and rollback limits.
tags: [deployment, vercel, ci, environment-variables, supabase, migrations, rls, release, operations, secrets]
verified:
  - by: openwiki/0.6.0
    at: 2026-09-29T00:58:03.170Z
sources:
  - id: openwiki-source-742d27f08cbeaa9bde84b50c
    resource: repo://.env.local.example
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-1a6effb048d19cdd34576d31
    resource: repo://DEPLOY.md
  - id: openwiki-source-ef42cd815a708eb1c03400bc
    resource: repo://docs/COACH-REPORT.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-1014e63c55f76f798fc308f0
    resource: repo://src/app/api/agent/chat/route.ts
  - id: openwiki-source-09126fcfa8a06083d93c6001
    resource: repo://src/app/api/coach/v1/weekly/route.ts
  - id: openwiki-source-be930f087fa8d032e8662f5b
    resource: repo://src/lib/agent/chat-handler.test.ts
  - id: openwiki-source-cac3db37009e0f0d9759e6d0
    resource: repo://src/lib/agent/chat-handler.ts
  - id: openwiki-source-08cf3e3fbec1ed9697edf9f7
    resource: repo://src/lib/agent/policy.ts
  - id: openwiki-source-d6f7e8c86f423c580c8f6a59
    resource: repo://src/lib/agent/thread.ts
  - id: openwiki-source-fa8b43662c37bc48f90bf6e8
    resource: repo://src/lib/coach-api.test.ts
  - id: openwiki-source-341cc1eb03b81a86675793d6
    resource: repo://src/lib/coach-api.ts
  - id: openwiki-source-88c16de37226f0856eaa8334
    resource: repo://src/lib/coach-weekly-data.ts
  - id: openwiki-source-912a05cb2ad8b6d48298f0c4
    resource: repo://src/lib/supabase/client.ts
  - id: openwiki-source-d81538d8891efe37053aeccb
    resource: repo://supabase/config.toml
  - id: openwiki-source-7cd2ccb4d8736797dc4a6c7e
    resource: repo://supabase/migrations/20260915203212_period_tracking.sql
  - id: openwiki-source-42c277b421dffbf0a7a99db3
    resource: repo://supabase/migrations/20260916120011_rest_tone_enabled.sql
  - id: openwiki-source-1915315531bbdb2a7a7c2327
    resource: repo://supabase/migrations/20260917000000_atomic_program_mutations.sql
  - id: openwiki-source-42ac529c3a660b3139a7faa2
    resource: repo://supabase/migrations/20260918000000_user_exercise_pin.sql
  - id: openwiki-source-597a0a3cd7e72a1e27e7b6eb
    resource: repo://supabase/migrations/20260919221137_body_measurement_log.sql
  - id: openwiki-source-3048387bbf0f2ed4eb93764e
    resource: repo://supabase/migrations/20260920181553_agent_threads.sql
  - id: openwiki-source-5dcdbbd3bd4b962baf2a892a
    resource: repo://supabase/migrations/20260927170000_agent_multi_thread.sql
generated: { by: "openwiki/0.6.0", at: "2026-09-29T00:58:03.170Z" }
---

## Overview

The app is a single Next.js project deployed through Vercel's GitHub integration for
`jms-dcksn/lifting-app`. There is no custom deploy pipeline and no `vercel.json`: pushing
to `main` releases to production, and any other branch gets an automatic preview
deployment. Resolve the current production or preview URL through the Vercel dashboard
or GitHub deployment/check status. This repository records no verified production URL,
and an old deployment-specific preview URL should not be treated as current.

Three things sit outside the automatic Vercel build and must be handled deliberately by a
release author: environment variable configuration (per Vercel environment), Supabase
migration application (`npx supabase db push`, not auto-run by the build), and Supabase Auth
dashboard settings (Site URL, redirect URLs). Getting any of these out of sync with a deploy
is the most common source of "it works locally but not in preview/production."

```mermaid
flowchart LR
  Dev[Push branch] -->|preview| VercelPreview[Vercel preview build]
  Dev -->|merge to main| VercelProd[Vercel production build]
  CI[.github/workflows/ci.yml] -->|lint, typecheck, Vitest, build, pgTAP| Dev
  VercelPreview --> PreviewDB[(Supabase project selected by preview env)]
  VercelProd --> ProdDB[(Supabase production project)]
  Migrate[npx supabase db push] -.->|manual, tracked| PreviewDB
  Migrate -.->|manual, tracked| ProdDB
```
*Vercel builds the app; it never applies database migrations. Migration application is a
separate, manual, tracked step against whichever Supabase project an environment targets.*

## Environment variables

`.env.local.example` enumerates every configuration variable the application reads. The
public pair is compiled into the client. Every other variable is server-only and must
never use a `NEXT_PUBLIC_` prefix.

| Variable | Consumer | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser, server, and proxy Supabase clients; the weekly Coach loader | Public (bundled into the client) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Those same cookie clients; RLS enforces per-owner access | Public (bundled into the client) |
| `SUPABASE_SECRET_KEY` | Server-only weekly Coach loader; a revocable `sb_secret_...` key that bypasses RLS | Server-only |
| `COACH_API_USER_ID` | Weekly Coach API — the sole account the endpoint is allowed to read | Server-only |
| `COACH_API_TOKEN` | Weekly Coach API bearer or capability-URL authentication (≥32 high-entropy characters) | Server-only, secret |
| `AI_GATEWAY_API_KEY` | Server-only Vercel AI Gateway key for `POST /api/agent/chat` | Server-only |
| `VERCEL_OIDC_TOKEN` | Optional server-only Gateway credential used when `AI_GATEWAY_API_KEY` is absent | Server-only, not listed in `.env.local.example` |
| `LANGSMITH_API_KEY` | Enables agent traces when present | Server-only |
| `LANGSMITH_TRACING` | Example sets `true`. If unset while a LangSmith key is present, the chat route sets it to `true` | Server-only |
| `LANGSMITH_PROJECT` | Dedicated project name. Example and code default: `lifting-app-agent` | Server-only |
| `AGENT_MODEL` | Optional Gateway model id (`provider/model`). Default `openai/gpt-5.4` | Server-only |

The first two are required for the app to function at all. Changing either requires a
rebuild/redeploy, not just an environment edit, before clients pick up the new value.

The Coach trio enables the private weekly API. Without a token of at least 32 characters
and a UUID `COACH_API_USER_ID`, `GET /api/coach/v1/weekly` returns 503 instead of failing
the app. A missing `SUPABASE_SECRET_KEY` or URL does not fail that check by itself: the
handler still authenticates, then the loader throws and the same route returns 503. When
configuration is valid, a bad caller token returns 401. All database reads made through
`SUPABASE_SECRET_KEY` in that route are explicitly scoped to `COACH_API_USER_ID` even
though the key itself bypasses RLS — the row-level restriction is enforced in application
code, not the database, for that one path. See `docs/COACH-REPORT.md` and
`/openwiki/integrations/supabase.md` for the full Coach API contract.

The agent keys are also server-only. `gatewayApiKey()` accepts
`AI_GATEWAY_API_KEY` or, if that is empty, `VERCEL_OIDC_TOKEN`. If both are missing,
`POST /api/agent/chat` returns 503 before it parses the body or inserts a thread.
`GET /api/agent/chat` does not require a Gateway credential. LangSmith tracing starts
only when `LANGSMITH_API_KEY` is set; a missing key disables traces rather than failing
the route. Use the dedicated project `lifting-app-agent`; do not share it with other apps.
The agent itself uses the publishable-key cookie client, not `SUPABASE_SECRET_KEY`.

Real values live in an ignored `.env.local` file locally and in Vercel's per-environment
settings (Production and Preview configured separately) in deployment. Before writing test
data through a preview deployment, confirm which Supabase project that preview's environment
variables actually point at — Preview and Production can (and often should) target different
Supabase projects, and there is nothing that prevents a misconfigured preview from writing to
the production database.

CI never uses real secrets for the app/build job: `.github/workflows/ci.yml` builds with
placeholder values (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-placeholder-publishable-key`) because Next.js only
needs these defined at build time and makes no network request during `next build`. The
build job does not set Coach, Gateway, OIDC, or LangSmith variables.

## Applying database migrations

Supabase is provisioned and migrated independently of the Vercel build:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

For a brand-new environment this applies every file under `supabase/migrations/` in order.
For an existing project, `db push` is tracked against Supabase's migration history table —
it is meant to bring a project forward to the current migration set, not to be treated as an
idempotent script that can be safely replayed from scratch. Before pushing to an existing
project, inspect its migration history so the operator knows which tracked migrations are
already applied versus pending. This checkout does not record remote migration state for
any environment.

The tracked set includes program phases, session feedback, bodyweight history, Coach
recommendation decisions, exercise swap scope, atomic program and bodyweight-calendar RPCs,
period tracking, rest-tone preference, exercise pins, body measurement logging, and the two
agent-thread migrations. A new migration is not optional just because Vercel can build
without it.

Three migrations have ordering requirements that make "migrate, then deploy" non-negotiable:

- Period tracking (`20260915203212_period_tracking.sql`) adds `profile.sex`, consent columns,
  and the `period_observation` table. It must be applied before deploying any build of the
  You (`/settings`) UI that reads those fields, or that UI will fail against a schema that
  doesn't have them yet.
- Rest-complete tone (`20260916120011_rest_tone_enabled.sql`) adds
  `profile.rest_tone_enabled` (default `true`). It must be applied before relying on the
  Settings checkbox that reads it.
- Both agent migrations must ship with the app version that writes a thread id and title.
  `20260920181553_agent_threads.sql` creates `agent_thread` and `agent_message`, with one
  thread per user and a database-generated thread id. `20260927170000_agent_multi_thread.sql`
  drops that one-thread key, drops the id default, makes `title` not null, deletes threads
  that have no messages, and backfills titles from the earliest user text. The current app
  inserts an app-chosen UUID v7 and a title on every new thread. Deploying that writer
  before the second migration, or applying the second migration before the writer exists,
  fails thread creation.

Breaking changes to period-tracking consent copy should bump `period_consent_version` in
the corresponding migration and application logic and require re-consent from existing users
rather than silently reinterpreting old consent rows. Current settings actions write `"v1"`.

**Vercel's build does not run database migrations.** A merge to `main` that depends on schema
introduced by a new migration will deploy application code against the old schema until
someone runs `supabase db push` against that environment's project — order the migration
before the deploy, not after.

## Auth configuration

Email magic-link is the only supported login method. In the Supabase Auth dashboard, Site URL
and the allowed redirect URLs must include the production origin and every preview origin the
team intends to test against. The client-side flow is: the magic-link email points at
`/auth/callback`, which exchanges the PKCE code for a session and redirects only to a
same-origin path; `src/proxy.ts` refreshes session cookies on every matched request; and the
app layout, Server Actions, and agent route authenticate by calling `getClaims()` directly
(see `/openwiki/integrations/supabase.md` for the full client-construction and auth-boundary
model). Because these dashboard settings are edited outside version control, verify them
directly in the target environment at release time rather than trusting old checklists or
screenshots.

Local `supabase/config.toml` is not the hosted Auth dashboard. Its `[auth]` section sets
`site_url = "http://localhost:3000"` and redirect globs for `localhost` and `127.0.0.1` so
magic-link PKCE verification works locally, since verifier cookies are per-host.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request, as two
independent jobs:

- **`app`** — checks out, installs with `npm ci`, then runs `npm run lint`, `npx tsc
  --noEmit`, `npm test` (Vitest, via `vitest run`), and `npm run build` in sequence. The build
  step supplies placeholder public Supabase env vars since no request is made at build time.
- **`database`** — installs dependencies (which pins the Supabase CLI version used, so CI and
  a developer's local `npm run test:db` run the identical binary against the identical test
  files), runs `npx supabase start` to bring up a local Supabase stack, runs `npm run test:db`
  (which resolves to `supabase test db supabase/tests/*_rls.sql`, the pgTAP ownership/RLS
  suite), then tears the stack down with `npx supabase stop` unconditionally (`if: always()`).

Both jobs must pass before a pull request is mergeable in practice. Because the `database`
job runs the pgTAP RLS suite against a real local Postgres instance with the project's actual
migrations and policies applied, an RLS regression on any table the suite covers fails CI
before it can reach `main` — this is a materially stronger guarantee than the mocked
Supabase-client tests Vitest runs in the `app` job. See
`/openwiki/testing/testing-strategy.md` for how the pgTAP suite relates to Vitest's pure-module
and mocked action tests, and for which SQL scripts under `supabase/tests/` are pgTAP
(`*_rls.sql`, TAP output, run by `npm run test:db`) versus plain psql-style checks that must
be run individually with `psql -f` per that feature's own documentation.

`supabase/config.toml` configures the local stack CI and `supabase start` share: only
`db`, `auth`, and `rest` services are enabled (`realtime`, `studio`, `storage`,
`edge_runtime`, and `analytics` are explicitly disabled) to keep the stack lean for both the
GitHub Actions runner and nested-Docker Cloud Agent environments.

## Release checklist

There is no separate release script; a release is a reviewed merge, verified locally first:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

A passing build does not exercise authenticated routes, so within an approved change, push
the branch for a preview deployment, inspect its deployment checks, and manually smoke-test
the flows the change could plausibly affect:

- login/callback (magic link, PKCE exchange, redirect)
- program creation
- planning/Start
- logging/swapping/finishing a workout
- Track/monthly review
- weight calendar edits

That list is a limit, not a full regression suite. Agent chat, Coach API, and Settings
schema reads are not in the default smoke list; add them when the change touches those
paths, and only after the matching migration has been pushed to the preview database.
Preview writes land in whichever Supabase project that preview's environment variables
select — confirm this before generating test data through a preview URL. Merging or pushing
to `main` releases to production automatically through Vercel's GitHub integration; there is
no manual "promote" step beyond the merge itself.

## Operational notes

- **Rollback does not undo migrations.** Reverting a Vercel deployment (or the merged commit)
  only rolls back application code; any schema change already pushed with `supabase db push`
  remains applied. If a release needs schema repair, write and review a new forward migration
  rather than assuming a rollback restores the previous schema. This is especially sharp for
  the multi-thread migration, which deletes empty threads and drops the id default.
- **Token and key rotation** is independent per secret:
  - Rotate `COACH_API_TOKEN` by generating a new high-entropy token, replacing it in the
    deployment's environment settings, updating the capability URL used by any scheduled
    caller after that deployment is live, validating the new token works, and confirming the
    old token now returns 401.
  - Rotate `SUPABASE_SECRET_KEY` independently in both the Supabase project settings and the
    deployment's environment settings whenever database-level access is suspected to be
    exposed; this key bypasses RLS, so leaking it is a broader exposure than leaking the
    Coach token alone.
  - Rotating `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` additionally requires a rebuild/redeploy
    of every client that already embedded the old value, since it is compiled into the
    browser bundle rather than read at request time.
  - Rotate `AI_GATEWAY_API_KEY` and `LANGSMITH_API_KEY` in deployment settings only. They
    are not public bundle inputs. After a Gateway rotation, confirm `POST /api/agent/chat`
    no longer returns 503.
- This checkout has no pinned Node engine, `.nvmrc`, or `vercel.json`; CI pins Node 20 via
  `actions/setup-node`, but the Vercel-side runtime selection should be verified directly in
  project settings at release time rather than assumed to match.
- Remote deployment health, Auth dashboard settings, and applied-migration state for any
  given environment are operational facts, not something recorded in this repository —
  confirm them directly against the target environment rather than trusting a prior review.
