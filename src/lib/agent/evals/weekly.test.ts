import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { WEEKLY_EXAMPLES } from "./weekly-cases";
import { runWeeklyTurn } from "./weekly-runner";

class WeeklyScript extends BaseChatModel {
  constructor(private replies: AIMessage[]) { super({}); }
  _llmType() { return "weekly-orchestration-script"; }
  bindTools() { return this; }
  async _generate(): Promise<ChatResult> {
    const message = this.replies.shift();
    if (!message) throw new Error("Weekly script exhausted");
    return { generations: [{ text: "", message }] };
  }
}

export function scriptedWeeklyModel(answer: string, name = "weeklyCoach") {
  return new WeeklyScript([new AIMessage({ content: "", tool_calls: [{ id: "fresh-call", name, args: {}, type: "tool_call" }] }), new AIMessage(answer)]);
}

describe("weekly fixture runner (not model narration quality)", () => {
  it("captures actual agent output and fresh evidence after a stale transcript", async () => {
    const example = WEEKLY_EXAMPLES.find((item) => item.inputs.id === "edited-history-freshness")!;
    const output = await runWeeklyTurn(example.inputs, scriptedWeeklyModel("2/4 so far.\nSource: Track Coach"));
    expect(output).toMatchObject({ answer: "2/4 so far.\nSource: Track Coach", toolCalls: [{ name: "weeklyCoach", args: {} }],
      toolResults: [{ name: "weeklyCoach", result: example.inputs.evidence.weeklyCoach }] });
    expect(output.toolResults).toHaveLength(1);
  });
  it("blocks attempted write execution while preserving the attempted tool call", async () => {
    const example = WEEKLY_EXAMPLES[0]!;
    const output = await runWeeklyTurn(example.inputs, scriptedWeeklyModel("No action performed.", "startNextWorkout"));
    expect(output.toolCalls[0]?.name).toBe("startNextWorkout");
    expect(output.toolResults[0]?.result).toMatchObject({ status: "unavailable" });
  });
});

import type { LiveTurnOutput } from "./live";
import { gradeWeeklyAnswer, validateWeeklySnapshot, weeklyJudgeRequest, WEEKLY_COACH_GUIDELINES, WEEKLY_JUDGE_QUESTIONS } from "./weekly-grade";

function control(id = "normal-summary", answer = "3 of 4 sessions; 45 minutes; squat 185 lb: 6 to 8 reps (+2). e1RM estimates: recent pair 242.8 lb versus 228.1 lb (+6.4%), gaining over comparable exposures.") {
  const example = WEEKLY_EXAMPLES.find((item) => item.inputs.id === id)!;
  const output: LiveTurnOutput = { answer, toolCalls: [{ name: "weeklyCoach", args: {} }],
    toolResults: [{ name: "weeklyCoach", result: example.inputs.evidence.weeklyCoach }] };
  return { example, output };
}
const passingScores = Object.fromEntries(Object.keys(WEEKLY_JUDGE_QUESTIONS).map((key) => [key, 0.95]));

