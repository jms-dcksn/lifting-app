import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import {
  isEligibleForPeriodTracking,
  loadPeriodObservations,
  loadPeriodObservationsInRange,
  savePeriodObservation,
  deleteAllPeriodObservations,
} from "./period-calendar";

const createMockDb = () => {
  const mock = {
    from: vi.fn(),
  };
  return mock as unknown as SupabaseClient<Database>;
};

describe("period-calendar", () => {
  let db: SupabaseClient<Database>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("isEligibleForPeriodTracking", () => {
    it("returns true when sex is female and tracking is enabled", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "female", period_tracking_enabled: true },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockFrom;

      const result = await isEligibleForPeriodTracking(db, "user-id");
      expect(result).toBe(true);
    });

    it("returns false when sex is not female", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "male", period_tracking_enabled: true },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockFrom;

      const result = await isEligibleForPeriodTracking(db, "user-id");
      expect(result).toBe(false);
    });

    it("returns false when tracking is disabled", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "female", period_tracking_enabled: false },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockFrom;

      const result = await isEligibleForPeriodTracking(db, "user-id");
      expect(result).toBe(false);
    });

    it("returns false on database error", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: new Error("Database error"),
            }),
          }),
        }),
      });
      (db.from as unknown) = mockFrom;

      const result = await isEligibleForPeriodTracking(db, "user-id");
      expect(result).toBe(false);
    });
  });

  describe("loadPeriodObservations", () => {
    it("returns empty array when not eligible", async () => {
      const mockProfileFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "male", period_tracking_enabled: false },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockProfileFrom;

      const result = await loadPeriodObservations(db, "user-id", "2026-09");
      expect(result).toEqual([]);
    });

    it("loads observations for eligible user", async () => {
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === "profile") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { sex: "female", period_tracking_enabled: true },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: "1", observed_on: "2026-09-15" },
                      { id: "2", observed_on: "2026-09-16" },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      });
      (db.from as unknown) = mockFrom;

      const result = await loadPeriodObservations(db, "user-id", "2026-09");
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", observedOn: "2026-09-15" });
    });

    it("returns empty for ineligible range loads and does not invent observations", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "female", period_tracking_enabled: false },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockFrom;

      const result = await loadPeriodObservationsInRange(db, "user-id", "2026-01-01", "2026-09-19");
      expect(result).toEqual([]);
      expect(mockFrom).toHaveBeenCalledWith("profile");
      expect(mockFrom).not.toHaveBeenCalledWith("period_observation");
    });
  });

  describe("savePeriodObservation", () => {
    it("rejects when not eligible", async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "male", period_tracking_enabled: false },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockFrom;

      const result = await savePeriodObservation(db, "user-id", "2026-09-15", "2026-09-15");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Period tracking not enabled or not eligible");
      }
    });

    it("rejects future dates", async () => {
      const mockProfileFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sex: "female", period_tracking_enabled: true },
              error: null,
            }),
          }),
        }),
      });
      (db.from as unknown) = mockProfileFrom;

      const result = await savePeriodObservation(db, "user-id", "2026-12-31", "2026-09-15");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Choose today or an earlier valid date");
      }
    });
  });

  describe("deleteAllPeriodObservations", () => {
    it("deletes all observations for user", async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete });
      (db.from as unknown) = mockFrom;

      const result = await deleteAllPeriodObservations(db, "user-id");
      expect(result.ok).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
