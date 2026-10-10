/** Deload is training activity, but not evidence of strength progression. */
export function isProgressionSet(set: { isWarmup?: boolean; isDeload?: boolean }) {
  return !set.isWarmup && !set.isDeload;
}
