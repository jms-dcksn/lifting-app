import { describe, it } from "vitest";

describe.skipIf(process.env.EVAL_LIVE !== "1")("ai-coach live eval", () => {
  it("runs the incline bench e1RM example", async () => {
    const { runLiveExperiment } = await import("./live-experiment");
    await runLiveExperiment();
  }, 180_000);
});
