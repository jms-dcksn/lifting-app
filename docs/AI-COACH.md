# AI Coach

A memory-backed agent that lives in the app. It wraps the deterministic Coach; it does not
replace it. Track Coach (`/analytics/coach`), `CoachCheckInReport`, and
`GET /api/coach/v1/weekly` stay the factual check-in and private export. The agent is the
language, intake, navigation, and draft layer on top of existing loaders and actions.

**Status:** Slice 0 shipped 2026-09-20. Later slices are still specified, not built.
Rationale lives in [Decisions](DECISIONS.md#ai-coach-2026-09-20). The teaching surface
is [ai-coach.html](ai-coach.html) — update that HTML whenever agent behavior changes.

Product copy may say Coach. Code and routes use **agent** (`src/lib/agent/`, `/coach`,
`/api/agent/chat`) so they do not collide with Track Coach.

## Locked decisions

| Decision | Lock |
| --- | --- |
| Job vs Coach | Wrap. Narrate and act on engine output. Keep `/analytics/coach`. |
| Build order | Slice 0 first, then 1–5 in order. |
| Runtime | TypeScript in this Next.js app. No Python service. |
| Library | LangChain TypeScript for the agent loop and ecosystem. Tools and prompts are plain TS so the loop can change. Deep Agents is out until Slice 5. |
| Writes | None in Slice 0. Drafts in Slice 2. Confirm-chip `startNextSession` may land in Slice 1. Live mutations wait for Slice 4. |
| Surface | Persistent entry + `Sheet` on Lift / Track / Program / You. Full thread at `/coach`. No fifth tab. Hidden wherever `hideAppChrome` is true. |
| Jev | Skip in Slice 0. Slice 2 uses it to classify program constraints, not to emit a program. |
| Models | Vercel AI Gateway, server-only. LangSmith is the trace sink. |
| Data | Logged-in user client + RLS. Domain tools wrap existing loaders. Not the weekly Coach secret, not a generic SQL tool, not embeddings over `set_log`. |
| Authority | Engine owns numbers and prescriptions. Agent owns language, intake, drafts, and navigation. |
| Privacy | Period observations stay out unless a later, separate opt-in. Same default as Coach. |
| Context | Full transcript in Postgres. Each model turn gets system prompt + last N messages. No summarization, compaction, or distilled user-memory in Slice 0. |

## Invariants

- Strength, report, stall, and target figures come from canonical helpers
  (`sessionTarget()`, `buildCoachCheckInReport`, `buildCoachRecommendations`,
  `groupReviewSessions`, `loadStallAssessments`). The prompt does not recompute them.
- Tools take the user-scoped Supabase client from the request session. They never receive
  `SUPABASE_SECRET_KEY` or `COACH_API_TOKEN`.
- Program persistence goes through `saveProgram`, `createFromTemplate`, or clone. Slot IDs
  stay id-preserving. Slice 2 writes inactive drafts; saving in the builder still activates.
- New capability = a domain tool (+ eval cases), not a new aggregation forked from Coach.

## Module

```
src/lib/agent/           tools, policy, prompts, thread helpers
src/app/api/agent/chat/  auth-gated streaming route
src/app/(app)/coach/     full-thread page
src/components/agent/    Sheet, transcript, persistent entry
```

`src/lib/agent/tools/` wraps loaders and actions. LangChain `tool()` adapters sit beside
those functions; they are not the public interface. Policy (`period` excluded, write
allow-list, tool-call budget) lives in one module and is applied by the route.

Streaming UI uses existing primitives (`Sheet`, `IconButton`, type scale, copy density).
Take stream/message protocol from LangChain / agent-chat-ui; do not take that chrome.

### Schema (Slice 0)

Owner-scoped `agent_thread` and `agent_message` with the same RLS pattern as other
user tables. Slice 0 get-or-creates one thread per user and **persists every message**.
Message `parts` are stored as JSON so tool calls survive a reload. The UI reads this
full history. The model does not: the chat route loads last N messages (`CONTEXT_MESSAGE_LIMIT`
in `src/lib/agent/policy.ts`). pgTAP coverage is `supabase/tests/agent_thread_rls.sql`.

### Env (Slice 0, server-only)

`AI_GATEWAY_API_KEY` (or Vercel OIDC `VERCEL_OIDC_TOKEN`), `LANGSMITH_API_KEY`,
`LANGSMITH_TRACING`, and `LANGSMITH_PROJECT=lifting-app-agent`. Optional `AGENT_MODEL`.
None may use a `NEXT_PUBLIC_` prefix. Listed in `.env.local.example` and
[DEPLOY.md](../DEPLOY.md). Local LangSmith project is dedicated to this agent.

## Slices

Build in order. A later slice may add tools; it may not weaken an invariant.

### Slice 0 — Talking to the ledger

**Status.** Shipped. Teaching walkthrough: [ai-coach.html](ai-coach.html).

**Intent.** Dogfoodable grounded chat. Prove streaming, RLS tools, cited numbers, traces.

**In**

- Auth-gated `POST /api/agent/chat` using `getClaims()` and the cookie Supabase client.
- LangChain TS agent loop, Gateway model, LangSmith tracing, a tool-call cap.
- Persistent `IconButton` + `Sheet` on screens where the tab bar shows; `/coach` as the
  full thread. Hide both entry and Sheet chrome using `hideAppChrome` (session, recap,
  planner, program new/edit).
- One persisted thread per user. Keep the full transcript in `agent_message`. On each
  model turn, send system prompt plus the last N messages only. Prefer dropping old
  tool results before user/assistant text if a token budget is also applied. Facts
  still come from tools, not from earlier tool JSON in the window.
- Four read tools, each wrapping an existing path:
  - `weeklyCoach` → `loadCoachUi` (report + proposals + formatted text).
  - `activeProgram` → `getActiveProgram`.
  - `exerciseReview` → the same finished-session grouping as `/history/[exerciseId]`
    (`groupReviewSessions` and the Last / 21-day / chart summaries). Identity is exact
    exercise plus equipment instance.
  - `nextWorkout` → `loadNextWorkout` plus the same `sessionTarget()` hydration the
    session screen uses, so “why is this target X?” matches Home / planner / Start.
- System prompt: answer from tool results; name the figure’s source; decline medical
  diagnosis (pain stays a review prompt, as Coach already does).
- ~20 labeled eval questions you grade: expected tool(s) and cited numbers against
  fixtures. Co-locate under `src/lib/agent/`.

**Out**

- Writes, client navigation, screen-route context, Jev, web search, Deep Agents,
  onboarding, in-session presence, automatic weekly delivery, generic table access.
- Rolling summaries, context compaction, embeddings, or a distilled `user_memory`
  store. Those wait for a later slice after dogfood.

**Done when** you can ask “how was this week?” and “why is my next squat target X?”
while authenticated and the numbers match Track Coach and the next-workout / session
target. Traces in LangSmith show the tool calls. Ownership RLS test passes. Lint,
typecheck, unit tests, and build pass. UI verified on phone-width: open Sheet from
Home, send a turn, reload `/coach` and see the thread; entry is absent on an active
session.

### Slice 1 — Screen context and navigation

**Intent.** Omnipresent without being a fifth tab. Still read-mostly.

**In**

- A context packet on each turn: pathname, active program id, open session id, focused
  exercise id when the screen has one.
- Client tools that route: `openExerciseReview`, `openCoachCheckIn`, `openProgram`.
- Optional `startNextWorkout` that calls `startNextSession` only after an in-transcript
  confirm chip, then navigates.

**Out**

- Chat during `/session/*`. Settings writes. Program writes.

**Done when** “open my coach check-in” and “start next workout” (with confirm) land on
the same screens a tap would, and a session route still has no agent entry.

### Slice 2 — Program intake → draft

**Intent.** First product bet: messy wish list becomes an inactive draft in the existing
builder.

**In**

- Short chat or chip intake: days, goal, emphasis, equipment, omissions, classic vs fluid.
- Jev (Choice / Noul / Score) or equivalent structured classify over that closed
  ontology. Low confidence asks a follow-up; it does not guess a split.
- Deterministic assembler: pick or patch a `PROGRAM_TEMPLATES` entry from catalog +
  lift history, then persist as a draft (same path as `createFromTemplate`, which is
  inactive unless the account has no programs). Do not call `saveProgram` on generate;
  that action activates. Open `/program/[id]?mode=edit`.
- Prefer exercises with stats; honor omissions; keep machine generics as templates.
  Validate with the same catalog/pattern tests templates already use.

**Out**

- Activating on generate. Emitting programs as free-form LLM JSON. Jev generating
  prose or slot lists. Web search for hypertrophy papers.

**Done when** an intake round-trips to the builder, slot identities are valid, and the
active program is unchanged until the user saves.

### Slice 3 — Weekly narrative

**Intent.** Manual “run check-in” in the thread, wrapping the existing report.

**In**

- A tool that loads `loadCoachUi` and narrates it. Optional later: first-open-of-week
  auto-run (no new push channel required).
- “Want me to take you to next steps?” uses Slice 1 navigation to `/analytics/coach`.

**Out**

- Replacing `/analytics/coach` or changing `CoachCheckInReport`. Accepting proposals
  (Slice 4). Email/push delivery.

**Done when** the narrative cites the same adherence, trends, and proposal keys as the
Track snapshot for the same window.

### Slice 4 — Confirmed writes

**Intent.** The agent can change settings, proposal review state, and swaps the way the
UI already does.

**In**

- Tools that call existing actions with an in-transcript confirm: settings patches,
  Coach accept/dismiss/defer (`coach_recommendation_decision` only), swaps that follow
  [exercise swaps](EXERCISE-SWAPS.md).
- Cost caps and tighter tool budgets now that writes exist.

**Out**

- Unattended `saveProgram` on the active program. New progression rules.

**Done when** every successful write is an existing action plus confirm, and an
abandoned confirm leaves data unchanged.

### Slice 5 — Sophistication

Only after Slice 0–4 dogfood. Candidates: Deep Agents / a program-design subagent,
web search with a research-vs-prescribe split, onboarding that starts in the agent,
in-session whispers, rolling summaries / context compaction, distilled user memory
beyond last-N. Each is its own Decision Card; none is implied by shipping 0–4.

## Evals

Label as you dogfood. Slice 0 grades grounding (tool choice + cited numbers). Slice 2
grades ontology confidence and template invariants. Slice 4 grades “no write without
confirm.” Inspect traces in the dedicated LangSmith project; do not paste capability
URLs, secrets, or weekly Coach tokens into traces, issues, or chat.
