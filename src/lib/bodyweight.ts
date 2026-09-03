const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface BodyweightEntry {
  id: string;
  loggedOn: string;
  weight: number;
}

export interface BodyweightWindow {
  start: string;
  end: string;
  average: number | null;
  observationCount: number;
}

export interface BodyweightTrend {
  latest: BodyweightEntry | null;
  current: BodyweightWindow;
  previous: BodyweightWindow;
  change: number | null;
}

// Current = as-of day plus the six preceding calendar days. Previous is the
// immediately preceding, non-overlapping seven-day window. Sparse observations
// are averaged as logged; the user does not need seven entries to get a trend.
export function bodyweightTrend(
  entries: BodyweightEntry[],
  asOf: string,
): BodyweightTrend {
  const endMs = parseDateKey(asOf);
  const currentStartMs = endMs - 6 * DAY_MS;
  const previousEndMs = endMs - 7 * DAY_MS;
  const previousStartMs = endMs - 13 * DAY_MS;

  const valid = entries
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0)
    .map((entry) => ({ entry, at: safeParseDateKey(entry.loggedOn) }))
    .filter((item): item is { entry: BodyweightEntry; at: number } => item.at != null && item.at <= endMs)
    .sort((a, b) => a.at - b.at);

  const currentEntries = valid.filter((item) => item.at >= currentStartMs);
  const previousEntries = valid.filter(
    (item) => item.at >= previousStartMs && item.at <= previousEndMs,
  );
  const current = windowSummary(currentEntries, currentStartMs, endMs);
  const previous = windowSummary(previousEntries, previousStartMs, previousEndMs);

  return {
    latest: valid.at(-1)?.entry ?? null,
    current,
    previous,
    change:
      current.average == null || previous.average == null
        ? null
        : current.average - previous.average,
  };
}

export function dateKey(date: Date, timeZone = "America/Chicago") {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

function windowSummary(
  entries: Array<{ entry: BodyweightEntry; at: number }>,
  startMs: number,
  endMs: number,
): BodyweightWindow {
  return {
    start: toDateKey(startMs),
    end: toDateKey(endMs),
    average:
      entries.length === 0
        ? null
        : entries.reduce((sum, item) => sum + item.entry.weight, 0) / entries.length,
    observationCount: entries.length,
  };
}

function safeParseDateKey(value: string) {
  try {
    return parseDateKey(value);
  } catch {
    return null;
  }
}

function parseDateKey(value: string) {
  if (!DATE_KEY.test(value)) throw new Error(`Invalid date key: ${value}`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || toDateKey(timestamp) !== value) {
    throw new Error(`Invalid date key: ${value}`);
  }
  return timestamp;
}

function toDateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
