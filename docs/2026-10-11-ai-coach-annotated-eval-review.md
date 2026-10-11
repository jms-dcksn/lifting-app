# AI Coach annotated live eval review — 2026-10-11

Recommendation: implement history preference with complete match disclosure, then evaluate that contract. Correct stale references without making the resolver its own oracle or lowering the judge threshold.

**Contract update, approved 2026-10-11:** James wants the tool to expose all relevant matches and their logged-history availability. When only one match has data, the agent can explain that preference, answer from it, and ask whether it satisfied the request. Clarification first is no longer mandatory in that case. Explicit intent still controls; multiple history-bearing matches require clarification or separate summaries. The [implementation plan](AI-COACH-EVAL-IMPROVEMENTS.md) supersedes earlier recommendations for mandatory squat clarification. Original labels below remain unchanged because the old outputs did not disclose the missing alternatives.

## Evidence and score alignment

Reviewed [experiment exercise-review-84fa7815](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba) (ee0f37d4-6754-4d10-b04c-bd11dbbd83ba): all 11 root runs, all saved human correctness labels, nine human notes, all four automated scores, outputs/tool results, and 143 child spans. References were checked against the experiment's dataset version (2026-10-11T14:00:20.692039+00:00); they match the exported examples. Source SHA: db1edc41848cb76fe580f8ff816a0c046c3de255. Actual traced model: deepseek/deepseek-v4.1-flash, 22 LLM calls. Do not infer this experiment's model from the current .env.local.

| Metric | Passes | Meaning |
| --- | ---: | --- |
| Your correctness | 8/11 | Your overall acceptance |
| reference_match | 5/11 | Jev reference-shape/semantic acceptance |
| found_exercise | 6/11 | Expected ID or exact expected choice set occurred |
| right_tool | 11/11 | exerciseReview appeared |
| tool_call_count | 11/11 | At most three calls; all examples used one |

reference_match agrees with you on 8/11 cases. It rejects three answers you accepted (leg press, no-history deadlift, disclosed incline fallback), misses 3/8 of your accepted answers, and accepts none of your three rejected answers. found_exercise agrees on 9/11: it also rejects your leg-press and bench-press passes, but correctly accepts deadlift identity. These are 11 cases from one model run, not a statistically stable quality estimate. Tool presence/count are procedural diagnostics and should not be reported as overall correctness.

