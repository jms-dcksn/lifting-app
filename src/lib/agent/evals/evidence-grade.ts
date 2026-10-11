import { reviewRecord, type LiveTurnOutput } from "./live";

/** Narrow deterministic guard; semantic identity/direction still belongs to the evidence judge. */
export function gradeSupportedFigures(output: LiveTurnOutput) {
  const numbers: number[] = [], dates = new Set<string>();
  function collect(value: unknown, key = "") {
    if (typeof value === "number" && ["weight", "e1rm", "bestE1rm", "delta", "historicalDelta"].includes(key)) numbers.push(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) dates.add(value.slice(0, 10));
    if (Array.isArray(value)) for (const child of value) collect(child, key);
    else if (value && typeof value === "object") for (const [childKey, child] of Object.entries(value)) collect(child, childKey);
  }
  for (const result of output.toolResults) if (result.name === "exerciseReview") collect(reviewRecord(result.result));
  const reasons: string[] = [];
  for (const match of output.answer.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(?:lb\b|pounds?\b)/gi)) {
    const number = Number(match[1]);
    if (!numbers.some((value) => Math.abs(value - number) <= 0.5)) reasons.push(`unsupported pounds ${match[1]}`);
  }
  for (const match of output.answer.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) if (!dates.has(match[0])) reasons.push(`unsupported date ${match[0]}`);
  return { score: reasons.length ? 0 : 1, comment: reasons.length ? reasons.join("; ") : "quoted pounds and ISO dates supported; semantic scope judged separately" };
}

export type ReviewAnswerControl = { required: string[]; forbidden?: string[] };
/** Independently authored fixture acceptance, not a generic natural-language judge. */
export function gradeReviewControl(answer: string, expected: ReviewAnswerControl) {
  const text = answer.toLowerCase();
  const reasons = expected.required.filter((phrase) => !text.includes(phrase.toLowerCase())).map((phrase) => `missing ${phrase}`);
  for (const phrase of expected.forbidden ?? []) if (text.includes(phrase.toLowerCase())) reasons.push(`forbidden ${phrase}`);
  return { score: reasons.length ? 0 : 1, reasons };
}
