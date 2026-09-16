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

The first two are required for the app and exposed in the browser bundle. The remaining
three enable the private weekly API and must stay server-only. Without valid Coach
configuration, the endpoint returns 503. See [Coach API](docs/COACH-REPORT.md#weekly-coach-api)
for high-entropy token requirements, supported auth, privacy, and rotation.

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
`period_observation`; apply that migration before deploying the Settings/Progress UI that
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
Progress/monthly review, and weight calendar edits relevant to the change. Preview writes
reach whichever Supabase project its environment selects. Merge/push to `main` releases
through Vercel's integration. `.github/workflows/ci.yml` runs lint, typecheck, Vitest, and the
build on every pull request, plus the pgTAP ownership suite against a local Supabase stack, so
an RLS regression on a covered table fails the build.

## Operations

- Application rollback does not undo database migrations; use a reviewed forward migration
  when schema repair is necessary.
- Rotate the Coach token and Supabase secret independently using the Coach contract. Updating
  a publishable key also requires a rebuild/redeploy of clients that embed it.
- Check `package.json` and deployment settings for build/runtime configuration. This checkout
  has no pinned Node engine, `.nvmrc`, or `vercel.json`; verify the selected runtime at release.
