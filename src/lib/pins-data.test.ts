import { describe, expect, it, vi } from "vitest";
import { loadUserPinRows } from "./pins-data";

function client(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
  return { query, db: { from: vi.fn(() => query) } as unknown as Parameters<typeof loadUserPinRows>[0] };
}

describe("loadUserPinRows", () => {
  it("returns rows when the pin table is present", async () => {
    const { db, query } = client({
      data: [{ exercise_id: "bb-hip-thrust", position: 1 }],
      error: null,
    });
    await expect(loadUserPinRows(db, "owner")).resolves.toEqual([
      { exerciseId: "bb-hip-thrust", position: 1 },
    ]);
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
  });

  it("does not crash Board, session, or history when the pin table is missing", async () => {
    const { db } = client({
      data: null,
      error: {
        code: "PGRST205",
        message: "Could not find the table 'public.user_exercise_pin' in the schema cache",
      },
    });
    await expect(loadUserPinRows(db, "owner")).resolves.toEqual([]);
  });

  it("still surfaces unexpected pin-read failures", async () => {
    const { db } = client({ data: null, error: { code: "PGRST301", message: "JWT expired" } });
    await expect(loadUserPinRows(db, "owner")).rejects.toThrow("Unable to load pins");
  });
});
