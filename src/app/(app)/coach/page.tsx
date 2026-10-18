import { redirect } from "next/navigation";
import { AgentChat } from "@/components/agent/agent-chat";
import { createClient } from "@/lib/supabase/server";
import { parseChatSelection } from "@/lib/agent/chat-state";
import { loadChat } from "@/lib/agent/thread";
import Link from "next/link";
import { threadReview } from "./episodes/actions";
import { CoachEntry } from "@/components/coach/coach-entry";
import { coachConversationHref, parseCoachFocus } from "@/lib/coach-entry";
import { getCatalogMap } from "@/lib/catalog";

export default async function AgentCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string | string[]; review?: string; exercise?: string; equipment?: string; month?: string; discuss?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const query = await searchParams;
  const { thread, discuss } = query;
  const focus = parseCoachFocus(query);
  if (query.review === "1") return <CoachEntry focus={focus} />;
  const catalog = focus.exerciseId ? await getCatalogMap(supabase, userId) : null;
  const focusLabel = focus.exerciseId ? catalog?.[focus.exerciseId]?.name ?? "Selected lift unavailable" : undefined;
  const selection = parseChatSelection(typeof thread === "string" ? thread : undefined);
  const snapshot = selection ? await loadChat(supabase, userId, selection) : null;
  if (!snapshot) return <div className="p-6"><p>This conversation is unavailable.</p><Link href={coachConversationHref(focus, null)}>Open Coach</Link></div>;

  const initialReview = snapshot.open.kind === "saved" ? await threadReview(snapshot.open.threadId).catch(() => undefined) : undefined;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4.25rem-env(safe-area-inset-bottom))] w-full max-w-page min-h-0 flex-col overflow-hidden pt-6">
      <AgentChat key={`${snapshot.open.kind === "saved" ? snapshot.open.threadId : "new"}:${focus.exerciseId}:${focus.equipmentInstanceId}:${focus.month}`} initial={snapshot} initialReview={initialReview} variant="page" discuss={discuss === "1"} focus={focus} focusLabel={focusLabel} />
    </div>
  );
}
