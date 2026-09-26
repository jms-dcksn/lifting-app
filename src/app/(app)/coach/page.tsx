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
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 py-6">
      <h1 className="text-display">Coach</h1>
      <AgentChat initialMessages={messages} variant="page" />
    </div>
  );
}
