export function equipmentQueryValue(equipmentInstanceId: string | null) {
  return equipmentInstanceId ?? "none";
}

export function exerciseReviewHref({
  exerciseId,
  equipmentInstanceId,
  month,
}: {
  exerciseId: string;
  equipmentInstanceId?: string | null;
  month?: string | null;
}) {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (equipmentInstanceId !== undefined) {
    params.set("equipment", equipmentQueryValue(equipmentInstanceId));
  }
  const query = params.toString();
  return `/history/${encodeURIComponent(exerciseId)}${query ? `?${query}` : ""}`;
}
