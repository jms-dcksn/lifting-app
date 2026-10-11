import type { AgentPart } from "../messages";

export const LIVE_EVAL_PROJECT = "lifting-app-agent-evals";
export const LIVE_DATASET = "ai-coach-live";
export const LIVE_POLICY_VERSION = "exercise-review-2026-10-11-v2";
export const REFERENCE_MATCH_THRESHOLD = 0.8;
export const INCLINE_E1RM_QUESTION = "How is my e1RM trending on incline bench press";
export const INCLINE_BENCH_ID = "bb-incline-bench";

export type LiveToolCall = { name: string; args: unknown };
export type LiveToolResult = { name: string; result: unknown };
export type LiveTurnOutput = { answer: string; toolCalls: LiveToolCall[]; toolResults: LiveToolResult[] };
export type ExpectedReview =
  | { outcome: "resolved"; exerciseId: string }
  | { outcome: "disambiguate"; matchIds: string[] }
  | { outcome: "policy"; requiredMatchIds: string[] };
export type LiveExample = {
  id: string; name: string; question: string; expectedTools: string[]; maxToolCalls: number;
  reference: string; instructions: typeof REFERENCE_MATCH_INSTRUCTIONS; review: ExpectedReview;
  followUps?: Array<{ question: string; maxToolCalls: number; review: ExpectedReview }>;
};

export const REFERENCE_MATCH_INSTRUCTIONS = {
  question: "Does the final answer satisfy the exercise-review policy using this turn's tool evidence?",
  ignore: "Ignore formatting and harmless rounding, but verify every number, date, comparison scope and availability claim against evidence. Reference is policy, not numeric gold.",
  pass: "Correct identity and selection, supported facts, and honest availability. Disclose all relevant alternatives and why only one has logged sets for an inferred choice, answer it and invite confirmation. Multiple logged matches require clarification or requested separate summaries; no history requires an honest no-data answer. Explicit intent controls.",
  fail: "Any unsupported fact, wrong identity/instance, hidden alternatives, missing inferred-choice confirmation, silent substitution, false availability or blended machine evidence fails. A trend is not mandatory when evidence is insufficient.",
};
export const INCLINE_E1RM_REFERENCE = "Incline barbell and dumbbell remain visible. Ordinary-pound barbell station variants share one movement. If only barbell has sets, disclose both and that reason, answer its eligible history and confirm intent. Otherwise clarify or report no data. Do not require a fabricated numeric trend.";

