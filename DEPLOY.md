# Deployment Plan: Vercel

This is a planning document only — no deployment is performed by following this file.
It lays out the steps required to take this app from its current state (local repo, no
hosted Supabase project) to a live production deployment on Vercel.

The app is Next.js 16 (App Router, Server Actions) + Supabase (Postgres + Auth + RLS),
client-side rendering for the strength engine, server-side for data fetching/auth. There
is **no offline/local-first layer** — it assumes connectivity, which matches "deploy and
go" without any service-worker/PWA caching concerns.

## 1. Prerequisites

- [ ] A Vercel account, with access to import this GitHub repo (`jms-dcksn/lifting-app`).
- [ ] A Supabase account/project provisioned for production (separate from any local/dev
      Supabase instance used during development).
- [ ] Repo pushed to GitHub with `main` as the deploy branch (already the case).

## 2. Provision the Supabase project

1. Create a new Supabase project (pick a region close to where most users are).
2. Apply the schema via the Supabase CLI, in order, against the new project:
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   This applies every migration in `supabase/migrations/` in sequence:
   `0001_init.sql` → `0009_fluid_programs.sql`. These are idempotent-by-design (no
   `down` migrations exist in-repo) — review the list against the project's migration
   history if the project was ever partially initialized.
3. Verify RLS is enabled on every table (the migrations enable it per-table; this is a
   sanity check, not a manual step) — every table is keyed on `auth.uid()` and the
   signup trigger (hardened in `0003`) auto-creates a `profile` row.
4. Configure Auth:
   - Enable email magic-link sign-in (the only auth method this app uses —
     `getClaims()`-based session handling, no password flow exists in the codebase).
   - Under Auth → URL Configuration, set **Site URL** to the production Vercel domain
     and add it (plus the Vercel preview-deployment wildcard, see §5) to **Redirect URLs**.
     Magic-link emails will fail to redirect correctly until this matches the real domain.
   - Confirm the default Supabase email rate limits are acceptable, or configure a custom
     SMTP provider if expecting meaningful signup volume (Supabase's built-in email
     sender is low-volume/best-effort).
5. Collect the two values the app needs from Project Settings → API:
   - Project URL
   - The publishable (anon) key — **not** the service-role key; the app only ever uses
     the anon key client- and server-side, RLS does the access control.

## 3. Environment variables

The app reads exactly two env vars (`src/lib/supabase/client.ts` and `server.ts`):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | Public — embedded in client bundle |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key | Public — safe given RLS |

Both are `NEXT_PUBLIC_*`, so they're exposed to the browser by design (this is expected
for Supabase's anon key model — RLS is the actual security boundary, not key secrecy).

Steps:
1. In the Vercel project → Settings → Environment Variables, add both keys for the
   **Production** environment, using the values from the production Supabase project.
2. Add them again for **Preview** environments. Decide up front whether previews point
   at the same production Supabase project or a separate staging project:
   - Same project (simplest): preview deploys write real production data. Acceptable
     only if previews are never shared with untrusted testers.
   - Separate staging Supabase project (safer): requires applying the same migrations
     there too, and a second magic-link redirect URL entry.
3. No `.env.production` file is committed (by design — see `.gitignore`); production
   values live only in Vercel's env var store. `.env.local.example` documents the two
   keys for local dev.

## 4. Vercel project setup

1. Import the GitHub repo into Vercel (Framework Preset: **Next.js**, auto-detected).
2. Build settings — defaults are correct, no `vercel.json` is needed:
   - Build Command: `next build` (via `npm run build`)
   - Output: handled automatically by the Next.js framework preset
   - Install Command: `npm install` (default)
3. Node.js version: no `.nvmrc`/`engines` field is pinned in `package.json`. Set the
   Vercel project's Node.js version explicitly (Settings → General → Node.js Version) to
   match what's used locally, rather than relying on Vercel's platform default drifting
   over time.
