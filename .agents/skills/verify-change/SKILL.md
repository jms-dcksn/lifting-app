---
name: verify-change
description: Definition of done. Use before declaring any change finished. Selects real verify profiles, records evidence, and never merges.
---

# Verify this change

Method adapted from Lauren Tan's create-verification-skill (MIT). That generator is not installed. See ../PSTACK-LICENSE and ../NOTICE.

This is the definition of done. Profile names and browser prerequisites live in `docs/VERIFICATION.md` and `scripts/verification-plan.mjs`. Select them. Do not copy the profile table into another doc, and do not invent a profile name.

You are one unattended agent. Do not stop to ask which command to run. Do not merge. Do not push to `main`. Do not run `npx supabase db push` or any SQL against the hosted database.

## Flow

1. Read the linked issue or the task. Confirm you are not on `main` (`git status`, `git branch --show-current`).
2. When the change has a cheap local test seam, follow `tdd` first. Name that seam in the PR. When it does not, write one line in the PR saying why and continue.
3. Make the smallest change that satisfies the outcome. For a bug, follow `diagnosing-bugs`: state the root cause, not a guard over the symptom.
4. Run the profiles below. Paste each status.
5. Follow `code-review` on the diff against the merge-base with `main`. Fix a hard miss before you commit. Put judgment calls in the PR.
6. Commit on the task branch with Git hooks left on. Do not use `--no-verify`. Push that branch only when the task says to publish the PR. Never push to `main`. Never merge.

## Which profile

`npm run verify` with no args runs `base`. Combine real names with `npm run verify -- base agent`. Unknown names exit with an error. The names are `base`, `database`, `browser`, `agent`, and `live`.

| Change | Run |
| --- | --- |
| Docs, skills, templates, or agent rules only | Do not run the app suite as proof of product behavior. Check that every command and path you wrote exists in `package.json`, `scripts/verification-plan.mjs`, or `docs/VERIFICATION.md`. Run `npm run lint` or `npm test` only when the task asks for those cheap checks or you touched code they cover. ESLint does not lint Markdown. |
| Application or script behavior | `npm run verify -- base` (fresh route types, TypeScript, ESLint, strict indexed-access slice, hook tests, Vitest, production build). |
| Agent or Coach tool behavior, or generated Coach invariants | Add `agent`. It does not call a model. |
| SQL, RLS, or a migration that has a local proof | Add `database` only when `COACH_TEST_DATABASE_URL` is a loopback disposable database. Otherwise record `database: BLOCKED` and the missing prerequisite. Never point this at the hosted project. |
| Authenticated UI, or a Server Action a signed-in user can trigger | Browser section below. |
| Paid model evals | `live` only when the task explicitly asks and the credentials in `docs/VERIFICATION.md` are present. Never select `live` by default. |

`base` uses a local placeholder Supabase URL and publishable key when those env vars are absent. That does not apply migrations and it does not talk to the hosted project. The production build still runs `scripts/check-hosted-migrations.ts`. On a non-production build the gate allows without calling the hosted ledger. Do not treat a green local build as proof the hosted database has the migration.

## Migration checklist

If the PR adds or edits any file in `supabase/migrations/`:

- The filename must match `<digits>_<name>.sql`. That digit prefix is the version `supabase_migrations.schema_migrations` records and that `deployment_applied_migration_versions` returns. `supabase db push` skips any other shape, and the production build then blocks (`src/lib/migration-gate.ts`).
- The PR body must say the human runs `npx supabase db push` after merge, from a linked checkout of `main`, then redeploys. See `DEPLOY.md`.
- Apply status in the report is `unapplied` unless the task already records that a human applied that exact version. Do not query the hosted database to discover status. Do not run the push. Do not execute migration SQL against the hosted project.

If the PR does not touch `supabase/migrations/`, write `migration: none`.

## Browser

Authenticated UI needs a browser check, as in `docs/VERIFICATION.md`. The committed journey signs up through local Auth, logs a set, reloads, checks swap scope, finishes with pain, and opens the generated notice.

- With local Supabase running and Chromium installed: `node scripts/browser-local.mjs`. It reads the local CLI public URL and key, uses a disposable database, and starts its own Next server. It does not reuse an unrelated dev server.
- Otherwise `npm run verify -- browser` only with `E2E_DISPOSABLE=1` and loopback `E2E_DATABASE_URL`, `E2E_SUPABASE_URL`, and `E2E_SUPABASE_KEY`. `E2E_BASE_URL` defaults to `http://127.0.0.1:3100` and that port must be free.
- Do not point the browser profile at the hosted project. Do not run base type generation at the same time.
- If local Supabase, Chromium, or those env vars are missing, write `browser: BLOCKED` and the missing piece. A screenshot of a static page is not the check.
- Docs-only changes, and pure `src/lib` changes with no UI, write `browser: not applicable`.

## Launch, doctor, cleanup

Doctor, before a long run: you are on the task branch, `node_modules` exists (`npm ci` on a fresh clone), and no second `next build` or `npm run dev` is already using the tree. The browser runner owns port 3100 for that attempt.

Launch means the command in the table above, not a manual click-through. Ready means the command printed its own PASS, FAIL, or BLOCKED line.

Cleanup stops processes this run started. Do not kill by process name. Leave the PR evidence in place. Traces under the ignored test-output directories are local artifacts, not a substitute for the PR note.

There is no separate feature map. `docs/VERIFICATION.md` already describes the browser journey. A proof that only hits a convenient entry point is incomplete when that doc lists a step you skipped. Say which step you did not run.

## Evidence

Put this in the PR body before you declare done:

```markdown
## Verification evidence
- `<command>`: PASS | FAIL | BLOCKED | SKIP — what actually happened
- browser: PASS | BLOCKED | not applicable — <one line>
- migration: none | `<file>` prefix `<version>` unapplied; human must run `npx supabase db push` after merge
- test seam: `<file>` or "no cheap seam — <why>"
- Decision Card: no | yes
```

Record FAIL and BLOCKED as plainly as PASS. Do not claim a check you did not run.
