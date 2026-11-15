import { createClient } from "@/lib/supabase/server";
import { createAgentChatHandlers } from "@/lib/agent/chat-handler";
import { durableChat } from "@/lib/agent/durable-chat";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

const handlers = createAgentChatHandlers({
  durable: durableChat,
  async auth() {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub as string | undefined;
    return { supabase, userId: userId ?? null };
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
