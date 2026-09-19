import { describe, expect, it } from "vitest";
import { exerciseSummaries, type AnalyticsSetRow } from "./analytics";

function row(
  id: string,
  performedAt: string,
  extra: Partial<AnalyticsSetRow> = {},
): AnalyticsSetRow {
  return {
    id,
    sessionId: extra.sessionId ?? id,
    exerciseId: extra.exerciseId ?? "leg-press",
    equipmentInstanceId: extra.equipmentInstanceId ?? null,
    weight: extra.weight ?? 200,
    reps: extra.reps ?? 8,
    rir: 1,
    e1rm: extra.e1rm ?? 280,
    createdAt: extra.createdAt ?? performedAt.replace("T12:", "T12:05:"),
    performedAt,
    finishedAt: extra.finishedAt === undefined ? performedAt.replace("T12:", "T13:") : extra.finishedAt,
    isWarmup: extra.isWarmup ?? false,
  };
}

describe("exerciseSummaries", () => {
  it("uses the latest finished instance instead of blending equipment", () => {
    const summaries = exerciseSummaries([
      row("old", "2026-08-01T12:00:00Z", { equipmentInstanceId: "hammer", e1rm: 400, sessionId: "s0" }),
      row("mid", "2026-09-02T12:00:00Z", { equipmentInstanceId: "hammer", e1rm: 410, sessionId: "s1" }),
      row("new", "2026-09-16T12:00:00Z", { equipmentInstanceId: "cybex", e1rm: 250, sessionId: "s2" }),
      row("open", "2026-09-18T12:00:00Z", { equipmentInstanceId: "open", e1rm: 500, sessionId: "s3", finishedAt: null }),
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      exerciseId: "leg-press",
      equipmentInstanceId: "cybex",
      currentE1rm: 250,
      sessionCount: 1,
      delta: null,
      e1rmSeries: [250],
    });
  });

  it("keeps one row per exercise keyed to that latest identity", () => {
    const summaries = exerciseSummaries([
      row("bench", "2026-09-16T12:00:00Z", { exerciseId: "bb-bench", e1rm: 150, sessionId: "s1" }),
      row("press", "2026-09-02T12:00:00Z", { equipmentInstanceId: "a", e1rm: 300, sessionId: "s2" }),
    ]);
    expect(summaries.map((summary) => [summary.exerciseId, summary.equipmentInstanceId, summary.currentE1rm]))
      .toEqual([
        ["bb-bench", null, 150],
        ["leg-press", "a", 300],
      ]);
  });
});
