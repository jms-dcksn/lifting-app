import { describe, expect, it } from "vitest";
import { bodyweightTrend, dateKey } from "./bodyweight";
import { calendarDays, monthRange, shiftDate, shiftMonth, validWeightDate } from "./weight-calendar";

describe("weight calendar dates", () => {
  it("rejects impossible/future dates and accepts actual leap days", () => {
    for (const date of ["2026-02-29", "2026-04-31", "2026-00-10", "2026-13-01", "2026-09-13", "0000-01-01", "bad"]) {
      expect(validWeightDate(date, "2026-09-12"), date).toBe(false);
    }
    expect(validWeightDate("2024-02-29", "2026-09-12")).toBe(true);
    expect(validWeightDate("2026-09-12", "2026-09-12")).toBe(true);
  });
  it("uses Chicago today on either side of midnight and DST", () => {
    expect(dateKey(new Date("2026-09-13T04:59:59Z"))).toBe("2026-09-12");
    expect(dateKey(new Date("2026-09-13T05:00:00Z"))).toBe("2026-09-13");
    expect(dateKey(new Date("2026-03-08T07:59:59Z"))).toBe("2026-03-08");
    expect(dateKey(new Date("2026-03-08T08:00:00Z"))).toBe("2026-03-08");
  });
  it("constructs Monday-first full weeks without shifting stored dates", () => {
    const days = calendarDays("2024-02");
    expect(days.slice(0, 4)).toEqual([null, null, null, "2024-02-01"]);
    expect(days.filter(Boolean)).toHaveLength(29);
    expect(days.length % 7).toBe(0);
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(() => monthRange("2026-13")).toThrow();
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("backfilling and removing old readings leaves current weight determined by date", () => {
    const newest = { id: "new", loggedOn: "2026-09-12", weight: 149.2 };
    const old = { id: "old", loggedOn: "2026-03-01", weight: 155 };
    expect(bodyweightTrend([newest, old], "2026-09-12").latest).toEqual(newest);
    expect(bodyweightTrend([old], "2026-09-12").latest).toEqual(old);
    expect(bodyweightTrend([], "2026-09-12").latest).toBeNull();
  });
});