| Example | You | Identity judge | Reference judge | Note and interpretation |
| --- | ---: | ---: | ---: | --- |
| [alias-rdl](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b43-bd9a-7000-8000-004e3a9884d0/run/01a12b43-bd9a-7000-8000-004e3a9884d0) | 1 | 1 | 1 | You: “Great answer.” Keep as a positive example of an upward historical trend and separate latest deload. |
| [hard-dumbbell-bench](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-4fb2-7000-8000-03009d22dade/run/01a12b44-4fb2-7000-8000-03009d22dade) | 1 | 1 | 1 | You accepted the clarification and requested an offer to summarize both exercises. This is a helpfulness improvement, not a failed answer. |
| [hard-barbell-squat](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-569a-7000-8000-021e04db4edb/run/01a12b44-569a-7000-8000-021e04db4edb) | 0 | 0 | 0 | You rejected the silent back-squat selection and asked why front squat disappeared. The logged-history filter explains it. |
| [hard-squat](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-605e-7000-8000-03f7a95b2c0d/run/01a12b44-605e-7000-8000-03f7a95b2c0d) | 0 | 0 | 0 | You rejected the silent back-squat selection and wanted more matches. Define the scope for generic squat; current gold only allows front/back barbell. |
| [medium-deadlift](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-6b75-7000-8000-010d77f0f14a/run/01a12b44-6b75-7000-8000-010d77f0f14a) | 1 | 1 | 0 | You accepted the honest no-history answer and identified the reference as incorrect. Tool evidence confirms no Last or chart points. |
| [medium-bench-press](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-71cf-7000-8000-01b39597ad69/run/01a12b44-71cf-7000-8000-01b39597ad69) | 1 | 0 | 0 | You accepted the explicitly disclosed incline fallback and identified the flat-bench gold as wrong. This reveals a policy distinction that must be made explicit. |
| [medium-cybex-hack-squat](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-80ce-7000-8000-0152cdb86d21/run/01a12b44-80ce-7000-8000-0152cdb86d21) | 1 | 1 | 1 | Correctness 1, no written note. Useful positive example for exact machine identity and recent increase excluding deloads. |
| [easy-romanian-deadlift](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-98c3-7000-8000-0066303d3741/run/01a12b44-98c3-7000-8000-0066303d3741) | 1 | 1 | 1 | Correctness 1, no written note. Useful alias-equivalence pair with rdl; current gold conflicts with the real direction and the alias gold. |
| [easy-leg-press](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-a525-7000-8000-00092e1e83c2/run/01a12b44-a525-7000-8000-00092e1e83c2) | 1 | 0 | 0 | You accepted brand disambiguation and requested an offer to show all. Current gold incorrectly requires a template trend. The returned calf-press custom movement deserves a relevance check. |
| [easy-nautilus-hack-squat](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-ae5f-7000-8000-030489634d22/run/01a12b44-ae5f-7000-8000-030489634d22) | 1 | 1 | 1 | You: “Good thorough answer.” You accept dated historical evidence even when the 21-day window is a gap. |
| [incline-bench](https://smith.langchain.com/o/44921cef-3b56-490c-945e-8213da32949f/projects/p/ee0f37d4-6754-4d10-b04c-bd11dbbd83ba/trace/01a12b44-bcf4-7000-8000-02f540529588/run/01a12b44-bcf4-7000-8000-02f540529588) | 0 | 0 | 0 | You rejected station disambiguation and expected barbell versus dumbbell; also requested gold allow that clarification. |

## 1. Resolve movement meaning before using history preferences (highest priority)

Confirmed root causes in [exercise-review.ts](../src/lib/agent/tools/exercise-review.ts): preferBarbell (line 331) drops dumbbell alternatives for unspecified equipment; preferLogged (line 346) discards all unlogged candidates if any scored candidate has a stats row. The exact-name fast path (line 392) can also reject an exact name because it is unlogged. Logged IDs come from the rebuildable user_exercise_stat cache (line 358), not directly from authoritative completed sets.

Read-only reproductions using the real development catalog and stats:

| Query | With user history | Without history filter |
| --- | --- | --- |
| incline bench press | Barbell template + Hoist station choices | Same two choices |
| barbell squat | Back squat only | Back/front squat clarification |
| squat | Back squat only | Back/front squat clarification |
| bench press | Incline barbell bench | Flat barbell bench |
| flat barbell bench press | Flat barbell bench | Flat barbell bench |
| leg press | Custom calf press + Cybex/Nautilus stations | Generic template |

Approved contract: explicit equipment/movement modifiers remain constraints. Return all relevant matches with authoritative logged-set and eligible-e1RM availability; prefer history without hiding alternatives. Generic barbell squat retains back/front alternatives even if only back has history. The tool can recommend back squat and return its review; the agent names the alternatives, explains that only back has data, answers, then asks whether that was intended. Generic incline retains barbell/dumbbell alternatives while collapsing ordinary-pound station duplicates. For bare squat, expose relevant families rather than freeze the old two-ID gold or dump every substring hit.

Your later clarification resolves the bench/squat policy question: a broad query may receive an immediate history-preferred answer with alternatives, reason, and confirmation. The original squat outputs still fail because their narrowing was hidden. An explicit flat-bench request cannot become incline; report its missing history and offer an alternative separately. Return structured matching and preference evidence so both narration and judges can verify the choice. This changes the response contract as well as the references.

Acceptance: resolver fixtures cover seed and personal catalogs, explicit flat/incline and bb/db constraints, zero/one/multiple history-bearing candidates, deload-only/one-point evidence, and stale/missing stats. The existing “resolves squat to the only logged barbell squat” test (exercise-review.test.ts:116) needs to assert retained alternatives and the preference reason, rather than only the selected ID. Add narration tests that require disclosure and confirmation.

## 2. Disambiguate at the actual review scope

exerciseReview already rolls ordinary-pound station variants into one movement (exercise-review.ts:43–55; strength/movement.ts:29,71). Resolution happens first and can return two station choices that would read the same history. Collapse ordinary-pound variants into movement candidates before asking the user. Preserve barbell versus dumbbell, flat versus incline, front versus back; keep machines and cables exact by brand/type/instance. This follows the shipped Card 1 read contract and does not change historical set IDs, per-station session targets, or stall/Fluid scope.

For machines, your brand-disambiguation note is correct; do not combine raw e1RM into one cross-machine number. “Show all” should present separate labeled summaries. Check whether “Leg press calf press” belongs in a leg-press choice set: current text scoring cannot reliably distinguish shared apparatus from the same movement. Your label accepts the overall clarification; it does not prove every returned candidate is relevant.

Acceptance: template + Hoist incline yields one barbell movement choice rather than two stations, alongside dumbbell incline when the phrase is ambiguous; Cybex/Nautilus machine histories remain separate. Align the tool description (tools/index.ts:56), which still says one exact exercise, with implemented movement scope. Consider returning station provenance on rolled-up sets instead of losing the brand.

## 3. Repair reference outputs and mutually exclusive rubric rules

Update durable source in [live.ts](../src/lib/agent/evals/live.ts), then deliberately sync the dataset:

- Deadlift: reference should describe no logged history/no trend, not invented 395–415 lb observations. found_exercise already passes; only answer grading is wrong.
- Leg press: reference should allow/expect meaningful brand clarification for this catalog and can include the offer to show each separately. Replace resolved template expectation in both review and the answer rubric.
- Incline: expose barbell/dumbbell movements, not duplicate stations. Allow transparent preference if only one has data, otherwise clarification or separate requested summaries. Update review and reference_match together.
- Squat/barbell squat: accept a preferred logged back-squat answer only when alternatives, verified history reason, and confirmation are present. Hidden selection still fails. Match expectations must reflect relevant movement scope rather than require clarification regardless of history.
- Bench press: allow the approved transparent history preference for broad queries, preserving explicit flat/incline constraints. Remove fictitious flat-bench history. A correct explicitly requested no-data answer remains acceptable.
- RDL: full-name gold says a falling 275/260/280 lb story while alias gold says a rising 318 lb story; both queries produced equivalent real evidence. Align alias and full-name expectations.
- Nautilus: reference claims a best within 21 days, but last training was Sep 19 and actual recent21Days is gap on Oct 11. Use a dated historical trend, not a recent-best claim.
- All references: distinguish latest workout, latest eligible e1RM, historical peak, and current-window best. “Currently” should not label a historical maximum by default. recent21Days.delta is last eligible point minus FIRST eligible point in the window (exercise-review-sessions.ts:111–128), whereas references label it last-versus-best.

General trendInstructions pass says no-trend answers are allowed, while inherited fail says replies that never report a trend fail (live.ts:113–118). The incline rubric does not even include the no-data exception. Write disjoint rules for trend available, no history, one point, recent gap with older chart, deload latest, clarification, and any permitted disclosed alternative. Judge clarity/meaning rather than requiring the same sentence layout. Do not lower 0.8 merely to make these cases green.

## 4. Separate identity, evidence accuracy, availability, and usefulness in judges

reference_match currently sends Jev only question/reference/answer, not actual toolResults (live-experiment.ts:128–145), and explicitly ignores pounds/dates. It cannot reliably know whether “no trend” is truthful or catch fabricated values. Pass evidence to a factual-grounding judge while keeping the expected intent independently authored. Never derive the identity gold by calling the same resolver under test.

Recommended metrics: identity_or_clarification_correct, facts_supported, availability_handled, and optional helpfulness. Keep call count and tool presence as diagnostics. A useful clarification may be correct without a trend. A correct number for the wrong lift may be grounded but fail identity. Returning the right tool does not establish either.

found_exercise accepts any earlier expected result even if a later call or final answer uses another lift (live.ts:325–337; tests explicitly permit this). Retain lookup occurrence as a diagnostic if useful, but validate final answer/selection consistency separately. Hardcoded exact choice equality also needs an explicit distinction between required movement choices, permitted relevant additions, and prohibited station duplicates/unrelated lifts; do not simply allow arbitrary supersets.

Use this annotated batch for judge calibration, including negative controls: invented trend on no-history deadlift, invented date/value, wrong-machine numbers, missing disclosure for incline fallback, stale 21-day claim, and right initial lookup followed by wrong final answer. Compare agreement against your labels and inspect disagreements; score thresholds need labeled evidence. Preserve raw noul and identify judge/model configuration; jev-latest currently floats (jev.ts:32).

## 5. Clarify time windows and deload semantics in tool/prompt output

Your accepted Nautilus answer shows that a 21-day gap can coexist with a valid six-point older chart. Prompt.ts:29–30 and the tool description currently collapse those into “no trend.” Give separate recent-comparison and historical-chart availability, each with dates. Zero/one eligible points still cannot establish direction.

The accepted RDL/Cybex/bench replies say no e1RM was “recorded” for deloads. Current dev DB read confirms 30/30 deload set rows have stored e1rm; groupReviewSessions excludes them from eligible session bests. Correct wording: deload values are excluded from strength comparisons, not absent from storage. Return a reason/status for missing eligible best so the model does not infer why a null occurred.

There is another subtle factual issue in the accepted bench answer: it calls Sep 14 a peak in the 21-day window, although Sep 14 is only in chartLast8, not recent21Days.sessions. That needs a grounding/window check even if the overall answer remains useful. Nautilus “steady climb” also contains a small early dip (381.7 to 380.6); “overall rise” is more accurate. Your correctness labels identify accepted answers, not proof that every sentence is perfect.

## 6. Offer “one or all” as usefulness, then test the follow-up

Your dumbbell and leg-press notes ask for “choose one, or show both/all.” Those outputs already earned correctness 1. Treat the offer as a helpfulness criterion so an otherwise safe clarification does not become incorrect. Prompt currently only says ask which listed exercise; add the offer where appropriate.

Add multi-turn cases: user chooses one, user says both/all, user provides a brand, and user corrects the suggested lift. Current dataset is eleven standalone first turns, so it cannot test this behavior. A leg-press query with three distinct candidates plus the initial clarification can exceed the universal three-call cap when expanded; make budgets scenario-specific or provide a bounded batch-read interface if actual repeated calls justify it. Preserve separate machine numbers and respect which summaries the user requested.

## 7. Preserve reproducibility and keep edits from being overwritten

syncLiveExamples runs every time, overwrites known references/instructions/review, and deletes examples outside its source list (live-experiment.ts:174–218). Edits made only in the LangSmith dataset will be lost on the next run; run feedback/annotations are separate and are not deleted by this sync. Make dataset sync deliberate and document the source of truth.

Split stable catalog/history/clock regression fixtures from live smoke checks. Record database project, eval user ID, as-of time, data snapshot identifier, actual model, judge settings, code SHA and dataset version without secrets. Current experiment records code/dataset metadata, but no explicit DB/user snapshot. Evaluate references against a frozen version. Rolling 21-day windows age, and seed-only resolver tests (live.test.ts:25–30) miss the history-dependent behavior reproduced here.

## 8. Reconcile contracts in documentation

The rollup spec header and current code say Card 1 shipped; AGENTS/DECISIONS still contain pending/exact wording. Resolve the contradiction against the shipped behavior and preserve cable/targets/stall distinctions. The eval docs say prod ledger, although the runner uses the configured Supabase URL, which now targets development. This experiment does not explicitly record its database target, so future metadata should prove that provenance. Refresh owning AI Coach docs and HTML explainer when implementation changes, with accurate examples of the supported resolution and comparison scopes.

## Suggested implementation sequence and limits

1. Return complete relevant movement matches with authoritative history metadata and a preference reason.
2. Add transparent preferred answers, confirmation, and correct window/deload semantics.
3. Align references and evidence-based judges with those outcomes; preserve original annotations separately.
4. Implement and test choose-one, correction, and show-all follow-ups.
5. Record reproducible experiment context and make dataset sync deliberate.
6. Calibrate and verify the development flow; refresh descriptions/docs/HTML in each code slice.

Scopes, dependencies, files, and acceptance criteria are in [the implementation plan](AI-COACH-EVAL-IMPROVEMENTS.md).

This review ran no new agent/model evals, changed no data or LangSmith resources, and implemented none of these proposals. Evidence exports are private temporary files under /private/tmp/ai-coach-eval-review-20261011; the report keeps only bounded notes and verified links. Source-only independent audit: /private/tmp/ai-coach-eval-tool-contract-review.md. Read-only database checks used development only. No build/test suite was needed for this review; behavior reproductions used actual source with the current dev catalog and stats.


## Implementation follow-through

The [implementation record](AI-COACH-EVAL-IMPROVEMENTS.md#implementation-record) now describes
local code and checks. Findings and original labels above describe the archived experiment;
no annotation was changed. Revised policy expectations and local controls are separate.
Live judge calibration and fresh output review remain deferred.
