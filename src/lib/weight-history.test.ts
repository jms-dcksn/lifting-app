import { expect, it, vi } from "vitest";
import { loadWeightHistory } from "./weight-history";

it("paginates even below the requested cap and scopes every read to its owner", async () => {
  const pages = [[{ id: "2", logged_on: "2026-09-12", weight: 150 }], [{ id: "1", logged_on: "2020-01-01", weight: 140 }], []];
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => void) => resolve({ data: pages.shift(), error: null }) };
  const from = vi.fn(() => query);
  const entries = await loadWeightHistory({ from } as unknown as Parameters<typeof loadWeightHistory>[0], "owner", "2026-09-12");
  expect(entries.map(e => e.loggedOn)).toEqual(["2026-09-12", "2020-01-01"]);
  expect(query.eq.mock.calls).toEqual(Array(3).fill(["user_id", "owner"]));
  expect(query.lte.mock.calls).toEqual(Array(3).fill(["logged_on", "2026-09-12"]));
  expect(query.lt.mock.calls).toEqual([["logged_on", "2026-09-12"], ["logged_on", "2020-01-01"]]);
});

it("surfaces query failure instead of silently showing partial history", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: null, error: { message: "failure" } }) };
  await expect(loadWeightHistory({ from: () => query } as unknown as Parameters<typeof loadWeightHistory>[0], "owner", "2026-09-12")).rejects.toThrow("Unable to load weight history");
});
