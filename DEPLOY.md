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
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/SSR clients and weekly Coach loader |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/SSR clients; owner access enforced by RLS |
| `SUPABASE_SECRET_KEY` | Server-only weekly Coach loader; bypasses RLS |
| `COACH_API_USER_ID` | Weekly API's sole allowed account |
| `COACH_API_TOKEN` | Weekly API capability authentication |
| `AI_GATEWAY_API_KEY` | Server-only Vercel AI Gateway key for the in-app agent. Vercel deployments may use `VERCEL_OIDC_TOKEN` instead |
| `LANGSMITH_API_KEY` | Server-only LangSmith key. Agent traces go here |
| `LANGSMITH_TRACING` | Set `true` to emit traces. The route also enables this when a LangSmith key is present |
| `LANGSMITH_PROJECT` | Dedicated project name. Default and recommended: `lifting-app-agent` |
| `AGENT_MODEL` | Optional Gateway model id (`provider/model`). Default `openai/gpt-5.4` |

The first two are required for the app and exposed in the browser bundle. The Coach
trio enables the private weekly API and must stay server-only. Without valid Coach
configuration, that endpoint returns 503. See [Coach API](docs/COACH-REPORT.md#weekly-coach-api)
for high-entropy token requirements, supported auth, privacy, and rotation.

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
later profile column; apply its migration before relying on the Settings checkbox. Vercel's build does not run database migrations. Breaking consent-copy
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
The Actions job checks out the pull request base commit and runs `.github/security-review/`
from that ref so a head-branch change cannot exfiltrate `CURSOR_API_KEY`. Pull-request title
and branch metadata are passed to the agent as untrusted data inside a delimited block.

The workflow reads the Actions secret `CURSOR_API_KEY`. Mint a user key at
[Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations), or a team
service-account key under Team Settings → Service accounts. Team Admin API keys do not
work. The GitHub connection for that key must include `jms-dcksn/lifting-app`, with
permission to push branches and open pull requests. Store the key as a repository secret
named `CURSOR_API_KEY`. Do not commit it.

## Operations

- Application rollback does not undo database migrations; use a reviewed forward migration
  when schema repair is necessary.
- Rotate the Coach token and Supabase secret independently using the Coach contract. Updating
  a publishable key also requires a rebuild/redeploy of clients that embed it.
- Check `package.json` and deployment settings for build/runtime configuration. This checkout
  has no pinned Node engine, `.nvmrc`, or `vercel.json`; verify the selected runtime at release.
