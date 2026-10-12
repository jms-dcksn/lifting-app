# Coach streaming capability review — #203

Decision, 2026-10-12: **keep LangChain + Vercel AI Gateway** for immediate dots and
execution progress. Plain reasoning can reach the installed adapter, so a provider
migration is not justified. Reasoning UI remains optional and unshipped.

## Evidence and configuration

- Installed: `langchain` 1.5.11, `@langchain/openai` 1.5.13,
  `@langchain/core` 1.2.12, `@langchain/langgraph` 1.4.16.
- `createGatewayModel()` uses Gateway's OpenAI-compatible `/v1` base URL;
  `ChatOpenAI` defaults to Chat Completions here. Policy default: `openai/gpt-5.4`.
  The local `.env.local` override inspected this session is
  `deepseek/deepseek-v4.1-flash`. Both IDs occur in the public
  [Gateway model catalog](https://ai-gateway.vercel.sh/v1/models), fetched 2026-10-12,
  with reasoning/tool-use support. Catalog tags do not prove readable output.
  Deployed overrides and actual serving provider were not inspected.
- `stream-capabilities.test.ts` injects sanitized Chat Completions SSE through the
  real `ChatOpenAI` fetch seam and LangChain v3 agent. Fixtures bearing the default
  and local model IDs establish adapter behavior, not those providers' live behavior.
  Plain `delta.reasoning` / `delta.reasoning_content` reaches `message.reasoning`;
  `reasoning_details`-only summaries do not. `runAgentTurn` consumes only `message.text`.
- The converter in
  `node_modules/@langchain/core/dist/language_models/openai_completions_stream.js`
  reads `delta.reasoning_content ?? delta.reasoning`. This native content-block
  path differs from the older chunk converter in `@langchain/openai`.
- LangChain's `run.toolCalls` can appear when a model finishes tool arguments,
  before execution. Its output promises can reject. Progress now uses the raw v3
  tools channel: `tool-started`, `tool-finished`, `tool-error`. Scripted real-agent
  tests prove concurrent same-name execution and failure outcomes without a model call.
- No paid request, production trace inspection, live latency/cost benchmark, or
  provider comparison ran. No reasoning is exposed to the UI.

## Capability matrix

Observed means installed code or a deterministic fixture/test. Documented alternatives
are candidates, not end-to-end verification.

| Capability | Existing Gateway + ChatOpenAI | Gateway Responses / AI SDK | Direct provider / other gateway |
| --- | --- | --- | --- |
| Answer tokens | Observed through adapter fixture, SSE and UI tests | Documented streaming; adapter migration unnecessary for current UX | No measured advantage |
| Reasoning | Plain fields reach v3; application omits them. Structured-only summary fixture is lost | Responses documents OpenAI summaries; `useResponsesApi` exists. AI SDK documents separate reasoning events | Live output still model/provider-dependent |
| Tool arguments vs execution | v3 projections can precede execution; UI now uses actual tools events, IDs and outcomes | AI SDK has separate input/output lifecycle; domain tools would need adapter work | Must preserve the same execution distinction |
| Tool failure | Observed `tool-error`; SSE includes only ID/outcome. Returned domain errors are not inferred as exceptions | Documented error events; unverified with our domain tools | No advantage established |
| Cancellation | LangGraph exposes `run.abort()`/signal. App has no stop button or request-to-run abort wiring; disconnect clears client activity | SDK abort APIs exist; complete app wiring still required | Migration alone does not fix app cancellation |
| Usage / finish | Installed v3 messages expose usage; app SSE does not forward it | Documented API/SDK metadata; requires mapping | Unmeasured |
| Latency / cost | No live benchmark; this slice adds no model calls or reasoning request | No comparative measurement; summaries may change usage | No evidence to justify routing change |
| Tracing | Existing LangSmith callbacks/`thread_id` retained; scripted test proves propagation | Responses can retain LangChain; AI SDK would need tracing/tool integration verification | Existing trace correlation must be preserved |
| Routing / fallbacks | Gateway endpoint retained; no new routing/fallback configuration | Same Gateway routing can remain | New credentials/routing/failure behavior to validate |
| Migration effort | Small event/reducer/UI change, no new runtime dependency | Responses is the narrower next probe; AI SDK means broader runtime/stream adaptation | Highest change surface with no demonstrated benefit |

## Sources checked

- [Gateway Chat Completions reasoning](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/reasoning): provider-dependent plain reasoning and structured details.
- [Gateway Responses](https://vercel.com/docs/ai-gateway/sdks-and-apis/responses): reasoning summary options.
- [LangChain ChatOpenAI](https://docs.langchain.com/oss/javascript/integrations/chat/openai): `useResponsesApi`.
- [AI SDK stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol): distinct reasoning and tool events.

## Next reasoning decision

If readable summaries become a product requirement, first approve a bounded live probe
for the configured model on the current Gateway path, using sanitized inputs and an
explicit cost limit. Inspect plain fields versus structured summaries and compare
same-Gateway Responses before considering AI SDK or a different provider. Record actual
usage, latency, tracing, cancellation and failure behavior. A paid probe or migration
still needs its own Decision Card; #203 does not authorize it.

## Delivery verification

- Full suite: 877 passed, one gated live test skipped. Lint passed with the existing
  `board.ts` unused-variable warning; typecheck and production build passed.
- Browser: actual `AgentChat`, `AgentTranscript`, `Sheet` and compiled app CSS in an
  ephemeral local fixture with controlled SSE. At 390 × 844, both page and sheet
  showed immediate dots, tool progress and one reply bubble; the sheet recovered
  from a dropped stream and accepted another send. No horizontal overflow or
  browser console errors. No authenticated hosted/model turn was run.
- Accessibility: stable polite status/atomic semantics and omission of token/frame
  announcements checked in DOM tests and browser accessibility state. Compiled
  reduced-motion CSS disables dot animation; the OS preference and a physical
  screen reader were not toggled/run. Scrolling away from the end preserves position
  in the component test; browser confirmed following at the end.