describe("weekly regression fixtures and grading controls", () => {
  it("has ten synthetic, typed cases and explicit policy references", () => {
    expect(new Set(WEEKLY_EXAMPLES.map((row) => row.inputs.id)).size).toBe(10);
    for (const row of WEEKLY_EXAMPLES) {
      expect(row.metadata.synthetic).toBe(true);
      expect(row.outputs.requiredFacts.length).toBeGreaterThan(0);
      expect(row.outputs.qualifications.length).toBeGreaterThan(0);
      expect(row.outputs.prohibitedClaims.length).toBeGreaterThan(0);
      expect(row.inputs.evidence.weeklyCoach.report.version).toBe("1.0");
      expect(row.inputs.evidence.weeklyCoach.report.timeZone).toBe("America/Chicago");
      expect(JSON.stringify(row)).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|lsv2_|SUPABASE_SECRET_KEY|trace_id/);
    }
  });
  it("locks canonical figures, null comparisons, Chicago windows and current targets", () => {
    const normal = control().example.inputs.evidence.weeklyCoach;
    expect(normal.report.current.adherence).toEqual({ completedSessions: 3, plannedSessions: 4 });
    expect(normal.report.current.duration.averageMinutes).toBe(45);
    expect(normal.report.exerciseTrends[0]).toMatchObject({ classification: "gaining" });
    expect(normal.report.exerciseTrends[0]?.recentAverageE1rm).toBeCloseTo(242.8, 0);
    expect(normal.report.exerciseTrends[0]?.previousAverageE1rm).toBeCloseTo(228.1, 0);
    expect(normal.report.fixedLoadRepProgress[0]).toMatchObject({ weight: 185, currentBestReps: 8, priorBestReps: 6, repChange: 2 });
    // UTC Monday is still Sunday in Chicago for the full-week fixture.
    expect(normal.report.windows.current).toEqual({ startDate: "2026-10-12", endDate: "2026-10-18" });
    const partial = control("partial-calendar-comparison").example.inputs.evidence.weeklyCoach;
    expect(partial.report.windows.current).toEqual({ startDate: "2026-10-19", endDate: "2026-10-25" });
    expect(partial.currentWorkout?.week).toBe(3);
    const noData = control("no-workouts").example.inputs.evidence.weeklyCoach;
    expect(noData.report.current.duration.averageMinutes).toBeNull();
    expect(noData.report.exerciseTrends).toEqual([]);
    const recovery = control("recovery-week").example.inputs.evidence.weeklyCoach;
    expect(recovery.report.current.setExecution.completedWorkingSets).toBe(3);
    expect(recovery.report.prior.setExecution.completedWorkingSets).toBe(8);
    expect(recovery.currentWorkout?.slots[0]?.effectiveTarget.reason).toBe("recovery");
    const divergent = control("recommendation-vs-target").example.inputs.evidence.weeklyCoach;
    expect(divergent.recommendations[0]?.action.targetWeight).toBe(200);
    expect(divergent.currentWorkout?.slots[0]?.target).toMatchObject({ weight: 190, targetReps: 6, targetRir: 1 });
    expect(divergent.decisions[0]?.status).toBe("accepted");
    const pain = control("pain-session-scope").example.inputs.evidence.weeklyCoach;
    expect(pain.recommendations[0]?.exerciseId).toBeNull();
    expect(pain.recommendations[0]?.action.targetWeight).toBeNull();
  });
  it.each(["grounded", "complete"])("preserves an independent low %s score without extra columns", async (key) => {
    const { example, output } = control();
    const judge = vi.fn().mockResolvedValue({ ...passingScores, [key]: 0.69 });
    const grades = await gradeWeeklyAnswer(example.inputs, output, example.outputs, judge);
    expect(grades).toHaveLength(2);
    expect(grades.find((grade) => grade.key === key)?.score).toBe(0.69);
    expect(grades.find((grade) => grade.key !== key)?.score).toBe(0.95);
    expect(judge).toHaveBeenCalledTimes(1);
  });
  it.each(["grounded", "complete"])("rejects missing or invalid %s scores", async (key) => {
    const { example, output } = control();
    for (const score of [undefined, NaN, -0.1, 1.1]) {
      await expect(gradeWeeklyAnswer(example.inputs, output, example.outputs,
        vi.fn().mockResolvedValue({ ...passingScores, [key]: score }))).rejects.toThrow(`Invalid weekly judge score: ${key}`);
    }
  });
  it("fails an empty answer without spending a judge call", async () => {
    const { example, output } = control();
    const judge = vi.fn();
    expect(await gradeWeeklyAnswer(example.inputs, { ...output, answer: " " }, example.outputs, judge))
      .toEqual([{ key: "grounded", score: 0, comment: "Empty final answer." }, { key: "complete", score: 0, comment: "Empty final answer." }]);
    expect(judge).not.toHaveBeenCalled();
  });
  it("supplies current evidence and coverage guidance without tool allowlists or call limits", () => {
    const { example, output } = control("edited-history-freshness");
    const request = weeklyJudgeRequest(example.inputs, output, example.outputs);
    expect(request.state).toEqual({ question: example.inputs.question, history: example.inputs.history, asOf: example.inputs.asOf,
      answer: output.answer, currentTurnToolEvidence: output.toolResults, requiredFacts: example.outputs.requiredFacts,
      qualifications: example.outputs.qualifications, prohibitedClaims: example.outputs.prohibitedClaims, coachGuidelines: WEEKLY_COACH_GUIDELINES, judgeVersion: "weekly-judge-v3" });
    expect(Object.keys(request.questions)).toEqual(["grounded", "complete"]);
  });
  it("keeps the self-contained HTML dataset and reference source snippets current", () => {
    const html = readFileSync("docs/weekly-coach-evals.html", "utf8");
    const dataset = html.match(/<script type="application\/json" id="dataset">([\s\S]*?)<\/script>/)?.[1];
    expect(dataset).toBeTruthy();
    expect(JSON.parse(dataset!)).toEqual(WEEKLY_EXAMPLES);
    const snapshot = JSON.parse(readFileSync("src/lib/agent/evals/datasets/weekly-coach-v1.json", "utf8"));
    expect(snapshot).toEqual(WEEKLY_EXAMPLES);
    const manifest = JSON.parse(readFileSync("src/lib/agent/evals/datasets/weekly-coach-v1.langsmith.json", "utf8"));
    expect(manifest.name).toBe("lifting-app-weekly-coach-v1");
    expect(manifest.exampleCount).toBe(WEEKLY_EXAMPLES.length);
    expect(manifest.fixtureSha256).toBe(createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"));
    const runner = readFileSync("src/lib/agent/evals/weekly-runner.ts", "utf8");
    const snippet = 'if (definition.name === "weeklyCoach") return JSON.stringify(inputs.evidence.weeklyCoach);';
    expect(runner).toContain(snippet);
    expect(html).toContain(snippet);
    expect(readFileSync("docs/ai-coach.html", "utf8")).toContain(snippet);
  });
  it("accepts roundtripped snapshots and refuses missing, duplicate or silently edited remote cases", () => {
    const rows = JSON.parse(JSON.stringify(WEEKLY_EXAMPLES));
    expect(() => validateWeeklySnapshot(rows, WEEKLY_EXAMPLES)).not.toThrow();
    expect(() => validateWeeklySnapshot(rows.slice(1), WEEKLY_EXAMPLES)).toThrow("exactly");
    expect(() => validateWeeklySnapshot([...rows.slice(1), rows[1]], WEEKLY_EXAMPLES)).toThrow("Missing/duplicate");
    rows[0].inputs.question = "A silently edited question";
    expect(() => validateWeeklySnapshot(rows, WEEKLY_EXAMPLES)).toThrow("differs");
  });
});
