import { describe, expect, it, vi } from "vitest";
import { createAgentChatHandlers } from "./chat-handler";
import type { AgentMessage } from "./messages";

const userId = "11111111-1111-1111-1111-111111111111";

function memoryClient() {
  const messages: AgentMessage[] = [];
  const client = {
    from(table: string) {
      const result = () => {
        if (table === "agent_thread") return { data: { id: "thread-1" }, error: null };
        return {
          data: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            created_at: message.createdAt,
          })),
          error: null,
        };
      };
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        insert(row: { role?: AgentMessage["role"]; parts?: AgentMessage["parts"] }) {
          if (table === "agent_message" && row.role && row.parts) {
            const saved: AgentMessage = {
              id: `m${messages.length + 1}`,
              role: row.role,
              parts: row.parts,
              createdAt: new Date().toISOString(),
            };
            messages.push(saved);
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: saved.id,
                      role: saved.role,
                      parts: saved.parts,
                      created_at: saved.createdAt,
                    },
                    error: null,
                  }),
                };
              },
            };
          }
          return {
            select() {
              return { single: async () => result() };
            },
          };
        },
        update() {
          return query;
        },
        maybeSingle: async () => result(),
        single: async () => result(),
        then(onFulfilled: (value: ReturnType<typeof result>) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(result()).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
  return { messages, supabase: client as never };
}

describe("agent chat route", () => {
  it("rejects an unauthenticated request before tools run", async () => {
    const runTurn = vi.fn();
    const { POST } = createAgentChatHandlers({
      auth: async () => ({ supabase: {} as never, userId: null }),
      runTurn,
    });
    const response = await POST(new Request("https://example.test/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({ text: "how was this week?" }),
    }));
    expect(response.status).toBe(401);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("streams a turn and persists user plus assistant messages", async () => {
    const store = memoryClient();
    const runTurn = vi.fn(async () => [{
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "3/4 from weeklyCoach." }],
    }]);
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    const { POST } = createAgentChatHandlers({
      auth: async () => ({ supabase: store.supabase, userId }),
      runTurn,
    });
    const response = await POST(new Request("https://example.test/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "how was this week?" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("\"type\":\"done\"");
    expect(runTurn).toHaveBeenCalledOnce();
    expect(store.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    vi.unstubAllEnvs();
  });
});
