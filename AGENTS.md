# Working in lifting-app

Personal progressive-overload lifting tracker: Next.js App Router, Supabase, and a pure
TypeScript strength engine. Workouts require connectivity; there is no offline sync layer.

## Start here

1. Check `git status`, current HEAD/branch, recent history, and the assigned issue/PR.
   Fresh local/cloud clones use versioned docs for continuity. `.claude/LAST_SESSION.md`
   is optional local context only when its `Commit:` and `Branch:` match the checkout;
   verify its claims against the working tree.
2. Read the relevant reference below before changing that area. Use
   [the docs index](docs/README.md) to distinguish current contracts from historical plans.
3. Before framework changes, check the installed docs in `node_modules/next/dist/docs/`.
   This app uses `src/proxy.ts` → `updateSession()` for refresh; auth gates use `getClaims()`.

## Working rules

- Keep code simple and modular, comments concise, and explanations direct. No emojis.
- Proceed with reversible work in the approved direction. Present a Decision Card before
  unapproved hard-to-reverse architecture, spending, external-facing changes, new scope, or unvalidated underlying assumptions:
  recommendation, reason, risk, and decision needed.
- Keep credentials in ignored environment files or deployment settings. Preserve owner-scoped
  RLS. Track Coach and agent tools use the signed-in user’s client. Keep
  `SUPABASE_SECRET_KEY` confined to local live agent evals.
- Keep `set_log` authoritative and strength statistics rebuildable. Preserve exact exercise
  identity and historical bodyweight when comparing records or editing saved sets.
- Use existing UI primitives and semantic tokens. Keep strength/report calculations pure and
  share their canonical helpers across consumers.
- AI Coach / agent work: every slice that ships code must update a self-contained HTML
  explainer (`docs/ai-coach.html`) with visual diagrams (Mermaid and/or hand-built), real
  reference code snippets from the landed code, and clear plain-language explanations of
  how the system works. Markdown alone is not enough for the teaching surface. Keep
  diagrams and snippets accurate to the code; update the HTML when behavior changes.

## Verification and continuity

