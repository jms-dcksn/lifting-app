const WEEKDAY_PREFIX = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*·\s*/i;

/**
 * Program days are ordered workout identities, not appointments on a calendar.
 * Legacy programs may have weekday-prefixed names such as "Tue · Upper A"; strip
 * that presentation-only prefix so a delayed workout remains "Upper A" when it is
 * performed on another day.
 */
export function workoutIdentity(name: string): string {
  return name.replace(WEEKDAY_PREFIX, "").trim();
}
