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

const CLARIFY_INSTRUCTIONS = {
  question: "Does `answer` ask the user to choose among the exercises named in `reference`?",
  ignore: "Ignore wording, markdown, and any Source line.",
  pass: "The reply politely asks which exercise the user means and names each exercise listed in reference.",
  fail: "The reply picks one exercise and reports a trend, or it names a lift that is not in reference.",
};

/** Jev noul at or above this counts as a correct answer. */
export const REFERENCE_MATCH_THRESHOLD = 0.8;

export type LiveToolCall = { name: string; args: unknown };

export type LiveToolResult = { name: string; result: unknown };

export type LiveTurnOutput = {
  answer: string;
  toolCalls: LiveToolCall[];
  toolResults: LiveToolResult[];
};

/** What `resolveExerciseIdentity` returns for the user's phrase on the seed catalog. */
export type SeedResolution =
  | { exerciseId: string }
  | {
      source: "exerciseReview";
      needsDisambiguation: true;
      matches: Array<{ id: string; name: string }>;
    }
  | { source: "exerciseReview"; error: string };

/** What the live judge expects from the exerciseReview results on the turn. */
export type ExpectedReview =
  | { outcome: "resolved"; exerciseId: string }
  | { outcome: "disambiguate"; matchIds: string[] };

export type LiveExample = {
  id: string;
  /** Phrase inside the question. The resolver lock uses this, not the full sentence. */
  name: string;
  question: string;
  expectedTools: string[];
  maxToolCalls: number;
  reference: string;
  instructions: {
    question: string;
    ignore: string;
    pass: string;
    fail: string;
  };
  /** Resolver outcome on the seed catalog. A miss here can still have a resolved gold lift. */
  seedResolution: SeedResolution;
  review: ExpectedReview;
};

const SQUAT_MATCHES = [
  { id: "bb-back-squat", name: "Barbell Back Squat" },
  { id: "bb-front-squat", name: "Barbell Front Squat" },
];

const DUMBBELL_BENCH_MATCHES = [
  { id: "db-bench", name: "Dumbbell Bench Press" },
  { id: "db-incline-bench", name: "Dumbbell Incline Bench" },
];

function ask(name: string) {
  return `How is my e1RM trending on ${name}`;
}

function trendReference(
  exerciseName: string,
  current: string,
  last: string,
  lastDate: string,
  best: string,
  delta: string,
  points: string,
) {
  return `E1RM is currently ~${current} lb for ${exerciseName}.

Last recorded E1RM: ${last} lb (${lastDate})
Best E1RM (in your last 21 days): ${best} lb
Trend vs 21-day best: ${delta} lb (last vs best)
Recent e1RM points: ${points}`;
}

function trendInstructions(exerciseName: string) {
  return {
    question: `Does \`answer\` report a ${exerciseName} e1RM value and trend if available in a somewhat similar shape as \`reference\`?`,
    ignore: REFERENCE_MATCH_INSTRUCTIONS.ignore,
    pass: `The reply names ${exerciseName} and tells the user e1RM value and trend: a recent level, a last session, and a direction or a short series of recent points. Or if no trend exists, it tells the user.`,
    fail: REFERENCE_MATCH_INSTRUCTIONS.fail,
  };
}

function clarifyReference(matches: Array<{ name: string }>) {
  const lines = matches.map((match) => `- ${match.name}`).join("\n");
  return `Which exercise do you mean?\n\n${lines}`;
}

function disambiguation(matches: Array<{ id: string; name: string }>): SeedResolution {
  return { source: "exerciseReview", needsDisambiguation: true, matches };
}

function resolvedExample(input: {
  id: string;
  name: string;
  exerciseId: string;
  spokenName: string;
  figures: [string, string, string, string, string, string];
}): LiveExample {
  const [current, last, lastDate, best, delta, points] = input.figures;
  return {
    id: input.id,
    name: input.name,
    question: ask(input.name),
    expectedTools: ["exerciseReview"],
    maxToolCalls: 3,
    reference: trendReference(input.spokenName, current, last, lastDate, best, delta, points),
    instructions: trendInstructions(input.spokenName),
    seedResolution: { exerciseId: input.exerciseId },
    review: { outcome: "resolved", exerciseId: input.exerciseId },
  };
}

