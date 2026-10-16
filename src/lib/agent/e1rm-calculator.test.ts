import { describe, expect, it, vi } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { bindReadTools } from "./tools";
import { runAgentTurn } from "./run";
import { outputFromTurn } from "./evals/live";
import type { AgentMessage } from "./messages";
import { computeE1rm } from "@/lib/strength/e1rm";

// Exercises real adapters/orchestration. Scripted calls do not evaluate live-model tool selection.
class CalculatorScript extends BaseChatModel {
  readonly seen: BaseMessage[][] = [];
  constructor(private replies: AIMessage[]) { super({}); }
  _llmType() { return "calculator-script"; }
  bindTools() { return this; }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const message = this.replies.shift();
    if (!message) throw new Error("Calculator script exhausted");
    return { generations: [{ text: "", message }] };
  }
}

const question = (text: string): AgentMessage => ({ id: "user", role: "user", parts: [{ type: "text", text }], createdAt: "2026-10-15T12:00:00Z" });
const call = (args: Record<string, unknown>, id = "calculate") => new AIMessage({
  content: "", tool_calls: [{ id, name: "calculateE1rm", args, type: "tool_call" }],
});
const noDatabase = () => {
  const from = vi.fn(() => { throw new Error("Calculator must not read the ledger"); });
  const rpc = vi.fn(() => { throw new Error("Calculator must not write"); });
  return { from, rpc, tools: bindReadTools({ from, rpc } as never, "owner") };
};

describe("calculator agent contract (scripted model, real tools)", () => {
  it.each([
    { question: "If I bench a total 100 kg for 5 reps at 2 RIR, what is my e1RM?",
      args: { exerciseName: "bench", weight: 100, reps: 5, rir: 2, unit: "kg", loadConvention: "total_external" },
      load: 100, reps: 5, rir: 2, basis: "total_external", defaulted: false,
      answer: "Estimated e1RM: **123.3 kg total external load**, using 2 RIR. This is hypothetical, not a logged result.\nSource: hypothetical e1RM calculator" },
    { question: "For an unlogged custom dumbbell press outside my program: 30 kg per hand for 8 reps. Estimate e1RM.",
      args: { exerciseName: "custom dumbbell press", weight: 30, reps: 8, unit: "kg", loadConvention: "per_hand" },
      load: 30, reps: 8, rir: 2, basis: "per_hand", defaulted: true,
      answer: "Estimated e1RM: **40.6 kg per hand**, assuming the default 2 RIR. This is an estimate, not a measured max.\nSource: hypothetical e1RM calculator" },
    { question: "At 80 kg bodyweight, a pull-up with 20 kg assistance for 5 reps, 0 RIR: e1RM?",
      args: { exerciseName: "assisted pull-up", weight: -20, bodyweight: 80, reps: 5, rir: 0, unit: "kg", loadConvention: "assisted_bodyweight" },
      load: 60, reps: 5, rir: 0, basis: "total_system_load", defaulted: false,
      answer: "Estimated e1RM: **69.5 kg total system load**, not added weight or assistance, using 0 RIR.\nSource: hypothetical e1RM calculator" },
  ])("round-trips grounded evidence: $question", async (scenario) => {
    const db = noDatabase();
    const model = new CalculatorScript([call(scenario.args), new AIMessage(scenario.answer)]);
    const turn = await runAgentTurn({ persisted: [question(scenario.question)], threadId: "calculator", tools: db.tools, model });
    const output = outputFromTurn(turn);
    expect(output.toolCalls.map((item) => item.name)).toEqual(["calculateE1rm"]);
    expect(output.toolResults[0]?.result).toMatchObject({
      status: "estimated", kind: "hypothetical", estimateBasis: scenario.basis,
      rirDefaulted: scenario.defaulted,
      estimatedOneRepMax: computeE1rm(scenario.load, scenario.reps, scenario.rir),
    });
    const estimate = (output.toolResults[0]?.result as { estimatedOneRepMax: number }).estimatedOneRepMax;
    expect(output.answer).toContain(estimate.toFixed(1));
    expect(model.seen[1].some((message) => message.type === "tool" && String(message.content).includes("estimatedOneRepMax"))).toBe(true);
    expect(JSON.stringify(model.seen[0][0].content)).toContain("For actual logged e1RM, records or trends, use exerciseReview");
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("round-trips ambiguous context, then calculates only after explicit clarification", async () => {
    const db = noDatabase();
    const persisted = [question("Dumbbell bench 60 for 8 reps — what's my e1RM?")];
    const first = await runAgentTurn({ persisted, threadId: "calculator", tools: db.tools,
      model: new CalculatorScript([call({ weight: 60, reps: 8 }), new AIMessage("Is 60 kg or lb, and per hand or both dumbbells together?\nSource: hypothetical e1RM calculator")]) });
    expect(outputFromTurn(first).toolResults[0]?.result).toMatchObject({ status: "needs_input", missing: ["unit", "loadConvention"] });
    expect(outputFromTurn(first).toolResults[0]?.result).not.toHaveProperty("estimatedOneRepMax");
    first.forEach((message, index) => persisted.push({ ...message, id: `first-${index}`, createdAt: "2026-10-15T12:00:00Z" }));
    persisted.push({ ...question("60 lb per hand"), id: "follow-up" });
    const second = await runAgentTurn({ persisted, threadId: "calculator", tools: db.tools,
      model: new CalculatorScript([call({ weight: 60, reps: 8, unit: "lb", loadConvention: "per_hand" }, "clarified"),
        new AIMessage("Estimated e1RM: **81.2 lb per hand**, assuming 2 RIR.\nSource: hypothetical e1RM calculator")]) });
    expect(outputFromTurn(second).toolResults[0]?.result).toMatchObject({
      status: "estimated", estimatedOneRepMax: computeE1rm(60, 8, 2), unit: "lb", rirDefaulted: true,
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed arguments at the registered tool boundary", async () => {
    const db = noDatabase();
    const calculator = db.tools.find((item) => item.name === "calculateE1rm")!;
    await expect(calculator.invoke({ weight: 100, reps: -5, unit: "kg", loadConvention: "total_external" })).rejects.toThrow();
    await expect(calculator.invoke({ weight: 100, reps: 5, unit: "kg", loadConvention: "total_external", rir: 7 })).rejects.toThrow();
    const result = JSON.parse(await calculator.invoke({ weight: 0, reps: 5, unit: "kg", loadConvention: "total_external" }));
    expect(result.status).toBe("invalid_input");
    expect(result).not.toHaveProperty("estimatedOneRepMax");
  });
});
