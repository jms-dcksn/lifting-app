import { parseDateKey } from "./bodyweight";
import type { WeightRange } from "./weight-trends";
import { weightRangeStart } from "./weight-trends";

export const SITES = ["waist", "neck", "arm", "thigh", "chest"] as const;
export type MeasurementSite = (typeof SITES)[number];

export const SITE_META: Record<
  MeasurementSite,
  { label: string; stroke: string; dash?: string }
> = {
  waist: { label: "Waist", stroke: "var(--foreground)" },
  neck: { label: "Neck", stroke: "var(--foreground)", dash: "6 4" },
  arm: { label: "Arm", stroke: "var(--muted)" },
  thigh: { label: "Thigh", stroke: "var(--muted)", dash: "6 4" },
  chest: { label: "Chest", stroke: "var(--border-strong)" },
};

export interface BodyMeasurement {
  id: string;
  userId: string;
  loggedOn: string;
  site: MeasurementSite;
  inches: number;
}

export type MeasurementSeriesBySite = Record<MeasurementSite, BodyMeasurement[]>;

export type MeasurementChartPoint = {
  date: string;
  timestamp: number;
} & Partial<Record<MeasurementSite, number>>;

export type MeasurementWriteResult =
  | { ok: true; loggedOn: string; readings: Array<{ site: MeasurementSite; inches: number }> }
  | { ok: false; error: string };

const MAX_INCHES = 80;

export function isMeasurementSite(value: string): value is MeasurementSite {
  return (SITES as readonly string[]).includes(value);
}

export function parseInches(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_INCHES) return null;
  return n;
}

export function parseLoggedOn(value: unknown, today: string): string | null {
  if (typeof value !== "string") return null;
  try {
    parseDateKey(value);
  } catch {
    return null;
  }
  if (value > today) return null;
  return value;
}

export function parseMeasurementRow(row: {
  id: string;
  user_id: string;
  logged_on: string;
  site: string;
  inches: number;
}): BodyMeasurement | null {
  if (!isMeasurementSite(row.site)) return null;
  const inches = parseInches(row.inches);
  if (inches == null) return null;
  try {
    parseDateKey(row.logged_on);
  } catch {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    loggedOn: row.logged_on,
    site: row.site,
    inches,
  };
}

export function emptySeries(): MeasurementSeriesBySite {
  return {
    waist: [],
    neck: [],
    arm: [],
    thigh: [],
    chest: [],
  };
}

export function seriesBySite(entries: BodyMeasurement[]): MeasurementSeriesBySite {
  const series = emptySeries();
  for (const entry of entries) {
    if (!isMeasurementSite(entry.site)) continue;
    const inches = parseInches(entry.inches);
    if (inches == null) continue;
    try {
      parseDateKey(entry.loggedOn);
    } catch {
      continue;
    }
    series[entry.site].push(entry);
  }
  for (const site of SITES) {
    series[site].sort((a, b) => a.loggedOn.localeCompare(b.loggedOn));
  }
  return series;
}

export function sitesWithPoints(entries: BodyMeasurement[]): MeasurementSite[] {
  const series = seriesBySite(entries);
  return SITES.filter((site) => series[site].length > 0);
}

export function replaceMeasurements(
  existing: BodyMeasurement[],
  incoming: BodyMeasurement[],
): BodyMeasurement[] {
  const keyOf = (entry: BodyMeasurement) => `${entry.userId}:${entry.loggedOn}:${entry.site}`;
  const next = new Map<string, BodyMeasurement>();
  for (const entry of existing) next.set(keyOf(entry), entry);
  for (const entry of incoming) next.set(keyOf(entry), entry);
  return [...next.values()];
}

export function measurementChartData(
  entries: BodyMeasurement[],
  today: string,
  range: WeightRange,
): MeasurementChartPoint[] {
  const series = seriesBySite(entries);
  const valid = SITES.flatMap((site) => series[site]).filter((entry) => entry.loggedOn <= today);
  const first = valid.reduce<string | undefined>((earliest, entry) => {
    if (earliest == null || entry.loggedOn < earliest) return entry.loggedOn;
    return earliest;
  }, undefined);
  const start = weightRangeStart(today, range, first);
  const byDate = new Map<string, MeasurementChartPoint>();
  for (const entry of valid) {
    if (entry.loggedOn < start) continue;
    const point = byDate.get(entry.loggedOn) ?? {
      date: entry.loggedOn,
      timestamp: parseDateKey(entry.loggedOn),
    };
    point[entry.site] = entry.inches;
    byDate.set(entry.loggedOn, point);
  }
  return [...byDate.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function parseMeasurementWrite(input: unknown, today: string): MeasurementWriteResult {
  if (input == null || typeof input !== "object") {
    return { ok: false, error: "Enter at least one site." };
  }
  const raw = input as { loggedOn?: unknown; readings?: unknown };
  const loggedOn = parseLoggedOn(raw.loggedOn, today);
  if (!loggedOn) return { ok: false, error: "Choose today or an earlier valid date." };
  if (!Array.isArray(raw.readings) || raw.readings.length === 0) {
    return { ok: false, error: "Enter at least one site." };
  }
  const bySite = new Map<MeasurementSite, number>();
  for (const item of raw.readings) {
    if (item == null || typeof item !== "object") {
      return { ok: false, error: "Choose a valid site." };
    }
    const reading = item as { site?: unknown; inches?: unknown };
    if (typeof reading.site !== "string" || !isMeasurementSite(reading.site)) {
      return { ok: false, error: "Choose a valid site." };
    }
    const inches = parseInches(reading.inches);
    if (inches == null) {
      return { ok: false, error: "Enter inches greater than 0 and no more than 80." };
    }
    bySite.set(reading.site, inches);
  }
  return {
    ok: true,
    loggedOn,
    readings: SITES.filter((site) => bySite.has(site)).map((site) => ({
      site,
      inches: bySite.get(site)!,
    })),
  };
}
