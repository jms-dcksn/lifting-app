import { createClient } from "@/lib/supabase/server";
import { createAgentChatHandlers } from "@/lib/agent/chat-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createAgentChatHandlers({
  async auth() {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub as string | undefined;
    return { supabase, userId: userId ?? null };
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
