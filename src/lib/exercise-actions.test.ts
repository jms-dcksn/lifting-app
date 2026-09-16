import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("Unauthenticated"); } }));

import { resolveVariant } from "@/app/(app)/exercise/actions";
import { ownedVariantId, variantId } from "./exercise-id";
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
});
