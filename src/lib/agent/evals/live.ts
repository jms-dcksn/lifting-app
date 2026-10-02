import type { AgentPart } from "../messages";

/** Tracing project for local experiments. Vercel stays on its own project. */
export const LIVE_EVAL_PROJECT = "lifting-app-agent-evals";

export const LIVE_DATASET = "ai-coach-live";

export const INCLINE_E1RM_QUESTION = "How is my e1RM trending on incline bench press";

export const INCLINE_BENCH_ID = "bb-incline-bench";

/** Handwritten gold. The live run copies this onto the dataset; it does not rebuild it from the tool. */
export const INCLINE_E1RM_REFERENCE = `E1RM is currently ~190.3 lb for incline barbell bench press.

Last recorded E1RM: 184.96 lb (2026-09-29)
Best E1RM (in your last 21 days): 190.29 lb
Trend vs 21-day best: -5.33 lb (last vs best)
Recent e1RM points: 179.21 → 184.48 → 190.29 → 190.29 → 184.96`;

/** Jev ignores the figures in the gold and checks shape plus that a trend was told to the user. */
export const REFERENCE_MATCH_INSTRUCTIONS = {
  question: "Does `answer` report an incline barbell bench e1RM trend in the same shape as `reference`?",
  ignore: "Ignore exact pounds, dates, and how many chart points are listed.",
  pass: "The reply names incline barbell bench and tells the user a trend: a recent level, a last session, and a direction or a short series of recent points.",
  fail: "The reply says the exercise was not found, names a different lift, or never reports a trend.",
};

/** Jev noul at or above this counts as a correct answer. */
export const REFERENCE_MATCH_THRESHOLD = 0.8;

export type LiveToolCall = { name: string; args: unknown };

export type LiveTurnOutput = {
  answer: string;
  toolCalls: LiveToolCall[];
};

export function outputFromTurn(
  messages: Array<{ role: string; parts: AgentPart[] }>,
): LiveTurnOutput {
  const toolCalls: LiveToolCall[] = [];
  const texts: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call") toolCalls.push({ name: part.name, args: part.args });
      if (part.type === "text" && message.role === "assistant" && part.text) texts.push(part.text);
    }
  }
  return { answer: texts.join("\n").trim(), toolCalls };
}

export function gradeRightTool(input: {
  toolCalls: LiveToolCall[];
  expectedTools: string[];
}) {
  const names = input.toolCalls.map((call) => call.name);
  const reasons: string[] = [];
  for (const tool of input.expectedTools) {
    if (!names.includes(tool)) reasons.push(`missing ${tool}`);
  }
  if (input.expectedTools.includes("exerciseReview")) {
    const targeted = input.toolCalls.some(
      (call) => call.name === "exerciseReview" && reviewTargetsIncline(call.args),
    );
    if (names.includes("exerciseReview") && !targeted) {
      reasons.push("exerciseReview was not aimed at incline bench");
    }
  }
  const called = names.length ? names.join(", ") : "none";
  return {
    score: reasons.length === 0 ? 1 : 0,
    comment: reasons.length ? `${reasons.join("; ")} (called ${called})` : `called ${called}`,
  };
}

export function gradeToolCount(count: number, maxToolCalls: number) {
  return {
    score: count <= maxToolCalls ? 1 : 0,
    comment: `${count} tool call${count === 1 ? "" : "s"} (max ${maxToolCalls})`,
  };
}

export function scoreNoul(noul: number, threshold = REFERENCE_MATCH_THRESHOLD) {
  const correct = noul >= threshold;
  return {
    score: correct ? 1 : 0,
    comment: `noul ${noul.toFixed(3)} — ${correct ? "correct" : "incorrect"}`,
  };
}

function reviewTargetsIncline(args: unknown) {
  if (!args || typeof args !== "object") return false;
  const record = args as Record<string, unknown>;
  const id = typeof record.exerciseId === "string" ? record.exerciseId.trim() : "";
  const name = typeof record.name === "string" ? record.name : "";
  if (id) return id === INCLINE_BENCH_ID;
  return /incline/i.test(name) && /bench/i.test(name);
}
