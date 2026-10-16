import { describe, expect, it } from "vitest";
import { calculateE1rm } from "./calculate-e1rm";
import { computeE1rm } from "@/lib/strength/e1rm";

const bench = { exerciseName: "Barbell bench", weight: 100, reps: 5, rir: 2, unit: "kg", loadConvention: "total_external" };

describe("hypothetical e1RM calculator", () => {
  it.each(["kg", "lb"])("preserves %s inputs and matches the canonical helper without conversion", (unit) => {
    expect(calculateE1rm({ ...bench, unit })).toMatchObject({
      status: "estimated", kind: "hypothetical", formula: "computeE1rm", unit,
      inputs: { ...bench, unit, bodyweight: null }, rirDefaulted: false,
      effectiveLoad: 100, estimatedOneRepMax: computeE1rm(100, 5, 2),
      estimateBasis: "total_external",
    });
  });

  it("calculates for an arbitrary lift without catalog, program or history", () => {
    const result = calculateE1rm({ ...bench, exerciseName: "My custom landmine press" });
    expect(result).toMatchObject({ status: "estimated", inputs: { exerciseName: "My custom landmine press" } });
  });

  it("discloses default RIR 2 and keeps dumbbell estimates per hand", () => {
    const result = calculateE1rm({ ...bench, rir: undefined, weight: 30, loadConvention: "per_hand" });
    expect(result).toMatchObject({ status: "estimated", rirDefaulted: true,
      inputs: { rir: 2 }, estimatedOneRepMax: computeE1rm(30, 5, 2), estimateBasis: "per_hand" });
    expect(result.assumptions).toContain("RIR was omitted; assumed 2 reps in reserve.");
    expect(result.assumptions?.join(" ")).toContain("not both dumbbells combined");
  });

  it.each([
    { loadConvention: "bodyweight", weight: 0, total: 80 },
    { loadConvention: "bodyweight", weight: 20, total: 100 },
    { loadConvention: "assisted_bodyweight", weight: -20, total: 60 },
  ])("uses canonical total system load for $loadConvention / $weight", ({ loadConvention, weight, total }) => {
    expect(calculateE1rm({ ...bench, loadConvention, weight, bodyweight: 80 })).toMatchObject({
      status: "estimated", effectiveLoad: total, estimatedOneRepMax: computeE1rm(total, 5, 2),
      estimateBasis: "total_system_load", inputs: { weight, bodyweight: 80 },
    });
  });

  it("labels machine estimates as station-specific and rep-only lifts as unavailable", () => {
    const machine = calculateE1rm({ ...bench, loadConvention: "machine" });
    expect(machine).toMatchObject({ status: "estimated", estimateBasis: "machine" });
    expect(machine.assumptions?.join(" ")).toContain("do not transfer");
    expect(calculateE1rm({ reps: 10, loadConvention: "reps_only" })).toMatchObject({ status: "unavailable" });
  });

  it.each(["weight", "reps", "unit", "loadConvention"])("asks for missing %s without an estimate", (field) => {
    const input: Record<string, unknown> = { ...bench };
    delete input[field];
    const result = calculateE1rm(input);
    expect(result).toMatchObject({ status: "needs_input", missing: [field] });
    expect(result).not.toHaveProperty("estimatedOneRepMax");
  });

  it("asks for explicit bodyweight and never uses zero as a missing-load substitute", () => {
    expect(calculateE1rm({ ...bench, loadConvention: "bodyweight", weight: 0 })).toMatchObject({
      status: "needs_input", missing: ["bodyweight"],
    });
  });

  it.each([
    { weight: NaN }, { weight: Infinity }, { weight: -Infinity }, { weight: 0 }, { weight: -5 },
    { weight: "100" }, { reps: 0 }, { reps: -1 }, { reps: 2.5 }, { reps: Infinity }, { reps: NaN },
    { rir: -1 }, { rir: 6 }, { rir: Infinity }, { rir: NaN }, { rir: null },
    { unit: "lbs" }, { bodyweight: 0 }, { bodyweight: Infinity },
    { loadConvention: "assisted_bodyweight", weight: 20, bodyweight: 80 },
    { loadConvention: "assisted_bodyweight", weight: -80, bodyweight: 80 },
    { loadConvention: "assisted_bodyweight", weight: -90, bodyweight: 80 },
    { loadConvention: "bodyweight", weight: -20, bodyweight: 80 },
    { weight: Number.MAX_VALUE, reps: 12 },
  ])("rejects invalid inputs without an estimate: %j", (patch) => {
    const result = calculateE1rm({ ...bench, ...patch });
    expect(result.status).toBe("invalid_input");
    expect(result).not.toHaveProperty("estimatedOneRepMax");
  });

  it("honors zero/fractional RIR and discloses extrapolation above the table", () => {
    expect(calculateE1rm({ ...bench, reps: 1, rir: 0 })).toMatchObject({
      rirDefaulted: false, estimatedOneRepMax: 100,
    });
    expect(calculateE1rm({ ...bench, rir: 1.5 })).toMatchObject({ estimatedOneRepMax: computeE1rm(100, 5, 1.5) });
    const result = calculateE1rm({ ...bench, reps: 15 });
    expect(result.assumptions?.join(" ")).toContain("canonical extrapolation");
  });
});
