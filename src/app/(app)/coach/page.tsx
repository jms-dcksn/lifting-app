import { redirect } from "next/navigation";
import { AgentChat } from "@/components/agent/agent-chat";
import { createClient } from "@/lib/supabase/server";
import { parseChatSelection } from "@/lib/agent/chat-state";
import { loadChat } from "@/lib/agent/thread";

export default async function AgentCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string | string[] }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { thread } = await searchParams;
  const selection = parseChatSelection(typeof thread === "string" ? thread : undefined) ?? { kind: "latest" };
  const snapshot = (await loadChat(supabase, userId, selection))
    ?? (await loadChat(supabase, userId, { kind: "latest" }));

  return (
    <div className="mx-auto flex h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom))] w-full max-w-page min-h-0 flex-col overflow-hidden pt-6">
      <AgentChat initial={snapshot} variant="page" />
    </div>
  );
}
