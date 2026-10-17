# AI Coach

A memory-backed agent that lives in the app. It wraps the deterministic Coach; it does not
replace it. The optional report details (`/analytics/coach?view=details`) and `CoachCheckInReport` provide the
factual check-in through `loadCoachUi`. The agent is the
language, intake, navigation, and draft layer on top of existing loaders and actions.

**Exception coaching entry (#206, implemented):** AI Coach becomes the coaching
entry point. Keep the deterministic engine; notify only significant pain, repeated effort
mismatch, confirmed plateau interventions and current sustained decline. Normal progression,
PRs and scheduled recovery stay silent. Replace routine Accept/Accept all with grounded
conversation, optional evidence details and meaningful confirmed choices. Delivery slices
and dependencies: [exception-only implementation plan](AI-COACH-EXCEPTIONS-PLAN.md).

**Foundations (#210/#211):** pure exception classification and shared effective workout
targets and the persistent foreground inbox (#195) are implemented. The coaching entry-point
switch (#206), episode-linked conversations and confirmed interventions (#141) are implemented. See [inbox contract](COACH-INBOX.md).

**Storage/action design (#212):** [episode design and Decision Card](AI-COACH-EPISODES-DESIGN.md)
specify replay, owner isolation, preferences and confirmed Fluid actions. The owner approved
proceeding with #195 on 2026-10-14. Four inbox tables, guarded reconciliation and delivery
are implemented, including #141 thread links and training-action receipts/RPCs.

**Status:** Slice 0 shipped 2026-09-20. Chat became multi-thread on 2026-09-27
([Threads](#threads)). Slice 1 (screen context and navigation) shipped 2026-09-29.
Slice 2 (gallery intake to inactive draft) shipped; later slices remain planned. Rationale lives in
[Decisions](DECISIONS.md#ai-coach-2026-09-20) and
[AI Coach threads](DECISIONS.md#ai-coach-threads-2026-09-27). The teaching surface
is [ai-coach.html](ai-coach.html) — update that HTML whenever agent behavior changes.

Product copy may say Coach. Code and routes use **agent** (`src/lib/agent/`, `/coach`,
`/api/agent/chat`) so they do not collide with Track Coach.

## Locked decisions

| Decision | Lock |
| --- | --- |
| Job vs Coach | Keep the engine/report. AI Coach is the entry point; report details stay accessible as optional read-only evidence. Routine acceptance is retired. |
| Build order | Shipped Slices 0–2 precede the exception plan A–F. Independent read tools can proceed separately. Sophistication follows dogfood and its own decisions. |
| Runtime | TypeScript in this Next.js app. No Python service. |
| Library | LangChain TypeScript for the agent loop and ecosystem. Tools and prompts are plain TS so the loop can change. Deep Agents is out until Slice 5. |
| Writes | Slice 0 was read-only. Slice 2 drafts inactive programs via `draftProgramFromIntake`. Confirm-chip `startNextSession` shipped in Slice 1. Live mutations wait for Slice 4. |
| Surface | Persistent entry + `Sheet` on Lift / Track / Program / You. Full screen at `/coach?thread=`. Both carry chat history and New chat. No fifth tab. Hidden wherever `hideAppChrome` is true. |
| Jev | Skip in Slice 0. Slice 2 uses it to classify program constraints, not to emit a program. |
| Models | Vercel AI Gateway, server-only. LangSmith is the trace sink. |
| Data | Logged-in user client + RLS. Domain tools wrap existing loaders. No elevated database client, generic SQL tool, or embeddings over `set_log`. |
| Authority | Engine owns numbers and prescriptions. Agent owns language, intake, drafts, and navigation. |
| Privacy | Period observations stay out unless a later, separate opt-in. Same default as Coach. |
| Context | Full transcript per thread in Postgres. Each model turn gets system prompt + that thread's last N messages. No summarization, compaction, or distilled user-memory in Slice 0. |

## Invariants

- Strength, report, stall, and target figures come from canonical helpers
  (`resolveEffectiveWorkoutTarget()`, `sessionTarget()`, `buildCoachCheckInReport`, `buildCoachRecommendations`,
  `groupReviewSessions`, `loadStallAssessments`). The prompt does not recompute them.
- Tools take the user-scoped Supabase client from the request session. They never receive
  `SUPABASE_SECRET_KEY`.
- Program persistence goes through `saveProgram`, `createFromTemplate`, or clone. Slot IDs
  stay id-preserving. Slice 2 writes inactive drafts; saving in the builder still activates.
- New capability = a domain tool (+ eval cases), not a new aggregation forked from Coach.

## Hypothetical e1RM calculator (#205)

`calculateE1rm` is a read-only, ledger-independent tool for user-supplied sets, including
unlogged lifts outside the active program. `src/lib/agent/tools/calculate-e1rm.ts` validates
inputs, uses canonical `effectiveLoad()` and `computeE1rm()`, and returns `estimated`,
`needs_input`, `invalid_input`, or `unavailable`. It performs no database access and never
creates a record, changes demonstrated strength/targets, or generates a notification.
Historical e1RM questions still use `exerciseReview` with its existing identity rules.

- Inputs: optional lift label, finite load, positive whole-number reps, optional finite RIR
  from 0–5, explicit `kg`/`lb`, and an explicit load convention. Omitted RIR defaults to 2;
  `rirDefaulted` and the returned assumptions disclose that choice. Missing unit/load context
  asks for clarification; invalid numeric inputs never produce an estimate.
- `total_external` includes the bar. `per_hand` uses one dumbbell and returns per-hand e1RM;
  never double the load. `machine` uses that station's logged load, with no transfer to
  another machine or free weights. No catalog lookup or equipment inference is required.
- `bodyweight` requires explicit bodyweight and nonnegative added load (zero for unweighted).
  `assisted_bodyweight` requires explicit bodyweight and negative added load for assistance
  (zero also allowed). Both use bodyweight plus added load in the same unit, and return a
  **total-system-load** estimate, not added weight or assistance. Effective load must stay
  positive and finite. The tool never substitutes current profile/weight history.
- `reps_only` returns unavailable: the app has no load-based e1RM for those movements.
  The agent must identify rep-only context rather than manufacture a loaded interpretation.
- Outputs retain source inputs, unit, formula, effective load, estimate basis, hypothetical
  status, default-RIR disclosure and assumptions. Units pass through without conversion or
  changing pound-based app storage. Canonical extrapolation above 12 effective reps is
  disclosed as less certain. Results are estimates, not measured maxima or guarantees.

Regression coverage includes pure numeric/convention boundaries, real registered-tool
validation and scripted `runAgentTurn` calls (including clarification then calculation),
plus authored evaluation cases for routing, units, omitted RIR, invalid inputs and missing
context. Scripted calls validate orchestration/evidence transport, not live-model compliance.
No paid/live model evaluation is part of this slice. Teaching walkthrough:
[calculator flow and source](ai-coach.html#e1rm-calculator).

## Deterministic exception eligibility (#210)

`src/lib/coach-exceptions.ts` exports `classifyCoachExceptions()`, policy version `1.0`.
It consumes an owner-validated history snapshot (including set IDs and `set_index`),
current active-program slots with exact exercise/equipment instance and program week,
completed-session pain feedback, and explicit `asOf`/`evidenceSince` dates. It performs
no fetches or writes; the authenticated inbox and episode loaders supply current ownership/context; this pure function is not an authorization gate.

- Significant pain produces one session-scoped review candidate and takes precedence over
  lift signals. It neither guesses the affected lift nor supplies a pain-specific load.
- `buildStallAssessments()` supplies the contiguous exact slot/exercise/instance series.
  Its typed `context` records program/day, phase, adaptation boundary, reps, RIR and sets;
  the classifier requires that context to match the current folded prescription.
- The last two comparable first working sets can qualify as repeated effort misses, using
  `strength/effort.ts`, also used by Coach recommendations. Two below-floor sets qualify
  only when each independently produces a lower `sessionTarget()` load. Historical
  bodyweight is recovered from each saved set; assistance keeps its negative-load convention.
- `detectPlateau()` preserves patience and the 14-day minimum. Classic proposes review;
  Fluid uses its existing rep-change/swap ladder and two-exposure plateau snooze;
  an overlapping decline cannot bypass that snooze.
- `strength/trend.ts` shares the factual report's four-exposure, greater-than-1% trend rule.
  Current decline uses the exact eligible series and stays quiet when recent fixed-load
  rep gains show progress. Ordinary PRs/load/rep gains, isolated misses, recovery and
  insufficient evidence produce no candidate.

Related effort, plateau and decline signals are grouped into one candidate per exact slot
context, with effort before plateau before decline. Each signal retains session/set references,
first-set identity and evidence dates. Numeric reduction targets include weight/reps/RIR;
plateau and decline actions do not invent a numeric target. All signal status is
`recommended`: the classifier cannot attest to a current workout target or applied intervention.
Legacy Accept/dismiss/defer decisions do not enter the classifier. `loadReductionReason` now
distinguishes `repeated_effort_miss` from `below_rep_floor` on generated Coach recommendations.

`evidenceSince` bounds supporting evidence, not just the latest exposure. The caller must
choose it explicitly; no bootstrap age or reminder cadence is introduced here. An empty
result never resolves an existing pain/performance episode. Retention, episode identity,
replay and delivery belong to #212/#195. Effective targets use the implemented contract below.

## Effective workout targets (#211)

`effective-workout-target.ts` exposes a pure `resolveEffectiveWorkoutTarget()` result:
nullable `target`, typed `reason`, bounded progression `reference`, source first-set `evidence`,
and `status: current_target`. This is a calculated initial suggestion, not an applied program
change. `sessionTarget()` remains the progression/recovery engine; `strength/effort.ts`
supplies the existing one-increment repeated-effort reduction. Recovery/deload wins.

Effort requires two consecutive eligible first working sets from `buildStallAssessments()`
with exactly matching current slot/exercise/equipment, program/day, phase, adaptation and
prescription. An old report proposal cannot override a new phase, chosen swap or unavailable
target. Significant pain stays a separate session-level review; there is no pain formula.

`workout-target-data.ts` uses the signed-in client's complete owner-scoped stall/history
loader, now including `set_index`. The pure builder bounds finished, non-warmup/non-deload
history before evaluation time and finds exact first sets. Client hydration retains each
requested slot's anchor/best, each identity's four-exposure fresh-swap window and the current
effort pair. This preserves best-recent targets without shipping every historical set.

- `loadNextWorkout()` hydrates Home/planner results. Planner shows the nullable load/rep
  target and **Why this target** details. Accept or a chat visit does not gate these numbers.
- Active sessions use the same resolver against pre-start history. First-set entry uses the
  effective suggestion; saved same-exercise weight/reps carry forward. Entered fields remain
  local component state across refreshes. Explicit swaps/adaptations retain confirmation.
- `nextWorkout` returns the same target, effective result and `targetExplanation`, with
  `targetEngine: resolveEffectiveWorkoutTarget`. Open workouts use stored day/week/choices,
  persisted deload and pre-start history. Missing stored exercise choices stay unavailable.
- `weeklyCoach.currentWorkout` supplies those same current targets alongside historical
  report/proposals/legacy decisions. The prompt uses this field for current-target claims,
  never subtracts another increment and never equates accepted review with an applied change.

Reasons are `starting_weight`, `add_load`, `add_rep`, `hold_load`, `below_rep_floor`,
`recovery`, `repeated_effort_miss`, and `unavailable`. Suggestions preserve current bodyweight
and negative assistance conventions. Reads never mutate source rows or slots: a 100 lb
exposure reduced to 95 lb never becomes 90 lb through another read.

## Module

```
src/lib/agent/           tools, policy, prompts, threads, chat state
src/app/api/agent/chat/  auth-gated snapshot (GET) and streaming turn (POST)
src/app/(app)/coach/     full-screen chat page
src/components/agent/    chat, transcript, persistent entry + Sheet
```

`src/lib/agent/tools/` wraps loaders and actions. LangChain `tool()` adapters sit beside
those functions; they are not the public interface. Policy (`period` excluded, write
allow-list, tool-call budget) lives in one module and is applied by the route.

Streaming UI uses existing primitives (`Sheet`, `IconButton`, type scale, copy density).
The persistent entry uses a speech bubble with two four-point sparkles (`IconChat`)
to identify AI chat, inside the standard 44px Coach button.
Your turns sit on the right; Coach sits on the left. The sheet and `/coach` open the most
recent thread at its latest message, and the composer stays pinned. The model writes
markdown, and the sheet renders bold, lists, and gain percents. A single trailing
`Source:` line is lifted under the Coach bubble. The header holds Coach, Chat history,
and New chat. The sheet adds Full screen, which opens the same conversation at
`/coach?thread=<id>` (a draft opens `/coach?thread=new`). Chat history, New chat, and
Full screen are disabled while a turn streams. Take stream/message protocol from
LangChain / agent-chat-ui; do not take that chrome.

### Turn activity (#203)

Send creates one Coach bubble immediately, before the server confirms the thread.
Three dots remain visible through initial latency, tool execution, pauses, and answer
streaming. The answer grows inside that same bubble. Both the Sheet and `/coach` use
`AgentChat`/`AgentTranscript`; history renders saved messages without activity.
Saved message text is trimmed before deciding whether it needs a bubble. Empty or
whitespace-only assistant messages show no Coach label; tool calls still show their
quiet “Checked …” line. The pending bubble keeps its label and dots while waiting.

`runAgentTurn` maps LangChain v3's **tools execution channel**, rather than finalized
model tool arguments, to `tool-start { callId, name }` and
`tool-end { callId, outcome: complete | error }`. The reducer keeps separate entries
by call ID, including overlapping calls to the same tool, and shows plain-language
running/completed/failed labels. Complete means the invocation returned; a domain
result such as `needs_intake` still needs interpretation by the agent. Labels for
navigation tools describe preparing/finding a link, not navigation or session creation.
Arguments, output, exception details, and reasoning are excluded from progress SSE.
The native tool-output projections are drained with rejection handlers because
LangChain creates those promises even when progress uses the execution channel.

The in-flight turn owns activity. Only `done`, `error`, or a failed/closed connection
clears it; a tool ending does not imply the turn ended. Another send starts with no
old tool status. The existing scroll behavior follows the reply while near the bottom
and leaves the reader in place after scrolling up. A stable polite status region
announces generic waiting or tool changes, never answer tokens or dot frames. Dot
animation is disabled for reduced motion.

**Integration decision:** keep Gateway + LangChain. No provider, model, permissions,
or reasoning configuration change. [Streaming capability review](AI-COACH-STREAMING.md)
records installed-source and fixture evidence, current model configuration, alternatives,
and remaining live-verification limits. Optional reasoning UI requires a separate
approved probe establishing useful provider output; generic activity always works.

### Threads

Owner-scoped `agent_thread` and `agent_message` with the same RLS pattern as other
user tables. A user has many threads, and **every message persists**. Message `parts`
are stored as JSON so tool calls survive a reload. The UI reads a thread's full
history. The model does not: the chat route loads that thread's last N messages
(`CONTEXT_MESSAGE_LIMIT` in `src/lib/agent/policy.ts`), and `selectModelMessages` is
the only place that cut is made.

- **Draft, then saved.** New chat is a draft with no row, so opening chat or pressing
  New chat never writes. The first send inserts the thread row, then its first message
  (`startTurn` in `src/lib/agent/thread.ts`). If that message insert fails, `startTurn`
  deletes the thread row before rethrowing.
- **Id and title.** The app picks the thread id with LangSmith `uuid7()`. The same id is
  the LangSmith `metadata.thread_id`, which groups a conversation's traces. There is no
  checkpointer and no `configurable.thread_id`; Postgres is the transcript. The title is
  the first user message with whitespace collapsed and cut to 80 characters, or
  `New chat` when that is empty (`threadTitleFromUserText`).
- **Order.** Each message insert moves the thread's `updated_at` to that message's
  `created_at`. History lists the latest 50 threads by `updated_at desc`
  (`agent_thread_user_updated_idx`).
- **Ownership.** `agent_message (thread_id, user_id)` references
  `agent_thread (id, user_id)` (`agent_message_thread_owner_fkey`, `on delete cascade`).
  RLS checks only a row's own `user_id`, so without the composite key a caller could
  point their message at another user's thread id. There is no second RLS `exists`
  policy.
- **Migration.** `20260927170000_agent_multi_thread.sql` deletes Slice 0's empty
  threads, backfills titles from each thread's earliest user text, and replaces the
  one-thread-per-user key with `agent_thread_id_user_key unique (id, user_id)`.

pgTAP coverage is `supabase/tests/agent_thread_rls.sql`.

**Chat contract.** `src/lib/agent/chat-handler.ts` serves `/api/agent/chat`. Every
response is no-store and noindex.

| Request | Result |
| --- | --- |
| `GET` | The history list and the latest thread, or a draft when there is none. |
| `GET ?thread=new` | The history list and a draft. |
| `GET ?thread=<uuid>` | That thread, or 404 when the caller does not own it. |
| `GET ?thread=<anything else>` | 400. |
| `POST { text, threadId: null }` | Starts a thread and streams the turn. |
| `POST { text, threadId: <uuid> }` | Continues the caller's thread, or 404 with no writes. |
| `POST` without the `threadId` key, with blank text, or with a malformed id | 400 with no writes. |
| `POST` without a Gateway key | 503 with no writes. |

GET never writes. A turn streams SSE in a fixed order: `thread` (the saved summary and
user message), then `text` / `tool-start` / `tool-end` (call IDs and execution outcomes), then `done` (the saved
messages) or `error`.

The client is one reducer (`chatReducer` in `src/lib/agent/chat-state.ts`) over three
screens: `loading`, `chat` (a conversation plus an optional in-flight turn), and
`history` (a conversation plus the row being opened). The `thread` event adopts the
saved id and replaces the optimistic row; `done` merges by message id. `/coach` reads
`?thread=` (`new`, a thread id, or absent for latest; an unknown or malformed id shows unavailable) and mirrors the open conversation into the URL with
`window.history.replaceState`. A draft's first send therefore moves the URL to
`/coach?thread=<id>` when the `thread` event arrives, without a server round-trip. The
sheet fetches its snapshot each time it opens.

### Env (Slice 0, server-only)

`AI_GATEWAY_API_KEY` (or Vercel OIDC `VERCEL_OIDC_TOKEN`), `LANGSMITH_API_KEY`,
`LANGSMITH_TRACING`, and `LANGSMITH_PROJECT=lifting-app-agent`. Optional `AGENT_MODEL`.
None may use a `NEXT_PUBLIC_` prefix. Listed in `.env.local.example` and
[DEPLOY.md](../DEPLOY.md). The chat route's LangSmith project is dedicated to this
agent. Local experiments use a second project, `lifting-app-agent-evals`, so reruns
do not land in the Vercel firehose. `JEV_API_KEY` is read only by that eval script.

## Slices

Build in order. A later slice may add tools; it may not weaken an invariant.

### Slice 0 — Talking to the ledger

**Status.** Shipped. Teaching walkthrough: [ai-coach.html](ai-coach.html).

**Intent.** Dogfoodable grounded chat. Prove streaming, RLS tools, cited numbers, traces.

**In**

- Auth-gated `POST /api/agent/chat` using `getClaims()` and the cookie Supabase client.
- LangChain TS agent loop, Gateway model, LangSmith tracing, a tool-call cap.
- Persistent `IconButton` + `Sheet` on screens where the tab bar shows; `/coach` as the
  full-screen chat. Hide both entry and Sheet chrome using `hideAppChrome` (session,
  recap, planner, program new/edit).
- A persisted transcript. Slice 0 shipped one thread per user; [Threads](#threads) is
  the current many-thread contract. Keep the full transcript in `agent_message`. On each
  model turn, send system prompt plus the last N messages only. Prefer dropping old
  tool results before user/assistant text if a token budget is also applied. Facts
  still come from tools, not from earlier tool JSON in the window.
- Four read tools, each wrapping an existing path:
  - `weeklyCoach` → `loadCoachUi` (report + proposals + formatted text).
  - `activeProgram` → `getActiveProgram`.
  - `exerciseReview` → the same finished-session grouping as `/history/[exerciseId]`
    (`groupReviewSessions` and the Last / 21-day / chart summaries). Ordinary-pound
    families load `movementMemberIds` and resolve to the template id. Machine and cable
    stay exact exercise plus equipment instance. See `docs/ai-coach.html`.
  - `nextWorkout` → `loadNextWorkout` and the same effective-target composition the
    session screen uses, so “why is this target X?” matches Home / planner / Start.
- System prompt: answer from tool results; name the source once on a final `Source:` line; decline medical
  diagnosis (pain stays a review prompt, as Coach already does). One logged value is not a trend.
  Exercise review distinguishes a missing 21-day comparison from historical trend availability.
  Two older eligible points support a dated historical trend even with a recent gap. Other read
  tools still report null / "not available" / `insufficient_data` explicitly.
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

**Status.** Shipped 2026-09-29. Teaching walkthrough: [ai-coach.html](ai-coach.html#slice-1).

**Intent.** Omnipresent without being a fifth tab. Still read-mostly.

**In**

- A context packet on each turn: pathname, active program id, open session id, focused
  exercise id when the screen has one. The client sends pathname-derived ids on
  `POST /api/agent/chat`; the route enriches `activeProgramId` from `getActiveProgram`.
- Client tools that route: `openExerciseReview`, `openCoachCheckIn`, `openProgram`.
  Server tools return the same hrefs the UI uses; the client navigates on `done`.
- `startNextWorkout` prepares an in-transcript confirm chip. `startNextSession` runs
  only after the user taps it, then Next.js redirects to the session screen.

**Out**

- Chat during `/session/*`. Settings writes. Program writes.

**Done when** “open my coach check-in” and “start next workout” (with confirm) land on
the same screens a tap would, and a session route still has no agent entry.

### Slice 2 — Program intake → draft

**Status.** Shipped 2026-09-29; dogfood polish 2026-09-30. Teaching walkthrough:
[ai-coach.html § Slice 2](ai-coach.html#slice-2).

**Intent.** Honest gallery template picker: messy wish list becomes an inactive draft in
the existing builder. This slice recommends an existing `PROGRAM_TEMPLATES` entry (pick +
light patch), not a custom program builder.

**In**

- Starter-prompt pills on empty/new threads (e.g. “Build me a program”, week check-in,
  coach check-in, next workout / target, exercise review). Tapping a pill fills the
  composer like intake chips.
- Short chat or chip intake: days, goal, emphasis, equipment, omissions, classic vs fluid.
- Jev (Choice / Noul / Score) or equivalent structured classify over that closed
  ontology. Low confidence asks a follow-up; it does not guess a split.
- Deterministic assembler: pick or patch a `PROGRAM_TEMPLATES` entry from catalog +
  lift history, then persist as a draft (same path as `createFromTemplate`, which is
  inactive unless the account has no programs). Do not call `saveProgram` on generate;
  that action activates. Present the recommendation in chat (name, match traits, gallery
  source), then offer an **Open in builder** confirm chip. Navigate to
  `/program/[id]?mode=edit` only after the user taps the chip.
- Prefer exercises with stats; honor omissions; keep machine generics as templates.
  Neutral asks should not default to audience-specific templates (e.g. women/glutes)
  when emphasis is unspecified. Validate with the same catalog/pattern tests templates
  already use.
- System prompt and tool descriptions state the gallery-picker boundary. Custom program
  design (discovery mode + program-writer sub-agent) is deferred to a later slice.
  Before intake, Coach explains that it chooses an existing gallery program for review.
  Match explanations use only `matchTraits`; intake confidence does not prove template fit.
  An unconfirmed requested emphasis is called out for builder review. Coach reports saved
  activation status from `isActive`, including the first-program activation exception.

**Out**

- Activating on generate. Emitting programs as free-form LLM JSON. Jev generating
  prose or slot lists. Web search for hypertrophy papers. Full custom program builder
  (discovery middleware, program-writer sub-agent, free-form program JSON).

**Done when** an intake round-trips to the builder after explicit confirm, slot
identities are valid, and the active program is unchanged until the user saves.

### Slice 3 — Weekly narrative

Planning update: #140 owns on-demand narrative quality and grounding; `weeklyCoach` already
exists. Proactive weekly recap #200 is superseded. Exception delivery belongs to #195/#206.

**Intent.** Manual “run check-in” in the thread, wrapping the existing report.

**In**

- Narrate the existing `loadCoachUi` tool output with explicit current/prior calendar windows.
- Explain relevant exceptions in the conversation; optional evidence details remain reachable.

**Out**

- Changing `CoachCheckInReport` or applying interventions. Scheduled first-open recaps,
  email/push delivery and happy-path notifications.

**Done when** the narrative cites the same adherence, trends, and proposal keys as the
Track snapshot for the same window.

### Slice 4 — Confirmed writes

Planning update: #141 and the [exception plan](AI-COACH-EXCEPTIONS-PLAN.md#slice-e--conversation-details-and-confirmed-interventions)
replace routine proposal acceptance with meaningful, revalidated choices. No new actions ship
with this planning update.

**Intent.** The agent explains an exception and offers a meaningful intervention, while
separately requested settings writes retain explicit confirmation.

**In**

- Episode-linked conversation and evidence details; explicit rep-range/swap actions that
  follow [exercise swaps](EXERCISE-SWAPS.md) and the approved #212 action contract.
- Separately requested settings patches with in-transcript confirmation. Delivery-state
  acknowledgement/snooze is distinct from an applied training change.
- Cost caps and tighter tool budgets now that writes exist.

**Out**

- Unattended `saveProgram` on the active program. New progression rules.

**Done when** every successful write is an existing action plus confirm, and an
abandoned confirm leaves data unchanged.

### Slice 5 — Sophistication

After baseline and the exception journey are dogfooded. Candidates: Deep Agents / a program-design subagent,
web search with a research-vs-prescribe split, onboarding that starts in the agent,
in-session whispers, rolling summaries / context compaction, distilled user memory
beyond last-N. Each is its own Decision Card; none is implied by shipping 0–4.

## Exercise review matching and history

The tool enumerates relevant identities before using history. Explicit equipment, movement
modifiers, brands and IDs constrain matching; unspecified equipment retains alternatives.
Aliases, plurals, word order and one-letter typos remain supported. Ordinary-pound variants
share the existing movement comparison scope; barbell/dumbbell and flat/incline stay distinct.
Machines, cables, brands, loading types and equipment instances remain separate. A calf press
on a leg-press apparatus is not a leg-press movement match.

Availability comes from paginated owner-scoped `set_log`, completed non-warmup sessions at
or before the tool's `asOf`. A stats-cache row is neither necessary nor sufficient. Each match
has logged-set/session counts, eligible-point count, and latest activity/eligible dates.

- `explicit` / `unique`: one comparison identity, including a direct no-data answer.
- `preferred_history`: multiple relevant identities, exactly one with logged sets. Return its
  review and deterministic reason; the agent names alternatives, explains the preference,
  answers and confirms intent. An inferred recommendation is not user confirmation.
- `clarification_needed`: zero or multiple history-bearing alternatives. Ask which and offer
  separate summaries, without selecting by recency or strength.
- `more_matches`: over 30 identities. `totalMatches` and `nextMatchOffset` expose continuation;
  inspect another page or ask the user to narrow. The visible page is not the full match list.
- `all`: explicit user request for separate summaries. Use the original name and prior
  `matchKeys` to revalidate the original choices. At most three reviews per call; `nextOffset`
  exposes remaining reviews. Stop at the existing eight-call cap and offer continuation.

Follow-up confirmation, correction, brand choice and “show both/all” all read fresh evidence.
`last` is the latest workout; `latestEligibleE1rm` can be older. Deload sets remain logged
activity but are excluded from strength comparisons. `availability.recentComparison` and
`availability.historicalTrend` are independent. Recent delta is last minus first eligible
point, not last minus best. Historical chart dates must be described as historical.

To bound context, last-workout details include up to 12 sets, and recent details include up
to eight sessions; counts, window best/delta and availability use the complete ledger. The
response declares these detail limits. Review chart remains the canonical last eight eligible
sessions. No schema or RLS policy changed.

See [implementation and validation](AI-COACH-EVAL-IMPROVEMENTS.md) and the
[original annotated experiment review](2026-10-11-ai-coach-annotated-eval-review.md).

## Evals

Fixed catalog/history/Chicago-clock tests are the regression gate. Scripted two-turn tests
exercise `runAgentTurn` and real read-tool adapters with a local PostgREST transport. They
verify orchestration and fresh reads, not the live model's ability to obey the prompt.

`LIVE_EXAMPLES` contains 11 independently authored first-turn policy cases; four additional
scenarios cover confirmation, correction, machine brand selection and “show both”. Each turn
has its own three-call diagnostic budget. Runtime still permits eight calls. References are
policy expectations, not snapshots of a changing user's numbers. RDL alias/full-name share
the same policy. Live facts must be supported by current tool evidence.
`npm run eval:agent` defaults to the 11 first-turn cases. Use `eval:agent:follow-ups` for the
four multi-turn scenarios, or `eval:agent:all` for all 15. These set `EVAL_SCENARIOS` to
`follow-ups` or `all`; an unset value defaults to `first-turn`.

Dataset synchronization is separate from execution. `LIVE_EXAMPLES` and
`LIVE_FOLLOW_UP_EXAMPLES` own source examples marked `metadata.source = lifting-app/LIVE_EXAMPLES`.
UI edits persist during execution. Explicit sync updates marked source rows; legacy matching
IDs are preserved unless `--adopt` is supplied. Manually added IDs are never deleted. Preview
before apply; source-row UI edits can be overwritten by an explicitly applied sync.

```bash
# Preview adoption of the existing 11 legacy source rows plus four new scenarios.
npm run eval:agent:sync -- --adopt
# Apply only after reviewing that preview; this does not run Coach or judges.
npm run eval:agent:sync -- --adopt --apply
# Run the 11 first-turn cases against development when desired.
npm run eval:agent
# Optional: run four follow-up scenarios, or all 15 scenarios.
npm run eval:agent:follow-ups
npm run eval:agent:all
```

The runner checks the URL against `EVAL_DB_PROJECT_REF` (default the development project),
rejects the known production project, and looks up `EVAL_USER_EMAIL` with the local-only
`SUPABASE_SECRET_KEY`. It uses read tools only and never inserts chat threads. No source sync
occurs during execution. Selection uses source case IDs within that snapshot and preserves
dataset-edited questions/references. Missing or duplicate selected IDs fail before Coach runs;
unrelated manual rows are excluded. Old/incomplete selected references identify the case and
print explicit sync commands. Follow-up references must cover every input turn.

Each run resolves `EVAL_DATASET_VERSION` (optional timestamp; otherwise latest) to an immutable
version and records it, actual configured agent/Jev models, policy/rubric, threshold, code SHA
and dirty state, selected scenario set, DB project/user, as-of timestamp, and a hash/count summary of the owner ledger
and catalog. A second hash records whether training data changed during the run. No keys or
full private ledger are experiment metadata. This detects data drift; it does not freeze the DB.
`JEV_MODEL` can select a supported fixed model. The default `jev-latest` is explicitly marked
floating; recording that alias does not establish an immutable vendor model version.
After sync, clear an `EVAL_DATASET_VERSION` pinned to an older snapshot or set it to the new
version; applying sync never modifies an earlier immutable snapshot.

One Jev correctness question produces `reference_match_raw`; `reference_match` is its direct
pass/fail result at `REFERENCE_MATCH_THRESHOLD` (currently 0.7, inclusive). A supported answer,
an honest no-data response, or an appropriate clarification can pass. For multiple matches
with history, listing the relevant choices and asking which one is sufficient: no trend or
resolved-review fields are required. Only claims actually made are checked. False missing-data
claims remain factual errors; availability is no longer a separate judge. Formatting and
optional detail do not decide correctness.

`right_tool`, `tool_call_count`, `found_exercise`, and `supported_figures` are independent code
diagnostics, not ingredients in a hidden aggregate. The figure check covers quoted pounds/ISO
dates, not their semantic scope or direction. Identity uses the final review result. Jev gets
question history, the answer and current-turn tool evidence. `LIVE_JUDGE_VERSION` and the full
question configuration are recorded separately from `LIVE_POLICY_VERSION`, so changing a
rubric does not force a dataset sync when references are still valid.

This replaces the four overlapping judges after inspecting `exercise-review-d90a6a5f`
(`bf61fa1d-bcc3-4400-b8df-4739077c1a35`). Its old aggregate passed 5/11; four of the six
failures came solely from availability. The leg-press clarification scored selection 0.91,
evidence 0.80 and availability 0.62: taking the minimum made a correct clarification fail.
That tool result contained candidate history metadata, not a resolved trend review. Jev did
not provide a rationale, so rubric mismatch is the diagnosis, not an observed internal reason.
Original scores/annotations stay unchanged; the new rubric has not yet been calibrated live.

To calibrate old outputs without calling Coach, explicitly regrade a private archived review:

```bash
npm run eval:agent:regrade -- --input /private/tmp/archive.json --output /private/tmp/revised-grades.json
```

Archive shape: `{ rows: [{ run: { id, inputs: { id, question }, outputs: { answer, toolCalls,
toolResults } }, example: { inputs: { id } }, feedback }] }`. The command calls Jev, saves a
new mode-600 file, and retains original feedback separately. It never changes historical
labels or submits revised feedback to LangSmith. Original silent answers remain negatives;
new transparent answers are new cases. Regrading, dataset apply and live execution have not
been run as part of implementing this contract. Traces stay in `lifting-app-agent-evals`.

## Persistent exception inbox (#195)

See [COACH-INBOX.md](COACH-INBOX.md) for the implemented lifecycle, signed-command boundary,
foreground hooks, preferences, explicit pain-end, rollout and verification. The inbox routes
provide deterministic evidence without a model turn. They preserve the ordinary Coach chat
and the optional read-only report evidence view. #206 routes the default entry to relevant conversations.

## Executable hardening boundaries (#222–#228)

Production next-workout and episode evidence adapters use `resolveExactWorkoutTarget()`
with an explicit exact loading identity, composing the unchanged effective-target engine.
Stored Coach evidence/preferences/results are validated before use; notice details receive
parsed values rather than JSON assertions. Architectural lint protects pure strength code,
canonical target entry points and local-only privileged eval helpers. Generated sequences
verify lifecycle invariants and repeated target reads. [Verification](VERIFICATION.md)
owns the reproducible command, CI/browser profiles and staged strict/evidence migrations.
No model/provider, permissions, comparison policy or skills installation changes.

## Exception conversations and confirmed interventions (#141)

Inbox **Open Coach** creates/reuses one owned ordinary thread and deterministic user seed
through `open_coach_episode`. Concurrent opens and lost responses reuse both. Opening and
reloading never call a model. The conversation shows a deterministic current-review panel;
**See details and choices** opens `/coach/episodes/[episodeId]`. Typing and sending a message
uses the existing agent, provider and tool budget. Each turn loads the linked episode using
the signed-in client independently of mutable transcript text, with bounded evidence and
saved receipts. Stale/unavailable evidence cannot supply current target claims or actions.
Deleted conversation URLs show unavailable; an explicit episode open can create a replacement.

`coach-conversation-data.ts` refreshes canonical evidence, checks source/state revisions
around reads, and obtains the canonical Fluid suggestion/candidate pool. The browser sends
only validated intent, episode occurrence/revision, a stable request UUID, selected replacement
and explicit nullable open-session scope. Confirmation rechecks active Fluid program, exact
context, unsnoozed plateau, no outstanding pain, current ladder/band and offered loggable
replacement. Classic plateaus remain review-only. A newly opened workout requires a fresh
scope confirmation. No workout is created just to apply an intervention.

`commit_coach_episode_action` uses the established signed-command boundary and lock order.
It atomically inserts one adaptation, updates an open-session swap when needed, records a
receipt and supersedes/snoozes the episode. A lost-response retry returns the owned receipt
before recomputing a consumed candidate, even if the old command expired or keys rotated.
Reusing a request UUID for another intent conflicts. Keep going inserts a dismiss plus the
two-exposure frontier without changing the prescription. Applied language requires a receipt.
Historical sets remain authoritative and untouched. Post-commit planner cleanup removes only
the affected choice and repeats on receipt replay; cache refresh is outside the transaction.

Active-session plateau controls now use this same review/confirmation path; the old
client-supplied ladder/band acceptance actions were removed. Ordinary manual swaps retain
their existing workout/program scope. Source, ownership, RPC, property and authenticated
phone verification are described in [Verification](VERIFICATION.md).

Deployment adds `20261017152248_coach_episode_conversations_actions.sql` after #195.
Keep inbox/actions disabled until the matching migration, keys and target-environment checks
pass. This PR does not apply hosted migrations or enable production delivery.

Open-workout review uses a Sheet so the set-entry component stays mounted. Prescription and
identity refreshes update only untouched suggestion fields. New sessions record each loggable
canonical identity at creation; old sessions with absent choices retain the unavailable state.

## Default entry and report compatibility (#206)

Track Explore, every monthly stall link, legacy `/settings?coachExercise=...`, the old
`/analytics/coach` entry and `openCoachCheckIn` use `/coach?review=1`. `coach-entry.ts` owns
query construction and validation. Exercise ID, exact equipment (`none` for no instance)
and selected historical month survive the resolver, conversation URL, reload and report link.
The month is navigation context, not permission to relabel current exception evidence or
weeklyCoach's explicit current/prior calendar windows. Screen enrichment validates requested
exercise/equipment ownership before providing it to the model.

The authenticated resolver refreshes the same deterministic inbox. One matching open
situation opens/reuses its owned thread; several matching slots offer a chooser rather than
silently selecting one. No matching exception opens an on-demand draft without a thread or
model call. Refresh failure is explicit and retryable, with ordinary chat still available.
The resolver finishes with a full document transition to avoid nested router transitions
without a streamed server redirect. Conversation destinations omit `review=1`, preventing
an entry/chat loop. Source changes and pain still gate actual choices in the #141 path.

The report remains at `/analytics/coach?view=details`, with its tested summary, privacy-safe
export and collapsible read-only recommendation evidence. It is optional, with no Accept,
Accept all, Later or Dismiss controls. Their old application server actions were removed;
existing legacy decision rows and deterministic engines/tool lookups remain intact. Accepted
legacy reviews never become action receipts or proof that a program changed. No schema,
provider, scheduler, notification policy or target formula changes are added by #206.
