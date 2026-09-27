import type { AgentMessage } from "./messages";
import type { AgentStreamEvent } from "./stream";

export type ThreadId = string & { readonly ThreadId: unique symbol };

export type ThreadSummary = { id: ThreadId; title: string; updatedAt: string };

export type Conversation =
  | { kind: "draft" }
  | { kind: "saved"; threadId: ThreadId; title: string; messages: AgentMessage[] };

export type AgentChatSnapshot = { threads: ThreadSummary[]; open: Conversation };

export type ChatSelection =
  | { kind: "latest" }
  | { kind: "new" }
  | { kind: "thread"; threadId: ThreadId };

export type TurnRequest =
  | { kind: "new"; text: string }
  | { kind: "continue"; threadId: ThreadId; text: string };

type Turn = {
  optimisticId: string;
  text: string;
  streamingText: string;
  pendingTool: string | null;
};

export type ChatScreen =
  | { name: "loading" }
  | { name: "chat"; conversation: Conversation; turn: Turn | null }
  | { name: "history"; conversation: Conversation; opening: ThreadId | null };

export type ChatState = {
  threads: ThreadSummary[];
  screen: ChatScreen;
  error: string | null;
};

export type ChatAction =
  | { type: "loaded"; snapshot: AgentChatSnapshot }
  | { type: "failed"; error: string }
  | { type: "send"; optimisticId: string; text: string }
  | { type: "event"; event: AgentStreamEvent }
  | { type: "closed"; error: string }
  | { type: "toggle-history" }
  | { type: "new-chat" }
  | { type: "open"; threadId: ThreadId };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_LIMIT = 80;
const DRAFT: Conversation = { kind: "draft" };
const NO_MESSAGES: AgentMessage[] = [];

export function parseThreadId(value: unknown): ThreadId | null {
  if (typeof value !== "string" || !UUID.test(value)) return null;
  return value.toLowerCase() as ThreadId;
}

/** `?thread=` value to a selection. Absent is latest; anything unreadable is null. */
export function parseChatSelection(value: string | null | undefined): ChatSelection | null {
  if (value == null) return { kind: "latest" };
  if (value === "new") return { kind: "new" };
  const threadId = parseThreadId(value);
  return threadId ? { kind: "thread", threadId } : null;
}

export function threadTitleFromUserText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  // Code points, not UTF-16 units, so an emoji at the cut never leaves a lone surrogate.
  return Array.from(collapsed).slice(0, TITLE_LIMIT).join("") || "New chat";
}

export function fullScreenHref(conversation: Conversation) {
  return conversation.kind === "draft" ? "/coach?thread=new" : `/coach?thread=${conversation.threadId}`;
}

export function canNavigate(screen: ChatScreen) {
  return screen.name === "history" || (screen.name === "chat" && screen.turn === null);
}

/** What the transcript shows: saved rows plus the in-flight turn until the server confirms its user row. */
export function transcriptView(conversation: Conversation, turn: Turn | null) {
  const messages = conversation.kind === "saved" ? conversation.messages : NO_MESSAGES;
  const confirmed = turn !== null && messages.some((message) => message.id === turn.optimisticId);
  return {
    messages,
    pendingText: turn && !confirmed ? turn.text : undefined,
    streamingText: turn?.streamingText,
    pendingTool: turn?.pendingTool,
  };
}

export function initialChatState(snapshot?: AgentChatSnapshot): ChatState {
  return snapshot ? show(snapshot) : { threads: [], screen: { name: "loading" }, error: null };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const { screen } = state;
  switch (action.type) {
    case "loaded":
      return isWaitingForSnapshot(screen, action.snapshot) ? show(action.snapshot) : state;
    case "failed":
      if (screen.name === "loading") {
        return { threads: [], screen: { name: "chat", conversation: DRAFT, turn: null }, error: action.error };
      }
      if (screen.name === "history" && screen.opening) {
        return { ...state, screen: { ...screen, opening: null }, error: action.error };
      }
      return state;
    case "send":
      if (screen.name !== "chat" || screen.turn) return state;
      return {
        ...state,
        screen: {
          ...screen,
          turn: { optimisticId: action.optimisticId, text: action.text, streamingText: "", pendingTool: null },
        },
        error: null,
      };
    case "event":
      if (screen.name !== "chat" || !screen.turn) return state;
      return applyEvent(state, screen.conversation, screen.turn, action.event);
    case "closed":
      if (screen.name !== "chat" || !screen.turn) return state;
      return { ...state, screen: { ...screen, turn: null }, error: action.error };
    case "toggle-history":
      if (screen.name === "history") {
        return { ...state, screen: { name: "chat", conversation: screen.conversation, turn: null } };
      }
      if (screen.name === "chat" && !screen.turn) {
        return { ...state, screen: { name: "history", conversation: screen.conversation, opening: null } };
      }
      return state;
    case "new-chat":
      if (!canNavigate(screen)) return state;
      return { ...state, screen: { name: "chat", conversation: DRAFT, turn: null }, error: null };
    case "open":
      if (screen.name !== "history" || screen.opening) return state;
      return { ...state, screen: { ...screen, opening: action.threadId }, error: null };
  }
}

function show(snapshot: AgentChatSnapshot): ChatState {
  return {
    threads: snapshot.threads,
    screen: { name: "chat", conversation: snapshot.open, turn: null },
    error: null,
  };
}

function isWaitingForSnapshot(screen: ChatScreen, snapshot: AgentChatSnapshot) {
  if (screen.name === "loading") return true;
  return screen.name === "history"
    && screen.opening !== null
    && snapshot.open.kind === "saved"
    && snapshot.open.threadId === screen.opening;
}

function applyEvent(
  state: ChatState,
  conversation: Conversation,
  turn: Turn,
  event: AgentStreamEvent,
): ChatState {
  const chat = (next: Conversation, nextTurn: Turn | null): ChatState => ({
    ...state,
    screen: { name: "chat", conversation: next, turn: nextTurn },
  });
  switch (event.type) {
    case "thread": {
      const prior = conversation.kind === "saved" ? conversation.messages : [];
      return {
        ...chat(
          {
            kind: "saved",
            threadId: event.thread.id,
            title: event.thread.title,
            messages: mergeById(prior, [event.userMessage]),
          },
          { ...turn, optimisticId: event.userMessage.id },
        ),
        threads: [event.thread, ...state.threads.filter((thread) => thread.id !== event.thread.id)],
      };
    }
    case "text":
      return chat(conversation, { ...turn, streamingText: turn.streamingText + event.text });
    case "tool-start":
      return chat(conversation, { ...turn, pendingTool: event.name });
    case "tool-end":
      return chat(conversation, { ...turn, pendingTool: null });
    case "done":
      if (conversation.kind === "draft") return chat(conversation, null);
      return chat({ ...conversation, messages: mergeById(conversation.messages, event.messages) }, null);
    case "error":
      return { ...chat(conversation, null), error: event.message };
  }
}

function mergeById(current: AgentMessage[], incoming: AgentMessage[]) {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))];
}