const policyReference = "Use all relevant matches and authoritative availability. Explicit constraints control. One history-bearing match permits a transparent preferred answer with alternatives, verified reason and confirmation. Multiple history-bearing matches need clarification with an offer of separate summaries. Zero history means no invented figures. Describe recent and historical evidence separately; last-minus-first is the recent delta. Deloads are logged activity excluded from strength comparisons.";
function example(id: string, name: string, requiredMatchIds: string[], reference = policyReference): LiveExample {
  return { id, name, question: `How is my e1RM trending on ${name}`, expectedTools: ["exerciseReview"], maxToolCalls: 3,
    reference, instructions: REFERENCE_MATCH_INSTRUCTIONS, review: { outcome: "policy", requiredMatchIds } };
}
// These expectations are authored from the contract, independently of the resolver.
export const LIVE_EXAMPLES: LiveExample[] = [
  example("incline-bench", "incline bench press", ["bb-incline-bench", "db-incline-bench"], INCLINE_E1RM_REFERENCE),
  example("easy-nautilus-hack-squat", "nautilus hack squat", [], "Keep Nautilus machine identity. An older dated chart can support a historical trend even with no 21-day comparison; never describe the older best as a current-window best."),
  example("easy-leg-press", "leg press", ["leg-press"], "Keep separate machine brands/types/instances visible, excluding calf press apparatus hits. Prefer transparently only if exactly one has history; otherwise clarify and offer separate summaries. No template numeric gold."),
  example("easy-romanian-deadlift", "romanian deadlift", ["bb-rdl"]),
  example("medium-cybex-hack-squat", "cybex hack squat", [], "Keep Cybex identity. Latest deload workout differs from latest eligible e1RM; excluded does not mean not recorded."),
  example("medium-bench-press", "bench press", ["bb-bench", "bb-incline-bench", "db-bench", "db-incline-bench"]),
  example("medium-deadlift", "deadlift", ["bb-deadlift"], "No-history conventional deadlift must not acquire fictional 405-pound history. If a broader query also matches another deadlift, any preference must disclose all alternatives and the verified history reason, then confirm intent."),
  example("hard-squat", "squat", ["bb-back-squat", "bb-front-squat", "hack-squat", "db-split-squat"]),
  example("hard-barbell-squat", "barbell squat", ["bb-back-squat", "bb-front-squat"]),
  example("hard-dumbbell-bench", "dumbbell bench", ["db-bench", "db-incline-bench"]),
  example("alias-rdl", "rdl", ["bb-rdl"]),
];
export const LIVE_FOLLOW_UP_EXAMPLES: LiveExample[] = [
  { ...example("confirm-squat", "barbell squat", ["bb-back-squat", "bb-front-squat"]),
    followUps: [{ question: "Yes, back squat. Show that history.", maxToolCalls: 3, review: { outcome: "resolved", exerciseId: "bb-back-squat" } }] },
  { ...example("correct-squat", "barbell squat", ["bb-back-squat", "bb-front-squat"]),
    followUps: [{ question: "Front squat instead.", maxToolCalls: 3, review: { outcome: "resolved", exerciseId: "bb-front-squat" } }] },
  { ...example("choose-cybex", "hack squat", ["hack-squat"]),
    followUps: [{ question: "The Cybex one.", maxToolCalls: 3, review: { outcome: "policy", requiredMatchIds: [] } }] },
  { ...example("show-both", "dumbbell bench", ["db-bench", "db-incline-bench"]),
    followUps: [{ question: "Show both separately.", maxToolCalls: 3, review: { outcome: "policy", requiredMatchIds: ["db-bench", "db-incline-bench"] } }] },
];

export const REVIEW_JUDGE_QUESTIONS = {
  selection_correctness: {
    type: "noul" as const,
    instructions: "Compare the final answer to the LAST exerciseReview result and explicit user intent. Prior correct lookups cannot rescue a wrong final lift. For preferred_history disclose all alternatives, the verified only-logged reason and confirm intended exercise. For clarification_needed ask which and offer separate summaries. For all, label each returned review separately and disclose continuation. Machine brands/types/instances must not be blended. A match list is not automatically a failure.",
    criteria: { true: "All identity/selection requirements satisfied.", false: "At least one wrong lift, hidden alternative, false preference reason, missing required confirmation, unwanted substitution or blended instance." },
  },
  evidence_support: {
    type: "noul" as const,
    instructions: "Check every factual claim against THIS turn's tool evidence, with harmless decimal rounding allowed. Verify numbers, dates, direction, exercise/equipment scope and claims about multiple matches. Historical chart points must not be called current-window points. Recent delta is last minus first eligible point, not last minus best. Deload exclusion does not imply stored e1RM was absent. Source attribution must be one final line. No data means no fabricated figures.",
    criteria: { true: "Every factual claim is supported and attributed.", false: "At least one unsupported number/date/direction/scope/storage claim or missing/duplicated source attribution." },
  },
  availability_handling: {
    type: "noul" as const,
    instructions: "Check availability.recentComparison separately from historicalTrend. Two older eligible points permit a dated historical trend despite a 21-day gap. Zero/one eligible points cannot support a trend. Latest workout, latest eligible e1RM and window best are different. Deload/missing-RIR activity is logged even when strength comparison is unavailable. Report missing comparisons honestly and available last facts; never require an invented trend.",
    criteria: { true: "Availability is accurately explained with available evidence.", false: "Invented trend, false no-activity claim, confusion of recent gap with no historical trend, or confusion of latest workout and latest eligible point." },
  },
  helpfulness: {
    type: "noul" as const,
    instructions: "Assess concise usefulness and the offer to summarize all when choices need clarification. This is optional helpfulness and cannot rescue identity or evidence failures.",
    criteria: { true: "Concise useful answer with a sensible next step.", false: "Unhelpful or unclear despite adequate evidence." },
  },
};

