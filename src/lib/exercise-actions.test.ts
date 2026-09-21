import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("Unauthenticated"); } }));

import { resolveVariant } from "@/app/(app)/exercise/actions";
import { ownedVariantId, variantId } from "./exercise-id";
import { EXERCISE_BY_ID, type StationTag } from "./strength/coefficients";
import type { DbExerciseRow } from "./catalog";

const USER_A = "16103ecf-ac56-4897-bbfd-cd557fc4a8be";
const USER_B = "a227317b-3e13-4e51-b853-111abd73b90a";
const HOIST_LEG = {
  id: "leg-extension__hoist__selectorized",
  user_id: USER_A,
  name: "Leg Extension — Hoist (stack)",
  pattern: "knee_extension",
  equipment: "machine",
  brand: "Hoist",
  machine_type: "selectorized",
  base_exercise_id: "leg-extension",
  coefficient: 1,
  is_reference: false,
  needs_calibration: true,
  increment: 10,
} satisfies DbExerciseRow & { user_id: string };

type Row = DbExerciseRow & { user_id: string };
let currentUser: string;
let rows: Row[];

function variantKey(row: Pick<Row, "user_id" | "base_exercise_id" | "brand" | "machine_type">) {
  return `${row.user_id}|${row.base_exercise_id}|${row.brand ?? ""}|${row.machine_type ?? ""}`;
}

function from() {
  let matched = rows.filter((row) => row.user_id === currentUser);
  let mutation: "insert" | null = null;
  let payload: Row | null = null;
  const query = {
    select: () => query,
    eq: (key: keyof Row, value: unknown) => {
      matched = matched.filter((row) => row[key] === value);
      return query;
    },
    is: (key: keyof Row, value: unknown) => {
      matched = matched.filter((row) => (value === null ? row[key] == null : row[key] === value));
      return query;
    },
    insert: (data: Row) => {
      mutation = "insert";
      payload = data;
      return query;
    },
    maybeSingle: () => query,
    single: () => query,
    then: (resolve: (result: unknown) => unknown) => {
      if (mutation === "insert" && payload) {
        if (rows.some((row) => row.id === payload!.id)) {
          return Promise.resolve(resolve({
            data: null,
            error: { code: "23505", message: 'duplicate key value violates unique constraint "exercise_pkey"' },
          }));
        }
        if (payload.base_exercise_id && rows.some((row) => variantKey(row) === variantKey(payload!))) {
          return Promise.resolve(resolve({
            data: null,
            error: { code: "23505", message: 'duplicate key value violates unique constraint "exercise_variant_unique"' },
          }));
        }
        rows.push(payload);
        matched = [payload];
      }
      return Promise.resolve(resolve({ data: matched[0] ?? null, error: null }));
    },
  };
  return query;
}

beforeEach(() => {
  currentUser = USER_B;
  rows = [{ ...HOIST_LEG }];
  mocks.client.mockResolvedValue({
    from,
    auth: { getClaims: async () => ({ data: { claims: { sub: currentUser } } }) },
  });
});

describe("resolveVariant", () => {
  const hoistLeg = {
    baseExerciseId: "leg-extension",
    brand: "Hoist",
    machineType: "selectorized" as const,
  };

  it("returns the caller's existing variant without inserting", async () => {
    currentUser = USER_A;
    const def = await resolveVariant(hoistLeg);
    expect(def.id).toBe(HOIST_LEG.id);
    expect(def.brand).toBe("Hoist");
    expect(rows).toHaveLength(1);
  });

  it("creates a canonical id when the slug is free", async () => {
    const def = await resolveVariant({
      baseExerciseId: "leg-extension",
      brand: "Nautilus",
      machineType: "selectorized",
    });
    expect(def.id).toBe(variantId("leg-extension", "Nautilus", "selectorized"));
    expect(def.name).toContain("Nautilus");
    expect(rows.some((row) => row.id === def.id && row.user_id === USER_B)).toBe(true);
  });

  // Production: exercise.id is a global PK, but variant slugs are not namespaced by user.
  // Another owner already holds leg-extension__hoist__selectorized; this used to throw
  // TypeError: Cannot read properties of null (reading 'id') from dbExerciseToDef.
  it("still resolves when another user already owns the canonical variant id", async () => {
    const def = await resolveVariant(hoistLeg);
    expect(def.id).toBe(ownedVariantId("leg-extension", "Hoist", "selectorized", USER_B));
    expect(def.brand).toBe("Hoist");
    expect(def.machineType).toBe("selectorized");
    expect(def.baseExerciseId).toBe("leg-extension");
    expect(def.name).toBe("Leg Extension — Hoist (stack)");
    expect(rows.filter((row) => row.user_id === USER_B && row.base_exercise_id === "leg-extension")).toHaveLength(1);
  });

  it("reuses the owned fallback instead of inserting twice", async () => {
    const first = await resolveVariant(hoistLeg);
    const second = await resolveVariant(hoistLeg);
    expect(second.id).toBe(first.id);
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(1);
  });

  it("recovers a same-user unique-index race", async () => {
    rows.push({
      ...HOIST_LEG,
      id: "already-owned",
      user_id: USER_B,
    });
    const def = await resolveVariant(hoistLeg);
    expect(def.id).toBe("already-owned");
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(1);
  });

  it("matches an unbranded variant by null brand", async () => {
    currentUser = USER_A;
    rows = [{ ...HOIST_LEG, id: "leg-extension____selectorized", brand: null, name: "Leg Extension (stack)" }];
    const def = await resolveVariant({
      baseExerciseId: "leg-extension",
      brand: "  ",
      machineType: "selectorized",
    });
    expect(def.id).toBe("leg-extension____selectorized");
    expect(rows).toHaveLength(1);
  });

  it("inherits machine equipment and calibration", async () => {
    const def = await resolveVariant({
      baseExerciseId: "machine-chest-press",
      brand: "Hammer Strength",
      machineType: "plate_loaded",
    });
    const inserted = rows.find((row) => row.id === def.id)!;
    expect(def.id).toBe(variantId("machine-chest-press", "Hammer Strength", "plate_loaded"));
    expect(def.equipment).toBe("machine");
    expect(def.needsCalibration).toBe(true);
    expect(def.isReference).toBe(false);
    expect(def.machineType).toBe("plate_loaded");
    expect(def.increment).toBe(EXERCISE_BY_ID["machine-chest-press"].increment);
    expect(inserted.equipment).toBe("machine");
    expect(inserted.needs_calibration).toBe(true);
    expect(inserted.is_reference).toBe(false);
  });
});

