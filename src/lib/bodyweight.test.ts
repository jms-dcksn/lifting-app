import { describe, expect, it } from "vitest";
import { bodyweightTrend, type BodyweightEntry } from "./bodyweight";

const entry = (loggedOn: string, weight: number, id = loggedOn): BodyweightEntry => ({
  id,
  loggedOn,
  weight,
});

describe("bodyweightTrend", () => {
  it("averages available observations in non-overlapping seven-day windows", () => {
    const trend = bodyweightTrend(
      [
        entry("2026-08-22", 182),
        entry("2026-08-23", 181),
        entry("2026-08-27", 180),
        entry("2026-08-29", 179),
        entry("2026-08-31", 178),
      ],
      "2026-08-31",
    );

    expect(trend.current).toMatchObject({
      start: "2026-08-25",
      end: "2026-08-31",
      average: 179,
      observationCount: 3,
    });
    expect(trend.previous).toMatchObject({
      start: "2026-08-18",
      end: "2026-08-24",
      average: 181.5,
      observationCount: 2,
    });
    expect(trend.change).toBe(-2.5);
    expect(trend.latest?.weight).toBe(178);
  });

  it("uses a single sparse reading rather than requiring seven entries", () => {
    const trend = bodyweightTrend([entry("2026-08-30", 180.5)], "2026-08-31");

    expect(trend.current.average).toBe(180.5);
    expect(trend.current.observationCount).toBe(1);
    expect(trend.change).toBeNull();
  });

  it("returns stable empty values when neither window has observations", () => {
    const trend = bodyweightTrend([entry("2026-08-01", 185)], "2026-08-31");

    expect(trend.latest?.weight).toBe(185);
    expect(trend.current.average).toBeNull();
    expect(trend.previous.average).toBeNull();
    expect(trend.change).toBeNull();
  });

  it("ignores invalid and future observations", () => {
    const trend = bodyweightTrend(
      [entry("2026-08-31", 180), entry("2026-09-01", 179), entry("bad-date", 170), entry("2026-08-30", 0)],
      "2026-08-31",
    );

    expect(trend.latest?.loggedOn).toBe("2026-08-31");
    expect(trend.current.observationCount).toBe(1);
  });
});
