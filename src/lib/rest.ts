// Format a rest countdown as m:ss (e.g. 120 -> "2:00", 47 -> "0:47"). Negatives clamp to 0.
export function formatRestRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