4. Root Directory: repo root (single app, no monorepo structure).
5. `src/proxy.ts` runs on Node.js runtime by default in Next.js 16 (not Edge) — no
   special Vercel runtime configuration is required for this to work.

## 5. Domains and redirect URLs

1. Assign the production domain in Vercel (either a `vercel.app` subdomain or a custom
   domain — if custom, add it under Settings → Domains and follow Vercel's DNS
   instructions).
2. Once the production domain is known, go back to Supabase Auth → URL Configuration and
   set:
   - **Site URL**: the production domain (e.g. `https://lifting-app.example.com`)
   - **Redirect URLs**: the production domain, plus Vercel's preview URL pattern
     (`https://*-<vercel-project>.vercel.app` or per-deployment URLs, depending on how
     strict Supabase's redirect matching needs to be for the preview env var strategy
     chosen in §3)
3. This is a circular dependency (need the Vercel domain before finalizing Supabase
   redirect config, but the app won't deploy successfully until env vars exist) — so the
   first deploy can happen with a placeholder/incorrect redirect URL, then be corrected
   once the real domain is assigned. Sign-in will not work correctly until this is fixed.

## 6. Pre-deploy verification (local)

Run before triggering the first deploy, to catch issues that would otherwise surface as
a failed Vercel build:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm run build` is the most important check — it runs the same `next build` Vercel will
run, and will catch the "Server Component importing a `"use client"` export" class of
runtime error that `tsc`/lint do not (per the `Button`/`buttonClasses` split noted in
`CLAUDE.md`).

## 7. First deploy

1. Push/merge to `main` (Vercel's default production branch).
2. Vercel auto-builds and deploys on push, given the GitHub integration from §4.
3. Watch the build log for the two env vars resolving correctly — a missing
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` won't fail the build
   (they're read at runtime, not build time, since Supabase client creation happens
   lazily) but will fail every page that hits Supabase at request time.

## 8. Post-deploy smoke test

- [ ] Load the production URL, confirm the landing/auth screen renders.
- [ ] Sign up with a real email, confirm the magic link arrives and redirects to the
      correct production domain (not `localhost`).
- [ ] Confirm a `profile` row was created (signup trigger from `0001_init.sql`/`0003`).
- [ ] Create a program via the builder, start a session, log a set, confirm e1RM/
      recommendation logic runs client-side without console errors.
- [ ] Check `/analytics` (Progress) renders without server errors (it does a heavier
      join across `set_log` + `workout_session` + `profile`).
- [ ] Confirm `src/proxy.ts` is refreshing sessions — reload an authenticated page after
      the auth cookie's short-lived token would have expired, confirm no forced re-login.

## 9. Ongoing operations

- **Migrations**: every future schema change adds a new file under
  `supabase/migrations/`. Apply to production with `supabase db push` against the linked
  production project before/alongside deploying the corresponding app code — there is no
  automatic migration-on-deploy step, this is a manual/CI step to set up separately if
  desired.
- **Preview deployments**: every PR gets a Vercel preview deploy automatically once the
  GitHub integration is connected (§4). Decide based on §3 whether these are safe to
  share given which Supabase project they point at.
- **Rollback**: Vercel keeps prior deployments; promoting an older deployment back to
  production is immediate via the Vercel dashboard. This does **not** roll back Supabase
  schema changes — if a bad deploy shipped a migration, the migration itself needs a
  hand-written follow-up migration to undo it (no down-migrations exist in this repo).
- **Secrets rotation**: rotating the Supabase anon key (Project Settings → API) requires
  updating the Vercel env var and redeploying; there is no service-role key in use to
  worry about.

## Out of scope for this plan

- CI pipeline changes (no GitHub Actions exist in-repo today; this plan covers Vercel's
  built-in build/deploy on push, not a separate CI gate).
- Analytics/error-monitoring integrations (e.g. Sentry) — not currently in the codebase.
- Custom Vercel configuration (`vercel.json`) — not needed; every requirement here is
  satisfied by Vercel's standard Next.js framework preset.
