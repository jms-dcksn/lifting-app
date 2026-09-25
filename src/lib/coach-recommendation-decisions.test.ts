import { describe, expect, it } from "vitest";
import {
  pendingCoachRecommendations,
  type RecommendationDecision,
} from "./coach-recommendation-decisions";

const now = "2026-09-25T12:00:00.000Z";

function item(key: string, extra: { kind?: "add_load" | "insufficient_data"; confidence?: "high" | "insufficient" } = {}) {
  return {
    key,
    kind: extra.kind ?? "add_load",
    confidence: extra.confidence ?? "high",
  };
}

function decision(
  recommendationKey: string,
  status: RecommendationDecision["status"],
  deferredUntil: string | null = null,
): RecommendationDecision {
  return { recommendationKey, status, deferredUntil };
}

describe("pendingCoachRecommendations", () => {
  it("hides accepted, dismissed, and still-deferred keys", () => {
    const pending = pendingCoachRecommendations(
      [
        item("rec_aaaaaaaaaaaaaaaa"),
        item("rec_bbbbbbbbbbbbbbbb"),
        item("rec_cccccccccccccccc"),
        item("rec_dddddddddddddddd"),
      ],
      [
        decision("rec_aaaaaaaaaaaaaaaa", "accepted"),
        decision("rec_bbbbbbbbbbbbbbbb", "dismissed"),
        decision("rec_cccccccccccccccc", "deferred", "2026-10-02T12:00:00.000Z"),
      ],
      now,
    );
    expect(pending.map((row) => row.key)).toEqual(["rec_dddddddddddddddd"]);
  });

  it("shows a deferral again after its deadline and skips insufficient rows", () => {
    const pending = pendingCoachRecommendations(
      [
        item("rec_aaaaaaaaaaaaaaaa"),
        item("rec_bbbbbbbbbbbbbbbb", { kind: "insufficient_data" }),
        item("rec_cccccccccccccccc", { confidence: "insufficient" }),
      ],
      [decision("rec_aaaaaaaaaaaaaaaa", "deferred", "2026-09-25T11:59:00.000Z")],
      now,
    );
    expect(pending.map((row) => row.key)).toEqual(["rec_aaaaaaaaaaaaaaaa"]);
  });
});
