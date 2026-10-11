# Exercise review and eval improvements

**Status:** implementation in the PR branch; history preference and transparent match disclosure approved by James on 2026-10-11. Live calibration remains deferred.

## Implementation record

Slices 1–5 are implemented in the existing tool, prompt, local judges and runner. Fixed
regressions cover ledger ownership/eligibility/pagination, movement/instance identity, evidence
availability, judge controls, deliberate sync, and scripted two-turn orchestration. Large
candidate lists enumerate through explicit 30-match pages with total/count continuation;
all-review pages contain at most three summaries and preserve the eight-call runtime cap.
Counts/comparisons use the complete ledger; bounded detail arrays declare their limits.

Read-only development smoke checks verify barbell squat preference, incline movement grouping,
leg-press brand clarification/calf exclusion, Nautilus historical availability, and explicit
front-squat no-data behavior. No database/schema mutation, dataset apply, Coach/Jev live call,
or historical-label change accompanies this implementation. CLI help works locally. The real
LangSmith read-only sync preview reports 11 legacy reference updates and four new scenarios,
with `applied: false`. Full verification: 855 tests passed (live test skipped), typecheck/build
passed, lint passed with the existing `board.ts` unused-variable warning. Local doc links and
HTML source excerpts were checked; no SQL/RLS change required the database ownership suite.

Slice 6 remains an operational validation step: explicitly request an archived-output regrade
and fresh development eval before claiming live model/judge calibration. Browser inventory
had no authenticated local app tab; authenticated chat behavior has not been exercised here.
Scripted model tests demonstrate orchestration only. The default Jev alias is floating and is
recorded as such; configure a supported fixed model for stronger vendor reproducibility.

