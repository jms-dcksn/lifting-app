import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { runAgentTurn } from "./run";
import { bindReadTools } from "./tools";
import type { AgentMessage } from "./messages";
import { outputFromTurn } from "./evals/live";
import { dbExercise, ledgerSet, REVIEW_NOW, REVIEW_USER, reviewTestDb } from "./evals/review-test-data";

class ReviewScript extends BaseChatModel {
  readonly seen: BaseMessage[][] = [];
  constructor(private replies: AIMessage[]) { super({}); }
  _llmType() { return "review-script"; }
  bindTools() { return this; }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const message = this.replies.shift();
    if (!message) throw new Error("Review script exhausted");
    return { generations: [{ text: "", message }] };
  }
}
function call(args: Record<string, unknown>, id: string) {
  return new AIMessage({ content: "", tool_calls: [{ id, name: "exerciseReview", args, type: "tool_call" }] });
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(REVIEW_NOW)); });
afterEach(() => vi.useRealTimers());

async function followUp(input: { firstName: string; firstAnswer: string; followUp: string; nextArgs: Record<string, unknown>;
  nextAnswer: string; tables?: Record<string, Record<string, unknown>[]> }) {
  const db = reviewTestDb(input.tables ?? { set_log: [ledgerSet()] });
  const tools = bindReadTools(db.client, REVIEW_USER);
  const persisted: AgentMessage[] = [{ id: "user1", role: "user", parts: [{ type: "text", text: input.firstName }], createdAt: REVIEW_NOW }];
  const first = await runAgentTurn({ persisted, threadId: "fixture-review", tools,
    model: new ReviewScript([call({ name: input.firstName }, "c1"), new AIMessage(input.firstAnswer)]) });
  for (const [index, message] of first.entries()) persisted.push({ ...message, id: `first${index}`, createdAt: REVIEW_NOW });
  persisted.push({ id: "user2", role: "user", parts: [{ type: "text", text: input.followUp }], createdAt: REVIEW_NOW });
  const second = await runAgentTurn({ persisted, threadId: "fixture-review", tools,
    model: new ReviewScript([call(input.nextArgs, "c2"), new AIMessage(input.nextAnswer)]) });
  return { db, output: outputFromTurn(second) };
}

describe("exercise review conversation orchestration (scripted model, real read tools)", () => {
  it.each([
    { title: "confirmation", followUp: "Yes, back squat", nextArgs: { exerciseId: "bb-back-squat" }, exerciseId: "bb-back-squat", count: 1 },
    { title: "correction to an unlogged lift", followUp: "Front squat instead", nextArgs: { exerciseId: "bb-front-squat" }, exerciseId: "bb-front-squat", count: 0 },
  ])("re-reads current evidence after $title", async ({ followUp: question, nextArgs, exerciseId, count }) => {
    const { output, db } = await followUp({ firstName: "barbell squat", firstAnswer: "Back and front squat match; only back has sets. Did you mean back?\nSource: Exercise review",
      followUp: question, nextArgs, nextAnswer: "Current history loaded.\nSource: Exercise review" });
    expect(output.toolResults[0]?.result).toMatchObject({ exerciseId, availability: { loggedSetCount: count } });
    expect(db.requests.filter((url) => url.pathname.endsWith("set_log"))).toHaveLength(2);
    expect(output.toolCalls).toHaveLength(1);
  });
  it("selects a named machine without blending its sibling", async () => {
    const { output } = await followUp({ firstName: "hack squat", firstAnswer: "Cybex or Nautilus? I can show both separately.\nSource: Exercise review",
      followUp: "The Cybex one", nextArgs: { name: "cybex hack squat" }, nextAnswer: "Cybex is 228 lb.\nSource: Exercise review",
      tables: { exercise: [dbExercise("cybex", "Hack Squat — Cybex (plate)", "hack-squat"), dbExercise("nautilus", "Hack Squat — Nautilus (plate)", "hack-squat")],
        set_log: [ledgerSet({ exercise_id: "cybex" }), ledgerSet({ id: "nautilus-set", exercise_id: "nautilus", e1rm: 440 })] } });
    expect(output.toolResults[0]?.result).toMatchObject({ exerciseId: "cybex", latestEligibleE1rm: { e1rm: 228 } });
  });
  it("shows both original choices separately using one bounded read call", async () => {
    const { output } = await followUp({ firstName: "dumbbell bench", firstAnswer: "Flat or incline dumbbell bench? I can show both separately.\nSource: Exercise review",
      followUp: "Show both", nextArgs: { name: "dumbbell bench", all: true, matchKeys: ["movement:db-bench", "movement:db-incline-bench"] },
      nextAnswer: "Flat: no data. Incline: no data.\nSource: Exercise review" });
    expect(output.toolResults[0]?.result).toMatchObject({ reviews: [{ exerciseId: "db-bench", last: null }, { exerciseId: "db-incline-bench", last: null }], nextOffset: null });
  });
});
