export const SESSION_NOTE_MAX_LENGTH = 280;

export const JOINT_PAIN_VALUES = ["none", "mild", "significant"] as const;
export type JointPain = (typeof JOINT_PAIN_VALUES)[number];

export interface SessionFeedback {
  readiness: number | null;
  jointPain: JointPain | null;
  note: string | null;
}

export function validateReadiness(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("Readiness must be a whole number from 1 to 5");
  }
  return value;
}

export function normalizeJointPain(value: string | null): JointPain | null {
  if (value === null) return null;
  if (!JOINT_PAIN_VALUES.includes(value as JointPain)) {
    throw new Error("Joint pain must be none, mild, or significant");
  }
  return value as JointPain;
}

export function normalizeSessionNote(value: string | null): string | null {
  const note = value?.trim() ?? "";
  if (!note) return null;
  if (note.length > SESSION_NOTE_MAX_LENGTH) {
    throw new Error(`Session note must be ${SESSION_NOTE_MAX_LENGTH} characters or fewer`);
  }
  return note;
}
