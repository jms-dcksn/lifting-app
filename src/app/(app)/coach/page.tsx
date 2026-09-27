import { redirect } from "next/navigation";
import { AgentChat } from "@/components/agent/agent-chat";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateThread, loadThreadMessages } from "@/lib/agent/thread";

export default async function AgentCoachPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const thread = await getOrCreateThread(supabase, userId);
  const messages = await loadThreadMessages(supabase, thread.id);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom))] w-full max-w-page min-h-0 flex-col overflow-hidden px-4 pt-6">
      <h1 className="shrink-0 text-display">Coach</h1>
      <AgentChat initialMessages={messages} variant="page" />
    </div>
  );
}
