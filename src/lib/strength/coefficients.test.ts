import { describe, it, expect } from "vitest";
import { EXERCISES, EXERCISE_BY_ID, KNOWN_BRANDS, PATTERN_LABEL } from "./coefficients";

describe("catalog templates", () => {
  it("collapses machine equipment to a single 'machine' value", () => {
    const equipments = new Set(EXERCISES.map((e) => e.equipment));
    expect(equipments.has("machine" as never)).toBe(true);
    expect([...equipments]).not.toContain("machine_plate");
    expect([...equipments]).not.toContain("machine_pin");
  });

  it("flags every machine template and gives it no brand", () => {
    for (const e of EXERCISES.filter((e) => e.equipment === "machine")) {
      expect(e.machineTemplate, `${e.id} machineTemplate`).toBe(true);
      expect(e.needsCalibration, `${e.id} needsCalibration`).toBe(true);
      expect(e.brand, `${e.id} brand`).toBeUndefined();
    }
  });

  it("exposes the generic chest-press template", () => {
    const def = EXERCISE_BY_ID["machine-chest-press"];
    expect(def).toBeDefined();
    expect(def.pattern).toBe("horizontal_press");
    expect(def.coefficient).toBe(0.9);
    expect(EXERCISE_BY_ID["hs-chest-press"]).toBeUndefined();
  });

  it("adds a core pattern with a reference anchor", () => {
    expect(PATTERN_LABEL.core).toBe("Core");
    const ref = EXERCISES.find((e) => e.pattern === "core" && e.isReference);
    expect(ref?.id).toBe("cable-crunch");
  });

  it("lists the known brands", () => {
    expect(KNOWN_BRANDS).toContain("Hammer Strength");
    expect(KNOWN_BRANDS).toContain("Precor");
  });
});
