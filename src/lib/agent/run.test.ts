import { describe, expect, it } from "vitest";
import { tool } from "langchain";
import { z } from "zod";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { runAgentTurn } from "./run";
import type { AgentStreamEvent } from "./stream";

const THREAD_ID = "0199a3b2-5c1e-7d4a-9f00-000000000001";

class ScriptedChatModel extends BaseChatModel {
  replies: AIMessage[];

  constructor(replies: AIMessage[]) {
    super({});
    this.replies = replies;
  }

  _llmType() {
    return "scripted";
  }

  bindTools() {
    return this;
  }

  async _generate(): Promise<ChatResult> {
    const message = this.replies.shift();
    if (!message) throw new Error("The script ran out of replies");
    return { generations: [{ text: "", message }] };
  }
}

function recordStartMetadata() {
  const starts: string[] = [];
  const record = (kind: string, metadata?: Record<string, unknown>) => {
    starts.push(`${kind}:${String(metadata?.thread_id)}`);
  };
  const handler = {
    handleChainStart(...args: unknown[]) {
      record("chain", args[5] as Record<string, unknown> | undefined);
    },
    handleChatModelStart(...args: unknown[]) {
      record("model", args[6] as Record<string, unknown> | undefined);
    },
    handleToolStart(...args: unknown[]) {
      record("tool", args[5] as Record<string, unknown> | undefined);
    },
  };
  return { starts, handler };
}

describe("runAgentTurn", () => {
  it("tags every chain, model, and tool run with the conversation's thread id", async () => {
    const { starts, handler } = recordStartMetadata();
    const events: AgentStreamEvent[] = [];
    const echo = tool(async () => "ok", {
      name: "echo",
      description: "Returns ok.",
      schema: z.object({}),
    });

    const generated = await runAgentTurn({
      persisted: [{
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "How was my week?" }],
        createdAt: "2026-09-27T12:00:00.000Z",
      }],
      threadId: THREAD_ID,
      tools: [echo],
      model: new ScriptedChatModel([
        new AIMessage({ content: "", tool_calls: [{ id: "call-1", name: "echo", args: {}, type: "tool_call" }] }),
        new AIMessage("All set."),
      ]),
      callbacks: [handler],
      onEvent: (event) => events.push(event),
    });
    await awaitAllCallbacks();

    expect(generated).toEqual([
      { role: "assistant", parts: [{ type: "tool-call", id: "call-1", name: "echo", args: {} }] },
      { role: "tool", parts: [{ type: "tool-result", id: "call-1", name: "echo", result: "ok" }] },
      { role: "assistant", parts: [{ type: "text", text: "All set." }] },
    ]);
    expect(events.filter((event) => event.type !== "text")).toEqual([
      { type: "tool-start", name: "echo", callId: "call-1" },
      { type: "tool-end", callId: "call-1", outcome: "complete" },
    ]);
    expect(new Set(starts)).toEqual(new Set([
      `chain:${THREAD_ID}`,
      `model:${THREAD_ID}`,
      `tool:${THREAD_ID}`,
    ]));
  });
  it("streams overlapping executions before either output and closes each by call id", async () => {
    const events: AgentStreamEvent[] = [];
    const releases: Array<() => void> = [];
    let bothStarted!: () => void;
    const started = new Promise<void>((resolve) => { bothStarted = resolve; });
    const lookup = tool(async () => {
      await new Promise<void>((resolve) => {
        releases.push(resolve);
        if (releases.length === 2) bothStarted();
      });
      return "ok";
    }, { name: "lookup", description: "Read data.", schema: z.object({}) });
    const turn = runAgentTurn({
      persisted: [], threadId: THREAD_ID, tools: [lookup],
      model: new ScriptedChatModel([
        new AIMessage({ content: "", tool_calls: [
          { id: "a", name: "lookup", args: {}, type: "tool_call" },
          { id: "b", name: "lookup", args: {}, type: "tool_call" },
        ] }),
        new AIMessage("Done."),
      ]),
      onEvent: (event) => events.push(event),
    });
    await started;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const beforeOutputs = [...events];
    releases[1]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterSecond = [...events];
    releases[0]();
    await turn;
    expect(beforeOutputs).toEqual([
      { type: "tool-start", name: "lookup", callId: "a" },
      { type: "tool-start", name: "lookup", callId: "b" },
    ]);
    expect(afterSecond).toContainEqual({ type: "tool-end", callId: "b", outcome: "complete" });
    expect(afterSecond).not.toContainEqual({ type: "tool-end", callId: "a", outcome: "complete" });
    expect(events).toContainEqual({ type: "tool-end", callId: "a", outcome: "complete" });
  });

  it("reports execution failure without leaking tool errors or arguments", async () => {
    const events: AgentStreamEvent[] = [];
    const broken = tool(async () => { throw new Error("private database detail"); }, {
      name: "broken", description: "Fails.", schema: z.object({}),
    });
    await runAgentTurn({
      persisted: [], threadId: THREAD_ID, tools: [broken],
      model: new ScriptedChatModel([
        new AIMessage({ content: "", tool_calls: [{ id: "bad", name: "broken", args: {}, type: "tool_call" }] }),
        new AIMessage("Could not read data."),
      ]),
      onEvent: (event) => events.push(event),
    }).catch(() => {});
    expect(events).toContainEqual({ type: "tool-start", name: "broken", callId: "bad" });
    expect(events).toContainEqual({ type: "tool-end", callId: "bad", outcome: "error" });
    expect(JSON.stringify(events)).not.toContain("private database detail");
  });

});
