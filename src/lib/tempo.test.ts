import { describe, it, expect } from "vitest";
import { resolveTempo, tempoSchema, formatTempo } from "./tempo";
import { parseStoredPlan, editorSlot } from "./workout-editor";

describe("exercise tempo", () => {
  it("uses explicit tempo before compound and ordinary defaults, including stations", () => {
    expect(resolveTempo({id:"db-curl"})).toEqual([2,0,1,0]);
    expect(resolveTempo({id:"bb-bench"})).toEqual([3,0,1,0]);
    expect(resolveTempo({id:"station-1",baseExerciseId:"bb-bench"})).toEqual([3,0,1,0]);
    expect(resolveTempo({id:"bb-bench"},[2,1,1,0])).toEqual([2,1,1,0]);
    expect(resolveTempo({id:"custom-squat-name"})).toEqual([2,0,1,0]);
  });
  it("accepts only four non-negative whole seconds and formats consistently", () => {
    for (const invalid of [[1,2,3], [1,2,3,4,5], [-1,0,1,0], [1.5,0,1,0], ["3",0,1,0], [Infinity,0,1,0]]) {
      expect(tempoSchema.safeParse(invalid).success).toBe(false);
    }
    expect(formatTempo(tempoSchema.parse([12,0,1,0]))).toBe("12-0-1-0");
  });
  it("preserves explicit and captured tempo through serialized workout plans", () => {
    const slot = editorSlot({id:"00000000-0000-4000-8000-000000000001",exerciseId:"bb-bench",pattern:"horizontal_press",restSeconds:90,
      tempo:[2,1,1,0], resolvedTempo:[2,1,1,0], prescription:{targetSets:3,repMin:5,repMax:8,targetRir:2,targetRirMin:2,targetRirMax:2,phase:null},effectiveTarget:{target:null}});
    expect(parseStoredPlan(JSON.parse(JSON.stringify({version:1,slots:[slot]}))).slots[0].tempo).toEqual([2,1,1,0]);
    delete slot.tempo; delete slot.resolvedTempo;
    expect(parseStoredPlan({version:1,slots:[slot]}).slots[0].tempo).toBeUndefined();
  });
});
