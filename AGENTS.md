# Working in lifting-app

Personal progressive-overload lifting tracker: Next.js App Router, Supabase, and a pure
TypeScript strength engine. Workouts require connectivity; there is no offline sync layer.

## Start here

1. Read `.claude/LAST_SESSION.md` if present. Check its commit against `git log` and the
   working tree before treating its status or next action as current.
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
  RLS. The weekly Coach API is the sole elevated application read path; its queries require
  explicit user predicates. Keep it read-only, no-store, and noindex.
- Keep `set_log` authoritative and strength statistics rebuildable. Preserve exact exercise
  identity and historical bodyweight when comparing records or editing saved sets.
- Use existing UI primitives and semantic tokens. Keep strength/report calculations pure and
  share their canonical helpers across consumers.

## Verification and continuity

Commands are defined in `package.json`: `npm run dev`, `npm test`, `npm run lint`,
`npm run build`; typecheck with `npx tsc --noEmit`. Vitest discovers `src/lib/**/*.test.ts`
in Node, including pure logic and mocked action/data-boundary tests. Co-locate tests there;
SQL ownership/atomicity checks live in `supabase/tests/` with execution notes in feature docs.
`npm run test:db` runs the pgTAP ownership suite (`supabase/tests/*_rls.sql`) against a local
stack and needs Docker; CI runs the same command. Other scripts there are manual `psql -f` checks.
For application changes run tests, lint, typecheck, and build; verify changed UI flows in a
browser when authenticated state is available. For docs-only edits, check references and
claims against source. Record what was actually verified and any remaining limits.

Use [ship-phase](.agents/skills/ship-phase/SKILL.md) when building or wrapping up a planned
phase. Refresh the owning docs and write `.claude/LAST_SESSION.md` with the current HEAD,
changes, checks, open work, and commit/push status. Keep `CLAUDE.md` exactly `@AGENTS.md`;
put new detail in the relevant reference and add a trigger here only when needed.

## Read before changing

| Area | Reference |
| --- | --- |
| Strength, calibration, catalog identity, program loading, data ownership, auth | [Architecture](docs/ARCHITECTURE.md) and [decisions](docs/DECISIONS.md) |
| UI primitives, motion, overlays, server/client boundaries | [UI conventions](docs/UI.md) |
| Program templates or weekly phases | [Architecture: programs](docs/ARCHITECTURE.md#programs-and-prescriptions); [Strong Foundations](docs/STRONG-FOUNDATIONS.md) for that template |
| Active swaps or Fluid adaptation events | [Exercise swaps](docs/EXERCISE-SWAPS.md) |
| Home preview, planner cookies, or session creation | [Workout planning](docs/WORKOUT-PLANNING.md) |
| PR pills, completion recaps, or historical set edits | [Workout records](docs/DECISIONS.md#workout-records) |
| Coach report, proposals, progression references, or private weekly API | [Coach contract](docs/COACH-REPORT.md) and [architecture: strength](docs/ARCHITECTURE.md#strength-and-exercise-identity) |
| Weight writes, date moves, or shared calendar | [Weight calendar](docs/WEIGHT-CALENDAR.md) |
| Weight charts, history pagination, or goal distance | [Weight trends](docs/WEIGHT-TRENDS.md) |
| Monthly comparisons, PR totals, or stall classification | [Monthly progress](docs/MONTHLY-PROGRESS.md); Coach/Fluid/monthly share `stall-report.ts` |
| Setup, environment variables, migrations, or deployment | [Deployment](DEPLOY.md) |
| Feature scope or selecting planned work | [Features](docs/FEATURES.md) and [build plan](docs/PLAN.md); verify old checklist status against code |