export function reviewJudgeRequest(question: string, reference: string, output: LiveTurnOutput) {
  return { state: { question, reference, answer: output.answer, toolCalls: output.toolCalls, toolEvidence: output.toolResults,
    policyVersion: LIVE_POLICY_VERSION }, questions: REVIEW_JUDGE_QUESTIONS };
}

export function outputFromTurn(messages: Array<{ role: string; parts: AgentPart[] }>): LiveTurnOutput {
  const toolCalls: LiveToolCall[] = [], toolResults: LiveToolResult[] = [];
  let answer = "";
  for (const message of messages) {
    const texts: string[] = [];
    for (const part of message.parts) {
      if (part.type === "tool-call") toolCalls.push({ name: part.name, args: part.args });
      if (part.type === "tool-result" && !part.omitted) toolResults.push({ name: part.name, result: part.result });
      if (part.type === "text" && message.role === "assistant") texts.push(part.text);
    }
    if (texts.length) answer = texts.join("\n").trim();
  }
  return { answer, toolCalls, toolResults };
}
export function gradeRightTool(input: { toolCalls: LiveToolCall[]; expectedTools: string[] }) {
  const names = input.toolCalls.map((call) => call.name);
  const missing = input.expectedTools.filter((name) => !names.includes(name));
  return { score: missing.length ? 0 : 1, comment: missing.length ? `missing ${missing.join(", ")}` : `called ${names.join(", ")}` };
}
export function gradeToolCount(count: number, maxToolCalls: number) {
  return { score: count <= maxToolCalls ? 1 : 0, comment: `${count} tool calls (max ${maxToolCalls})` };
}

export function reviewRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") { try { return reviewRecord(JSON.parse(value)); } catch { return null; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function gradeFoundExercise(input: { toolResults: LiveToolResult[]; expected: ExpectedReview }) {
  const last = input.toolResults.filter((result) => result.name === "exerciseReview").at(-1);
  const result = reviewRecord(last?.result);
  if (!result || result.error) return { score: 0, comment: "no successful final exerciseReview result" };
  const matches = Array.isArray(result.matches) ? result.matches.flatMap((value) => {
    const match = reviewRecord(value); return match ? [match] : [];
  }) : [];
  const ids = matches.map((match) => match.id);
  let pass: boolean;
  if (input.expected.outcome === "resolved") pass = result.exerciseId === input.expected.exerciseId;
  else if (input.expected.outcome === "disambiguate") pass = result.needsDisambiguation === true && input.expected.matchIds.every((id) => ids.includes(id));
  else {
    const logged = matches.filter((match) => Number(reviewRecord(match.history)?.loggedSetCount) > 0);
    const status = result.selectionStatus;
    const selected = matches.find((match) => match.id === result.exerciseId && match.equipmentInstanceId === result.equipmentInstanceId);
    pass = input.expected.requiredMatchIds.every((id) => ids.includes(id)) && matches.length > 0
      && (status === "all" ? Array.isArray(result.reviews)
        : status === "preferred_history" ? matches.length > 1 && logged.length === 1 && selected?.key === logged[0]?.key
          && reviewRecord(result.recommendation)?.reason === "only_match_with_logged_sets"
        : status === "unique" || status === "explicit" ? matches.length === 1 && !!selected
        : status === "clarification_needed" ? matches.length > 1 && logged.length !== 1 && !result.exerciseId
        : false);
  }
  return { score: pass ? 1 : 0, comment: `final result: ${String(result.selectionStatus ?? result.exerciseId ?? "choices")}; matches ${ids.join(", ")}` };
}
export function scoreNoul(noul: number, threshold = REFERENCE_MATCH_THRESHOLD) {
  const correct = Number.isFinite(noul) && noul >= threshold;
  return { score: correct ? 1 : 0, comment: `noul ${noul.toFixed(3)} — ${correct ? "correct" : "incorrect"}` };
}
