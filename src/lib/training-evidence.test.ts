import { describe, expect, it } from "vitest";
import { parseTrainingEvidence, progressionEvidence, replayTrainingRecords } from "./training-evidence";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { computeE1rm } from "./strength/e1rm";

const row = { id: "set", user_id: "owner", session_id: "session", exercise_id: "weighted-dip", equipment_instance_id: null,
  program_slot_id: null, weight: -20, reps: 8, rir: 2, e1rm: computeE1rm(160, 8, 2), is_warmup: false, is_deload: false,
  created_at: "2026-10-01T12:01:00Z", workout_session: { performed_at: "2026-10-01T12:00:00Z", finished_at: null } };
describe("validated training evidence", () => {
  it.each(["is_warmup", "is_deload", "equipment_instance_id", "workout_session"])("rejects omitted %s rather than assuming eligibility", field => {
    const incomplete: Record<string, unknown> = { ...row };
    delete incomplete[field];
    expect(() => parseTrainingEvidence(incomplete, "owner")).toThrow("incomplete");
  });
  it("preserves historical bodyweight and negative assistance independently of current weight", () => {
    const activity = parseTrainingEvidence(row, "owner");
    expect(activity.historicalBodyweight).toBeCloseTo(180);
    expect(progressionEvidence(activity)?.set.weight).toBe(-20);
    expect(() => parseTrainingEvidence(row, "other")).toThrow();
  });
  it.each(["is_warmup", "is_deload"])("retains %s activity but excludes it from progression", field => {
    const activity = parseTrainingEvidence({ ...row, [field]: true }, "owner");
    expect(activity.set.id).toBe("set");
    expect(progressionEvidence(activity)).toBeNull();
  });
  it("preserves rep-only records and edits through the normalized replay path", () => {
    const prior = { ...row, exercise_id: "ab-wheel-rollout", weight: 0, e1rm: null,
      workout_session: { ...row.workout_session, finished_at: "2026-10-01T13:00:00Z" } };
    const current = { ...prior, id: "new", session_id: "new-session", reps: 10, created_at: "2026-10-02T12:01:00Z",
      workout_session: { performed_at: "2026-10-02T12:00:00Z", finished_at: null } };
    const replay = (reps: number) => replayTrainingRecords([prior, { ...current, reps }].map(set => parseTrainingEvidence(set, "owner")),
      "owner", "new-session", "2026-10-02T12:00:00Z", EXERCISE_BY_ID);
    expect(replay(10)[0]?.repRecords[0]?.improvement).toBe(2);
    expect(replay(8)).toEqual([]);
    expect(replay(10)[0]?.e1rmRecord).toBeNull();
  });
});
