export function reviewEquipmentParam(
  value: string | string[] | undefined,
): string | null | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw === "none" ? null : raw;
}

export function latestReviewEquipment(
  rows: {
    equipmentInstanceId: string | null;
    performedAt: string;
    createdAt?: string;
    finishedAt?: string | null;
  }[],
  now = new Date(),
): string | null | undefined {
  const eligible = finishedIdentityRows(rows, now);
  const latest = eligible.at(-1);
  return latest ? latest.equipmentInstanceId : undefined;
}

export function reviewEquipmentChoices(
  rows: {
    equipmentInstanceId: string | null;
    performedAt: string;
    createdAt?: string;
    finishedAt?: string | null;
  }[],
  now = new Date(),
): Array<string | null> {
  const latest = new Map<string, string>();
  for (const row of finishedIdentityRows(rows, now)) {
    const key = row.equipmentInstanceId ?? "";
    latest.set(key, row.performedAt);
  }
  return [...latest.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]))
    .map(([key]) => (key === "" ? null : key));
}

export function rowsForReviewEquipment<T extends { equipmentInstanceId: string | null }>(
  rows: T[],
  equipment: string | null,
): T[] {
  return rows.filter((row) => row.equipmentInstanceId === equipment);
}

export function resolveReviewEquipment(
  requested: string | null | undefined,
  rows: {
    equipmentInstanceId: string | null;
    performedAt: string;
    createdAt?: string;
    finishedAt?: string | null;
  }[],
  now = new Date(),
): string | null {
  if (requested !== undefined) return requested;
  return latestReviewEquipment(rows, now) ?? null;
}

export function reviewEquipmentLabel(
  instance: { label: string | null; gym: string | null } | undefined,
  id: string | null,
) {
  if (id == null) return null;
  const named = instance?.label?.trim() || instance?.gym?.trim();
  return named || id;
}

export function reviewEquipmentChoiceLabel(
  instance: { label: string | null; gym: string | null } | undefined,
  id: string | null,
) {
  return reviewEquipmentLabel(instance, id) ?? "None";
}

function finishedIdentityRows<
  T extends {
    equipmentInstanceId: string | null;
    performedAt: string;
    createdAt?: string;
    finishedAt?: string | null;
  },
>(rows: T[], now: Date): T[] {
  const cutoff = now.getTime();
  return [...rows]
    .filter((row) => isFinishedIdentityRow(row, cutoff))
    .sort((a, b) => {
      const sessionOrder = a.performedAt.localeCompare(b.performedAt);
      if (sessionOrder !== 0) return sessionOrder;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
}

function isFinishedIdentityRow(
  row: { performedAt: string; finishedAt?: string | null },
  cutoff: number,
) {
  if (row.finishedAt === null) return false;
  const performed = Date.parse(row.performedAt);
  if (!Number.isFinite(performed) || performed > cutoff) return false;
  if (row.finishedAt == null) return true;
  const finished = Date.parse(row.finishedAt);
  return Number.isFinite(finished) && finished <= cutoff;
}