const INHERIT_CASES: {
  baseExerciseId: string;
  brand: string;
  machineType: StationTag;
  equipment: "machine" | "cable" | "barbell";
  needsCalibration: boolean;
  tag: string;
}[] = [
  {
    baseExerciseId: "lat-pulldown",
    brand: "Nautilus",
    machineType: "selectorized",
    equipment: "cable",
    needsCalibration: true,
    tag: "stack",
  },
  {
    baseExerciseId: "seated-cable-row",
    brand: "Hoist",
    machineType: "selectorized",
    equipment: "cable",
    needsCalibration: true,
    tag: "stack",
  },
  {
    baseExerciseId: "bb-incline-bench",
    brand: "Flex Fitness",
    machineType: "bench",
    equipment: "barbell",
    needsCalibration: false,
    tag: "bench",
  },
  {
    baseExerciseId: "bb-bench",
    brand: "Nautilus",
    machineType: "bench",
    equipment: "barbell",
    needsCalibration: false,
    tag: "bench",
  },
  {
    baseExerciseId: "bb-hip-thrust",
    brand: "Rogue",
    machineType: "bench",
    equipment: "barbell",
    needsCalibration: false,
    tag: "bench",
  },
  {
    baseExerciseId: "bb-back-squat",
    brand: "Rogue",
    machineType: "rack",
    equipment: "barbell",
    needsCalibration: false,
    tag: "rack",
  },
  {
    baseExerciseId: "bb-ohp",
    brand: "Rogue",
    machineType: "rack",
    equipment: "barbell",
    needsCalibration: false,
    tag: "rack",
  },
  {
    baseExerciseId: "bb-deadlift",
    brand: "Eleiko",
    machineType: "platform",
    equipment: "barbell",
    needsCalibration: false,
    tag: "platform",
  },
  {
    baseExerciseId: "bb-rdl",
    brand: "Eleiko",
    machineType: "platform",
    equipment: "barbell",
    needsCalibration: false,
    tag: "platform",
  },
];

