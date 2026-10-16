/** Cursor mechanics only. Callers own typed projections, owner filters and errors. */
export async function collectIdPages<T extends { id: string }>(
  fetchPage: (after: string | null) => PromiseLike<readonly T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  while (true) {
    const page = await fetchPage(after);
    if (!page.length) return rows;
    for (const row of page) {
      // Text IDs use the database's collation, which need not match JS ordering.
      if (!row.id || seen.has(row.id)) {
        throw new Error("Pagination did not advance in unique ID order.");
      }
      seen.add(row.id);
      rows.push(row);
      after = row.id;
    }
    // Never stop on a short page: PostgREST can cap below the requested limit.
  }
}
