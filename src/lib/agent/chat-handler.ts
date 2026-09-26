import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enableLangSmithTracing, gatewayApiKey } from "./policy";
import { appendMessage, getOrCreateThread, loadThreadMessages } from "./thread";
import { bindReadTools } from "./tools";
import { runAgentTurn } from "./run";
import { encodeSse, type AgentStreamEvent } from "./stream";
import type { AgentMessage } from "./messages";

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
    const thread = await getOrCreateThread(supabase, userId);
    const messages = await loadThreadMessages(supabase, thread.id);
    return json({ messages }, 200);
  }

  async function POST(request: Request) {
    const { supabase, userId } = await deps.auth(request);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    if (!gatewayApiKey()) return json({ error: "Service unavailable" }, 503);

    let text = "";
    try {
      const body = await request.json() as { text?: unknown };
      text = typeof body.text === "string" ? body.text.trim() : "";
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (!text) return json({ error: "Message required" }, 400);

    enableLangSmithTracing();
    const thread = await getOrCreateThread(supabase, userId);
    const userMessage = await appendMessage(supabase, {
      threadId: thread.id,
      userId,
      role: "user",
      parts: [{ type: "text", text }],
    });
    const persisted = [...await loadThreadMessages(supabase, thread.id)];
    if (!persisted.some((message) => message.id === userMessage.id)) {
      persisted.push(userMessage);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(encodeSse(event)));
        };
        try {
          const generated = await runTurn({
            persisted,
            tools: bindReadTools(supabase, userId),
            onEvent: send,
          });
          const saved: AgentMessage[] = [];
          for (const message of generated) {
            saved.push(await appendMessage(supabase, {
              threadId: thread.id,
              userId,
              role: message.role,
              parts: message.parts,
            }));
          }
          send({ type: "done", messages: [userMessage, ...saved] });
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

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