function clarifyExample(input: {
  id: string;
  name: string;
  matches: Array<{ id: string; name: string }>;
}): LiveExample {
  return {
    id: input.id,
    name: input.name,
    question: ask(input.name),
    expectedTools: ["exerciseReview"],
    maxToolCalls: 3,
    reference: clarifyReference(input.matches),
    instructions: CLARIFY_INSTRUCTIONS,
    seedResolution: disambiguation(input.matches),
    review: { outcome: "disambiguate", matchIds: input.matches.map((match) => match.id) },
  };
}

/**
 * Eleven live reads. Gold is the lift the question means. "rdl" and
 * "incline bench press" resolve on the seed catalog.
 * Back squat has one logged point for the eval user (checked 2026-10-03), so those
 * examples are the Nautilus and Cybex hack squats, which have chart trends.
 * On the seed catalog both phrases collapse to the hack-squat template. On the eval
 * user's catalog they resolve to the station rows that hold the sets.
 */
export const LIVE_EXAMPLES: LiveExample[] = [
  {
    id: "incline-bench",
    name: "incline bench press",
    question: INCLINE_E1RM_QUESTION,
    expectedTools: ["exerciseReview"],
    maxToolCalls: 3,
    reference: INCLINE_E1RM_REFERENCE,
    instructions: REFERENCE_MATCH_INSTRUCTIONS,
    seedResolution: { exerciseId: INCLINE_BENCH_ID },
    review: { outcome: "resolved", exerciseId: INCLINE_BENCH_ID },
  },
  {
    ...resolvedExample({
      id: "easy-nautilus-hack-squat",
      name: "nautilus hack squat",
      exerciseId: "hack-squat__nautilus__plate_loaded",
      spokenName: "Hack Squat — Nautilus (plate)",
      figures: ["441.2", "441.18", "2026-09-19", "441.18", "0", "381.68 → 380.58 → 393.70 → 405.95 → 424.33 → 441.18"],
    }),
    seedResolution: { exerciseId: "hack-squat" },
  },
  resolvedExample({
    id: "easy-leg-press",
    name: "leg press",
    exerciseId: "leg-press",
    spokenName: "leg press",
    figures: ["540", "500", "2026-09-14", "560", "-60", "480 → 520 → 560 → 500"],
  }),
  resolvedExample({
    id: "easy-romanian-deadlift",
    name: "romanian deadlift",
    exerciseId: "bb-rdl",
    spokenName: "romanian deadlift",
    figures: ["275", "260", "2026-09-16", "280", "-20", "250 → 265 → 280 → 260"],
  }),
  {
    ...resolvedExample({
      id: "medium-cybex-hack-squat",
      name: "cybex hack squat",
      exerciseId: "hack-squat__cybex__plate_loaded",
      spokenName: "Hack Squat — Cybex (plate)",
      figures: ["205.9", "205.88", "2026-10-03", "205.88", "0", "183.73 → 189.45 → 198.02 → 205.88"],
    }),
    seedResolution: { exerciseId: "hack-squat" },
  },
  resolvedExample({
    id: "medium-bench-press",
    name: "bench press",
    exerciseId: "bb-bench",
    spokenName: "barbell bench press",
    figures: ["225", "215", "2026-09-20", "230", "-15", "200 → 215 → 230 → 215"],
  }),
  resolvedExample({
    id: "medium-deadlift",
    name: "deadlift",
    exerciseId: "bb-deadlift",
    spokenName: "barbell deadlift",
    figures: ["405", "395", "2026-09-22", "415", "-20", "365 → 395 → 415 → 395"],
  }),
  clarifyExample({ id: "hard-squat", name: "squat", matches: SQUAT_MATCHES }),
  clarifyExample({ id: "hard-barbell-squat", name: "barbell squat", matches: SQUAT_MATCHES }),
  clarifyExample({
    id: "hard-dumbbell-bench",
    name: "dumbbell bench",
    matches: DUMBBELL_BENCH_MATCHES,
  }),
  {
    id: "alias-rdl",
    name: "rdl",
    question: ask("rdl"),
    expectedTools: ["exerciseReview"],
    maxToolCalls: 3,
    reference: trendReference(
      "romanian deadlift",
      "318.3",
      "318.25",
      "2026-10-03",
      "318.25",
      "0",
      "286.26 → 295.28 → 304.47 → 311.70 → 318.25",
    ),
    instructions: trendInstructions("romanian deadlift"),
    seedResolution: { exerciseId: "bb-rdl" },
    review: { outcome: "resolved", exerciseId: "bb-rdl" },
  },
];

