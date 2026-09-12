import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { loadWeightMonth, removeWeightEntry, writeWeightEntry } from "@/app/(app)/weight/actions";

const owner = "a0000000-0000-0000-0000-000000000001";
const id = "a0000000-0000-0000-0000-000000000002";
const rpc = vi.fn();
const query = {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(), order: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(), delete: vi.fn().mockReturnThis(),
};
const from = vi.fn(() => query);
const claims = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T04:00:00Z"));
  claims.mockResolvedValue({ data: { claims: { sub: owner } } });
  mocks.client.mockResolvedValue({ auth: { getClaims: claims }, from, rpc });
  rpc.mockResolvedValue({ data: id, error: null });
  query.order.mockResolvedValue({ data: [], error: null });
  query.single.mockResolvedValue({ data: { id }, error: null });
});
afterEach(() => vi.useRealTimers());

describe("authenticated weight actions", () => {
  it("fetches a whole requested old month under the current user's ownership", async () => {
    expect(await loadWeightMonth("2024-02")).toEqual({ today: "2026-09-12", entries: [] });
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
    expect(query.gte).toHaveBeenCalledWith("logged_on", "2024-02-01");
    expect(query.lte).toHaveBeenCalledWith("logged_on", "2024-02-29");
  });
  it("rejects invalid dates and weights before a database mutation", async () => {
    for (const loggedOn of ["2026-02-29", "2026-09-13", "garbage"]) {
      expect((await writeWeightEntry({ entryId: null, loggedOn, weight: 149 })).ok).toBe(false);
    }
    for (const weight of [NaN, Infinity, 0, -1, 1501]) {
      expect((await writeWeightEntry({ entryId: null, loggedOn: "2026-09-12", weight })).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the atomic RPC and refreshes every live weight consumer", async () => {
    expect(await writeWeightEntry({ entryId: id, loggedOn: "2026-03-01", weight: 155 })).toEqual({ ok: true, id });
    expect(rpc).toHaveBeenCalledWith("save_bodyweight_entry", {
      p_entry_id: id, p_logged_on: "2026-03-01", p_weight: 155, p_replace_entry_id: null,
    });
    for (const path of ["/", "/settings", "/analytics", "/workout/next"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
    expect(mocks.revalidate).toHaveBeenCalledWith("/session/[id]", "page");
    expect(from).not.toHaveBeenCalled(); // no profile/set/e1RM rewrite
  });
  it("surfaces the owned conflicting record for explicit replacement without retrying a write", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    query.maybeSingle.mockResolvedValue({ data: { id, logged_on: "2026-03-01", weight: 153 }, error: null });
    expect(await writeWeightEntry({ entryId: null, loggedOn: "2026-03-01", weight: 155 })).toMatchObject({
      ok: false, conflict: { id, loggedOn: "2026-03-01", weight: 153 },
    });
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not report success or refresh on a failed replacement", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "private database details" } });
    const result = await writeWeightEntry({ entryId: id, loggedOn: "2026-03-01", weight: 155, replaceEntryId: owner });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private database details");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("enforces user ownership on removals and rejects anonymous calls", async () => {
    expect(await removeWeightEntry(id)).toEqual({ ok: true });
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
    claims.mockResolvedValue({ data: null });
    await expect(loadWeightMonth("2026-09")).rejects.toThrow("Sign in");
    await expect(writeWeightEntry({ entryId: null, loggedOn: "2026-09-12", weight: 149 })).rejects.toThrow("Sign in");
    await expect(removeWeightEntry(id)).rejects.toThrow("Sign in");
  });
});
