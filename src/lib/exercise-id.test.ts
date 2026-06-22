import { describe, it, expect } from "vitest";
import { variantId, variantName, slugifyCustom } from "./exercise-id";

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

describe("slugifyCustom", () => {
  it("slugs a custom name with a prefix", () => {
    expect(slugifyCustom("Landmine Press!")).toMatch(/^custom-landmine-press/);
  });
});
