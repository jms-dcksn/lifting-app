import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { durableChat } from "./durable-chat";
import { readSseEvents } from "./stream";
import type { TurnRequest } from "./chat-state";

const mocks = vi.hoisted(() => ({ store: vi.fn(), execute: vi.fn(), tools: vi.fn() }));
vi.mock("./durable-store", async importOriginal => ({ ...await importOriginal<typeof import("./durable-store")>(), configuredDurableStore: mocks.store }));
vi.mock("./durable-runtime", async importOriginal => ({ ...await importOriginal<typeof import("./durable-runtime")>(), executeDurableTurn: mocks.execute }));
vi.mock("./tools", () => ({ bindAgentTools: mocks.tools }));
vi.mock("./context", async importOriginal => ({ ...await importOriginal<typeof import("./context")>(), enrichScreenContext: async (_client: unknown, _owner: unknown, context: unknown) => context }));
vi.mock("@/lib/coach-conversation-data", () => ({ episodeContextForThread: async () => null }));

const owner = "10000000-0000-4000-8000-000000000001";
const threadId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const turnRequest: TurnRequest = { kind: "continue", threadId: threadId as never, text: "Question",
  context: { pathname: "/coach", activeProgramId: null, focusedExerciseId: null, openSessionId: null } };
const userMessage = { id: "input", role: "user", parts: [{ type: "text", text: "Question" }], createdAt: new Date().toISOString() };
const rpc = vi.fn();
const client = { rpc };
const post = (body: unknown = { requestId }) => durableChat.post({ supabase: client as never, owner,
  request: new Request("http://localhost/api/agent/chat", { method: "POST" }), turnRequest, body });

beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: null, error: null }); mocks.tools.mockReturnValue([]); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("durable chat rollout and transport", () => {
  it("keeps untouched threads on legacy with switch off, and never falls back for a checkpoint-backed thread", async () => {
    vi.stubEnv("COACH_RUNTIME_ENABLED", "0");
    expect(await post()).toBeNull();
    rpc.mockResolvedValue({ data: "coach-deep-v1", error: null });
    expect((await post())?.status).toBe(409);
    expect(mocks.store).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: "outage" } });
    expect((await post())?.status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("requires stable request identity before admission", async () => {
    vi.stubEnv("COACH_RUNTIME_ENABLED", "1");
    expect((await post({}))?.status).toBe(400);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it("logs the safe database error code while keeping credentials out of logs and responses", async () => {
    vi.stubEnv("COACH_RUNTIME_ENABLED", "1");
    const secret = "postgresql://runtime:secret-password@private-host/postgres";
    const error = Object.assign(new Error(`authentication failed: ${secret}`), { code: "28P01" });
    mocks.store.mockReturnValue({ admit: vi.fn().mockRejectedValue(error) });
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await post();
      expect(response?.status).toBe(503);
      expect(logger).toHaveBeenCalledWith("Coach persistence failed", { stage: "admission", code: "28P01" });
      expect(JSON.stringify(logger.mock.calls)).not.toContain("secret-password");
      expect(await response?.text()).not.toContain("secret-password");
    } finally { logger.mockRestore(); }
  });

  it("returns a completed duplicate without generation or client action replay", async () => {
    vi.stubEnv("COACH_RUNTIME_ENABLED", "1");
    const admission = { execute: false, turn: { request_id: requestId, status: "completed" },
      thread: { id: threadId, title: "Question", updatedAt: userMessage.createdAt }, userMessage, history: [userMessage] };
    const admit = vi.fn().mockResolvedValue(admission);
    mocks.store.mockReturnValue({ admit, status: vi.fn().mockResolvedValue(admission.turn) });
    const response = await post();
    const events = [];
    for await (const event of readSseEvents(response!.body!)) events.push(event);
    expect(events.map(event => event.type)).toEqual(["thread", "runtime", "done"]);
    expect(events.at(-1)).toMatchObject({ replayed: true });
    expect(admit).toHaveBeenCalledWith(owner, expect.objectContaining({ requestId }));
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.tools).not.toHaveBeenCalled();
  });
  it("aborts execution and records interruption when the response stream is cancelled", async () => {
    vi.stubEnv("COACH_RUNTIME_ENABLED", "1");
    const interrupt = vi.fn().mockResolvedValue(undefined);
    const admission = { execute: true, recovered: false, scope: { owner, thread: threadId, epoch: 1 },
      turn: { request_id: requestId, status: "running" }, thread: { id: threadId, title: "Question", updatedAt: userMessage.createdAt }, userMessage, history: [userMessage] };
    mocks.store.mockReturnValue({ admit: vi.fn().mockResolvedValue(admission), interrupt });
    let signal: AbortSignal | undefined;
    mocks.execute.mockImplementation(async input => {
      signal = input.signal;
      await new Promise((_, reject) => { input.signal.addEventListener("abort", () => reject(Error("aborted")), { once: true }); });
    });
    const response = await post();
    await vi.waitFor(() => expect(signal).toBeDefined());
    await response!.body!.cancel();
    await vi.waitFor(() => expect(interrupt).toHaveBeenCalledWith(admission.scope, requestId));
    expect(signal?.aborted).toBe(true);
    expect(mocks.tools).toHaveBeenCalledWith(client, owner, expect.objectContaining({ recoveryOnly: false }));
  });
});
