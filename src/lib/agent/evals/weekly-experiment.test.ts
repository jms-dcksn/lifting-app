import { describe, it } from "vitest";

describe.skipIf(process.env.EVAL_LIVE !== "1" || process.env.EVAL_WEEKLY_LIVE !== "1")("weekly Coach narration (paid, synthetic fixtures)", () => {
  it("evaluates actual model answers on the reviewed weekly dataset", async () => {
    const { runWeeklyExperiment } = await import("./weekly-experiment");
    await runWeeklyExperiment();
  }, 900_000);
});
