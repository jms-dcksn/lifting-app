import { READ_TOOL_NAMES, WRITE_TOOL_NAMES } from "../policy";
import type { EvalCase } from "./cases";

export function gradeGrounding(input: {
  expectedTools: string[];
  usedTools: string[];
  expectedCitations: Array<{ value: string | number; source: string }>;
  answer: string;
}) {
  const reasons: string[] = [];
  for (const tool of input.expectedTools) {
    if (!input.usedTools.includes(tool)) reasons.push(`missing tool ${tool}`);
  }
  for (const tool of input.usedTools) {
    if (WRITE_TOOL_NAMES.includes(tool)) reasons.push(`write tool ${tool}`);
    if (!READ_TOOL_NAMES.includes(tool as (typeof READ_TOOL_NAMES)[number]) && !input.expectedTools.includes(tool)) {
      reasons.push(`unexpected tool ${tool}`);
    }
  }
  const haystack = input.answer.toLowerCase();
  for (const citation of input.expectedCitations) {
    if (!haystack.includes(String(citation.value).toLowerCase())) {
      reasons.push(`missing citation ${citation.value}`);
    }
    if (!haystack.includes(citation.source.toLowerCase()) && !haystack.includes("sessiontarget")) {
      reasons.push(`missing source ${citation.source}`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

export function goldUsesFixtureNumbers(caseDef: EvalCase) {
  const used = caseDef.expectedTools;
  return gradeGrounding({
    expectedTools: caseDef.expectedTools,
    usedTools: used,
    expectedCitations: caseDef.expectedCitations,
    answer: caseDef.goldAnswer,
  });
}

export function inventedAnswer(caseDef: EvalCase) {
  return gradeGrounding({
    expectedTools: caseDef.expectedTools,
    usedTools: caseDef.expectedTools,
    expectedCitations: caseDef.expectedCitations,
    answer: "Typical squat is 315 and you did 6 of 6 sessions.",
  });
}
