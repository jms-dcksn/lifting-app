import { describe, it, expect } from "vitest";
import { variantId, variantName, variantShortLabel, ownedVariantId, slugifyCustom } from "./exercise-id";
import { EXERCISE_BY_ID, type StationTag } from "./strength/coefficients";

const VARIANT_CASES: {
  tag: StationTag;
  display: string;
  baseId: string;
  brand: string;
  id: string;
  name: string;
}[] = [
  {
    tag: "selectorized",
    display: "stack",
    baseId: "lat-pulldown",
    brand: "Nautilus",
    id: "lat-pulldown__nautilus__selectorized",
    name: "Lat Pulldown (Cable) — Nautilus (stack)",
  },
  {
    tag: "plate_loaded",
    display: "plate",
    baseId: "machine-chest-press",
    brand: "Hammer Strength",
    id: "machine-chest-press__hammer-strength__plate_loaded",
    name: "Machine Chest Press — Hammer Strength (plate)",
  },
  {
    tag: "bench",
    display: "bench",
    baseId: "bb-incline-bench",
    brand: "Flex Fitness",
    id: "bb-incline-bench__flex-fitness__bench",
    name: "Barbell Incline Bench — Flex Fitness (bench)",
  },
  {
    tag: "rack",
    display: "rack",
    baseId: "bb-back-squat",
    brand: "Rogue",
    id: "bb-back-squat__rogue__rack",
    name: "Barbell Back Squat — Rogue (rack)",
  },
  {
    tag: "platform",
    display: "platform",
    baseId: "bb-deadlift",
    brand: "Eleiko",
    id: "bb-deadlift__eleiko__platform",
    name: "Barbell Deadlift — Eleiko (platform)",
  },
];

describe("variantId", () => {
  it("builds a stable slug from base + brand + type", () => {
    expect(variantId("machine-chest-press", "Hammer Strength", "plate_loaded")).toBe(
      "machine-chest-press__hammer-strength__plate_loaded",
    );
  });
  it("handles a missing brand", () => {
    expect(variantId("leg-press", null, "selectorized")).toBe("leg-press____selectorized");
  });
});

describe("ownedVariantId", () => {
  it("namespaces the canonical slug by user when the global id is taken", () => {
    expect(ownedVariantId("leg-extension", "Hoist", "selectorized", "user-b")).toBe(
      "leg-extension__hoist__selectorized__user-b",
    );
  });
});

describe("station tags", () => {
  it.each(VARIANT_CASES)("variantId/variantName for $tag → $display", (row) => {
    expect(variantId(row.baseId, row.brand, row.tag)).toBe(row.id);
    expect(variantName(EXERCISE_BY_ID[row.baseId].name, row.brand, row.tag)).toBe(row.name);
    expect(variantShortLabel(row.brand, row.tag)).toBe(`${row.brand} (${row.display})`);
  });
});

describe("variantName", () => {
  it("appends brand and a short type tag", () => {
    expect(variantName("Machine Chest Press", "Cybex", "plate_loaded")).toBe(
      "Machine Chest Press — Cybex (plate)",
    );
    expect(variantName("Leg Press", "Hoist", "selectorized")).toBe("Leg Press — Hoist (stack)");
  });
  it("omits brand when absent", () => {
    expect(variantName("Leg Press", null, "plate_loaded")).toBe("Leg Press (plate)");
  });
});

describe("variantShortLabel", () => {
  it("keeps brand and type together", () => {
    expect(variantShortLabel("Hammer Strength", "plate_loaded")).toBe("Hammer Strength (plate)");
  });
  it("distinguishes two variants of one movement by brand and by type", () => {
    expect(variantShortLabel("Cybex", "plate_loaded")).not.toBe(
      variantShortLabel("Hoist", "plate_loaded"),
    );
    expect(variantShortLabel("Hoist", "plate_loaded")).not.toBe(
      variantShortLabel("Hoist", "selectorized"),
    );
  });
  it("falls back to whichever identity exists", () => {
    expect(variantShortLabel(null, "selectorized")).toBe("stack");
    expect(variantShortLabel("Hoist", null)).toBe("Hoist");
  });
  it("returns null for an exercise with no machine identity", () => {
    expect(variantShortLabel(undefined, undefined)).toBeNull();
  });
});

describe("slugifyCustom", () => {
  it("slugs a custom name with a prefix", () => {
    expect(slugifyCustom("Landmine Press!")).toMatch(/^custom-landmine-press/);
  });
});