export function outputFromTurn(
  messages: Array<{ role: string; parts: AgentPart[] }>,
): LiveTurnOutput {
  const toolCalls: LiveToolCall[] = [];
  const toolResults: LiveToolResult[] = [];
  const texts: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call") toolCalls.push({ name: part.name, args: part.args });
      if (part.type === "tool-result" && !part.omitted) {
        toolResults.push({ name: part.name, result: part.result });
      }
      if (part.type === "text" && message.role === "assistant" && part.text) texts.push(part.text);
    }
  }
  return { answer: texts.join("\n").trim(), toolCalls, toolResults };
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

export function gradeFoundExercise(input: {
  toolResults: LiveToolResult[];
  expected: ExpectedReview;
}) {
  const results = reviewRecords(input.toolResults);
  if (results.length === 0) return { score: 0, comment: "no exerciseReview result" };
  if (input.expected.outcome === "resolved") return gradeResolved(results, input.expected.exerciseId);
  return gradeDisambiguation(results, input.expected.matchIds);
}

export function scoreNoul(noul: number, threshold = REFERENCE_MATCH_THRESHOLD) {
  const correct = noul >= threshold;
  return {
    score: correct ? 1 : 0,
    comment: `noul ${noul.toFixed(3)} — ${correct ? "correct" : "incorrect"}`,
  };
}

function gradeResolved(results: Record<string, unknown>[], exerciseId: string) {
  if (results.some((result) => result.exerciseId === exerciseId)) {
    return { score: 1, comment: `found ${exerciseId}` };
  }
  return { score: 0, comment: `expected ${exerciseId}; saw ${results.map(describeResult).join(" | ")}` };
}

function gradeDisambiguation(results: Record<string, unknown>[], matchIds: string[]) {
  const hit = results.find((result) =>
    result.needsDisambiguation === true && sameIds(matchIdsFrom(result), matchIds)
  );
  if (hit) return { score: 1, comment: `choices ${matchIds.join(", ")}` };
  return { score: 0, comment: `expected ${matchIds.join(", ")}; saw ${results.map(describeResult).join(" | ")}` };
}

function reviewRecords(toolResults: LiveToolResult[]) {
  return toolResults.flatMap((result) => {
    if (result.name !== "exerciseReview") return [];
    const record = asRecord(result.result);
    return record ? [record] : [];
  });
}

function describeResult(result: Record<string, unknown>) {
  if (typeof result.exerciseId === "string") return result.exerciseId;
  if (typeof result.error === "string") return result.error;
  if (result.needsDisambiguation === true) {
    const ids = matchIdsFrom(result);
    return ids.length ? `choices ${ids.join(", ")}` : "choices none";
  }
  return "unrecognized";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function matchIdsFrom(result: Record<string, unknown>) {
  if (!Array.isArray(result.matches)) return [];
  return result.matches.flatMap((match) => {
    if (!match || typeof match !== "object" || !("id" in match)) return [];
    const id = (match as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const wanted = new Set(right);
  return left.every((id) => wanted.has(id));
}
