# LangSmith organization and tracing

Use the existing workspace and select **Application → lifting-app** in LangSmith. An
application groups tracing projects, datasets and experiments; a tracing project does not
contain datasets. Resource IDs and tag values are recorded in
`src/lib/agent/evals/datasets/langsmith-resources.json`.

## Environment mapping

| Runtime | `LANGSMITH_PROJECT` | Trace metadata |
| --- | --- | --- |
| Vercel Production | `lifting-app` | `app=lifting-app`, `environment=prod`, `source=production` |
| Vercel Preview | `lifting-app-dev` | `environment=dev`, `source=preview`, branch/revision when supplied by Vercel |
| Local app | `lifting-app-dev` | `environment=dev`, `source=local` |
| Paid offline evaluation | SDK-generated experiment, linked to its dataset | `environment=dev`, `source=experiment`, suite, revision and dataset version |

The local ignored `.env.local` and the example file select `lifting-app-dev`. Set
`LANGSMITH_WORKSPACE_ID` explicitly when needed so CLI and SDK use the same workspace.
Production and Preview now have separate Vercel variable entries. The production value
remains `lifting-app`; changed Preview settings take effect on the next deployment.
Restart an already-running local server after changing its environment.

`enableLangSmithTracing()` preserves an explicit project and tracing toggle. With a key
and no project, its fallback is `lifting-app` only when `VERCEL_ENV=production`, otherwise
`lifting-app-dev`. `NODE_ENV=production` is not enough: a local production build must not
silently route to production. `agentTraceMetadata()` supplies the common fields; Vercel's
commit SHA takes precedence over optional `LANGSMITH_REVISION_ID` for local revision labels.
Application chat never runs Git to discover its revision.

## Datasets and experiments

Keep these regression datasets under Application `lifting-app`, Environment `dev`:

- `ai-coach-live`: existing development-ledger exercise-review scenarios.
- `lifting-app-weekly-coach-v1`: fixed synthetic weekly narration scenarios. The JSON,
  remote ID and verified immutable version are persisted in `src/lib/agent/evals/datasets/`.

The 15 existing `ai-coach-live` experiments are grouped with those resources. Their answers,
feedback and dataset versions were not changed. The user ran weekly experiment
`weekly-coach-4429b245`; its [investigation](WEEKLY-COACH-EVAL-REVIEW.md) preserves the original
answers and feedback. All ten answers were judged; the original local archive was empty.

Both eval runners pass an `ExperimentClient` to LangSmith `evaluate()`. The SDK creates an
independent experiment project with its dataset reference; the client adds Application and
Environment resource tags at creation. Runs remain inside that native experiment tree.
Neither runner overrides `LANGSMITH_PROJECT` with a suite-specific project name. The ordinary
app-trace project remains configured for any calls outside an experiment context.

Experiments record the suite, agent/judge models, code SHA/dirty state and dataset version.
Weekly runs additionally record fixture/prompt/tool hashes. Both runners read the SDK
materialized `results.results` array for reporting. Jev requests create a `Jev judge` LLM trace,
linked through evaluator feedback. Weekly rubric `weekly-judge-v3` asks just two questions,
`grounded` and `complete`, in one request. These are the only feedback columns, storing raw
0–1 scores; both must reach 0.7 for the local case to pass. Grounding also checks substantive
Coach boundaries, recorded in judgeGuidelines metadata. The rubric accepts reasonable inference
and only material omissions; local human labels remain outside judge inputs. Prior results remain
unchanged. Judge tracing was absent from the user-run v1 baseline. Dataset synchronization, paid
execution and production tracing remain separate operations. No automatic online evaluator
or scheduled paid experiment is enabled by this setup.

## Verify routing without model calls

```bash
npm run check:langsmith
```

This loads local configuration, requires `lifting-app-dev`, emits one synthetic chain trace,
flushes it, then reads it back and checks the owning project. It makes no model calls or
training-data reads. A short bounded read retry handles ingestion visibility. It prints the
trace URL and non-secret metadata. This command is explicit; it is not part of tests/hooks.

On 2026-10-21, the remote grouping, Vercel Production/Preview values and a synthetic local
trace were verified. This is configuration/routing evidence, not a paid narration baseline
or an authenticated production chat test.

See [AI Coach](AI-COACH.md#evals), the [weekly lab](weekly-coach-evals.html),
[LangSmith project routing](https://docs.langchain.com/langsmith/log-traces-to-project), and
[resource organization](https://docs.langchain.com/langsmith/administration-overview).
