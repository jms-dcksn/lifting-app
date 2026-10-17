export type SupersetSlot = { supersetGroup?: string | null };

// Groups are local to a day. Slot order determines C1/C2, including after a reorder.
export function supersetLabel(slots: readonly SupersetSlot[], index: number): string | null {
  const group = slots[index]?.supersetGroup;
  if (!group) return null;
  const member = slots.slice(0, index + 1).filter((slot) => slot.supersetGroup === group).length;
  return `${group}${member}`;
}

export function isSupersetEnd(slots: readonly SupersetSlot[], index: number): boolean {
  const group = slots[index]?.supersetGroup;
  return !group || slots[index + 1]?.supersetGroup !== group;
}

export function validateSupersets(slots: readonly SupersetSlot[]): string | null {
  const groups = new Set(slots.map((slot) => slot.supersetGroup).filter(Boolean));
  for (const group of groups) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(group!)) return "Superset names must start with a letter and use up to 16 letters, numbers, underscores or hyphens.";
    const indexes = slots.flatMap((slot, index) => slot.supersetGroup === group ? [index] : []);
    if (indexes.length < 2) return `Superset ${group} needs at least two exercises.`;
    if (indexes[indexes.length - 1]! - indexes[0]! + 1 !== indexes.length) return `Keep superset ${group} exercises together.`;
  }
  return null;
}
