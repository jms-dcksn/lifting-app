import { describe, it } from "vitest";

describe.skipIf(process.env.EVAL_LIVE !== "1")("ai-coach live eval", () => {
  it("runs the live exercise review examples", async () => {
    const { runLiveExperiment } = await import("./live-experiment");
    await runLiveExperiment();
  }, 900_000);
});
