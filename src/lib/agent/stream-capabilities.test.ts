import { describe, expect, it, vi } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { runAgentTurn } from "./run";
import type { AgentStreamEvent } from "./stream";

// Sanitized provider-shaped fixtures; no credentials or network requests.
function fixtureModel(delta: Record<string, unknown>, modelId = "openai/gpt-5.4") {
  const chunks = [
    { delta: { role: "assistant", ...delta }, finish_reason: null },
    { delta: { content: "Three sessions completed." }, finish_reason: null },
    { delta: {}, finish_reason: "stop" },
  ].map((choice) => ({
    id: "fixture", object: "chat.completion.chunk", created: 0, model: modelId,
    choices: [{ index: 0, ...choice }],
  }));
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  ));
  const model = new ChatOpenAI({
    model: modelId, apiKey: "fixture-only", maxRetries: 0,
    configuration: { baseURL: "https://fixture.invalid/v1", fetch },
  });
  return { model, fetch };
}

describe("installed Gateway-compatible streaming adapter", () => {
  it.each([
    ["reasoning", "openai/gpt-5.4"],
    ["reasoning_content", "deepseek/deepseek-v4.1-flash"],
  ])("projects plain %s into v3 message reasoning (%s fixture)", async (field, modelId) => {
    const { model, fetch } = fixtureModel({ [field]: "Inspect the weekly report." }, modelId);
    const agent = createAgent({ model, tools: [] });
    const run = await agent.streamEvents({ messages: [{ role: "user", content: "How was my week?" }] }, { version: "v3" });
    const observed: Array<{ text: string; reasoning: string }> = [];
    for await (const message of run.messages) {
      const text: string[] = [];
      const reasoning: string[] = [];
      await Promise.all([
        (async () => { for await (const token of message.text) text.push(token); })(),
        (async () => { for await (const token of message.reasoning) reasoning.push(token); })(),
      ]);
      observed.push({ text: text.join(""), reasoning: reasoning.join("") });
    }
    await run.output;
    expect(observed).toEqual([{ text: "Three sessions completed.", reasoning: "Inspect the weekly report." }]);
    expect(fetch.mock.calls[0]?.[0]?.toString()).toBe("https://fixture.invalid/v1/chat/completions");
  });

  it("does not project reasoning_details-only summaries through this adapter", async () => {
    const { model } = fixtureModel({ reasoning_details: [{ type: "reasoning.summary", summary: "Inspect the weekly report." }] });
    const stream = model.streamEvents("How was my week?");
    const reasoning: string[] = [];
    for await (const token of stream.reasoning) reasoning.push(token);
    await stream;
    expect(reasoning).toEqual([]);
  });

  it("keeps reasoning out of the application's answer events", async () => {
    const { model } = fixtureModel({ reasoning: "Inspect the weekly report." });
    const events: AgentStreamEvent[] = [];
    await runAgentTurn({
      persisted: [], threadId: "fixture", tools: [], model,
      onEvent: (event) => events.push(event),
    });
    expect(events).toEqual([{ type: "text", text: "Three sessions completed." }]);
  });
});
