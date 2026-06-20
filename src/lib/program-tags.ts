// Pure tag helpers shared by the program gallery and builder. Tags are free text;
// dedupe is case-insensitive but preserves the first-seen capitalization.

export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function uniqueTags(programs: { tags: string[] }[]): string[] {
  const union = normalizeTags(programs.flatMap((p) => p.tags));
  return union.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function filterByTag<T extends { tags: string[] }>(
  programs: T[],
  tag: string | null,
): T[] {
  if (!tag) return programs;
  const key = tag.toLowerCase();
  return programs.filter((p) => p.tags.some((t) => t.toLowerCase() === key));
}
