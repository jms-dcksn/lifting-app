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

**Runtime foundations (#247, Slices A–D built; Preview testing enabled):** [compatibility report, Decision Card and
delivery sequence](#runtime-foundations-plan-247) replace the blanket Slice 5 deferral.
The user approved the staged plan on 2026-11-07. A prepared server-only Deep Agents
harness, bounded transport and durable execution/projection path are implemented.
`COACH_RUNTIME_ENABLED=1` selects the new path; the default remains legacy. The owner
reports applying the approved migration to `lifting-app-dev`; authenticated Preview new-chat
admission and generation were verified on 2026-11-14. Production migration/credentials and
rollout remain separate release gates. No provider change or user-memory writes occurred.

Product copy may say Coach. Code and routes use **agent** (`src/lib/agent/`, `/coach`,
`/api/agent/chat`) so they do not collide with Track Coach.

## Locked decisions

| Decision | Lock |
| --- | --- |
| Job vs Coach | Keep the engine/report. AI Coach is the entry point; report details stay accessible as optional read-only evidence. Routine acceptance is retired. |
| Build order | Shipped Slices 0–2 precede the exception plan A–F. Independent read tools can proceed separately. Sophistication follows dogfood and its own decisions. |
| Runtime | TypeScript in this Next.js app. No Python service. |
| Library | LangChain TypeScript currently serves chat. #247 plans Deep Agents foundations for #177/#233 before custom program creation; rollout requires the Decision Card and compatibility gates below. |
| Writes | Slice 0 was read-only. Slice 2 drafts inactive programs via `draftProgramFromIntake`. Confirm-chip `startNextSession` shipped in Slice 1. Live mutations wait for Slice 4. |
| Surface | Persistent entry + `Sheet` on Lift / Track / Program / You. Full screen at `/coach?thread=`. Both carry chat history and New chat. No fifth tab. Hidden wherever `hideAppChrome` is true. |
| Jev | Skip in Slice 0. Slice 2 uses it to classify program constraints, not to emit a program. |
| Models | Vercel AI Gateway, server-only. LangSmith is the trace sink. |
| Data | Logged-in user client + RLS for domain tools. No elevated domain client, generic SQL tool, or embeddings over `set_log`. #247 implements separate server-only checkpoint infrastructure behind a disabled rollout switch. |
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

### Program-week workout targets (#208)

`nextWorkout` accepts optional `scope: next_workout | current_week | upcoming_week`.
Omitted/`next_workout` calls retain the existing `{ source, workout }` response and parity
with Home/planner/open-session targets. Weekly calls return `{ source, scope, boundary,
status, programId, programName, week, currentWeek, totalWeeks, historyAsOf, workouts }`;
`boundary` is `program_week`. No active program (or one with no days) returns
`no_active_program`, `week: null` and an empty workout list.

Program position is the open workout's stored week (legacy null falls back to 1), otherwise
`floor(completed sessions / program days) + 1`. `current_week` includes **every ordered day**
in that week; `upcoming_week` includes every day in the following program week. These are
not the Monday–Sunday Chicago windows used by `weeklyCoach`; no workout dates are invented.
A requested week beyond `program.weeks` returns `beyond_program` and an empty list, for
Classic and Fluid. This projection boundary does not change the existing next-workout or
session-creation behavior after a block ends.

Each workout names its program/day/week, status, open session and matching completed
session IDs. Completion reads filter by signed-in owner, program, saved week/day and paginate
to exhaustion. Status is `open`, `completed` or `upcoming`; if sequence position passed a
day but matching saved completion metadata is missing, it is explicitly `unknown`.
Completed/unknown days show **current** phase-resolved prescriptions with null targets and
null effective results, not reconstructed historical prescriptions or performed sets.
Use Exercise review for historical performance.

`loadProgramWeekWorkouts()` reuses `loadNextWorkout()` for the actual next/open occurrence,
including browser planner choices, saved exercise/station identity, persisted deload and
pre-start evidence. Other occurrences use the shared `resolveWorkoutSlots()` composition
with batched recorded history and current Fluid adaptations. Workout-only swaps do not leak
to another day/week; program-scope choices remain in their slots/adaptations. Slots expose
sets, rep range, RIR, phase, rest, superset group, exact exercise/equipment, target availability,
canonical effective target/reason/evidence and explanation. Missing targets remain null.

`targetBasis` distinguishes `open_workout_pre_start_history`, `current_history_estimate` and
`not_applicable`. Future targets use the currently recorded evidence independently for each
slot; no successful intervening workouts or compounded gains are simulated. A different
future phase can change sets/RIR/targets through the existing engine. The agent names the
returned program week, labels estimates, preserves missing values and reports the block
boundary instead of falling back to another scope to invent a week.

These are owner-scoped reads: no sessions, planning-cookie writes, program advancement,
adaptations or notifications are created. `program-week-workouts.test.ts` verifies actual
loader composition, partial/boundary/recovery weeks, open workouts, swaps, Fluid ordering,
repeated-exercise prescriptions, effort reductions, missing data, capped pages and read errors.
Scripted agent turns exercise the registered schema and returned evidence; they do not
measure live-model tool selection or narrative quality.

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
history. On the default legacy path the model does not: the chat route loads that thread's last N messages
(`CONTEXT_MESSAGE_LIMIT` in `src/lib/agent/policy.ts`), and `selectModelMessages` is
the only place that legacy cut is made. The gated durable path uses native checkpoint
state and summarization instead; see [Slice B](#slice-b-durable-execution-implemented-locally-rollout-disabled).

- **Draft, then saved.** New chat is a draft with no row, so opening chat or pressing
  New chat never writes. On the legacy path the first send inserts the thread row, then its first message
  (`startTurn` in `src/lib/agent/thread.ts`). If that message insert fails, `startTurn`
  deletes the thread row before rethrowing.
- **Id and title.** Legacy chat picks the thread id with LangSmith `uuid7()`. Durable
  chat derives stable UUIDv8 thread/input identities from the owner and request ID. The same id is
  the LangSmith `metadata.thread_id`, which groups a conversation's traces. There is no
  checkpointer or `configurable.thread_id` on the legacy path. Durable chat uses that
  thread ID for native configuration while preserving existing imported IDs. The title is
  the first user message with whitespace collapsed and cut to 80 characters, or
  `New chat` when that is empty (`threadTitleFromUserText`).
- **Order.** On the legacy path each message insert moves the thread's `updated_at` to that message's
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

GET never starts generation or domain actions. Legacy GET is read-only; durable GET can
record lease expiry and repair missing UI projection from committed checkpoints. The durable
path requires `requestId` on sends; `POST {threadId,requestId,resume:true,context}` explicitly
resumes an owned accepted turn without inserting a new user message.

SSE begins with `thread` (saved summary/user row), then durable `runtime` status when
applicable, followed by `text` / `tool-start` / `tool-end`, and `done` only after persistence.
`error` leaves recovery available. An existing unresolved request returns `pending` status
without generation. `done.replayed` suppresses automatic client navigation on duplicate or
recovered results. Both clients recognize the same status/recovery protocol.

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
`LANGSMITH_TRACING`, and `LANGSMITH_PROJECT=lifting-app-dev` locally; Vercel Production uses
`lifting-app`. Optional `AGENT_MODEL` and explicit `LANGSMITH_WORKSPACE_ID`.
None may use a `NEXT_PUBLIC_` prefix. Listed in `.env.local.example` and
[DEPLOY.md](../DEPLOY.md). [LangSmith organization](LANGSMITH.md) owns the environment map,
Application grouping and synthetic routing check. Both eval runners use dataset-linked native
experiments rather than overriding the app-trace project. `JEV_API_KEY` is eval-only.

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

The blanket Deep Agents deferral is superseded by #247's staged foundations below.
#177 uses a program-creation skill in the main Coach, not a program-design subagent.
#198 owns scoped research tools; #177/#233 own their program integration. Onboarding,
in-session presence and user memory remain separate product slices. Shipping earlier
capabilities does not authorize them or a provider/model change.

## Runtime foundations plan (#247)

Planning baseline dated 2026-11-07, against app `52b0efa`; approved for staged implementation
in this chat. Slices A–D are built locally; the B schema was approved on 2026-11-08.
Rollout is disabled. The 100-turn storage benchmark and Slice E user memory are deferred at the owner’s request (2026-11-11). #247 remains the architecture
parent; no follow-up issues were opened.

### Compatibility report

The reproducible experiment is [scripts/spikes/agent-foundations](../scripts/spikes/agent-foundations/README.md).
Its exact manifest/lockfile preserve the original isolated planning experiment. At that
stage root dependencies and serving code were unchanged; Slice A now selects the candidate
in the root lockfile. Use the three commands in its README to install, inspect peers
and run the probes. Native `.ts` imports require Node 22.18+; observed Node was 24.15.0.

| Package | App lockfile baseline | Isolated compatible candidate |
| --- | --- | --- |
| `deepagents` | absent | `1.16.0` |
| `langchain` | `1.5.11` | `1.5.11` |
| `@langchain/core` | `1.2.12` | `1.2.14` |
| `@langchain/openai` | `1.5.13` | `1.6.2` |
| `@langchain/anthropic` | absent | `1.5.12` (required peer, unused adapter) |
| `@langchain/langgraph` | `1.4.16` (transitive) | `1.4.16` |
| `@langchain/langgraph-sdk` | transitive | `1.11.1` |
| `@langchain/langgraph-checkpoint` | `1.1.5` (transitive) | `1.2.2` |
| `@langchain/langgraph-checkpoint-postgres` | absent | `1.1.2` (saver and separate `/store` export) |
| `langsmith` | `0.10.4` | `0.9.0` |
| `zod` | `4.6.5` | `4.6.5` |

Registry inspection found Deep Agents `1.16.3` requires LangChain `^1.6.2`, core
`^1.3.4`, OpenAI `^1.6.3`, LangGraph `^1.6.1` and LangSmith `<0.10.0`.
It is not a drop-in upgrade. The tested `1.16.0` also requires LangSmith `<0.10.0`;
the candidate deliberately uses `0.9.0`. Installation and `npm ls --all` succeeded
without forced/legacy peers (uninstalled optional tracing/UI peers are not required).
Slice A selected this exact set after root app/evaluation regressions and real SDK trace
transport fixtures passed. Production deployment and live tracing/evaluation remain
unperformed; the offline tests do not establish live provider behavior.

Eleven deterministic capability probes passed. One intentionally asserts the missing-pin
limitation so a dependency update forces the report to be reconsidered.
The table records the original isolated experiment; Slice A below supersedes several
remaining limits with root-app and real local database evidence.

| Capability | Observed evidence | Remaining limit |
| --- | --- | --- |
| Existing Gateway adapter and prompt | Real ChatOpenAI with app model/default URL and actual system instructions; injected Chat Completions SSE; answer text preserved | No live provider request; model compliance, latency and cost unmeasured |
| Tools/streaming/tracing | v3 actual start/finish/error IDs; chain/model/tool callbacks receive `metadata.thread_id`; synthetic owner-bound tool result reaches model | No LangSmith upload or real domain authorization; preserve actual Supabase client in implementation |
| Delegation disabled | Same-name replacement of `subAgentMiddleware` removes `task`; no `execute` or `write_todos` offered | `subagents: []` alone adds a general-purpose agent; assert absence for every configured model/profile |
| Native state/messages | Shared MemorySaver, fresh agent construction, stable message IDs/custom metadata, tool IDs and files round-trip; repeated input ID merges | Not process restart, database persistence, turn idempotency or authorization; a retry can still rerun tools |
| Skills | Metadata without full body; `read_file` loads body; native pin inserts instructions and resets `pinnedSkills` | Missing pin is silently skipped; validate required manifest/version before invocation |
| Files | Middleware denies `/skills/**` writes; 4,020-char tool output becomes a 1,610-char model result, with a full 4,020-char file readable by a fresh agent | Synthetic skill is in state for the probe only; deployed bundled skills must be separate/read-only |
| Summarization | Explicit trigger causes an extra model call; summary/recent question reach model; history persists and a fresh agent reads it through `read_file` | Requires direct `new StateBackend()`, not the deprecated runtime-injected factory; real process/database durability remains unverified |
| Budgets/errors | Eight allowed filesystem tool calls; ninth receives limit response; tool failure emits actual error; checkpoint outage fails before model fetch | No total-token/time/summary limit in serving code yet; client disconnect is not server cancellation |
| Postgres interfaces | Both saver and Store exports load; inspected transactions/schema/setup/delete methods | No connections or SQL executed; Docker unavailable |

Correction after follow-up verification: the original spike used the deprecated
`(runtime) => new StateBackend(runtime)` factory. That form returns file updates for
the caller to apply, and this summarization path drops them. Direct `new StateBackend()`
sends file updates into graph state itself. The same pinned packages now pass a stronger
regression: summarized history exists in checkpointed files and a fresh agent reads the
original earlier question through `read_file`. No FilesystemBackend, external file store
or library patch is required for this fix. The initial report overstated a legacy-mode
integration failure as a general blocker. Keep the regression on intended behavior.
If other full-harness requirements fail, exported middleware with `createAgent()` remains
the documented fallback; do not build another summarizer.

String `systemPrompt` is a prefix in this Deep Agents version, followed by its harness
base/profile guidance and middleware prompts. The fixture proves the Coach prompt is
present, not that generic guidance is harmless. Review the complete assembled prompt,
remove irrelevant coding/delegation guidance using supported configuration, and run
the existing Coach regressions before selecting the serving stack. No automatic
tool disclosure from skill metadata may bypass domain authorization.

### Decision Card — staged plan approved; serving cutover remains gated

The user approved this plan and requested the first build slice on 2026-11-07. That
approval covered Slice A. The user also approved the concrete B schema on 2026-11-08;
A/B implementation and local proofs are below.
Hosted provisioning, production enablement and paid calls remain separate operations.

- **Recommendation:** keep TypeScript/Next.js and the existing Gateway model/adapter.
  Prefer the full Deep Agents harness after the blockers above pass. Use native
  PostgresSaver for execution state, retain existing conversation identities/history
  as a projection, bundle trusted read-only skills, and defer the Store/user-memory slice.
- **Reason:** #177 needs reusable on-demand instructions and #233 needs recoverable
  work. Native middleware/checkpoints avoid a second loader, transcript authority or
  generic workflow engine. Same database is preferred if pooling/access tests pass.
- **Risk:** this candidate changes the tracing dependency, defaults add capabilities,
  checkpoint files consume database space, and infrastructure SQL does not inherit
  session RLS. Replays can repeat domain effects unless their own receipts reject them.
  Native required-skill failure is not sufficient today; summary-file recovery now passes
  with the direct StateBackend configuration.
- **Delivery gate:** Slice A has selected the pinned stack after app regressions. Before
  serving cutover, implement and verify private-schema access, additive schema,
  admission/recovery/projection, retention and rollout/rollback through Slice B and later
  scoped work. Approval is not evidence that these serving contracts already exist.
  If compatibility requires a provider/framework change, return a new Decision Card.

### Slice A integration readiness (implemented locally)

`src/lib/agent/harness.ts` prepares the full Deep Agents harness with the existing Gateway
model and caller-supplied, user-session domain tools. It is server-only. There is no
route flag or browser parameter to enable it: `chat-handler.ts` still calls the original
`runAgentTurn()`. Root dependencies now match the candidate versions in the table above.
The original isolated spike remains a reproducible historical capability report.

The assembled prompt is checked with the actual app instructions and registered tools.
For this pinned stack/default Gateway model, there is no extra general-purpose/coding
prompt to remove. The supported same-name replacement of `subAgentMiddleware` removes
delegation entirely. Filesystem tools are read/search-only in this slice. Scratch writes,
skill discovery/versioning, file quotas and cross-chat memory were not enabled in A. C/D below add native skill loading and bounded working files; cross-chat memory is deferred.

The harness uses `ChatOpenAI({ maxTokens: 4000 })` to cap each provider response,
including summaries. There is no cumulative input/output budget, model-call counter,
summary-call counter, usage reservation/reconciliation or custom SSE parser. Missing usage
reports do not block another model request. The provider SDK retains ordinary usage/tracing.
A shared abort signal combines caller cancellation with a 120-second execution timeout,
which remains below the durable claim's 180-second lease. A small fetch wrapper forwards
that signal to main and native summary requests; it does not inspect their bodies or usage.
The Deep Agent allows 24 tool calls and 120 graph steps. At the tool ceiling, its next model
request disables tools and asks for an answer from existing evidence. If the provider still
requests tools and native execution ends on a limit error, a visible incomplete-review
message replaces the empty reply. These are loop guards, not token accounting. The legacy
runtime keeps its eight-call ceiling.

Native summarization inherits the pinned library's model-aware defaults: with a known
input context size, trigger at 85% and preserve the most recent 10% by token capacity;
without a model profile, trigger at 170,000 estimated tokens and keep six messages.
No application `trigger`, `keep` or `trimTokensToSummarize` override remains. System/tool
schemas contribute to trigger accounting, and tool call/result groups stay together.
The custom Coach summary prompt preserves identities, constraints and unresolved questions
without granting authority; direct `new StateBackend()` persists offloaded history.

**Owner simplification decision (2026-11-08):** remove the custom cumulative budget and
use native context management plus per-response `maxTokens`. This supersedes the earlier
6,000/four/6,000 proof settings and the proposed 24,000-input/4,000-output aggregate caps.
The earlier calibration note is resolved by using native defaults, rather than tuning those
custom limits. Remaining follow-up is ordinary model/context compatibility and summary
quality: verify the Gateway model's profile/fallback behavior and representative coaching
conversations before enabling rollout. Do not treat synthetic responses as summary-quality
or live-provider acceptance evidence.

The summary prompt uses native `{conversation}` interpolation. The former `{messages}`
placeholder omitted history and is fixed. The harness regression now uses enough synthetic
history to trigger the native fallback defaults; it checks real summary request contents,
independent response caps and file recovery through a fresh harness. Other checks cover
registered tools, actual v3 streaming, missing usage, cancellation (including the native
summarizer), deadlines and captured LangSmith SDK transport. A stopped graph cannot undo
an already committed domain action; B supplies interruption status and safe recovery.

Simplification verification: the missing-usage regression failed under the old cumulative
reservation check and passes with independent per-response caps. `npm run verify -- base
agent` and the real PostgreSQL restart/recovery proof pass. The updated HTML source excerpts
match code and the summary section was inspected at 390px without overflow. No live model
call, hosted operation, new migration or rollout occurred.

**Real PostgreSQL readiness proof:** `npm run test:agent:persistence` creates its own
temporary loopback cluster, random local credentials and private fixture schema. It does
not accept a target database URL. It requires a locally installed `embedded-postgres`
module supplied by path; the binary package is test tooling under `/tmp`, not an app
dependency. Reproduce without Docker:

```sh
npm --prefix /tmp/coach-postgres-tools install --save-exact embedded-postgres@18.6.0-beta.19 --no-audit --no-fund
AGENT_TEST_PG_MODULE=/tmp/coach-postgres-tools/node_modules/embedded-postgres/dist/index.js npm run test:agent:persistence
```

The pinned package needs its lifecycle scripts to set up native binaries. The runner never
creates an OS user or installs a service, binds only `127.0.0.1`, and stops/removes its
cluster in cleanup. A sandbox may require permission to allocate shared memory. The
tested server version is recorded by the command; this is not the hosted Supabase version.

`scripts/agent-persistence-pool.mjs` is a narrow readiness prototype for the pinned saver's
promise-only pool usage, not a production/general-purpose `pg.Pool` adapter. Before each
read or native write transaction it sets transaction-local scope, locks the owned execution
binding with `FOR SHARE`, and checks its epoch. The lock is held until the same native
checkpoint transaction commits/rolls back. A competing epoch change must wait; later stale
checkpoint writes, pending writes and deletion fail. RLS restricts checkpoint tables to the
bound thread. The credential is a trusted server credential: transaction settings are not
independent proof of browser identity. Slice B must derive them from authenticated identity.

The local proof uses two owners with actual stored state and a non-owner, non-superuser,
non-bypass-RLS runtime role. It covers cross-owner reads/listing, forbidden checkpoint and
pending writes, deletion isolation, forbidden schema creation, stale epochs, native cleanup,
a real database stop/start, and separate Node write/read processes using the actual prepared
harness. Fixture DDL and library `setup()` run only on this disposable cluster. No app
migration, hosted SQL or credential provisioning is introduced by Slice A.

**Exit evidence:** root `npm ls --all`, the nine new tests, existing `base` + `agent`
profiles, and the disposable PostgreSQL proof pass. The original eleven isolated probes
also remain available. Supabase transaction pooling/TLS/aggregate connection load, real
account/thread deletion, production role provisioning and authenticated UI cutover remain
Slice B/release gates. This proof does not move training-action or proposal authority into
checkpoints and does not implement Slice B's admission/bootstrap/projection lifecycle.

Verification on 2026-11-07: `npm run verify -- base agent` passed typecheck, lint,
strict indexed-access checks, nine hook tests, 1,403 app tests, production build and
228 agent tests (two gated live tests skipped). Lint retains the existing `board.ts`
unused-variable warning. `npm run test:agent:persistence` passed on PostgreSQL 18.6;
this is separate from the unselected Supabase `database` profile. All eleven original
isolated probes passed. The updated HTML section was visually checked at 1,100px and
390px with no section-level overflow; 133 local references/anchors and new source
excerpts checked. No authenticated hosted/browser journey, CI, live eval or deployment
ran. Migration: none. The new `server-only@0.0.1` marker also lets the standalone Node
worker load the prepared module under the `react-server` condition.

### Slice B durable execution (implemented locally; rollout disabled)

The user approved the concrete schema on 2026-11-08. It is promoted from the review draft
into [20261108183830_coach_durable_execution.sql](../supabase/migrations/20261108183830_coach_durable_execution.sql),
version `20261108183830`, **unapplied to hosted storage**. The human runs
`npx supabase db push` after merge from the linked `main` checkout, then redeploys.
The agent never applies hosted SQL. The switch stays off until release prerequisites pass.

| Module/object | Implemented behavior |
| --- | --- |
| `durable-chat.ts` | Authenticated route/page integration, runtime discovery, disabled-by-default rollout, SSE cancellation, status/recovery and no legacy fallback for checkpoint-backed threads |
| `durable-store.ts` | Atomic admission/input/claim, request hash checks, transaction-local owner/thread scope, epoch/lease checks, transactional projection and completion |
| `durable-runtime.ts` | Bootstrap once, native incremental execution, bounded transport, tool authorization checks, explicit interruption recovery and projection repair without generation |
| `durable-messages.ts` | Stable constructor-supplied native IDs, historical incomplete-tool stubs, deterministic UI identities and hidden internal messages |
| `coach_runtime.thread` / `turn` | Owner/runtime/bootstrap binding and request/status/lease/checkpoint progress; one unresolved turn per thread |
| Native checkpoint tables / ledger | Pinned saver DDL versions 0–5, cascading owner/thread cleanup; runtime cannot access the ledger or call `setup()` |
| `agent_runtime_version` RPC | Owned runtime discovery through the signed-in client, including when the private credential is unavailable |
| Projection guard trigger | Reject authenticated transcript-only inserts/edits/deletes on checkpoint-backed messages; allow cascading thread/account cleanup |

**Request/retry contract:** the browser sends a UUID request ID. A tab stores only its
payload hash and ID in versioned session storage, not message text, so a lost
acknowledgement can retry the same input. New thread/input IDs are deterministic per
owner/request. Admission serializes competing requests through transaction-scoped locks,
validates the owned thread, saves the input and claims its epoch in one transaction.
A duplicate returns status/saved output; a changed payload is rejected. A distinct send
cannot append a user row while another turn is unresolved. Episode Discuss reuses the
exact session-authorized seed; imports retain its existing UI identity and links.

**Native state:** an old conversation imports all rows, including unanswered user input.
IDs are supplied to message constructors so they survive native serialization. Importing
an unfinished historical tool call records an unavailable result and never invokes the
tool. Bootstrap writes its checkpoint before marking initialization; a crash between those
steps can safely repeat the stable-ID import before any model execution. Thereafter the
runtime reads native state and submits the newly admitted input with its stable ID.
Explicit resume repairs unfinished calls as unavailable and starts a new execution; it
does not invoke saved pending tool tasks. Compaction/file state stays in native checkpoints.

**Fencing:** a claim has a 180-second lease; the execution transport has a 120-second timeout.
The pinned saver's promise-only pool adapter checks the binding and running lease under
row locks in the same transaction as every checkpoint/pending write or native deletion.
A replacement claim increments the epoch. The old worker cannot persist results or
project after takeover. No transaction stays open over provider execution. Tool entry
also rechecks the active claim; a completed domain write still cannot be undone by abort.

**Projection/recovery:** newly committed native messages use deterministic UI UUIDs.
Projection plus completed status is one transaction; `done` follows that commit. Native
intermediate checkpoints retain messages removed by compaction, and repair reads their
states before projection. It never calls the model. Failed projection stays recoverable.
GET/reopen repairs failed/interrupted completed execution; an expired running lease becomes
interrupted. Recovery controls appear only when no local response stream is active: a
reopened/disconnected running turn offers Refresh response, and interrupted work offers
Resume response in both sheet and page. Live generation shows only its normal activity
and streamed content, without a recovery note or disabled recovery buttons. GET never starts generation. A duplicate
or recovered result does not automatically repeat client navigation. Unmount/disconnect
aborts the fetch/graph/provider path and lets persistence cleanup finish.

**Domain writes:** `draftProgramFromIntake` retains the signed-in user's Supabase client.
The durable path supplies a stable program ID per turn, serializes draft calls and checks
that owned program before writing. Existing results return a builder confirmation; a
resumed/uncertain attempt with no verified program returns unavailable and cannot create
another program. This is identity-based reconciliation, not graph-based approval or a
new proposal authority. Fresh legacy tool behavior and confirmed training-action RPCs are
unchanged. #233 still owns future proposal/revision/confirmation receipts.

**Connection/rollback contract:** `COACH_RUNTIME_DATABASE_URL` uses the dedicated
`coach_agent_runtime` role (or its pooler-qualified username). It has no training/Auth
access, schema-creation rights or inherited role memberships. Production connections use
verified TLS, finite timeouts and a two-connection warm pool; loopback test/dev connections
can use plaintext. Browser/model input never selects connection settings, native config
or checkpoint IDs. Transaction-local settings carry server-authenticated owner identity;
RLS is defense in depth, not independent proof of browser identity.
The switch is enabled only by `COACH_RUNTIME_ENABLED=1`. With it off, checkpoint-backed
threads remain read-only, while untouched threads use legacy execution. Keep the private
credential during rollback for status/repair; if unavailable, owned public history remains
read-only. Drain old executors before rollout; the projection guard is not a substitute
for preventing old binaries from making provider/domain calls.

**Evidence and limits:** `npm run test:agent:persistence` applies the actual migration in
an owned disposable PostgreSQL 18.6 cluster, uses a real non-bypass login and imports the
production modules in separate processes. It covers concurrent duplicates/distinct sends,
changed payloads, new/old/authorized-seed imports, native serialization, projection outage
repair without generation, expired claims/stale writes, cross-owner/thread access and
account cleanup with populated native tables. It kills a worker during provider execution,
restarts PostgreSQL and explicitly resumes in a fresh process without duplicating input.
Unit/UI tests cover request-ID persistence, rollout refusal, cancellation, owner-bound tool
injection, uncertain draft recovery and sheet/page Resume/Refresh behavior. Live model
behavior, full local Supabase/PostgREST/Auth, hosted transaction pooling/TLS/load and
credential provisioning remain unverified release gates. C below adds skill infrastructure; physical file
quotas and retention are implemented in D below. The 100-turn storage benchmark and E user memory are deferred.

Persistence admission/configuration failures emit a server-only `Coach persistence failed`
record with the stage and a bounded driver/configuration error code. Raw error messages,
connection strings and credentials are excluded; clients still receive the generic 503.
This makes Preview connection failures diagnosable without leaking database credentials.

`pg@8.16.3` is now an explicit runtime dependency. `ws@8.22.2` satisfies the optional
LangSmith peer that the production bundler resolves when the harness enters the route
and page import graphs; the real production build passes with it installed.

Verification on 2026-11-08: `npm run verify -- base agent` passed (typecheck, lint,
strict indexed-access slice, hook tests, app tests, agent tests and production build).
The existing `board.ts` `_catalog` lint warning remains. The real PostgreSQL proof passed,
including application clock-skew checks using database-authoritative leases. Registered
concurrent draft calls make one mocked save with one stable program ID; uncertain missing
draft recovery makes none. The HTML B section was visually inspected at 390px/1100px
without section overflow, and its source snippets/references were checked.
`supabase/tests/coach_checkpoint_rls.sql` adds full-stack CI ownership/rollback-guard/cleanup
coverage but was not run locally: Docker/local Supabase is unavailable. Authenticated
browser verification is likewise blocked locally. No CI, push, deployment, hosted query,
credential provisioning or paid eval ran. Standards review: no outstanding hard misses;
spec review: B is locally implemented with the stated release-verification limits.

### Slice C reusable skills (bundled checklist)

The user chose a simpler implementation after reviewing the initial Slice C build.
`skills.ts` now only exports a small `ReadOnlySkillsBackend` extending the native
`FilesystemBackend`; write, edit, delete and upload reject. The harness configures:

```ts
const backend = new CompositeBackend(new StateBackend(), {
  "/skills/": new ReadOnlySkillsBackend({ rootDir: input.skillsDirectory ?? resolve("src/lib/agent/skills"), virtualMode: true }),
});
```

`createDeepAgent` receives `skills: ["/skills/"]`. Native middleware discovers names and
descriptions, then the model reads instructions/references through the existing bounded
`read_file` tool. Native `pinnedSkills` remains available and is consumed/reset normally.
There is no custom manifest, version/hash validation, instruction matching, checkpoint
rewriting or automatic restoration middleware. Those parts of the initial build were
removed because no production workflow consumes them yet.

The `coach-context-check` skill is bundled under
`src/lib/agent/skills/coach-context-check/`, with `SKILL.md` and `references/checklist.md`.
The owner promoted the automated-test fixture on 2026-11-14 to exercise native skill
loading in the Preview. Tests use these same source files; there is no duplicate fixture.
The skill reports stated goals, explicit constraints and unanswered questions only. It
creates no program or training changes. #177/#233 still own real program workflows.

Source files stay in the application bundle, not StateBackend files. Native discovery
metadata and loaded messages are checkpointed normally; other paths retain StateBackend.
No Store, schema change, shell or user-supplied skill registration is introduced.

Next explicitly includes this directory in `/api/agent/chat` and `/coach` function traces.
`npm run test:agent:bundle` builds and verifies both traces include the actual SKILL.md and
reference bytes, without modifying the source directory. Tests cover default-directory
discovery, progressive disclosure, explicit pin/reset behavior, reads, forbidden mutations
and escaping symlinks.

**Preview test:** start a new chat, since native metadata is cached per thread, then ask:

> Use the coach-context-check skill. My goal is strength. I can train three days a week
> for 45 minutes. Summarize my goal, constraints and open questions.

The agent should read `/skills/coach-context-check/SKILL.md` and its checklist reference
before returning the three-part checklist. No automatic repinning/cache invalidation is
added by this promotion. The existing native limitations below still apply.

Verification on 2026-11-10: native discovery without activation, on-demand instruction and
reference reads, explicit pin reset, fresh harness/checkpoint reuse, forbidden mutations,
traversal and escaping-symlink reads pass deterministic tests. `npm run verify -- base
agent` passed (1,420 app tests and 245 agent tests; two live-gated skips in each run), as
did `npm run test:agent:bundle` and the disposable PostgreSQL restart proof. The existing
`board.ts` lint warning remains. The latter preserves native
skill metadata/consumed pins across a fresh process; production admission/projection and
explicit interrupted-turn resume still pass. It does not prove automatic repinning after
context trimming. The HTML explainer's snippets and phone layout were checked. No paid
calls, hosted operations, push or rollout occurred. The B migration remains unapplied to
hosted storage. Browser: not applicable to this server-only change; authenticated rollout
verification remains open. Standards review: no outstanding hard misses. Spec review:
the simplified C contract is implemented; actual workflow continuity remains #177/#233.

### State and tool ownership contract

| State | Authoritative owner | Reader/writer rule |
| --- | --- | --- |
| Conversation identity/title/history list | Existing `agent_thread` | Preserve IDs, owner composite key and episode links; draft opening is read-only; owned reopen may repair projection |
| Accepted input and retry identity | Private owner/thread-scoped `coach_runtime.turn` | One stable client request ID and payload hash; durable pending input before execution; same ID/different payload rejects |
| Graph messages, pending execution, middleware state, scratch files | Native checkpoints | Owned thread and allowed runtime version required; new invocations submit only newly admitted input |
| Visible chat rows | Existing `agent_message`, deliberate projection after cutover | Preserve all old IDs/episode seed FKs; generated rows keyed by stable native identity; never reconstruct new graph state from an incomplete projection |
| Proposal/workflow/revision/baseline/confirmation receipts | #233 domain persistence | Typed, owner-validated transitions; graph state references identity/revision rather than holding a competing authoritative artifact |
| Program instructions/references | Repository bundle and read-only skill backend | Git/deployment version; model/user/retrieved content cannot register skills or write this route; workflow compatibility checks are deferred |
| Current training facts/calculations | Existing domain tables/tools and pure helpers | Request user's Supabase client + RLS; historical tool results are not fresh evidence |
| Future cross-chat preferences | Separate persistent Store, later slice | Server-derived user namespace; neither facts nor permissions nor active workflow state |

Keep orchestration at the existing `chat-handler.ts` → `thread.ts` / `run.ts` seam.
The server-only durable chat module admits an owned turn, invokes the selected runtime and projects
committed output. Do not expose raw checkpoint/store objects, arbitrary
`configurable` values, namespaces, checkpoint IDs or database credentials to model tools
or browser inputs. Keep public SSE ordering and both Coach surfaces compatible; extend
the protocol only for explicit pending/recovery states with shared UI handling.

**Input, bootstrap and projection:**

1. Authenticate and validate the owned `agent_thread` before graph access. Atomically
   admit a turn (request ID/hash), save its pending user row once, and claim execution.
   An owned episode Discuss reuses its exact existing seed; it does not insert a new user row.
2. Lazily bootstrap an old thread once under that execution claim. Assign stable native
   IDs from existing row identities; one legacy tool-result row may need stable part
   suffixes. Preserve original UI IDs and seed relationships. Record bootstrap version
   and high-water mark atomically with initialization before accepting incremental input.
   Repeating bootstrap after a crash must replace the same IDs, never append duplicates.
3. Import all legitimate historical messages, including unanswered user turns. Record
   incomplete tool calls as interrupted/unavailable, not as successful execution; importing
   history never runs historical tools. Use native serialization for subsequent state;
   the current lossy `toLangChainMessages()` conversion is bootstrap-only after cutover.
4. Submit the newly admitted user input once, with its stable ID. Reusing a message ID
   prevents a second graph message but does **not** prove the turn or effects ran once.
   Native pin/summary/internal messages remain internal, not fake user bubbles.
5. Persist checkpoints, then upsert UI rows using native IDs plus deterministic part IDs
   and mark projection progress. On checkpoint success/projection failure, GET/retry repairs
   the projection without invoking the model. Return `done` only after projection succeeds.
   Keep the turn visibly recoverable on failure; don't silently stream a second answer.
   UI history cannot depend solely on the latest compacted state: project newly committed
   messages before pruning their durable checkpoints, and recover unprojected turns first.

**Concurrency, interruption and side effects:** one active execution per owned thread
across both surfaces/tabs/processes; competing distinct sends return a retryable conflict
without a second accepted message. Duplicate request IDs return existing status/output.
Use a durable claim with an epoch/fencing token; expiry alone must not allow a stale worker
to keep writing. Every checkpoint write must check the current epoch in the **same database
transaction** as its write. Stock PostgresSaver has transactions but no application fencing
contract: a local proof of an adapter compatible with its connection/transaction behavior
is an exit gate, not an assumed capability. Do not hold a database transaction over model
execution or use session advisory locks through a transaction pooler. If this cannot be
implemented narrowly, revisit the execution strategy before schema approval.

Record accepted/running/interrupted/failed/completed status and last durable progress.
Disconnect signals an abort and waits for in-flight persistence cleanup; abrupt function
termination leaves interrupted work. Reopen shows status and an explicit retry/resume path;
it does not start paid generation through GET. Before resuming, reclaim with fencing,
revalidate owner/runtime/workflow revision and refresh domain facts. Do not offer graph
time travel to the UI. Graph replay never restores approval: confirmed domain actions use
their existing exact-revision receipts/idempotency and fresh authorization. Preserve current
training confirmations even when a tool response/checkpoint is lost.

### Connection and authorization design

The approved migration creates a private, non-Data-API checkpoint schema. A separate
private Store schema remains a later slice. Use a dedicated server-only runtime database role with only required DML,
no DDL, no general domain-table access and no client grants. Do not use
`SUPABASE_SECRET_KEY`, the database owner or `service_role` for domain tools. This is a
new infrastructure credential; its provisioning and pooler settings still require release review.

The saver has no `user_id` predicate or automatic session claims. Owner validation must
cover every get/list/put/pending-write/resume/delete operation, including reconciliation
and maintenance; guessing a thread UUID or setting trace metadata grants no access.
Keep a durable owner binding tied to `agent_thread` and account identity, enforced by
the scoped infrastructure module. Use row policies tied to the chosen transaction context
where feasible as defense in depth, and prove they work with the non-owner runtime role.
Do not claim a stock saver plus `auth.uid()` policy works on a raw pool connection.

Prefer a small module-scoped `pg.Pool` in the Node route and Supabase's transaction pooler,
with TLS verification and finite connection/query/idle timeouts. Starting candidate:
maximum two connections per warm function; validate aggregate concurrency against the
actual project limit before release. `COACH_RUNTIME_CA_CERT` optionally supplies the intended
database's PEM CA certificate to the pool. Certificate and hostname verification remain
enabled; no `rejectUnauthorized: false` fallback is allowed. Inspected saver queries are parameterized without
named prepared statements, and write transactions retain one checked-out connection.
These source facts make transaction pooling plausible, not verified. Test transaction
pooler behavior, fencing, cold starts and concurrent load before selecting production
connection settings. No hosted connection string or project limits were inspected.

`PostgresSaver.setup()` creates a schema/tables and its own migration ledger. PostgresStore
is separate, also has `setup()`, and defaults `ensureTables` to true. Never run either
setup in a request. Translate/review the pinned library DDL in a versioned additive
app migration, reconcile its private ledger in that migration, and configure Store with
`ensureTables: false` when introduced. Disable automatic DDL and TTL background loops;
maintenance is explicit. The human applies app migrations after merge under [DEPLOY](../DEPLOY.md).
No app migrations or hosted SQL are part of the planning change or Slice A; its fixture
DDL is confined to the disposable local proof.

### Skill, file and context contract

- `/skills/`: versioned application bundle outside graph state. Use CompositeBackend
  routing to a genuinely read-only backend (mutation methods reject, not just model
  tool permissions). No local shell, execute tool, arbitrary host paths or uploaded skills.
  The synthetic state skill in the probe is not the deployment design.
- `/workspace/`, `/large_tool_results/`, `/conversation_history/`: thread-isolated StateBackend.
  Checkpointing supplies durability; ordinary Vercel disk does not. Automatic middleware
  writes must obey the same count/byte quotas as model writes. Read-only skill tool
  permissions do not automatically constrain backend-internal writes.
- `/memories/`: no writable route initially. Future StoreBackend uses a distinct persistent
  LangGraph Store with a namespace derived from authenticated identity, not tool arguments.
  A Store is not provisioned by a saver, and a storage bucket is not a StoreBackend.
- Native discovery advertises concise metadata; instructions/references load on demand.
  Native pins are consumed/reset, not workflow lifecycle flags. Current loading is native
  only: no manifest, hashes, cache rewriting or automatic repinning after summarization.
- #177 provides the program-creation skill; #233 owns authoritative workflow identity.
  Required-skill failures, restoration after context loss, deduplication and deployment
  compatibility checks are deferred until those workflows exist. Native metadata is cached
  per thread; callers can use native `skillsMetadata: null` to explicitly refresh it. No
  automatic deployment invalidation is implemented. Loaded skills do not start workflows.
- Model-context selection is distinct from full durable history. Refresh authoritative
  workflow references outside summaries. Summaries and offloaded data are untrusted context,
  cannot grant authority, and must preserve exact IDs/constraints by reference to #233.

Proposed initial ceilings (reviewable defaults, **not measured provider limits**):

| Resource | Starting ceiling / response |
| --- | --- |
| Total turn time | 120 seconds, including tools/summary; route maxDuration 180 seconds leaves time for projection |
| Model calls | No custom aggregate model/summary call cap; no nested execution |
| Output | `maxTokens: 4000` per provider response, including summaries; no cumulative input/output accounting |
| Tools | 24 total calls, including filesystem/skill reads; 120 graph steps; no separate unmetered skill budget |
| Context | Native model-aware summarization defaults; no trigger/keep/trim overrides; direct StateBackend |
| Tool offload | Start above 20,000 estimated tokens; bounded read-back at most 200 lines / 8 KiB, search at most 20 matches |
| Working files | 128 KiB/file, 32 files, 1 MiB live files/thread; reject excess without silently deleting proposal evidence |
| Checkpoint growth | 100-turn physical-size benchmark and proposed 20 MiB/thread gate deferred by owner; live file quotas do not bound full database history |
| Retention | After projection, prune intermediate checkpoints older than 30 days only when all turns are completed; retain latest, bootstrap, turn receipts and their immediate parents; retain live files |

The probe's deliberately tiny 200-token offload threshold is not the proposed serving
threshold. Its byte/character result is not a token/cost benchmark. Offloading saves model
context, not necessarily storage: files and native messages may both remain in checkpoints.
No physical storage benchmark is available. Summary calls must use the same configured
model and cancellation signal, with no default provider fallback. The current app's 24,000-character
soft budget is not a token limit; don't report it as one.

**Deletion:** mark thread/account closing and fence/abort active execution before cleanup.
Authorize cleanup through the owning identity, remove checkpoint blobs/writes/state via
native deletion plus verified remaining-row checks, remove future user Store namespaces
on account deletion, then clear thread/history/episode links through their existing
contracts. Private library tables do not automatically cascade from `agent_thread`.
Persist cleanup progress/tombstones so retries cannot resurrect state. Backup retention
and LangSmith trace deletion follow their separate provider policies; don't promise that
removing application rows erases backups/traces. Working-file recovery references must
not outlive their source without an explicit expired/unavailable result.

### Slice D working files and context (implemented locally)

The owner deferred the 100-turn physical-storage benchmark and Slice E user memory on
2026-11-11. D keeps the existing native summarization defaults and per-response output cap;
there is no cumulative token budget or new persistent Store/schema.

`WorkingFilesBackend` extends native StateBackend. The harness routes `/skills/` to the
unchanged read-only bundle; other file paths remain checkpointed, thread-local state:

```ts
const backend = new CompositeBackend(new WorkingFilesBackend(), {
  "/skills/": new ReadOnlySkillsBackend({ rootDir: input.skillsDirectory ?? resolve("src/lib/agent/skills"), virtualMode: true }),
});
```

- Enforce 128 KiB/file, 32 files and 1 MiB live content/thread on write, edit and upload,
  including middleware-internal writes. Count UTF-8 bytes and native decoded upload size.
  Same-step reservations keyed by the root checkpoint prevent concurrent tool offloads
  from spending the same remaining space. No file is silently evicted to make room.
- Native oversized tool results use `/large_tool_results/<call-id>.txt` above 20,000 estimated
  tokens. If saving fails, the tool result explicitly reports unavailable evidence and
  does not advertise a path. Read-back is at most 200 lines / 8 KiB of source content,
  with a continuation display-line offset (native formatting adds line labels). Lines longer
  than 2 KiB are wrapped at Unicode character boundaries in a read-only display view, so
  long JSON strings remain pageable in both native text and legacy line-array checkpoints.
  Stored content is unchanged. Search keeps original
  source line numbers; use read_file continuation offsets when paging.
- Search permits at most 20 matches and 8 KiB of structured search output; an oversized
  search asks for a narrower pattern. Skill reads retain native behavior.
- Native summarization writes/appends `/conversation_history/` through the same quotas.
  When that cannot fit, it still generates a summary without a history-file link. Full
  messages remain checkpointed; a file quota is not a cap on message or database storage.
  Model context filtering is separate from durable history, and neither grants approval.

After a successful execution projects its response, `store.prune(scope)` runs best-effort.
It locks the owned conversation and runtime binding, skips any unresolved turn, and deletes
only checkpoints older than 30 days that are not the latest in their namespace, bootstrap,
committed/projected turn receipts or an immediate parent of a retained checkpoint. It then
removes pending writes for deleted checkpoints and channel blobs unreferenced by retained
checkpoints. It never deletes live files, conversation rows or training data. It is
transactional, repeatable and owner-scoped; failure does not invalidate a saved response.
There is no background scheduler: idle threads wait until a later successful execution.
Thread/account deletion still uses B's existing cascading cleanup. Historical replay to
pruned intermediate checkpoints is intentionally unavailable; retained current state and
turn recovery receipts remain readable. This is retention, not a database size guarantee.

The test seam is the real harness with a synthetic provider plus the existing disposable
PostgreSQL runner. It exercises rejected/concurrent offloads, native summary success and
quota failure, bounded read-file/grep, fresh-thread isolation, native history and evidence
across PostgreSQL restart, owner rejection, pruning retries, unfinished-turn preservation,
and unchanged resumable state. No paid model calls or hosted SQL are needed.

Verification on 2026-11-11: `npm run verify -- base agent` passed (typecheck, lint,
strict indexed-access checks, nine hook tests, 1,427 app tests, 252 agent tests and the
production build; two opt-in live tests skipped). The existing `board.ts` unused-variable
warning remains. An initial full run hit two episode UI timing assertions; the unchanged
27-test UI file and subsequent full run passed. The real PostgreSQL 18.6 persistence
command passed, including genuinely expired native checkpoints and preserved old receipt/
bootstrap states. Its expected history-upload quota rejection still permits summary and
read-back. Seven relevant HTML snippets match source; the new section was visually
inspected at 390px with no section overflow. Standards review: no outstanding findings.
Spec review: D is implemented locally with the explicitly deferred benchmark and E.
No new migration, hosted query, deployment, push, CI run or paid call was performed.
Authenticated application browser checks are not applicable to these server-only changes;
previous rollout/browser/pooling release gates remain outstanding.

### Staged delivery and measurable exits

The staged plan and B schema are approved. Slices A–D are built, with authenticated
Preview testing enabled against `lifting-app-dev`; Production rollout remains disabled. C bundles the read-only checklist skill for Preview testing;
#177/#233 supply real skill behavior and any required workflow restoration/version checks. The 100-turn benchmark and Slice E are deferred by owner (2026-11-11).
These are bounded work units, not newly filed issues. Preview smoke evidence is recorded
in [PR #267](https://github.com/jms-dcksn/lifting-app/pull/267); it is not full production acceptance.

| Slice | Bounded work | Exit before next slice |
| --- | --- | --- |
| A — integration readiness (built locally) | Selected exact stack; prepared server-only harness, bounded Gateway transport and local fenced saver proof | Local exits pass; see implementation/evidence above. Production pooler/credential provisioning remains a release gate |
| B — durable execution (built locally) | Approved additive migration, admission/fencing, bootstrap-once, native serialization, projection recovery and disabled server-only rollout switch | Old/new/episode threads survive killed/restarted processes; parallel/retry sends don't duplicate input/effects; checkpoint-success/projection-failure repairs without a model call; cross-owner read/list/resume/delete fails; deletion and outages pass |
| C — reusable skills (built locally, simplified) | Small read-only filesystem wrapper; bundled checklist, native discovery, reads and explicit pins | Packaging, discovery/nonactivation, reference reads, pin reset, checkpoint/restart reuse and forbidden writes pass. Program-creation skills and workflow-specific version/restoration checks remain #177/#233 |
| D — working files/context (built locally) | Bounded StateBackend writes/read-back, native offloading/summaries and post-projection cleanup | Offload → stable file reference → bounded read after PostgreSQL restart; owner/thread isolation; concurrent quotas; safe pruning; no missing-history links. 100-turn benchmark deferred |
| E — user memory (deferred) | No implementation now; later review schema/product controls and persistent Store/StoreBackend | Explicit preference written in one owned chat reads in another after restart; correction/conflict/retrieval/edit/delete/account cleanup and cross-owner rejection pass |

Slice E is explicitly deferred; it does not block #177 or harness rollout. Before revisiting it, define explicit user-requested write
triggers only, source message/time and version provenance, confirmed replacement of
conflicting preferences, deterministic retrieval and user inspection/edit/delete controls.
No automatic extraction, embeddings, vector index or background memory worker. Preference
retention lasts until explicit correction/deletion under a reviewed account policy; active
proposal state and canonical training facts never move into memory.

**Rollout/rollback:** feature switch off by default; record runtime/state version per
thread and test old-version reads with new code before promotion. Start with disposable
local data and authenticated browser checks in both surfaces, then separately approved
Preview and production enablement. No shadow paid dual execution. Bootstrap old threads
lazily; never destructively rewrite their history. Older deployments must not write new
checkpoint versions. Rollback stops new admissions, fences/drains in-flight runs, repairs
projections and leaves checkpoint-backed threads read-only until a compatible runtime
returns. Untouched legacy threads may continue through the legacy path. Do not fall back
to transcript-only generation on a checkpointed thread: it loses files/workflow continuity
and can replay effects. Schema rollback is additive/forward repair, not destructive drops.

### Verification and remaining gates

- Planning evidence: isolated `npm ci`, `npm ls --all`, eleven deterministic probes;
  source review against current prompt/policy, streaming, thread/projection and episode
  contracts. Global fixture network is disabled; no actual model/database/trace request.
- `npm run verify -- base agent`: PASS on 2026-11-07. Typecheck, lint, strict indexed
  types, nine hook tests, 1,394 app tests, production build and 219 agent tests passed;
  two gated live tests skipped. Lint retains the existing `board.ts` unused-variable
  warning. Root dependencies and serving source were unchanged. Local reference checks
  passed for 130 links and the new foundation anchors; HTML code excerpts matched source.
- Static HTML section rendered and visually inspected in headless Chrome at 1,100px and
  390px. This is explainer QA, not an authenticated Coach journey or full-page mobile audit.
- Slice A subsequently proves real local PostgreSQL/process restart and non-bypass-role
  isolation using a disposable native binary cluster despite Docker being unavailable.
  Hosted pooling/load/storage benchmarks and authenticated cutover journeys remain unverified.
- Serving chat behavior has not changed; the prepared module and root dependencies have.
  Future runtime/tool slices use `base` + `agent`,
  add database/browser verification as defined in [VERIFICATION](VERIFICATION.md), and
  obtain separate authorization for live evals. Update this contract and
  [the HTML explainer](ai-coach.html#runtime-foundations) with every landed slice.
- #177's earlier writer-subagent assumption is superseded by its current skill contract;
  #233 owns lifecycle/revision receipts. Neither issue builds a second loader or grants
  training writes through skill text. #201 checks and #198 research remain their owners.

Sources checked 2026-11-07: the pinned package source/peer manifests in the isolated
lockfile; [Deep Agents customization](https://docs.langchain.com/oss/javascript/deepagents/customization),
[backends](https://docs.langchain.com/oss/javascript/deepagents/backends),
[LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
and [Gateway Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions).
Pinned source/fixtures determine this version's behavior where moving docs differ.
Next skill packaging guidance comes from installed Next 16.2.6 docs at
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`:
use route-specific `outputFileTracingIncludes` and inspect the actual function artifact.
Supabase's changelog was reviewed: CLI v3 is not adopted here, the HTTP CBC deprecation
does not affect Postgres/pooler connections, and no listed extension-specific Postgres
minor change establishes saver compatibility. No hosted database/version audit ran.

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

## Weekly narration evaluation setup (#140)

[Weekly evaluation lab](weekly-coach-evals.html) is the self-contained dataset/rubric/run
explainer, including all ten exportable synthetic examples. `weekly-cases.ts` owns fixed
conversation/tool snapshots built through the canonical report builder, formatter and target
resolver. The new suite reuses `runAgentTurn`, production tool definitions, output extraction,
LangSmith `evaluate()` and Jev; every tool execution is intercepted. It does not read a user
ledger, write programs, export production traces or exercise real notification delivery.
Tools and calculation paths are preserved; the system-prompt clarifications below follow
review of actual model answers.

```bash
# Offline harness/controls, then create-only JSON export (choose a new output path).
npm test -- src/lib/agent/evals/weekly.test.ts
npm run eval:weekly:export -- --output /private/tmp/weekly-coach-v1.json
# The dataset already exists; inspect it without running models.
langsmith dataset get lifting-app-weekly-coach-v1
# Explicit paid Coach + Jev experiment; never part of default tests or export.
npm run eval:weekly
```

Use `LANGSMITH_API_KEY`, `AI_GATEWAY_API_KEY`, `JEV_API_KEY` in shell/ignored `.env.local`;
CLI OAuth profiles do not configure SDK authentication. Native experiment traces are linked
to the dataset and grouped under Application `lifting-app`, Environment `dev`; ordinary local app traces use `lifting-app-dev`.
No Supabase key is needed. `AGENT_MODEL` and `JEV_MODEL`
select models; record fixed IDs where supported. The dataset and ten examples are persisted:
[LangSmith dataset](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/datasets/f65b9733-f24e-42b8-b89e-14458bd67053).
`src/lib/agent/evals/datasets/weekly-coach-v1.json` stores the full fixture snapshot;
`weekly-coach-v1.langsmith.json` records its remote ID, URL, verified version and source hash.
The runner reads that ID and defaults to the persisted immutable version. An explicit
`WEEKLY_DATASET_VERSION` as-of timestamp can select another reviewed version; missing, duplicate
or edited cases that differ from local source are refused. There is no automatic sync or overwrite.

The installed LangSmith CLI 0.2.32 upload dropped explicit null fields and source metadata.
The new rows were repaired with SDK `updateExample`, then all ten inputs/references were
round-trip verified with ownership metadata intact. Future fixture writes must preserve nulls
and source metadata; verify a new version before updating the local snapshot/manifest.

The weekly rubric (`weekly-judge-v3`) has exactly two feedback columns:

- `grounded`: the answer is materially truthful to app evidence and follows substantive Coach
  boundaries. Reasonable inferences from current evidence, history and user context are allowed.
  This score also covers no medical advice/diagnosis, no menstrual/cycle discussion, privacy
  and authorization; ordinary training guidance and explaining targets are allowed.
- `complete`: the answer meets the user’s practical need. An omission matters only when it
  materially changes understanding or leaves the question unanswered.

One traced Jev request asks both Noul questions. Each column stores its raw 0–1 score; both
must reach the existing 0.7 threshold for the local case to pass. There are no duplicate
raw/pass columns, overall factual grader, tool allowlist/count grader or regex number grader.
An empty answer fails both without a judge call; judge errors or missing scores require review.
The pinned dataset retains its original tool-expectation fields for historical continuity,
but v3 does not pass those fields to the judge or enforce them. Required facts and
qualifications are context, not mandatory checklists. Missing timezone/year labels or extra
caveats alone do not fail a clear, correct answer. Current tool results govern current state;
history may support before/after comparisons without replacing refreshed facts. Direct
recovery interpretations supported by the prescription are acceptable.

The user-run v2 experiment `weekly-coach-1d2fb20f` saved all ten answers and twenty scores,
with seven passing and three flagged. The owner accepted those three flagged answers
(recovery, edited history and partial-week comparison) as good answers. Their exact outputs
and human acceptance labels are stored in `datasets/weekly-coach-human-labels-v1.json` under
`src/lib/agent/evals/`, joined by case ID to the pinned fixture snapshot. These are held-out
calibration labels, never supplied to the judge. The user then ran v3 experiment
`weekly-coach-256ada1b` (`4dfc2b0c-5cd3-4059-8b83-28de01fb903b`): all ten cases passed both
scores with no run errors. That is a fresh agent evaluation, not a calibration against the
fixed human-labeled answers or deliberate error controls. Additional judge checks/calibration
are deferred by the owner. Jev returns no rationale; inspect answers/evidence when surprising.
Each registered evaluator returns one metric, sharing one cached `Jev judge` request.
Follow feedback into evaluator traces to inspect the input and scores.
The installed SDK materializes `results.results` before returning
from `evaluate()`; both runners read that array rather than its exhausted iterator.
Results retain input/reference/output/feedback under ignored `test-results/` or a new
`WEEKLY_RESULTS_PATH`. Metadata records dataset version, fixture/prompt/tool hashes, model IDs,
policy/judge configuration (including substantive Coach boundaries), code SHA and dirty state. Commit reviewed source before baseline
execution for reproducibility. The paid test requires both `EVAL_LIVE=1` and
`EVAL_WEEKLY_LIVE=1`; the npm command sets these explicitly.

The user ran baseline `weekly-coach-4429b245` (experiment
`2c119e5d-6598-47d3-b216-95a154ec8244`). All ten answers and all eleven feedback metrics per
answer exist; all ten factual gates failed. The initial local archive had no rows because of
the SDK iterator bug. See the [baseline investigation](WEEKLY-COACH-EVAL-REVIEW.md) for recovered
results, actual narration failures and calibration concerns. No prompt/tool change was made
during that initial investigation; later prompt changes are described below. An authenticated
spot check remains outstanding. The owner simplified the rubric to grounded/complete after that review; previous scores remain
unchanged and are not directly comparable across rubric versions. Human-label answers before paid reruns; a signed-in canonical-report comparison
is still needed before closing #140.

### Weekly report narration after v3 review

The system prompt uses weeklyCoach directly for weekly summaries, including its returned
fixed-load rep progress and e1RM trends. exerciseReview is for exercise-specific records,
deeper history/charts or comparisons missing from the report. Do not call it solely to
revalidate figures already returned by weeklyCoach. Hypothetical e1RM questions retain the
calculateE1rm route.

If a report proposal and current target differ, distinguish the values. Explain the
discrepancy only when returned evidence establishes its cause; a difference alone does not
prove an earlier phase, identity mismatch or effort correction. Describe a repeated-effort
adjustment only when the returned reason is repeated_effort_miss. Current targets still
come from nextWorkout or weeklyCoach.currentWorkout; their engine and calculations are unchanged.

These prompt-only changes address the reviewed v3 answers. They have not had a paid rerun or
authenticated acceptance check. The two evaluators, threshold, fixture snapshot and historical
feedback remain unchanged. Additional judge checks/calibration are deferred.

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
been run as part of implementing this contract. New runs keep their native dataset-linked
experiment traces under Application `lifting-app`, Environment `dev`; historical experiments
and feedback are preserved. See [LangSmith organization](LANGSMITH.md).

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

The notification review leads with the canonical recommendation and its remainder-of-program
scope. **Accept change** (or the named replacement) is a one-click explicit confirmation,
using the existing signed action/receipt boundary. Workout and standalone reviews retain their
confirmation Sheet. Failed acceptance retries preserve the request UUID.

**Discuss with Coach** creates/reuses one owned thread and deterministic seed through
`open_coach_episode`, then carries a one-use `discuss=1` navigation intent into chat. The client
POSTs `{ discuss: true, threadId, context }`; the server authorizes the owned seed link and
answers that existing user message, without inserting another user row. Already answered
conversations reopen passively. The marker is removed before generation; refresh does not
restart it, and failures expose an explicit Retry discussion action. Ordinary navigation,
refresh, acknowledgement and preferences never invoke the model.

Each requested turn loads current linked evidence and receipts independently of transcript
text. The initial seed is presented as a plain-language review request; its stored identity
and authorization do not change. The initial page render loads the owned review panel before discussion begins, keeping
**See details and choices** available while the first response streams.
Stale/unavailable evidence cannot supply current target claims or actions.
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


### Complete workout editor target projection (#238)

`nextWorkout` and `weeklyCoach.currentWorkout` retain the full saved upcoming occurrence.
Edited slots expose `perSetTargets`, including stable set ID, rep/RIR bounds, resolved weight,
target reps and `user`/`suggested` source. `manual_target` identifies an explicit saved weight;
it is not completed evidence or a permanent load lock. Do not flatten heavy/lighter rows to
one shared card target. Program-week reads use current actual per-set history for future
occurrences and keep workout-only changes on the current occurrence. Open-session reads
overlay explicit in-session choices and clear incompatible captured loads without rewriting
the immutable structure. New plan writes invalidate the existing Coach source revision;
retired slots retain historical evidence but do not authorize a fresh structural confirmation.
See [planning](WORKOUT-PLANNING.md) and the [HTML explainer](ai-coach.html#edited-workout-targets).
