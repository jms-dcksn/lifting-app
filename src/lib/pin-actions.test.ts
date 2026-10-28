import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  revalidate: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/catalog", () => ({ getCatalogMap: mocks.catalog }));

import { toggleExercisePin } from "@/app/(app)/pins/actions";
import { buildBoardLifts, defaultCompoundIds, isExercisePinned } from "@/lib/board";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";

const owner = "a0000000-0000-0000-0000-000000000001";
const pins: { exercise_id: string; position: number }[] = [];
const stats: { exercise_id: string }[] = [];
const writes: { type: string; payload?: unknown }[] = [];

function from(table: string) {
  const filters: ((id: string) => boolean)[] = [];
  let deleting = false;
  const result = () => {
    if (deleting && table === "user_exercise_pin") {
      for (let i = pins.length - 1; i >= 0; i--) {
        if (filters.every((matches) => matches(pins[i].exercise_id))) pins.splice(i, 1);
      }
    }
    return {
      data: table === "user_exercise_pin" ? pins : stats,
      error: null,
    };
  };
  const query: Record<string, unknown> = {
    select: () => query,
    eq: (column: string, value: string) => {
      if (column === "exercise_id") filters.push((id) => id === value);
      return query;
    },
    in: (column: string, values: string[]) => {
      if (column === "exercise_id") filters.push((id) => values.includes(id));
      return query;
    },
    order: () => query,
    insert: async (payload: unknown) => {
      writes.push({ type: "insert", payload });
      return { error: null };
    },
    upsert: async (payload: unknown) => {
      writes.push({ type: "upsert", payload });
      return { error: null };
    },
    delete: () => {
      deleting = true;
      writes.push({ type: "delete" });
      return query;
    },
    then: (resolve: (value: unknown) => void) => resolve(result()),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  pins.length = 0;
  stats.length = 0;
  writes.length = 0;
  mocks.catalog.mockResolvedValue(EXERCISE_BY_ID);
  mocks.client.mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: owner } } }) },
    from,
  });
});

describe("toggleExercisePin", () => {
  it("pins an extra and refuses past the cap", async () => {
    stats.push(
      { exercise_id: "bb-back-squat" },
      { exercise_id: "bb-deadlift" },
      { exercise_id: "bb-bench" },
      { exercise_id: "bb-ohp" },
      { exercise_id: "bb-row" },
      { exercise_id: "lat-pulldown" },
    );
    const first = await toggleExercisePin("db-bench");
    expect(first).toEqual({ ok: true, pinned: true });
    expect(writes[0]).toMatchObject({ type: "insert" });

    pins.push({ exercise_id: "db-bench", position: 1 });
    pins.push({ exercise_id: "db-split-squat", position: 2 });
    writes.length = 0;
    const blocked = await toggleExercisePin("bb-curl");
    expect(blocked).toEqual({ ok: false, error: "Pin cap is 8. Unpin something first." });
    expect(writes).toEqual([]);
  });

  it.each(["seated-cable-row", "machine-chest-press"] as const)(
    "refuses to pin unresolved machine or cable template %s as an extra",
    async (id) => {
      const result = await toggleExercisePin(id);
      expect(result).toEqual({ ok: false, error: "Choose a loggable exercise." });
      expect(writes).toEqual([]);
    },
  );

  it("allows pinning a rolling station template as the display master", async () => {
    stats.push({ exercise_id: "bb-incline-bench__flex-fitness__bench" });
    const result = await toggleExercisePin("bb-incline-bench");
    expect(result).toEqual({ ok: true, pinned: true });
    expect(writes[0]).toMatchObject({ type: "insert" });
  });

  it("hides a default compound by writing a pin row", async () => {
    stats.push({ exercise_id: "bb-bench" });
    const result = await toggleExercisePin("bb-bench");
    expect(result).toEqual({ ok: true, pinned: false });
    expect(writes[0]).toMatchObject({
      type: "upsert",
      payload: { user_id: owner, exercise_id: "bb-bench", position: 0 },
    });
  });
});

