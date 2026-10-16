export type TrendClassification = "gaining" | "flat" | "declining" | "insufficient_data";

// Both recent marks must clear both prior marks; one unusual session stays flat.
export function classifyPerformanceTrend(values: number[]) {
  const evidence = values.slice(-4);
  const [a, b, c, d] = evidence;
  if (a === undefined || b === undefined || c === undefined || d === undefined || evidence.length < 4 || evidence.some(value => !Number.isFinite(value) || value <= 0)) {
    return {
      classification: "insufficient_data" as TrendClassification,
      evidenceExposureCount: evidence.length,
      recentAverageE1rm: null,
      previousAverageE1rm: null,
      changePercent: null,
    };
  }
  const previous = evidence.slice(0, 2);
  const recent = evidence.slice(2);
  const previousAverage = (a + b) / 2;
  const recentAverage = (c + d) / 2;
  const gaining = Math.min(...recent) > Math.max(...previous) * 1.01;
  const declining = Math.max(...recent) < Math.min(...previous) * 0.99;
  return {
    classification: (gaining ? "gaining" : declining ? "declining" : "flat") as TrendClassification,
    evidenceExposureCount: 4,
    recentAverageE1rm: recentAverage,
    previousAverageE1rm: previousAverage,
    changePercent: ((recentAverage - previousAverage) / previousAverage) * 100,
  };
}
