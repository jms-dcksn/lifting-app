import { describe, expect, it } from "vitest";
import {
  canNavigate,
  chatReducer,
  fullScreenHref,
  initialChatState,
  parseChatSelection,
  parseThreadId,
  threadTitleFromUserText,
  transcriptView,
  type ChatAction,
  type ChatState,
  type ThreadId,
} from "./chat-state";
import type { AgentMessage } from "./messages";

const A = "0199a3b2-0000-7000-8000-00000000000a" as ThreadId;
const B = "0199a3b2-0000-7000-8000-00000000000b" as ThreadId;

function message(id: string, role: AgentMessage["role"], text: string): AgentMessage {
  return { id, role, parts: [{ type: "text", text }], createdAt: "2026-09-27T12:00:00.000Z" };
}

function run(state: ChatState, ...actions: ChatAction[]) {
  return actions.reduce(chatReducer, state);
}

function view(state: ChatState) {
  return state.screen.name === "chat" ? transcriptView(state.screen.conversation, state.screen.turn) : null;
}

const earlier = message("m0", "user", "Earlier question");
const summaryA = { id: A, title: "Earlier question", updatedAt: "2026-09-26T09:00:00.000Z" };
const summaryB = { id: B, title: "Deload?", updatedAt: "2026-09-25T09:00:00.000Z" };
const savedA = initialChatState({
  threads: [summaryB, summaryA],
  open: { kind: "saved", threadId: A, title: "Earlier question", messages: [earlier] },
});

describe("thread ids and selections", () => {
  it("accepts a UUID in any case and rejects everything else", () => {
    expect(parseThreadId("0199A3B2-0000-7000-8000-00000000000A")).toBe("0199a3b2-0000-7000-8000-00000000000a");
    expect([parseThreadId("new"), parseThreadId(42), parseThreadId(null)]).toEqual([null, null, null]);
  });

  it("reads ?thread= as latest, new, one thread, or nothing", () => {
    expect(parseChatSelection(null)).toEqual({ kind: "latest" });
    expect(parseChatSelection("new")).toEqual({ kind: "new" });
    expect(parseChatSelection("0199a3b2-0000-7000-8000-00000000000b")).toEqual({
      kind: "thread",
      threadId: "0199a3b2-0000-7000-8000-00000000000b",
    });
    expect(parseChatSelection("latest")).toBeNull();
  });
});

describe("threadTitleFromUserText", () => {
  it("collapses whitespace and keeps the first 80 characters", () => {
    expect(threadTitleFromUserText("  How did\n\n my   bench\tgo?  ")).toBe("How did my bench go?");
    expect(threadTitleFromUserText("x".repeat(100))).toBe("x".repeat(80));
  });

  it("counts an emoji as one character at the cut", () => {
    expect(threadTitleFromUserText(`${"a".repeat(79)}💪tail`)).toBe(`${"a".repeat(79)}💪`);
  });

  it("names a blank message New chat", () => {
    expect(threadTitleFromUserText(" \n\t ")).toBe("New chat");
  });
});

