import { describe, expect, it, vi } from "vitest";
import { createTurnBudget } from "./turn-budget";

const request = { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }], stream: true }) };

describe("shared provider budget", () => {
  it("reconciles usage across split SSE frames without changing the streamed bytes", async () => {
    const wire = 'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\ndata: [DONE]\n\n';
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(wire.slice(0, 15)));
      controller.enqueue(new TextEncoder().encode(wire.slice(15)));
      controller.close();
    } })));
    const budget = createTurnBudget({ fetch });
    expect(await (await budget.fetch("https://fixture.invalid", request)).text()).toBe(wire);
    expect(budget.usage()).toEqual({ calls: 1, summaries: 0, inputTokens: 10, outputTokens: 5 });
  });

  it("retains reservations without usage and blocks a subsequent unmetered request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("data: [DONE]\n\n"));
    const budget = createTurnBudget({ fetch });
    await (await budget.fetch("https://fixture.invalid", request)).text();
    expect(budget.usage().outputTokens).toBe(4000);
    await expect(budget.fetch("https://fixture.invalid", request)).rejects.toThrow(/budget/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects reported token overruns instead of allowing more requests", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ usage: { prompt_tokens: 25_000, completion_tokens: 1 } }));
    const budget = createTurnBudget({ fetch });
    const nonStreaming = { ...request, body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) };
    await expect(budget.fetch("https://fixture.invalid", nonStreaming)).rejects.toThrow(/token budget exceeded/);
    await expect(budget.fetch("https://fixture.invalid", nonStreaming)).rejects.toThrow(/budget/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
