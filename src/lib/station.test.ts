import { describe, expect, it } from "vitest";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import {
  CHOOSE_STATION_COPY,
  chooseStationCopy,
  isLoggableExercise,
  shouldResolveStation,
  stationPickerForm,
  stationResolveInput,
} from "./station";

describe("station picker helpers", () => {
  it("uses profile-specific choose copy, never generic Choose station", () => {
    expect(chooseStationCopy("machine")).toBe("Choose machine");
    expect(chooseStationCopy("cable")).toBe("Choose cable");
    expect(chooseStationCopy("bench")).toBe("Choose bench");
    expect(chooseStationCopy("rack")).toBe("Choose rack");
    expect(chooseStationCopy("platform")).toBe("Choose platform");
    expect(chooseStationCopy("none")).toBeNull();
    expect(chooseStationCopy(undefined)).toBeNull();
    expect(Object.values(CHOOSE_STATION_COPY)).not.toContain("Choose station");
  });

  it.each([
    ["machine-chest-press", "brand-and-type", "Choose machine"],
    ["lat-pulldown", "brand-only", "Choose cable"],
    ["bb-incline-bench", "brand-only", "Choose bench"],
    ["bb-back-squat", "brand-only", "Choose rack"],
    ["bb-deadlift", "brand-only", "Choose platform"],
    ["bb-row", "none", undefined],
    ["db-incline-bench", "none", undefined],
  ] as const)("%s opens a %s form", (id, kind, copy) => {
    const form = stationPickerForm(EXERCISE_BY_ID[id]);
    expect(form.kind).toBe(kind);
    if (form.kind === "none") return;
    expect(form.copy).toBe(copy);
  });

  it("locks cable to selectorized and barbell stations to their profile tag", () => {
    expect(stationResolveInput(EXERCISE_BY_ID["lat-pulldown"], {
      brand: "Nautilus",
      machineType: "plate_loaded",
    })).toEqual({
      baseExerciseId: "lat-pulldown",
      brand: "Nautilus",
      machineType: "selectorized",
    });
    expect(stationResolveInput(EXERCISE_BY_ID["bb-incline-bench"], {
      brand: "Flex Fitness",
    })).toEqual({
      baseExerciseId: "bb-incline-bench",
      brand: "Flex Fitness",
      machineType: "bench",
    });
    expect(stationResolveInput(EXERCISE_BY_ID["machine-chest-press"], {
      brand: "Hammer Strength",
      machineType: "plate_loaded",
    })).toEqual({
      baseExerciseId: "machine-chest-press",
      brand: "Hammer Strength",
      machineType: "plate_loaded",
    });
  });

  it("session pickers resolve station templates; the builder does not", () => {
    expect(shouldResolveStation(EXERCISE_BY_ID["lat-pulldown"], true)).toBe(true);
    expect(shouldResolveStation(EXERCISE_BY_ID["bb-incline-bench"], true)).toBe(true);
    expect(shouldResolveStation(EXERCISE_BY_ID["machine-chest-press"], true)).toBe(true);
    expect(shouldResolveStation(EXERCISE_BY_ID["bb-row"], true)).toBe(false);
    expect(shouldResolveStation(EXERCISE_BY_ID["lat-pulldown"], false)).toBe(false);
    expect(isLoggableExercise(EXERCISE_BY_ID["lat-pulldown"])).toBe(false);
    expect(isLoggableExercise(EXERCISE_BY_ID["bb-row"])).toBe(true);
    expect(isLoggableExercise({ id: "variant" })).toBe(true);
    expect(isLoggableExercise(undefined)).toBe(false);
  });
});
