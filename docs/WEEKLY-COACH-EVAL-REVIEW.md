# Weekly Coach baseline investigation

Human-label the saved answers before changing the rubric or running another paid experiment.
The baseline exposes real narration failures, a reporting bug and judge calibration concerns.
The all-zero factual column alone cannot distinguish these.

## Evidence

User-run experiment: `weekly-coach-4429b245`, ID
`2c119e5d-6598-47d3-b216-95a154ec8244`. Agent: `deepseek/deepseek-v4.1-flash`;
judge: `jev-latest`; rubric: `weekly-judge-v1`; threshold: `0.7`.
The judge ID floats; its exact underlying revision was not returned.

Read-only inspection found ten completed target runs with answers, no target-run errors,
and eleven feedback metrics per answer, including all four raw Jev scores.
The deterministic checks were replayed offline against the stored outputs: all twenty
matched historical feedback. No historical scores, references or thresholds were changed.

| Metric | Passes / 10 |
| --- | ---: |
| Tool selection / freshness | 7 |
| Supported figures | 9 |
| Numerical / date accuracy | 2 |
| Unsupported claims | 10 |
| Target-state distinction | 9 |
| Explanation quality | 9 |
| Factual gate | 0 |

Every case failed at least one required factual metric. The test failure is the final gate;
it does not mean a model invocation crashed or the judge was skipped.

## Harness defects and fixes

LangSmith SDK 0.10.4 materializes the rows and consumes its iterator inside `evaluate()`.
Both local runners then used `for await` on that exhausted iterator. The weekly archive
`test-results/weekly-coach-1792630110530.json` consequently contained `rows: []`, and the
final gate rejected the missing count even before any row failures were counted.
Both runners now read `results.results` for reporting; the weekly runner saves every row. The weekly error reports counts and the archive path.
An offline regression test reproduced the empty archive before the fix, then passed after it.

The two deterministic evaluators previously waited on the combined judge call. They now
run independently, so a Jev error cannot erase code diagnostics. Semantic failures remain
errors or missing feedback; they are not converted into passing scores.

Jev used raw HTTP without a LangSmith child trace. Its absence in the original trace tree
was a visibility gap, although all raw scores were stored. Future requests use `traceable`
with name `Jev judge`, recording the evidence/rubric and raw scores. Follow semantic feedback
into evaluator traces; four questions share one request. `factual_pass` is a code aggregate
and never has its own judge invocation. The client returns no explanatory rationale.
Tracing was checked with offline transport tests; a paid traced request has not been verified.

The complete original answers and feedback were recovered separately to ignored local file
`test-results/weekly-coach-2c119e5d-recovered.json`. The empty original archive is preserved.
Full hosted results remain in LangSmith; the recovery did not rescore or rerun anything.

## Answer review

| Case | Observed issue or review question |
| --- | --- |
| `calendar-vs-program` | Opens “Yes — the report’s current window is program week 3, and your next workout is also week 3.” Later qualifications do not repair that opening conflation. Numerical score 0.56, quality 0.61. |
| `recommendation-vs-target` | Calls nextWorkout and activeProgram, omits weeklyCoach. Current 190 lb × 6 is supported, but the claimed “earlier phase” explanation for 200 lb is not. Unsupported-claims judge nevertheless gives 0.88. The figure guard flags 200 lb absent from returned tools, although the user supplied that number; the guard is deliberately narrower than semantic grounding. |
| `normal-summary`, `normal-progress-no-notification` | Fetch weeklyCoach then exerciseReview. The fixture allowlist rejects the latter; part of the production prompt routes e1RM/history questions there. Resolve that policy/fixture mismatch before interpreting these as pure selection failures. No action or notification was performed. |
| `sparse-data`, `no-workouts` | Answers acknowledge insufficient history and avoid a trend claim. Numerical scores 0.48 and 0.44 need human calibration against the full evidence. These are concerns, not proof of an internally broken judge. |
| `partial-calendar-comparison` | Numerical score 0.77 passes; target-state score 0.65 fails despite no target claim being requested or made. The rubric intends irrelevant target distinctions to pass. |
| `pain-session-scope` | Appears to preserve session-level pain uncertainty and current 190 lb × 6 without inventing a diagnosis or reduction. Numerical score 0.54 needs review. |
| `recovery-week` | Numerical score 0.33; omitted the explicit 3-versus-8 set comparison and “not a setback” may be too categorical. Separate required coverage from incorrect figures when labeling. |
| `edited-history-freshness` | Fresh 2/4 adherence is correct; explicit partial-week qualification is missing. Numerical score 0.55 needs review against that omission. |