describe("chatReducer", () => {
  it("saves a draft on its first thread event and swaps the pending row for the saved one", () => {
    const user = message("m1", "user", "How was my week?");
    const thread = { id: A, title: "How was my week?", updatedAt: "2026-09-27T12:00:00.000Z" };
    const sending = chatReducer(initialChatState({ threads: [summaryB], open: { kind: "draft" } }), {
      type: "send",
      optimisticId: "local-1",
      text: "How was my week?",
    });
    expect(view(sending)).toEqual({ messages: [], pendingText: "How was my week?", streamingText: "", pendingTool: null });

    const streaming = run(
      sending,
      { type: "event", event: { type: "thread", thread, userMessage: user } },
      { type: "event", event: { type: "text", text: "3/4 " } },
      { type: "event", event: { type: "tool-start", name: "weeklyCoach" } },
    );
    expect(view(streaming)).toEqual({
      messages: [user],
      pendingText: undefined,
      streamingText: "3/4 ",
      pendingTool: "weeklyCoach",
    });
    expect(streaming.threads.map((summary) => summary.id)).toEqual([A, B]);

    const answer = message("m2", "assistant", "3/4 sessions.");
    const done = run(
      streaming,
      { type: "event", event: { type: "tool-end", name: "weeklyCoach" } },
      { type: "event", event: { type: "done", messages: [user, answer] } },
    );
    expect(done.screen).toEqual({
      name: "chat",
      conversation: { kind: "saved", threadId: A, title: "How was my week?", messages: [user, answer] },
      turn: null,
    });
    expect(done.screen.name === "chat" ? fullScreenHref(done.screen.conversation) : null)
      .toBe("/coach?thread=0199a3b2-0000-7000-8000-00000000000a");
  });

  it("moves a continued thread to the top of the list", () => {
    const user = message("m3", "user", "And squat?");
    const bumped = { ...summaryA, updatedAt: "2026-09-27T12:00:00.000Z" };
    const next = run(
      savedA,
      { type: "send", optimisticId: "local-2", text: "And squat?" },
      { type: "event", event: { type: "thread", thread: bumped, userMessage: user } },
    );
    expect(next.threads).toEqual([bumped, summaryB]);
    expect(view(next)?.messages).toEqual([earlier, user]);
  });

  it("holds history, new chat, and row opens until the turn ends", () => {
    const busy = chatReducer(savedA, { type: "send", optimisticId: "local-3", text: "hi" });
    expect([canNavigate(savedA.screen), canNavigate(busy.screen)]).toEqual([true, false]);
    expect(run(busy, { type: "toggle-history" }, { type: "new-chat" }, { type: "open", threadId: B })).toBe(busy);
  });

  it("opens a history row and drops a snapshot for any other thread", () => {
    const history = chatReducer(savedA, { type: "toggle-history" });
    expect(history.screen).toEqual({
      name: "history",
      conversation: { kind: "saved", threadId: A, title: "Earlier question", messages: [earlier] },
      opening: null,
    });
    const opening = chatReducer(history, { type: "open", threadId: B });
    const stale = {
      threads: [summaryA, summaryB],
      open: { kind: "saved" as const, threadId: A, title: "Earlier question", messages: [earlier] },
    };
    expect(chatReducer(opening, { type: "loaded", snapshot: stale })).toBe(opening);

    const deload = message("m4", "user", "Deload?");
    const opened = chatReducer(opening, {
      type: "loaded",
      snapshot: { threads: [summaryA, summaryB], open: { kind: "saved", threadId: B, title: "Deload?", messages: [deload] } },
    });
    expect(opened.screen).toEqual({
      name: "chat",
      conversation: { kind: "saved", threadId: B, title: "Deload?", messages: [deload] },
      turn: null,
    });
  });

  it("starts a new chat as an empty draft that points Full screen at thread=new", () => {
    const fresh = chatReducer(savedA, { type: "new-chat" });
    expect(fresh.screen).toEqual({ name: "chat", conversation: { kind: "draft" }, turn: null });
    expect(fresh.threads).toEqual([summaryB, summaryA]);
    expect(fresh.screen.name === "chat" ? fullScreenHref(fresh.screen.conversation) : null).toBe("/coach?thread=new");
  });

  it("falls back to an empty draft with the error when the first load fails", () => {
    expect(chatReducer(initialChatState(), { type: "failed", error: "Could not load chats." })).toEqual({
      threads: [],
      screen: { name: "chat", conversation: { kind: "draft" }, turn: null },
      error: "Could not load chats.",
    });
  });

  it("ends a dropped turn with the error and no pending row", () => {
    const busy = chatReducer(initialChatState({ threads: [], open: { kind: "draft" } }), {
      type: "send",
      optimisticId: "local-4",
      text: "hi",
    });
    const closed = chatReducer(busy, { type: "closed", error: "Connection lost." });
    expect(closed).toEqual({
      threads: [],
      screen: { name: "chat", conversation: { kind: "draft" }, turn: null },
      error: "Connection lost.",
    });
    expect(chatReducer(closed, { type: "closed", error: "late" })).toBe(closed);
  });

  it("keeps the saved user row when the stream reports an error", () => {
    const user = message("m5", "user", "hi");
    const failed = run(
      chatReducer(savedA, { type: "send", optimisticId: "local-5", text: "hi" }),
      { type: "event", event: { type: "thread", thread: summaryA, userMessage: user } },
      { type: "event", event: { type: "error", message: "Agent failed" } },
    );
    expect(failed.error).toBe("Agent failed");
    expect(view(failed)).toEqual({
      messages: [earlier, user],
      pendingText: undefined,
      streamingText: undefined,
      pendingTool: undefined,
    });
  });
});
