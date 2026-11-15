import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enrichScreenContext, parseScreenContextInput } from "./context";
import { enableLangSmithTracing, gatewayApiKey } from "./policy";
import { parseChatSelection, parseThreadId, type TurnRequest } from "./chat-state";
import { loadChat, startTurn } from "./thread";
import { bindAgentTools } from "./tools";
import { runAgentTurn } from "./run";
import { encodeSse, type AgentStreamEvent } from "./stream";
import { episodeContextForThread } from "@/lib/coach-conversation-data";
import type { durableChat } from "./durable-chat";

type Client = SupabaseClient<Database>;

export type AgentChatAuth = {
  supabase: Client;
  userId: string | null;
};

export function createAgentChatHandlers(deps: {
  auth: (request: Request) => Promise<AgentChatAuth>;
  runTurn?: typeof runAgentTurn;
  durable?: typeof durableChat;
}) {
  const runTurn = deps.runTurn ?? runAgentTurn;

  async function GET(request: Request) {
    const { supabase, userId } = await deps.auth(request);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const selection = parseChatSelection(new URL(request.url).searchParams.get("thread"));
    if (!selection) return json({ error: "Invalid request" }, 400);
    const snapshot = await loadChat(supabase, userId, selection);
    if (!snapshot) return json({ error: "Not found" }, 404);
    try { return json(deps.durable ? await deps.durable.snapshot(supabase, userId, snapshot) : snapshot, 200); }
    catch { return json({ error: "Coach persistence is unavailable. Please retry later." }, 503); }
  }

  async function POST(request: Request) {
    const { supabase, userId } = await deps.auth(request);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    if (!gatewayApiKey()) return json({ error: "Service unavailable" }, 503);

    const body: unknown = await request.json().catch(() => null);
    const turnRequest = parseTurnRequest(body, Boolean(deps.durable));
    if (!turnRequest) return json({ error: "Invalid request" }, 400);

    enableLangSmithTracing();
    if (deps.durable) {
      const response = await deps.durable.post({ supabase, owner: userId, request, turnRequest, body });
      if (response) return response;
    }
    const turn = await startTurn(supabase, userId, turnRequest);
    if (!turn) return json({ error: "Not found" }, 404);
    const screenContext = await enrichScreenContext(supabase, userId, turnRequest.context);

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
            screenContext,
            episodeContext: await episodeContextForThread(supabase, userId, turn.thread.id),
            tools: bindAgentTools(supabase, userId),
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

function parseTurnRequest(body: unknown, allowResume = false): TurnRequest | null {
  if (!body || typeof body !== "object" || !("threadId" in body)) return null;
    const { text, threadId, context, discuss, resume, requestId } = body as {
    text?: unknown;
    threadId: unknown;
    context?: unknown;
    discuss?: unknown;
    resume?: unknown;
    requestId?: unknown;
  };
  const trimmed = typeof text === "string" ? text.trim() : "";
  const screenContext = parseScreenContextInput(context);
  if (!screenContext) return null;
  if (resume === true) {
    const id = parseThreadId(threadId);
    return allowResume && id && parseThreadId(requestId) ? { kind: "continue", threadId: id, text: "", context: screenContext } : null;
  }
  if (discuss === true) {
    const id = parseThreadId(threadId);
    return id && !trimmed ? { kind: "review", threadId: id, context: screenContext } : null;
  }
  if (!trimmed) return null;
  if (threadId === null) return { kind: "new", text: trimmed, context: screenContext };
  const id = parseThreadId(threadId);
  return id ? { kind: "continue", threadId: id, text: trimmed, context: screenContext } : null;
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
