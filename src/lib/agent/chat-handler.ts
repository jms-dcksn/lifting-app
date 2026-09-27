import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enableLangSmithTracing, gatewayApiKey } from "./policy";
import { parseChatSelection, parseThreadId, type TurnRequest } from "./chat-state";
import { loadChat, startTurn } from "./thread";
import { bindReadTools } from "./tools";
import { runAgentTurn } from "./run";
import { encodeSse, type AgentStreamEvent } from "./stream";

type Client = SupabaseClient<Database>;

export type AgentChatAuth = {
  supabase: Client;
  userId: string | null;
};

export function createAgentChatHandlers(deps: {
  auth: (request: Request) => Promise<AgentChatAuth>;
  runTurn?: typeof runAgentTurn;
}) {
  const runTurn = deps.runTurn ?? runAgentTurn;

  async function GET(request: Request) {
    const { supabase, userId } = await deps.auth(request);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const selection = parseChatSelection(new URL(request.url).searchParams.get("thread"));
    if (!selection) return json({ error: "Invalid request" }, 400);
    const snapshot = await loadChat(supabase, userId, selection);
    if (!snapshot) return json({ error: "Not found" }, 404);
    return json(snapshot, 200);
  }

  async function POST(request: Request) {
    const { supabase, userId } = await deps.auth(request);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    if (!gatewayApiKey()) return json({ error: "Service unavailable" }, 503);

    const turnRequest = parseTurnRequest(await request.json().catch(() => null));
    if (!turnRequest) return json({ error: "Invalid request" }, 400);

    enableLangSmithTracing();
    const turn = await startTurn(supabase, userId, turnRequest);
    if (!turn) return json({ error: "Not found" }, 404);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(encodeSse(event)));
        };
        try {
          send({ type: "thread", thread: turn.thread, userMessage: turn.userMessage });
          const generated = await runTurn({
            persisted: turn.transcript,
            threadId: turn.thread.id,
            tools: bindReadTools(supabase, userId),
            onEvent: send,
          });
          const saved = await turn.appendReply(generated);
          send({ type: "done", messages: [turn.userMessage, ...saved] });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Agent failed";
          send({ type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        Connection: "keep-alive",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return { GET, POST };
}

/** The body must name its thread: `null` starts one, a UUID continues one. */
function parseTurnRequest(body: unknown): TurnRequest | null {
  if (!body || typeof body !== "object" || !("threadId" in body)) return null;
  const { text, threadId } = body as { text?: unknown; threadId: unknown };
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return null;
  if (threadId === null) return { kind: "new", text: trimmed };
  const id = parseThreadId(threadId);
  return id ? { kind: "continue", threadId: id, text: trimmed } : null;
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
