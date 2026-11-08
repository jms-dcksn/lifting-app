import { describe, expect, it } from "vitest";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { bootstrapMessages, projectionMessages, stableUuid } from "./durable-messages";
import type { AgentMessage } from "./messages";
import { JsonPlusSerializer } from "@langchain/langgraph-checkpoint";

describe("durable conversation identities", () => {
  const user: AgentMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Unanswered question" }], createdAt: new Date().toISOString() };
  it("imports unanswered history with stable IDs and closes incomplete tool calls without executing them", () => {
    const pending: AgentMessage = { ...user, id: crypto.randomUUID(), role: "assistant", parts: [{ type: "tool-call", id: "lost", name: "draftProgramFromIntake", args: {} }] };
    const first = bootstrapMessages([pending, user]);
    const second = bootstrapMessages([pending, user]);
    expect(first.map(m => m.id)).toEqual(second.map(m => m.id));
    expect(first.at(-1)?.id).toBe(`ui:${user.id}`);
    expect(ToolMessage.isInstance(first[1])).toBe(true);
    expect(JSON.stringify(first[1].content)).toContain("unavailable");
  });
  it("projects native messages idempotently and hides imported history and internal context", () => {
    const output = [
      ...bootstrapMessages([user]),
      new HumanMessage({ id: "summary", content: "Internal", additional_kwargs: { lc_source: "summarization" } }),
      new AIMessage({ id: "answer", content: "Saved answer" }),
      new ToolMessage({ id: "tool", content: '{"action":"confirm"}', tool_call_id: "c1", name: "startNextWorkout" }),
    ];
    const first = projectionMessages("thread", output);
    expect(first.map(m => m.role)).toEqual(["assistant", "tool"]);
    expect(first).toEqual(projectionMessages("thread", output));
    expect(stableUuid("one")).not.toBe(stableUuid("two"));
    expect(stableUuid("one")).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("retains historical identities through the native checkpoint serializer", async () => {
    const serde = new JsonPlusSerializer();
    const messages = bootstrapMessages([user]);
    const [type, bytes] = await serde.dumpsTyped(messages);
    const restored = await serde.loadsTyped(type, bytes);
    expect(restored[0].id).toBe(`ui:${user.id}`);
  });
});
