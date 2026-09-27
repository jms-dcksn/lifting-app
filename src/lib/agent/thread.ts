import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid7 } from "langsmith";
import type { Database, Json } from "@/lib/supabase/types";
import {
  parseThreadId,
  threadTitleFromUserText,
  type AgentChatSnapshot,
  type ChatSelection,
  type ThreadId,
  type ThreadSummary,
  type TurnRequest,
} from "./chat-state";
import { parseParts, type AgentMessage, type AgentRole } from "./messages";

type Client = SupabaseClient<Database>;
type NewMessage = Omit<AgentMessage, "id" | "createdAt">;

export type StartedTurn = {
  thread: ThreadSummary;
  userMessage: AgentMessage;
  transcript: AgentMessage[];
  appendReply: (messages: NewMessage[]) => Promise<AgentMessage[]>;
};

const THREAD_LIST_LIMIT = 50;

export function loadChat(
  supabase: Client,
  userId: string,
  selection: Exclude<ChatSelection, { kind: "thread" }>,
): Promise<AgentChatSnapshot>;
export function loadChat(
  supabase: Client,
  userId: string,
  selection: ChatSelection,
): Promise<AgentChatSnapshot | null>;
export async function loadChat(
  supabase: Client,
  userId: string,
  selection: ChatSelection,
): Promise<AgentChatSnapshot | null> {
  if (selection.kind === "thread") {
    const [threads, thread, messages] = await Promise.all([
      listThreads(supabase, userId),
      findThread(supabase, userId, selection.threadId),
      loadTranscript(supabase, userId, selection.threadId),
    ]);
    if (!thread) return null;
    return { threads, open: { kind: "saved", threadId: thread.id, title: thread.title, messages } };
  }
  const threads = await listThreads(supabase, userId);
  const latest = selection.kind === "latest" ? threads.at(0) : undefined;
  if (!latest) return { threads, open: { kind: "draft" } };
  const messages = await loadTranscript(supabase, userId, latest.id);
  return { threads, open: { kind: "saved", threadId: latest.id, title: latest.title, messages } };
}

export async function startTurn(
  supabase: Client,
  userId: string,
  request: TurnRequest,
): Promise<StartedTurn | null> {
  const opened = request.kind === "new"
    ? await openThread(supabase, userId, request.text)
    : await continueThread(supabase, userId, request.threadId, request.text);
  if (!opened) return null;

  const { thread, userMessage } = opened;
  const transcript = request.kind === "new"
    ? [userMessage]
    : await loadTranscript(supabase, userId, thread.id);
  if (!transcript.some((message) => message.id === userMessage.id)) transcript.push(userMessage);

  return {
    thread,
    userMessage,
    transcript,
    appendReply: async (messages) => {
      const saved: AgentMessage[] = [];
      for (const message of messages) {
        saved.push(await insertMessage(supabase, userId, thread.id, message));
      }
      return saved;
    },
  };
}

async function openThread(supabase: Client, userId: string, text: string) {
  const id = parseThreadId(uuid7());
  if (!id) throw new Error("Unable to create agent thread");
  const title = threadTitleFromUserText(text);
  const created = await supabase.from("agent_thread").insert({ id, user_id: userId, title });
  if (created.error) throw new Error(created.error.message);
  try {
    const userMessage = await insertMessage(supabase, userId, id, userText(text));
    return { thread: { id, title, updatedAt: userMessage.createdAt }, userMessage };
  } catch (error) {
    await supabase.from("agent_thread").delete().eq("id", id).eq("user_id", userId);
    throw error;
  }
}

async function continueThread(supabase: Client, userId: string, threadId: ThreadId, text: string) {
  const thread = await findThread(supabase, userId, threadId);
  if (!thread) return null;
  const userMessage = await insertMessage(supabase, userId, thread.id, userText(text));
  return { thread: { ...thread, updatedAt: userMessage.createdAt }, userMessage };
}

async function listThreads(supabase: Client, userId: string): Promise<ThreadSummary[]> {
  const { data, error } = await supabase
    .from("agent_thread")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(THREAD_LIST_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as ThreadId,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}

async function findThread(supabase: Client, userId: string, threadId: ThreadId) {
  const { data, error } = await supabase
    .from("agent_thread")
    .select("title")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: threadId, title: data.title } : null;
}

async function loadTranscript(supabase: Client, userId: string, threadId: ThreadId): Promise<AgentMessage[]> {
  const { data, error } = await supabase
    .from("agent_message")
    .select("id, role, parts, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
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

/** Also moves the thread's `updated_at` to this message, so the history list sorts by last activity. */
async function insertMessage(
  supabase: Client,
  userId: string,
  threadId: ThreadId,
  message: NewMessage,
): Promise<AgentMessage> {
  const { data, error } = await supabase
    .from("agent_message")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: message.role,
      parts: message.parts as unknown as Json,
    })
    .select("id, role, parts, created_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Unable to persist agent message");
  await supabase
    .from("agent_thread")
    .update({ updated_at: data.created_at })
    .eq("id", threadId)
    .eq("user_id", userId);
  return {
    id: data.id,
    role: data.role as AgentRole,
    parts: parseParts(data.parts),
    createdAt: data.created_at,
  };
}

function userText(text: string): NewMessage {
  return { role: "user", parts: [{ type: "text", text }] };
}
