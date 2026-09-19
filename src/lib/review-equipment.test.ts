import { describe, expect, it } from "vitest";
import {
  latestReviewEquipment,
  resolveReviewEquipment,
  reviewEquipmentChoiceLabel,
  reviewEquipmentChoices,
  reviewEquipmentLabel,
  reviewEquipmentParam,
  rowsForReviewEquipment,
} from "./review-equipment";

const now = new Date("2026-09-19T18:00:00Z");

function row(
  equipmentInstanceId: string | null,
  day: string,
  extra: { finishedAt?: string | null; createdAt?: string } = {},
) {
  return {
    equipmentInstanceId,
    performedAt: `${day}T12:00:00Z`,
    createdAt: extra.createdAt ?? `${day}T12:05:00Z`,
    finishedAt: extra.finishedAt === undefined ? `${day}T13:00:00Z` : extra.finishedAt,
  };
}

describe("reviewEquipmentParam", () => {
  it("treats none as an explicit null instance and ignores missing values", () => {
    expect(reviewEquipmentParam("none")).toBeNull();
    expect(reviewEquipmentParam("machine-1")).toBe("machine-1");
    expect(reviewEquipmentParam(undefined)).toBeUndefined();
    expect(reviewEquipmentParam("")).toBeUndefined();
    expect(reviewEquipmentParam(["none"])).toBeNull();
  });
});

describe("latestReviewEquipment", () => {
  it("picks the latest finished instance rather than blending", () => {
    expect(latestReviewEquipment([
      row("old-machine", "2026-08-01"),
      row(null, "2026-09-02"),
      row("new-machine", "2026-09-16"),
      row("open", "2026-09-18", { finishedAt: null }),
    ], now)).toBe("new-machine");
  });

  it("returns undefined when there is no finished history", () => {
    expect(latestReviewEquipment([row("open", "2026-09-18", { finishedAt: null })], now)).toBeUndefined();
  });
});

describe("reviewEquipmentChoices", () => {
  it("lists distinct identities with the latest first", () => {
    expect(reviewEquipmentChoices([
      row("old-machine", "2026-08-01"),
      row(null, "2026-09-02"),
      row("new-machine", "2026-09-16"),
    ], now)).toEqual(["new-machine", null, "old-machine"]);
  });
});

describe("resolveReviewEquipment", () => {
  it("honors an explicit query and otherwise defaults to the latest finished identity", () => {
    const rows = [row("old-machine", "2026-08-01"), row("new-machine", "2026-09-16")];
    expect(resolveReviewEquipment("old-machine", rows, now)).toBe("old-machine");
    expect(resolveReviewEquipment(null, rows, now)).toBeNull();
    expect(resolveReviewEquipment(undefined, rows, now)).toBe("new-machine");
  });
});

describe("rowsForReviewEquipment", () => {
  it("keeps only the selected identity", () => {
    const rows = [row("a", "2026-09-02"), row("b", "2026-09-16"), row(null, "2026-09-09")];
    expect(rowsForReviewEquipment(rows, "b").map((item) => item.equipmentInstanceId)).toEqual(["b"]);
    expect(rowsForReviewEquipment(rows, null)).toHaveLength(1);
  });
});

describe("reviewEquipmentLabel", () => {
  it("prefers a human label, then gym, and hides the line when there is no instance", () => {
    expect(reviewEquipmentLabel({ label: "Hammer Strength", gym: "Home" }, "id")).toBe("Hammer Strength");
    expect(reviewEquipmentLabel({ label: null, gym: "Home gym" }, "id")).toBe("Home gym");
    expect(reviewEquipmentLabel({ label: null, gym: null }, "abc-uuid")).toBe("abc-uuid");
    expect(reviewEquipmentLabel(undefined, null)).toBeNull();
    expect(reviewEquipmentChoiceLabel(undefined, null)).toBe("None");
  });
});