describe("resolveVariant station profiles", () => {
  it.each(INHERIT_CASES)(
    "creates $baseExerciseId as $equipment / $machineType (calibrate=$needsCalibration)",
    async ({ baseExerciseId, brand, machineType, equipment, needsCalibration, tag }) => {
      const base = EXERCISE_BY_ID[baseExerciseId];
      const def = await resolveVariant({ baseExerciseId, brand, machineType });
      const inserted = rows.find((row) => row.id === def.id && row.user_id === USER_B)!;

      expect(def.id).toBe(variantId(baseExerciseId, brand, machineType));
      expect(def.name).toBe(`${base.name} — ${brand} (${tag})`);
      expect(def.equipment).toBe(equipment);
      expect(def.needsCalibration).toBe(needsCalibration);
      expect(def.isReference).toBe(false);
      expect(def.machineType).toBe(machineType);
      expect(def.brand).toBe(brand);
      expect(def.baseExerciseId).toBe(baseExerciseId);
      expect(def.pattern).toBe(base.pattern);
      expect(def.coefficient).toBe(base.coefficient);
      expect(def.increment).toBe(base.increment);
      expect(inserted.equipment).toBe(equipment);
      expect(inserted.needs_calibration).toBe(needsCalibration);
      expect(inserted.machine_type).toBe(machineType);
      expect(inserted.is_reference).toBe(false);
    },
  );

  it("reuses an existing cable variant without inserting", async () => {
    const existing = {
      id: variantId("lat-pulldown", "Nautilus", "selectorized"),
      user_id: USER_B,
      name: "Lat Pulldown (Cable) — Nautilus (stack)",
      pattern: "vertical_pull",
      equipment: "cable",
      brand: "Nautilus",
      machine_type: "selectorized",
      base_exercise_id: "lat-pulldown",
      coefficient: 1,
      is_reference: false,
      needs_calibration: true,
      increment: 10,
    } satisfies Row;
    rows.push(existing);
    const def = await resolveVariant({
      baseExerciseId: "lat-pulldown",
      brand: "Nautilus",
      machineType: "selectorized",
    });
    expect(def.id).toBe(existing.id);
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(1);
  });

  it("owns a cable slug when another user already holds the canonical id", async () => {
    rows.push({
      id: variantId("lat-pulldown", "Nautilus", "selectorized"),
      user_id: USER_A,
      name: "Lat Pulldown (Cable) — Nautilus (stack)",
      pattern: "vertical_pull",
      equipment: "cable",
      brand: "Nautilus",
      machine_type: "selectorized",
      base_exercise_id: "lat-pulldown",
      coefficient: 1,
      is_reference: false,
      needs_calibration: true,
      increment: 10,
    });
    const def = await resolveVariant({
      baseExerciseId: "lat-pulldown",
      brand: "Nautilus",
      machineType: "selectorized",
    });
    expect(def.id).toBe(ownedVariantId("lat-pulldown", "Nautilus", "selectorized", USER_B));
    expect(def.equipment).toBe("cable");
    expect(def.needsCalibration).toBe(true);
    expect(rows.filter((row) => row.user_id === USER_B && row.base_exercise_id === "lat-pulldown")).toHaveLength(1);
  });

  it("recovers a same-user unique-index race for a bench station", async () => {
    rows.push({
      id: "already-owned-bench",
      user_id: USER_B,
      name: "Barbell Incline Bench — Flex Fitness (bench)",
      pattern: "horizontal_press",
      equipment: "barbell",
      brand: "Flex Fitness",
      machine_type: "bench",
      base_exercise_id: "bb-incline-bench",
      coefficient: 0.82,
      is_reference: false,
      needs_calibration: false,
      increment: 5,
    });
    const def = await resolveVariant({
      baseExerciseId: "bb-incline-bench",
      brand: "Flex Fitness",
      machineType: "bench",
    });
    expect(def.id).toBe("already-owned-bench");
    expect(def.equipment).toBe("barbell");
    expect(def.needsCalibration).toBe(false);
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(1);
  });

  it.each([
    { baseExerciseId: "lat-pulldown", machineType: "plate_loaded" as StationTag },
    { baseExerciseId: "lat-pulldown", machineType: "bench" as StationTag },
    { baseExerciseId: "bb-bench", machineType: "rack" as StationTag },
    { baseExerciseId: "bb-bench", machineType: "selectorized" as StationTag },
    { baseExerciseId: "bb-back-squat", machineType: "platform" as StationTag },
    { baseExerciseId: "bb-deadlift", machineType: "rack" as StationTag },
    { baseExerciseId: "machine-chest-press", machineType: "bench" as StationTag },
  ])("rejects $baseExerciseId + $machineType", async ({ baseExerciseId, machineType }) => {
    await expect(resolveVariant({
      baseExerciseId,
      brand: "Nautilus",
      machineType,
    })).rejects.toThrow("Station tag does not match template profile");
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(0);
  });

  it.each(["bb-row", "db-bench", "weighted-dip"] as const)(
    "rejects a none-profile template (%s)",
    async (baseExerciseId) => {
      await expect(resolveVariant({
        baseExerciseId,
        brand: "Rogue",
        machineType: "selectorized",
      })).rejects.toThrow("Template does not require a station");
      expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(0);
    },
  );

  it.each([
    { baseExerciseId: "lat-pulldown", machineType: "selectorized" as const },
    { baseExerciseId: "bb-incline-bench", machineType: "bench" as const },
    { baseExerciseId: "bb-ohp", machineType: "rack" as const },
    { baseExerciseId: "bb-rdl", machineType: "platform" as const },
  ])("requires a brand for $baseExerciseId", async ({ baseExerciseId, machineType }) => {
    await expect(resolveVariant({
      baseExerciseId,
      brand: null,
      machineType,
    })).rejects.toThrow("Brand required");
    await expect(resolveVariant({
      baseExerciseId,
      brand: "   ",
      machineType,
    })).rejects.toThrow("Brand required");
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(0);
  });

  it("rejects an unknown template before writing", async () => {
    await expect(resolveVariant({
      baseExerciseId: "not-a-real-lift",
      brand: "Nautilus",
      machineType: "selectorized",
    })).rejects.toThrow("Unknown template: not-a-real-lift");
    expect(rows.filter((row) => row.user_id === USER_B)).toHaveLength(0);
  });
});
