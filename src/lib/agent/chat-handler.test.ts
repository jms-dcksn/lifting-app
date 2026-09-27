import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentChatHandlers } from "./chat-handler";
import type { AgentChatSnapshot } from "./chat-state";
import type { runAgentTurn } from "./run";
import { readSseEvents, type AgentStreamEvent } from "./stream";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const ownThread = "0199a3b2-0000-7000-8000-000000000001";
const otherThread = "0199a3b2-0000-7000-8000-000000000002";
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Row = Record<string, unknown>;
type Failure = { message: string; code: string };

/** Enough of the Supabase query builder for thread.ts, with the table constraints the migration adds. */
function memoryStore(options: { failMessageInsert?: boolean } = {}) {
  const tables: Record<string, Row[]> = { agent_thread: [], agent_message: [] };
  let clock = Date.parse("2026-09-27T12:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();

  function insertRow(table: string, row: Row): Row | Failure {
    if (table === "agent_thread") {
      if (!row.id) return { code: "23502", message: "null value in column \"id\"" };
      const saved = { created_at: tick(), updated_at: tick(), ...row };
      tables.agent_thread.push(saved);
      return saved;
    }
    if (options.failMessageInsert) return { code: "XX000", message: "message insert failed" };
    const owned = tables.agent_thread.some((thread) => thread.id === row.thread_id && thread.user_id === row.user_id);
    if (!owned) return { code: "23503", message: "violates foreign key constraint \"agent_message_thread_owner_fkey\"" };
    const saved = { id: crypto.randomUUID(), created_at: tick(), ...row };
    tables.agent_message.push(saved);
    return saved;
  }

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let action: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } =
      { kind: "select" };
    let columns: string[] | null = null;
    let sort: { column: string; ascending: boolean } | null = null;
    let limit = Number.POSITIVE_INFINITY;

    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);
    const pick = (row: Row) => (columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : row);

    function run(): { data: Row[] | null; error: Failure | null } {
      if (action.kind === "insert") {
        const saved = insertRow(table, action.row);
        if ("code" in saved) return { data: null, error: saved as Failure };
        return { data: [pick(saved)], error: null };
      }
      if (action.kind === "update") {
        const patch = action.patch;
        tables[table].filter(matches).forEach((row) => Object.assign(row, patch));
        return { data: null, error: null };
      }
      if (action.kind === "delete") {
        const removed = new Set(tables[table].filter(matches).map((row) => row.id));
        tables[table] = tables[table].filter((row) => !removed.has(row.id));
        if (table === "agent_thread") {
          tables.agent_message = tables.agent_message.filter((row) => !removed.has(row.thread_id));
        }
        return { data: null, error: null };
      }
      const rows = tables[table].filter(matches);
      if (sort) {
        const { column, ascending } = sort;
        rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
      }
      return { data: rows.slice(0, limit).map(pick), error: null };
    }

    const query = {
      select(list: string) {
        columns = list.split(",").map((column) => column.trim());
        return query;
      },
      insert(row: Row) {
        action = { kind: "insert", row };
        return query;
      },
      update(patch: Row) {
        action = { kind: "update", patch };
        return query;
      },
      delete() {
        action = { kind: "delete" };
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      order(column: string, { ascending }: { ascending: boolean }) {
        sort = { column, ascending };
        return query;
      },
      limit(count: number) {
        limit = count;
        return query;
      },
      async single() {
        const { data, error } = run();
        return error ? { data: null, error } : { data: data?.[0] ?? null, error: data?.[0] ? null : { code: "PGRST116", message: "no rows" } };
      },
      async maybeSingle() {
        const { data, error } = run();
        return { data: data?.[0] ?? null, error };
      },
      then(onFulfilled: (value: ReturnType<typeof run>) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  function seedThread(id: string, owner: string, title: string, texts: string[]) {
    tables.agent_thread.push({ id, user_id: owner, title, created_at: tick(), updated_at: tick() });
    for (const text of texts) {
      tables.agent_message.push({
        id: crypto.randomUUID(),
        thread_id: id,
        user_id: owner,
        role: "user",
        parts: [{ type: "text", text }],
        created_at: tick(),
      });
    }
  }

  return { tables, seedThread, supabase: { from } as never };
}

const reply = [{ role: "assistant" as const, parts: [{ type: "text" as const, text: "3/4 from weeklyCoach." }] }];

function setup(options?: { failMessageInsert?: boolean }) {
  const store = memoryStore(options);
  store.seedThread(ownThread, userId, "Earlier chat", ["earlier question"]);
  store.seedThread(otherThread, otherUserId, "Secret", ["secret question"]);
  const runTurn = vi.fn<typeof runAgentTurn>(async () => reply);
  const handlers = createAgentChatHandlers({ auth: async () => ({ supabase: store.supabase, userId }), runTurn });
  return { store, runTurn, ...handlers };
}

function post(body: unknown) {
  return new Request("https://example.test/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function events(response: Response) {
  const out: AgentStreamEvent[] = [];
  for await (const event of readSseEvents(response.body!)) out.push(event);
  return out;
}

function rowCounts(tables: Record<string, Row[]>) {
  return { threads: tables.agent_thread.length, messages: tables.agent_message.length };
}

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("agent chat POST", () => {
  it("rejects an unauthenticated request before tools run", async () => {
    const runTurn = vi.fn<typeof runAgentTurn>();
    const { POST } = createAgentChatHandlers({
      auth: async () => ({ supabase: {} as never, userId: null }),
      runTurn,
    });
    const response = await POST(post({ text: "how was this week?", threadId: null }));
    expect(response.status).toBe(401);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("rejects a body that does not name its thread, and writes nothing", async () => {
    const { POST, runTurn, store } = setup();
    const responses = await Promise.all([
      POST(post({ text: "how was this week?" })),
      POST(post({ text: "how was this week?", threadId: "not-a-uuid" })),
      POST(post({ text: "   ", threadId: null })),
    ]);
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(runTurn).not.toHaveBeenCalled();
    expect(rowCounts(store.tables)).toEqual({ threads: 2, messages: 2 });
  });

  it("answers 503 before any insert when the gateway key is missing", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const { POST, store } = setup();
    const response = await POST(post({ text: "how was this week?", threadId: null }));
    expect(response.status).toBe(503);
    expect(rowCounts(store.tables)).toEqual({ threads: 2, messages: 2 });
  });

  it("starts a thread for threadId null and streams the thread event before done", async () => {
    const { POST, runTurn, store } = setup();
    const response = await POST(post({ text: "  How was\n this week?  ", threadId: null }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const streamed = await events(response);

    const created = store.tables.agent_thread.find((thread) => thread.id !== ownThread && thread.id !== otherThread);
    expect(created).toMatchObject({ user_id: userId, title: "How was this week?" });
    expect(String(created?.id)).toMatch(UUID_V7);
    expect(streamed.map((event) => event.type)).toEqual(["thread", "done"]);
    expect(streamed[0]).toMatchObject({
      type: "thread",
      thread: { id: created?.id, title: "How was this week?" },
      userMessage: { role: "user", parts: [{ type: "text", text: "How was\n this week?" }] },
    });
    expect(runTurn.mock.calls[0]?.[0]).toMatchObject({
      threadId: created?.id,
      persisted: [{ role: "user", parts: [{ type: "text", text: "How was\n this week?" }] }],
    });
    expect(store.tables.agent_message.filter((row) => row.thread_id === created?.id).map((row) => row.role))
      .toEqual(["user", "assistant"]);
    const done = streamed[1];
    expect(done.type === "done" ? done.messages.map((message) => message.parts) : null).toEqual([
      [{ type: "text", text: "How was\n this week?" }],
      [{ type: "text", text: "3/4 from weeklyCoach." }],
    ]);
  });

  it("continues an owned thread with its earlier messages in the transcript", async () => {
    const { POST, runTurn, store } = setup();
    const streamed = await events(await POST(post({ text: "and my squat?", threadId: ownThread.toUpperCase() })));
    expect(streamed[0]).toMatchObject({ type: "thread", thread: { id: ownThread, title: "Earlier chat" } });
    expect(runTurn.mock.calls[0]?.[0].threadId).toBe(ownThread);
    expect(runTurn.mock.calls[0]?.[0].persisted.map((message) => message.parts)).toEqual([
      [{ type: "text", text: "earlier question" }],
      [{ type: "text", text: "and my squat?" }],
    ]);
    const thread = store.tables.agent_thread.find((row) => row.id === ownThread);
    const last = store.tables.agent_message.at(-1);
    expect(thread?.updated_at).toBe(last?.created_at);
  });

  it("answers 404 for another user's thread without running the agent or writing", async () => {
    const { POST, runTurn, store } = setup();
    const response = await POST(post({ text: "let me in", threadId: otherThread }));
    expect(response.status).toBe(404);
    expect(runTurn).not.toHaveBeenCalled();
    expect(rowCounts(store.tables)).toEqual({ threads: 2, messages: 2 });
  });

  it("removes the new thread when its first message cannot be saved", async () => {
    const { POST, store } = setup({ failMessageInsert: true });
    await expect(POST(post({ text: "how was this week?", threadId: null }))).rejects.toThrow("message insert failed");
    expect(store.tables.agent_thread.map((thread) => thread.id)).toEqual([ownThread, otherThread]);
  });
});

describe("agent chat GET", () => {
  it("reads latest, a draft, or one owned thread, and never writes", async () => {
    const { GET, store } = setup();
    const get = (query: string) => GET(new Request(`https://example.test/api/agent/chat${query}`));

    const latest = (await (await get("")).json()) as AgentChatSnapshot;
    expect(latest).toMatchObject({
      threads: [{ id: ownThread, title: "Earlier chat" }],
      open: { kind: "saved", threadId: ownThread, title: "Earlier chat" },
    });
    expect(latest.open.kind === "saved" ? latest.open.messages.map((message) => message.parts) : null)
      .toEqual([[{ type: "text", text: "earlier question" }]]);

    const draft = (await (await get("?thread=new")).json()) as AgentChatSnapshot;
    expect(draft.open).toEqual({ kind: "draft" });
    expect(draft.threads.map((thread) => thread.id)).toEqual([ownThread]);

    const statuses = await Promise.all([get(`?thread=${ownThread}`), get(`?thread=${otherThread}`), get("?thread=nope")])
      .then((responses) => responses.map((response) => response.status));
    expect(statuses).toEqual([200, 404, 400]);
    expect(rowCounts(store.tables)).toEqual({ threads: 2, messages: 2 });
  });
});
