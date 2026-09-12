import { describe, expect, it } from "vitest";
import { bodyweightTrend, type BodyweightEntry } from "./bodyweight";
import { shiftWeightDay, weightChartData, weightGoalDistance, weightRangeStart, weeklyWeightData } from "./weight-trends";
const entry = (loggedOn: string, weight: number): BodyweightEntry => ({ id: loggedOn, loggedOn, weight });

describe("weight trends", () => {
  it("uses six days before the visible range, not seven observations", () => {
    const data = weightChartData([entry("2026-08-08", 500), entry("2026-08-09", 140), entry("2026-08-15", 160)], "2026-09-13", "30");
    expect(data[0]).toMatchObject({ date: "2026-08-15", average: 150, count: 2, reading: 160 });
  });
  it("matches canonical Coach windows on every plotted date", () => {
    const entries = Array.from({ length: 50 }, (_, i) => entry(shiftWeightDay("2026-09-12", -i * 3), 150 + i / 10));
    for (const point of weightChartData(entries, "2026-09-12", "90")) {
      const window = bodyweightTrend(entries, point.date).current;
      expect(point.average).toBeCloseTo(window.average!);
      expect(point.count).toBe(window.observationCount);
    }
  });
  it("marks gaps and never fabricates raw readings", () => {
    const data = weightChartData([entry("2026-08-01", 150), entry("2026-09-01", 160)], "2026-09-12", "all");
    expect(data.find(p => p.date === "2026-08-07")).toMatchObject({ average: 150, reading: null, count: 1 });
    expect(data.find(p => p.date === "2026-08-08")).toMatchObject({ average: null, reading: null, count: 0 });
    expect(data.at(-1)?.average).toBeNull();
    expect(data.filter(p => p.reading != null)).toHaveLength(2);
  });
  it("handles empty, invalid, future, and extremely old observations", () => {
    expect(weightChartData([], "2026-09-12", "90").every(p => p.average == null)).toBe(true);
    const data = weightChartData([entry("0001-01-01", 150), entry("2026-09-13", 170), entry("2026-02-30", 160), entry("2026-09-10", NaN)], "2026-09-12", "all");
    expect(data).toHaveLength(9);
    expect(data[0].reading).toBe(150);
  });
  it("recalculates backdated corrections and deletions", () => {
    const entries = [entry("2026-09-08", 150), entry("2026-09-12", 160)];
    expect(weightChartData(entries, "2026-09-12", "30").at(-1)?.average).toBe(155);
    expect(weightChartData([entry("2026-09-08", 140), entries[1]], "2026-09-12", "30").at(-1)?.average).toBe(150);
    expect(weightChartData([entries[1]], "2026-09-12", "30").at(-1)?.average).toBe(160);
  });
  it("uses true calendar ranges across leap days and month ends", () => {
    expect(weightRangeStart("2024-08-31", "6m")).toBe("2024-02-29");
    expect(weightRangeStart("2026-08-31", "6m")).toBe("2026-02-28");
    expect(weightRangeStart("2026-09-12", "90")).toBe("2026-06-15");
    expect(weightRangeStart("2026-09-12", "all", "2020-01-01")).toBe("2020-01-01");
  });
  it("uses Monday weeks and labels partial weeks without overlap", () => {
    const entries = [entry("2026-09-06", 140), entry("2026-09-07", 150), entry("2026-09-12", 160)];
    const weeks = weeklyWeightData(entries, "2026-09-12");
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-2)).toMatchObject({ start: "2026-08-31", end: "2026-09-06", average: 140, observationCount: 1, partial: false });
    expect(weeks.at(-1)).toMatchObject({ start: "2026-09-07", end: "2026-09-12", average: 155, observationCount: 2, partial: true });
    expect(weeklyWeightData(entries, "2026-09-13").at(-1)?.partial).toBe(false);
  });
  it("reports both sides of a changed or crossed goal without inventing percentages", () => {
    expect(weightGoalDistance(150, 160)).toEqual({ pounds: 10, position: "below" });
    expect(weightGoalDistance(165, 160)).toEqual({ pounds: 5, position: "above" });
    expect(weightGoalDistance(150, 140)).toEqual({ pounds: 10, position: "above" });
    expect(weightGoalDistance(150, 150)).toEqual({ pounds: 0, position: "at" });
    expect(weightGoalDistance(null, 160)).toBeNull();
    expect(weightGoalDistance(150, null)).toBeNull();
  });
});
