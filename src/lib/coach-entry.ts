/** Navigation context only. Evidence and actions are always reloaded under the owner. */
export type CoachFocus = { exerciseId: string | null; equipmentInstanceId: string | null; month: string | null };
export function parseCoachFocus(input: { exercise?: unknown; equipment?: unknown; month?: unknown }): CoachFocus {
  return {
    exerciseId: typeof input.exercise === "string" && input.exercise.length > 0 && input.exercise.length <= 200 ? input.exercise : null,
    equipmentInstanceId: typeof input.equipment === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(input.equipment) ? input.equipment : null,
    month: typeof input.month === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(input.month) ? input.month : null,
  };
}
export function coachFocusParams(focus: CoachFocus) {
  const params = new URLSearchParams();
  if (focus.exerciseId) params.set("exercise", focus.exerciseId);
  if (focus.exerciseId || focus.equipmentInstanceId) params.set("equipment", focus.equipmentInstanceId ?? "none");
  if (focus.month) params.set("month", focus.month);
  return params;
}
export function coachEntryHref(input: Partial<CoachFocus> = {}) {
  const params = coachFocusParams({ exerciseId: input.exerciseId ?? null, equipmentInstanceId: input.equipmentInstanceId ?? null, month: input.month ?? null });
  params.set("review", "1"); return `/coach?${params}`;
}
export function coachConversationHref(focus: CoachFocus, threadId: string | null) {
  const params = coachFocusParams(focus); params.set("thread", threadId ?? "new"); return `/coach?${params}`;
}
export function coachDetailsHref(focus: CoachFocus) {
  const params = coachFocusParams(focus); params.set("view", "details"); return `/analytics/coach?${params}`;
}