These observations identify calibration candidates; Jev supplied no rationale proving why it
assigned any particular score. Keep the original feedback visible. Do not lower the threshold
merely to turn this baseline green.

## Remaining work

Label each stored answer per dimension, resolve the exerciseReview fixture/prompt mismatch,
and add human-reviewed positive/negative controls before revising the judge. Version any
rubric change independently. Only then coordinate a paid regrade/rerun and compare the same
cases. Production prompts, tool outputs and canonical calculations were not changed here.
A signed-in comparison against the canonical report is still required before closing #140.

See the [weekly lab](weekly-coach-evals.html), [owning contract](AI-COACH.md#weekly-narration-evaluation-setup-140)
and [LangSmith organization](LANGSMITH.md).

## Local verification

`npm run verify` passed typecheck, lint, indexed-access typecheck, hook tests, all 1,266
unit tests and build. Two paid suites were skipped. Lint retains the existing unused
`_catalog` warning in `src/lib/board.ts:91`. Regression tests cover SDK result persistence,
failed/missing feedback preservation, independent code checks, shared judge requests and
mocked Jev transport/errors. Database/browser/live profiles were not run. No paid rerun,
production prompt change, hosted feedback edit or deployment was performed during diagnosis.

## Subsequent rubric simplification

After this investigation, the owner requested only grounding and completeness. Future
runs use `weekly-judge-v2`: exactly two raw score columns, `grounded` and `complete`, both
requiring 0.7. Tool-policy/count and regex figure graders, duplicate raw/pass columns and
the factual aggregate are removed. The pinned dataset and historical feedback above remain
unchanged; v1 and v2 scores are not directly comparable. At introduction no paid v2 run
had been made; subsequent results and owner feedback follow below.

## Owner alignment after the v2 run (2026-10-26)

Experiment `weekly-coach-1d2fb20f` (`7e8f5312-bb0a-4139-85d7-955411c94c9d`)
completed all ten cases and twenty scores. The runner correctly reported seven passes and
three REVIEW cases: edited history (0.51 grounded / 0.68 complete), recovery (0.61 / 0.78)
and partial-week comparison (0.80 / 0.49).

The owner accepts all three answers. Recovery reassurance directly answers the question;
the dropped-session inference from snapshots is reasonable; omission of the Chicago label
alone does not warrant failure. This feedback supersedes the earlier proposed wording
corrections for these answers. The actionable problem is judge alignment, not a demonstrated
Coach defect in these cases.

`weekly-judge-v3` grades material truth, practical usefulness and substantive Coach boundaries
within the existing two columns. The three exact accepted answers and human labels are
saved in `src/lib/agent/evals/datasets/weekly-coach-human-labels-v1.json`; evidence comes from
the pinned fixtures by case ID. Labels remain outside judge inputs and are not automatically
uploaded. No production prompt/calculation change, historical rescore or paid v3 run was made.

## Passing v3 evaluation and agent prompt updates

Read-only LangSmith inspection of `weekly-coach-256ada1b`
(`4dfc2b0c-5cd3-4059-8b83-28de01fb903b`) confirmed ten completed target runs, twenty
passing scores and no run errors. Hosted answers match the saved local archive
`test-results/weekly-coach-1793029623442.json`. A semantic evaluator trace contains a
`Jev judge` child with both raw scores, confirming the earlier visibility fix.

Two findings justify targeted prompt updates even though the scores pass:

- `recommendation-vs-target` returns the correct 190 lb target but asserts the 200 lb
  proposal is from an earlier phase. It called nextWorkout and activeProgram (unavailable),
  so no evidence establishes that cause. The previous prompt's “may describe an earlier
  phase or identity” invitation is replaced by a requirement for evidence of the cause.
  Effort-adjustment explanations are conditional on reason repeated_effort_miss.
- The two normal weekly summaries call exerciseReview after weeklyCoach already returns
  the requested figures. The unavailable fixture drives extra caveats. The prompt now uses
  report figures directly, reserving exerciseReview for deeper records/history or missing
  comparisons. Canonical report and target computations remain untouched.

The owner approved these prompt-only changes and deferred additional judge checks/calibration.
The passing evaluation predates the changes. No paid rerun, hosted feedback edit or deployment
was made; model adherence and authenticated acceptance remain unverified.
