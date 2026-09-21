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
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";

const owner = "a0000000-0000-0000-0000-000000000001";
const pins: { exercise_id: string; position: number }[] = [];
const stats: { exercise_id: string }[] = [];
const writes: { type: string; payload?: unknown }[] = [];

function from(table: string) {
  const result = () => ({
    data: table === "user_exercise_pin" ? pins : stats,
    error: null,
  });
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
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

  it.each(["seated-cable-row", "bb-incline-bench", "bb-hip-thrust", "machine-chest-press"] as const)(
    "refuses to pin unresolved station template %s as an extra",
    async (id) => {
      const result = await toggleExercisePin(id);
      expect(result).toEqual({ ok: false, error: "Choose a loggable exercise." });
      expect(writes).toEqual([]);
    },
  );

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
