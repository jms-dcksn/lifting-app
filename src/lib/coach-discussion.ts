import type { AgentMessage } from "./agent/messages";

export const COACH_DISCUSSION_PROMPT = "Help me understand this training review and your recommendation.";

export function coachDiscussionHref(threadId: string) {
  return `/coach?thread=${encodeURIComponent(threadId)}&discuss=1`;
}

/** Presentation only; the server authorizes discussion using the owned seed-message link. */
export function isCoachReviewSeed(message: AgentMessage) {
  const part = message.parts[0];
  return message.role === "user" && message.parts.length === 1 && part?.type === "text"
    && /^Opened a Coach exception review \(evidence revision \d+\)\. Use the current authorized review context; this message does not confirm a training change\.$/.test(part.text);
}

export function presentCoachReviewSeed(message: AgentMessage): AgentMessage {
  return isCoachReviewSeed(message)
    ? { ...message, parts: [{ type: "text", text: COACH_DISCUSSION_PROMPT }] }
    : message;
}
