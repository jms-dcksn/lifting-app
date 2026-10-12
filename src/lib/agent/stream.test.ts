import { describe, expect, it } from "vitest";
import { encodeSse, readSseEvents, type AgentStreamEvent } from "./stream";

describe("agent SSE", () => {
  it("preserves overlapping call IDs and failure outcomes across fragmented UTF-8 chunks", async () => {
    const events: AgentStreamEvent[] = [
      { type: "tool-start", callId: "a", name: "exerciseReview" },
      { type: "tool-start", callId: "b", name: "exerciseReview" },
      { type: "tool-end", callId: "b", outcome: "error" },
      { type: "text", text: "Bench improved — keep going." },
      { type: "tool-end", callId: "a", outcome: "complete" },
      { type: "done", messages: [] },
    ];
    const bytes = new TextEncoder().encode(events.map(encodeSse).join(""));
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } });
    const actual: AgentStreamEvent[] = [];
    for await (const event of readSseEvents(body)) actual.push(event);
    expect(actual).toEqual(events);
  });

  it("propagates an interrupted body to the client's connection-error path", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.error(new Error("Disconnected"));
    } });
    const consume = async () => { for await (const event of readSseEvents(body)) void event; };
    await expect(consume()).rejects.toThrow("Disconnected");
  });
});