describe("movement pin persistence", () => {
  const variantId = "bb-rdl__rogue__platform";
  const siblingId = "bb-rdl__eleiko__platform";
  const catalog = {
    ...EXERCISE_BY_ID,
    [variantId]: { ...EXERCISE_BY_ID["bb-rdl"], id: variantId, baseExerciseId: "bb-rdl", stationProfile: undefined },
    [siblingId]: { ...EXERCISE_BY_ID["bb-rdl"], id: siblingId, baseExerciseId: "bb-rdl", stationProfile: undefined },
  };
  const defaults = defaultCompoundIds(catalog);
  const rows = () => pins.map((pin) => ({ exerciseId: pin.exercise_id, position: pin.position }));
  const board = () => buildBoardLifts({ catalog, pins: rows(), summaries: [], weekExerciseIds: [] });

  it.each(["bb-rdl", variantId])("removes the Romanian Deadlift tile when unpinned through %s", async (clickedId) => {
    mocks.catalog.mockResolvedValue(catalog);
    pins.push(
      { exercise_id: variantId, position: 1 },
      { exercise_id: siblingId, position: 2 },
      { exercise_id: "bb-rdl", position: 3 },
      { exercise_id: "db-bench", position: 4 },
    );
    expect(board().map((lift) => lift.exerciseId)).toContain("bb-rdl");

    expect(await toggleExercisePin(clickedId)).toEqual({ ok: true, pinned: false });

    expect(board().map((lift) => lift.exerciseId)).not.toContain("bb-rdl");
    expect(pins).toEqual([{ exercise_id: "db-bench", position: 4 }]);
    expect(isExercisePinned(rows(), defaults, "bb-rdl", catalog)).toBe(false);
  });

  it("hides and restores a default through a station variant", async () => {
    const benchId = "bb-bench__rogue__bench";
    const benchCatalog = { ...catalog, [benchId]: {
      ...EXERCISE_BY_ID["bb-bench"], id: benchId, baseExerciseId: "bb-bench", stationProfile: undefined,
    } };
    mocks.catalog.mockResolvedValue(benchCatalog);
    expect(await toggleExercisePin(benchId)).toEqual({ ok: true, pinned: false });
    expect(writes[0]).toMatchObject({ type: "upsert", payload: { exercise_id: "bb-bench" } });
    pins.push({ exercise_id: "bb-bench", position: 0 });
    expect(await toggleExercisePin(benchId)).toEqual({ ok: true, pinned: true });
    expect(isExercisePinned(rows(), defaults, benchId, benchCatalog)).toBe(true);
  });

  it("stores a new variant pin under its movement id", async () => {
    mocks.catalog.mockResolvedValue(catalog);
    expect(await toggleExercisePin(variantId)).toEqual({ ok: true, pinned: true });
    expect(writes[0]).toMatchObject({ type: "insert", payload: { exercise_id: "bb-rdl" } });
  });

  it.each(["machine-chest-press", "seated-cable-row"])("keeps sibling %s pins independent", async (baseId) => {
    const firstId = `${baseId}__first`;
    const secondId = `${baseId}__second`;
    const stationCatalog = { ...catalog,
      [firstId]: { ...EXERCISE_BY_ID[baseId], id: firstId, baseExerciseId: baseId, stationProfile: undefined },
      [secondId]: { ...EXERCISE_BY_ID[baseId], id: secondId, baseExerciseId: baseId, stationProfile: undefined },
    };
    mocks.catalog.mockResolvedValue(stationCatalog);
    pins.push({ exercise_id: firstId, position: 1 }, { exercise_id: secondId, position: 2 });
    expect(await toggleExercisePin(firstId)).toEqual({ ok: true, pinned: false });
    expect(pins).toEqual([{ exercise_id: secondId, position: 2 }]);
    expect(isExercisePinned(rows(), defaults, secondId, stationCatalog)).toBe(true);
  });
});
