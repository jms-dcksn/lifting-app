import { describe, it, expect } from "vitest";
import {
  EXERCISES,
  EXERCISE_BY_ID,
  KNOWN_BRANDS,
  PATTERN_LABEL,
  needsStation,
  type StationProfile,
} from "./coefficients";

const STATION_PROFILE_BY_ID: Record<string, StationProfile> = {
  "bb-bench": "bench",
  "bb-incline-bench": "bench",
  "db-bench": "none",
  "db-incline-bench": "none",
  "weighted-dip": "none",
  "machine-chest-press": "machine",
  "pec-deck": "machine",
  "bb-ohp": "rack",
  "db-shoulder-press": "none",
  "machine-shoulder-press": "machine",
  "bb-row": "none",
  "db-row": "none",
  "machine-row": "machine",
  "seated-cable-row": "cable",
  "lat-pulldown": "cable",
  "weighted-pullup": "none",
  "high-row": "machine",
  "bb-back-squat": "rack",
  "bb-front-squat": "rack",
  "hack-squat": "machine",
  "leg-press": "machine",
  "bb-deadlift": "platform",
  "bb-rdl": "platform",
  "back-extension": "machine",
  "db-split-squat": "none",
  "db-step-up": "none",
  "bb-reverse-lunge": "none",
  "bb-hip-thrust": "bench",
  "glute-drive": "machine",
  "seated-hip-abduction": "machine",
  "leg-extension": "machine",
  "seated-leg-curl": "machine",
  "standing-calf-raise": "machine",
  "bb-shrug": "none",
  "cable-shrug": "cable",
  "bb-curl": "none",
  "db-curl": "none",
  "cable-curl": "cable",
  "hammer-rope-curl": "cable",
  "cable-pushdown": "cable",
  "db-skullcrusher": "none",
  "db-lateral-raise": "none",
  "cable-lateral-raise": "cable",
  "machine-lateral-raise": "machine",
  "reverse-pec-deck": "machine",
  "cable-crunch": "cable",
  "machine-ab-crunch": "machine",
  "hanging-knee-raise": "none",
};

describe("catalog templates", () => {
  it("collapses machine equipment to a single 'machine' value", () => {
    const equipments = new Set(EXERCISES.map((e) => e.equipment));
    expect(equipments.has("machine" as never)).toBe(true);
    expect([...equipments]).not.toContain("machine_plate");
    expect([...equipments]).not.toContain("machine_pin");
  });

  it("maps every seed to the locked station profile", () => {
    expect(EXERCISES).toHaveLength(48);
    expect(Object.keys(STATION_PROFILE_BY_ID)).toHaveLength(48);
    expect(EXERCISES.map((e) => e.id).sort()).toEqual(Object.keys(STATION_PROFILE_BY_ID).sort());

    const counts = { machine: 0, cable: 0, bench: 0, rack: 0, platform: 0, none: 0 };
    for (const e of EXERCISES) {
      expect(e.stationProfile, e.id).toBe(STATION_PROFILE_BY_ID[e.id]);
      expect(needsStation(e), e.id).toBe(e.stationProfile !== "none");
      expect(e.machineTemplate, e.id).toBe(e.stationProfile === "machine" || undefined);
      counts[e.stationProfile!] += 1;
    }
    expect(counts).toEqual({ machine: 16, cable: 8, bench: 3, rack: 3, platform: 2, none: 16 });
  });

  it("treats a missing profile as already resolved", () => {
    expect(needsStation({})).toBe(false);
    expect(needsStation({ stationProfile: undefined })).toBe(false);
  });

  it("flags every machine template and gives it no brand", () => {
    for (const e of EXERCISES.filter((e) => e.equipment === "machine")) {
      expect(e.stationProfile, `${e.id} stationProfile`).toBe("machine");
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
