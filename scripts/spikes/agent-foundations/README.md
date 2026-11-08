# Coach foundations compatibility spike (#247)

Isolated dependency experiment; the Next.js app does not import this package.
Requires Node 22.18+ (native TypeScript stripping for the app's pure prompt/policy imports).
Tested with Node 24.15.0. Anthropic is installed to satisfy Deep Agents' peer contract;
the fixture explicitly uses ChatOpenAI and never calls Anthropic or another provider.

```sh
npm --prefix scripts/spikes/agent-foundations ci --ignore-scripts --no-audit --no-fund
npm --prefix scripts/spikes/agent-foundations ls --all
npm --prefix scripts/spikes/agent-foundations test
```

The exact manifest and lockfile are independent of the app's dependency tree. No forced
peers, environment-file loading, database connections, paid calls or trace uploads.
Global network fetch is disabled; provider-shaped SSE is injected through ChatOpenAI's
fetch option. Local callback assertions verify trace metadata transport only.

Eleven capability probes cover adapter/stream/tool behavior, fresh-agent in-memory
checkpoint recovery, native serialization, skill discovery/read/pin semantics, denied
skill writes, offloading, summarization, tool budgets, errors and persistence outages.
The synthetic owner-bound tool proves transport, not real Supabase authorization.

One passing probe deliberately documents a limitation: missing pinned skills are silently
skipped. An upgrade changing that behavior should trigger a report update.

Use `new StateBackend()` directly. The deprecated runtime-injected factory loses summary
history updates in this version. The regression now requires history to persist and be
readable through a fresh agent using the same in-memory checkpointer. No disk backend
is needed; real process/database durability remains unverified.
The report, proposed architecture, Decision Card and delivery gates live in
[AI-COACH.md](../../../docs/AI-COACH.md#runtime-foundations-plan-247).
No Postgres restart, real owner isolation, hosted pooling, Next function packaging or
live provider behavior is established by these tests.

The approved B schema is now the application migration
[`20261108183830_coach_durable_execution.sql`](../../../supabase/migrations/20261108183830_coach_durable_execution.sql).
The root `npm run test:agent:persistence` runs `scripts/agent-schema-proof.mjs` and the production
runtime worker against an owned disposable PostgreSQL cluster. Those separate proofs cover
real storage, admission, restart and projection recovery; the isolated eleven probes above
do not establish those facts by themselves. The hosted migration remains human-applied.