Current commands and result contract are owned by [AI Coach](AI-COACH.md#evals).
The original annotated review remains historical evidence; its labels are unchanged.

Implement the tool contract and its evaluation together. Prefer exercises with logged data,
return all relevant matches to the agent, and explain any inferred selection before answering.
Use the [annotated experiment review](2026-10-11-ai-coach-annotated-eval-review.md) as evidence;
its original labels remain an observation of the old outputs, not the new acceptance rules.

## Approved behavior

The tool owns matching, review scope, history availability, ranking, and training facts.
The agent owns the explanation, answer, clarification, and confirmation question.

- Return every relevant match after explicit constraints and review-scope grouping. History
  preference must not remove unlogged alternatives. Do not silently truncate the candidate list.
- Preserve explicit IDs, equipment, brand, and movement modifiers. An explicit front-squat
  request cannot become back squat because only back squat has data.
- Group ordinary-pound station variants by the existing movement comparison scope. Preserve
  distinct barbell/dumbbell, flat/incline, and front/back movements. Machine and cable brands,
  types, and equipment instances remain separate; do not average their numbers.
- Count completed, non-warmup sets from the authoritative owner-scoped ledger. Exclude future
  sessions as the current review does. A stats-cache row is not proof of logged history.
- Report logged activity separately from eligible e1RM history. Deload-only history has logged
  sets but no eligible strength trend; missing RIR/e1RM must not be mistaken for no activity.
- When exactly one relevant match has logged data, recommend it and return its review. The
  agent acknowledges the alternatives, explains why it used that match, answers, and asks if
  that was the exercise intended. A follow-up is required for an inferred choice, not every
  exact-ID lookup.
- When multiple plausible matches have history and none is explicitly identified, ask the
  user to choose and offer separate summaries of all. Do not infer intended lift from recency
  or the largest e1RM. When none has history, say so and offer clarification without inventing
  a trend. A uniquely identified exercise with no history gets a direct no-data answer.
- A focused or user-confirmed ID controls the review. Re-read evidence on follow-up turns;
  previous tool output may identify a choice but is not current training evidence.

Example target response for an ambiguous query:

> I found back squat and front squat. Only back squat has logged sets, so I used that history.
> Your last e1RM was 228 lb; there isn't enough data to establish a trend. Did you mean back squat?

This permits transparent history-based answers for the generic squat cases. Their old outputs
still failed because they concealed the other matches and the selection reason. The old bench
fallback remains useful evidence, but the new response must expose the alternatives and invite
correction. Exact flat-bench queries still cannot substitute incline.

## Tool result and test surfaces

Evolve the existing `exerciseReview` module; avoid a separate search service, schema change,
or second strength engine. Resolve relevance and comparison scope before annotating history.
Reuse canonical movement and session helpers.

The result needs these facts; exact field names are an implementation detail:

| Information | Required meaning |
| --- | --- |
| Requested phrase/ID | What the user or focused context supplied |
| Matches | All relevant comparison identities, with names and scope |
| History per match | Completed logged-set/session counts, eligible chart-point count, latest activity and eligible dates |
| Recommendation | Candidate ID or null, with a deterministic reason such as only match with history |
| Selection status | Explicit/unique, inferred from history, clarification needed, or no match |
| Review evidence | Last workout, latest eligible e1RM, recent window, historical chart for the selected candidate |

Return compact history metadata for every candidate, rather than full histories for every
possible lift. Load a selected review through the same canonical path. Batch and paginate
owner-scoped ledger reads so Supabase row limits cannot silently turn existing history into
zero history; avoid one history query per candidate. Respect the existing model context budget.
Distinguish a ranking recommendation from a user-confirmed selection.

Test through the public `exerciseReview` result, its exported matching interface, canonical
review summaries, grader interfaces, and `runAgentTurn` conversation output. Expected cases
must be independently authored from this contract and the annotations, never generated by the
resolver under test. Use deterministic catalog/history fixtures with one explicit Chicago clock.

## Implementation slices

Each slice is a bounded PR/issue scope. Update `docs/AI-COACH.md` and `docs/ai-coach.html` as
behavior lands, including diagrams and actual landed snippets. No issue publication is part
of this planning task.

### 1. Return complete movement matches and authoritative history preference

**Depends on:** none. **Files:** `src/lib/agent/tools/exercise-review.ts`, its tests,
`src/lib/strength/movement.ts` only where reuse requires it, `src/lib/agent/tools/tools.test.ts`.

Replace history-based candidate elimination and implicit barbell-only filtering with complete
relevant match discovery, scope grouping, history metadata, and deterministic selection.
Keep current alias, typo, and word-order support. Exact IDs and explicit modifiers remain
constraints. Use existing catalog metadata to distinguish shared apparatus from the same
movement; include a calf-press negative example. Broad squat matching must expose all genuinely
relevant families rather than freeze the old two-ID seed list or return every substring hit.

**Acceptance:**

- Back/front squat remain visible when only back has history; back is recommended with reason.
- Incline barbell template plus Hoist variant becomes one movement candidate, with dumbbell
  incline also visible when equipment is unspecified.
- Generic machine searches retain separate relevant brands/types; explicit brand or instance
  requests narrow correctly. Counts and review evidence use the same comparison scope.
- Zero, one, and multiple history-bearing candidates produce the approved statuses. Deload-only,
  one-point, stale/missing stats, warmup-only, unfinished, future, and foreign-user rows are covered.
- Empty stats with real sets and stats without real sets cannot misstate availability.
- Candidate/history reads cover pagination boundaries and do not silently cut candidates to eight.

### 2. Narrate preferred matches and accurate evidence availability

**Depends on:** 1. **Files:** `src/lib/agent/prompt.ts`, `src/lib/agent/tools/index.ts`,
`src/lib/agent/tools/exercise-review.ts`, `src/lib/exercise-review-sessions.ts` if a shared
summary is needed, relevant tests.

Teach the agent to disclose matches and the history-based reason, answer using the recommended
review, and invite correction. Expose recent-comparison and historical-chart availability
separately. Clarify latest workout versus latest eligible e1RM and window best. Deload evidence
is excluded from strength comparisons, not absent from storage.

**Acceptance:**

- One logged match: alternatives + verified preference reason + supported answer + confirmation.
- Multiple logged matches: meaningful choices plus offer to show separately; no silent selection.
- Explicit no-history lift: honest no-data answer, no substitution or fabricated figures.
- A 21-day gap with at least two older eligible chart points permits a dated historical trend.
- Zero/one eligible point has no trend; deload-only activity is described accurately.
- Window delta remains last minus first eligible point. Chart dates outside the window are not
  presented as current-window evidence. Source attribution stays on one final line.

### 3. Align reference outcomes and judges with the approved contract

**Depends on:** 1–2. **Files:** `src/lib/agent/evals/live.ts`, `live.test.ts`,
`live-experiment.ts`, `jev.ts`, fixture/grade modules as needed.

Represent independently authored acceptable outcomes: explicit resolution, preferred logged
match with required disclosure/confirmation, clarification, and no-data response. Keep stable
numeric gold in deterministic fixtures; live answers must be grounded in returned evidence.
Separate identity/selection correctness, evidence support, availability handling, and optional
helpfulness. Keep tool presence/count as diagnostics. Inspect final-answer consistency rather
than accepting any earlier correct lookup. Give Jev tool evidence and disjoint pass/fail rules.

**Acceptance:**

- Deadlift no-history, leg-press brand handling, and disclosed bench preference no longer fail
  solely because of obsolete gold. Hidden squat alternatives and duplicate incline station
  choices still fail. Transparent preferred squat answers can pass the revised rubric.
- RDL alias/full-name gold agrees; Nautilus allows dated history despite recent gap; no invented
  current/21-day claims. Multiple returned candidates do not automatically count as failure.
- A correct initial lookup followed by a wrong final lift fails identity/answer consistency.
- Fabricated numbers/dates, wrong-machine evidence, false only-one-has-history claims, omitted
  alternatives/confirmation, and confusing deload exclusion with absent storage fail controls.
- Store raw judge scores and configuration; do not lower the 0.8 threshold to hide mismatches.

Keep the original 11 human labels and notes unchanged. Save revised-policy expectations
separately: the old silent squat answers remain negatives, while newly transparent answers
are new positive cases. After judge changes, an explicitly requested regrade of stored outputs
can calibrate judges without invoking the Coach model again; don't fabricate improved answers
or reinterpret the historical labels as if the new behavior had already occurred.

### 4. Support choose-one, correction, and show-all follow-ups

**Depends on:** 1–3. **Files:** tool module/adapter, prompt, `src/lib/agent/run.ts` and
`messages.ts` only if needed, multi-turn eval cases/runner/tests.

Use current transcript/context to understand “front squat instead,” “the Cybex one,” and
“show both/all,” then re-read current evidence. Add a small read-only batch interface to the
existing tool only if individual calls cannot serve the selected candidate set within the
current runtime budget. Do not add another transcript store or unbounded automatic fan-out.

**Acceptance:**

- End-to-end turns cover confirming a preferred match, correcting it to an unlogged lift,
  selecting a brand, and requesting both/all after clarification.
- Summaries remain labeled separately; no cross-machine aggregation or fabricated no-data trend.
- “All” means the relevant candidate set exposed in the prior turn, revalidated under the user.
- Eval budgets are per scenario/turn; the current runtime budget is eight calls, while first-turn
  live examples currently grade a maximum of three. Do not globally increase either cap.
- Large candidate sets produce a bounded, transparent continuation rather than silently dropping
  matches. The offer to show all is helpfulness; it cannot compensate for incorrect identity/facts.

### 5. Make live experiments reproducible and dataset sync deliberate

**Depends on:** 3; extend for 4's multi-turn cases. **Files:** `live-experiment.ts`, runner tests,
`package.json`, `.env.local.example` only if configuration is added, AI Coach/deployment docs.

Separate source-to-dataset synchronization from experiment execution. Pin each run to a known
dataset version and record actual model, judge configuration, code SHA, DB project, user ID,
as-of time, and an identifiable training-data snapshot/summary. No keys or full private ledger
in metadata. Live cases remain operational checks; fixed catalog/history/clock cases are the
regression gate. Use the configured development database and validate the target before live work.

**Acceptance:**

- Running an experiment does not overwrite UI edits or delete manually added examples implicitly.
- Explicit sync previews changes, preserves historical experiment annotations, and applies only
  the agreed source-owned examples. Document which source owns references.
- Model/database/dataset changes are visible when comparing experiments; stale data expectations
  are distinguished from tool/agent failure. Time-window changes do not break fixed fixtures.
- New command/config names are documented after implementation, not represented as existing now.

### 6. Calibrate and verify the complete development flow

**Depends on:** 1–5. **Scope:** validation, documentation reconciliation, and result review.

Replay the archived annotated outputs through the revised judges when requested, inspect each
disagreement, then run a fresh development experiment when explicitly authorized. Compare new
outputs under the revised policy; don't demand the original 8/11 labels reproduce exactly after
the policy change. Verify an authenticated chat with ambiguous query, disclosed preference,
correction, and separate machine summaries. Reconcile stale rollup/pending wording against the
shipped code and preserve target/stall/cable scope decisions.

**Acceptance:** all negative controls fail for the intended reason; positive fixtures pass;
every annotated discrepancy has an explanation or tracked follow-up; fresh output demonstrates
complete match disclosure and correct availability. One live batch is evidence, not a statistical
quality claim. Record what passed and all access/verification limits.

## Verification and delivery

For each application slice run focused public-contract tests, then `npm test`, `npm run lint`,
`npx tsc --noEmit`, and `npm run build`. Browser-check changed authenticated flows when available.
No DB schema migration is expected. Add ownership checks to the data-reading tests; use
`npm run test:db` if a later implementation changes SQL/RLS. Resolve stale Next validator types
through the build before treating them as new route defects.

Implementation and PR publication are authorized. Dataset apply, archived-output regrading,
and fresh live eval execution remain separate explicit actions; none ran during implementation.
