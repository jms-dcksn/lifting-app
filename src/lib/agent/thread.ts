import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { parseParts, type AgentMessage, type AgentPart, type AgentRole } from "./messages";

type Client = SupabaseClient<Database>;

export async function getOrCreateThread(supabase: Client, userId: string) {
  const existing = await supabase
    .from("agent_thread")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const created = await supabase
    .from("agent_thread")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (created.data) return created.data;
  if (created.error?.code === "23505") {
    const retry = await supabase
      .from("agent_thread")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (retry.data) return retry.data;
    if (retry.error) throw new Error(retry.error.message);
  }
  throw new Error(created.error?.message ?? "Unable to create agent thread");
}

export async function loadThreadMessages(supabase: Client, threadId: string): Promise<AgentMessage[]> {
  const { data, error } = await supabase
    .from("agent_message")
    .select("id, role, parts, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    if (row.role !== "user" && row.role !== "assistant" && row.role !== "tool") return [];
    return [{
      id: row.id,
      role: row.role,
      parts: parseParts(row.parts),
      createdAt: row.created_at,
    }];
  });
}

export async function appendMessage(
  supabase: Client,
  input: {
    threadId: string;
    userId: string;
    role: AgentRole;
    parts: AgentPart[];
  },
): Promise<AgentMessage> {
  const { data, error } = await supabase
    .from("agent_message")
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      role: input.role,
      parts: input.parts as unknown as Json,
    })
    .select("id, role, parts, created_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Unable to persist agent message");
  await supabase
    .from("agent_thread")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.threadId)
    .eq("user_id", input.userId);
  return {
    id: data.id,
    role: data.role as AgentRole,
    parts: parseParts(data.parts),
    createdAt: data.created_at,
  };
}