On fresh clones (including cloud VMs), run `npm ci` with dev dependencies and lifecycle
scripts enabled; `prepare` installs the versioned Lefthook gates. Commit and push through
Git with hooks enabled; fix failures rather than bypassing them. For hook setup, staged
checks, push prerequisites, or blocked environments, read [Git hooks](docs/VERIFICATION.md#git-hooks).

Commands are defined in `package.json`: `npm run dev`, `npm test`, `npm run lint`,
`npm run build`; run `npm run verify` for the base checks, or `npm run typecheck`
for fresh framework types plus TypeScript. Profile selection and prerequisites live in
[Verification](docs/VERIFICATION.md). Vitest discovers `src/lib/**/*.test.ts`
in Node, including pure logic and mocked action/data-boundary tests. Co-locate tests there;
SQL ownership/atomicity checks live in `supabase/tests/` with execution notes in feature docs.
`npm run test:db` runs the pgTAP ownership suite (`supabase/tests/*_rls.sql`) against a local
stack and needs Docker; CI runs the same command. Other scripts there are manual `psql -f` checks.
A migration is on the hosted project only after `npx supabase db push`, and the production build
blocks when `supabase/migrations` disagrees with that ledger. See [Deployment](DEPLOY.md).
For application changes run tests, lint, typecheck, and build; verify changed UI flows in a
browser when authenticated state is available. For docs-only edits, check references and
claims against source. Record what was actually verified and any remaining limits.

Use [close-session](.agents/skills/close-session/SKILL.md) when a session changes the repo
or a commit lands. It refreshes owning docs and produces a self-contained verification and
handoff report. The ignored local note is optional; cloud sessions need no previous file.
Claude's optional startup hook is not a Codex/cloud lifecycle hook; follow this workflow
explicitly in every environment. Keep `CLAUDE.md` exactly `@AGENTS.md`; put new detail in the owning reference
and add a trigger here only when a new task branch appears.

## Read before changing

| Area | Reference |
| --- | --- |
| Git hooks, architecture lint, validated evidence/identity/storage boundaries, strict indexed-access slice, or verification/browser smoke checks | [Verification and hardening](docs/VERIFICATION.md) |
| Visual map of experiences, request path, or why a performance/scale choice exists | [Architecture map](docs/architecture.html) |
| Strength, calibration, catalog identity, program loading, data ownership, auth | [Architecture](docs/ARCHITECTURE.md) and [decisions](docs/DECISIONS.md) |
| UI primitives, motion, overlays, server/client boundaries | [UI conventions](docs/UI.md) |
| Exercise artwork generation, styling, or replacement | [Exercise art specification](docs/EXERCISE-ART.md) and [UI conventions](docs/UI.md) |
| Program templates or weekly phases | [Architecture: programs](docs/ARCHITECTURE.md#programs-and-prescriptions); [Strong Foundations](docs/STRONG-FOUNDATIONS.md) for that template |
| Tempo, workout setup, or exercise/set notes | [Workout details](docs/WORKOUT-DETAILS.md) |
| Active swaps or Fluid adaptation events | [Exercise swaps](docs/EXERCISE-SWAPS.md) |
| Home preview, planner cookies, or session creation | [Workout planning](docs/WORKOUT-PLANNING.md) |
| PR pills, completion recaps, or historical set edits | [Workout records](docs/DECISIONS.md#workout-records) |
| Exercise review Last card, 21-day window, or e1RM chart | [Exercise review spec](docs/superpowers/specs/2026-09-19-exercise-review-design.md); [Features](docs/FEATURES.md) |
| Movement-level e1RM/PR rollup for non-machine families | [2026-09-29 rollup spec](docs/superpowers/specs/2026-09-29-non-machine-movement-rollup-design.md). Card 1 shipped: ordinary-pound records/review use movement scope. Cables, session targets and stall/Fluid keep their separate Card 2–4 defaults; do not widen those scopes without an approved decision. |
| Coach report, proposals, Track Coach UI, or weeklyCoach tool | [Coach contract](docs/COACH-REPORT.md) and [architecture: strength](docs/ARCHITECTURE.md#strength-and-exercise-identity) |
| Agent chat, LangChain tools, or AI Coach slices | [AI Coach](docs/AI-COACH.md) and [AI Coach explainer](docs/ai-coach.html) |
| Coach inbox, episodes, notification preferences, source invalidation or foreground refresh | [Inbox contract](docs/COACH-INBOX.md) and [episode design](docs/AI-COACH-EPISODES-DESIGN.md) |
| Track Explore destinations (Coach, Body, Volume) | [Track body and volume plan](docs/superpowers/plans/2026-09-19-track-body-volume.md); [Features](docs/FEATURES.md) |
| Weight writes, date moves, or shared calendar | [Weight calendar](docs/WEIGHT-CALENDAR.md) |
| Weight charts, history pagination, or goal distance | [Weight trends](docs/WEIGHT-TRENDS.md) |
| Tape measurements, site chips, or Body inches chart | [Body measurements](docs/BODY-MEASUREMENTS.md) |
| Monthly comparisons, PR totals, stall classification, or period × performance weeks | [Monthly progress](docs/MONTHLY-PROGRESS.md); Coach/Fluid/monthly share `stall-report.ts`; [period tracking](docs/PERIOD-TRACKING.md) |
| Setup, environment variables, migrations, or deployment | [Deployment](DEPLOY.md) |
| Pull request security review workflow | [Deployment](DEPLOY.md#pull-request-security-review) |
| Feature scope or selecting planned work | [Features](docs/FEATURES.md) and [build plan](docs/PLAN.md); verify old checklist status against code |

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The OpenWiki GitHub Actions workflow is manual. Run it from the Actions tab when you want the repository wiki refreshed. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
