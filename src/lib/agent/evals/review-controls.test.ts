import { describe, expect, it } from "vitest";
import { gradeReviewControl, gradeSupportedFigures } from "./evidence-grade";

const preferredControl = { required: ["back squat", "front squat", "only back squat has logged sets", "228 lb", "no trend", "did you mean back squat?"],
  forbidden: ["steadily rising", "405 lb"] };
const preferredGold = "I found back squat and front squat. Only back squat has logged sets. Last e1RM was 228 lb; no trend from one point. Did you mean back squat?\nSource: Exercise review";
const evidence = { exerciseId: "bb-back-squat", last: { dateKey: "2026-09-09", bestE1rm: 228 }, chartLast8: [{ dateKey: "2026-09-09", e1rm: 228 }] };

describe("independently authored review controls", () => {
  it("accepts transparent single-history disclosure and rejects the old hidden squat answer", () => {
    expect(gradeReviewControl(preferredGold, preferredControl).score).toBe(1);
    expect(gradeReviewControl("Back squat was 228 lb; no trend.\nSource: Exercise review", preferredControl).score).toBe(0);
    expect(gradeReviewControl(preferredGold.replace("Did you mean back squat?", ""), preferredControl).score).toBe(0);
    expect(gradeReviewControl(preferredGold.replace("Only back squat has logged sets", "Both have logged sets"), preferredControl).score).toBe(0);
  });
  it("rejects unsupported figures/dates while allowing harmless rounding", () => {
    const score = (answer: string) => gradeSupportedFigures({ answer, toolCalls: [], toolResults: [{ name: "exerciseReview", result: evidence }] }).score;
    expect(score("228 lb on 2026-09-09.")).toBe(1);
    expect(score("228.0 lb on 2026-09-09.")).toBe(1);
    expect(score("405 lb on 2026-09-09.")).toBe(0);
    expect(score("228 lb on 2026-10-09.")).toBe(0);
  });
  it("keeps historical availability, deload exclusion and machine labels in regression controls", () => {
    const history = { required: ["historical", "no recent comparison", "441.2 lb"], forbidden: ["21-day best", "steady climb"] };
    expect(gradeReviewControl("Historical Nautilus chart rose overall to 441.2 lb; no recent comparison.", history).score).toBe(1);
    expect(gradeReviewControl("21-day best 441.2 lb, steady climb.", history).score).toBe(0);
    const deload = { required: ["deload", "excluded", "latest eligible"], forbidden: ["not recorded", "no logged sets"] };
    expect(gradeReviewControl("Latest deload is excluded from comparisons; latest eligible e1RM is earlier.", deload).score).toBe(1);
    expect(gradeReviewControl("Deload e1RM was not recorded; no logged sets.", deload).score).toBe(0);
    const machines = { required: ["cybex", "nautilus", "separately"], forbidden: ["combined", "averaged"] };
    expect(gradeReviewControl("Cybex and Nautilus shown separately.", machines).score).toBe(1);
    expect(gradeReviewControl("Cybex and Nautilus averaged together.", machines).score).toBe(0);
  });
});
