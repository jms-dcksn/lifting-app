import { describe, expect, it } from "vitest";
import {
  measurementChartData,
  parseInches,
  parseMeasurementWrite,
  replaceMeasurements,
  seriesBySite,
  sitesWithPoints,
  type BodyMeasurement,
} from "./body-measurements";

const entry = (
  site: BodyMeasurement["site"],
  loggedOn: string,
  inches: number,
  id = `${site}-${loggedOn}`,
): BodyMeasurement => ({
  id,
  userId: "owner",
  loggedOn,
  site,
  inches,
});

describe("body measurements", () => {
  it("groups a mixed list into one series per site and leaves unused sites empty", () => {
    const series = seriesBySite([
      entry("neck", "2026-09-18", 13.2),
      entry("waist", "2026-09-19", 28.5),
      entry("waist", "2026-09-10", 29),
    ]);

    expect(series.waist.map((row) => row.inches)).toEqual([29, 28.5]);
    expect(series.neck.map((row) => row.loggedOn)).toEqual(["2026-09-18"]);
    expect(series.arm).toEqual([]);
    expect(series.thigh).toEqual([]);
    expect(series.chest).toEqual([]);
    expect(sitesWithPoints([entry("chest", "2026-09-19", 36)])).toEqual(["chest"]);
  });

  it("replaces the same owner, date, and site and keeps a second site on that date", () => {
    const next = replaceMeasurements(
      [entry("waist", "2026-09-19", 28.5, "old"), entry("neck", "2026-09-19", 13, "neck")],
      [entry("waist", "2026-09-19", 27.75, "new")],
    );

    expect(next).toHaveLength(2);
    expect(seriesBySite(next).waist).toEqual([
      expect.objectContaining({ id: "new", inches: 27.75 }),
    ]);
    expect(seriesBySite(next).neck).toEqual([
      expect.objectContaining({ inches: 13 }),
    ]);
  });

  it("rejects invalid inches and unknown sites at the parse boundary", () => {
    expect(parseInches(0)).toBeNull();
    expect(parseInches(80.01)).toBeNull();
    expect(parseInches(28.5)).toBe(28.5);

    expect(
      parseMeasurementWrite(
        { loggedOn: "2026-09-19", readings: [{ site: "calf", inches: 14 }] },
        "2026-09-19",
      ),
    ).toEqual({ ok: false, error: "Choose a valid site." });

    expect(
      parseMeasurementWrite(
        { loggedOn: "2026-09-19", readings: [{ site: "waist", inches: 0 }] },
        "2026-09-19",
      ),
    ).toEqual({ ok: false, error: "Enter inches greater than 0 and no more than 80." });

    expect(
      parseMeasurementWrite({ loggedOn: "2026-09-19", readings: [] }, "2026-09-19"),
    ).toEqual({ ok: false, error: "Enter at least one site." });
  });

  it("plots provided sites on one date and ignores a later out-of-range point", () => {
    const data = measurementChartData(
      [
        entry("waist", "2026-09-01", 28.5),
        entry("neck", "2026-09-01", 13),
        entry("arm", "2026-07-01", 12),
      ],
      "2026-09-19",
      "30",
    );

    expect(data).toEqual([
      expect.objectContaining({ date: "2026-09-01", waist: 28.5, neck: 13 }),
    ]);
    expect(data[0]?.arm).toBeUndefined();
  });
});
