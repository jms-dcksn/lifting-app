import { describe, expect, it } from "vitest";
import { loadPlannedPerformances } from "./workout-editor-data";
import { plannedSetTarget } from "./workout-editor-targets";
import { newPlannedSet } from "./workout-editor";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const slotId = "123e4567-e89b-42d3-a456-426614174000";
function client() {
  return { from(table: string) {
    const q: Record<string, unknown> = {};
    let empty = false;
    for (const op of ["select", "eq", "not", "lt", "lte", "order", "limit", "gt"]) q[op] = (...args: unknown[]) => {
      if (op === "gt" || (op === "not" && ["plan_snapshot", "planned_set_id"].includes(args[0] as string))) empty = true;
      return q;
    };
    q.then = (resolve: (v: unknown) => void) => resolve({ error: null, data: empty ? [] : table === "workout_session"
      ? [{ id: "session", performed_at: "2026-11-06T12:00:00Z", finished_at: "2026-11-06T13:00:00Z", is_deload: false, plan_snapshot: null }]
      : [10, 9].map((reps, i) => ({ id: `set-${i}`, session_id: "session", program_slot_id: slotId,
        exercise_id: "db-shoulder-press", equipment_instance_id: null, weight: 25, reps, rir: 2,
        e1rm: 36 - i, planned_set_id: null, set_index: i })) });
    return q;
  } } as unknown as Parameters<typeof loadPlannedPerformances>[0];
}

describe("legacy workout row history", () => {
  it("uses the working-set index when a completed workout predates plan snapshots", async () => {
    const history = await loadPlannedPerformances(client(), "user", new Date("2026-11-11T12:00:00Z"));
    expect(history).toHaveLength(2);
    const targets = [0, 1].map(i => plannedSetTarget({ slotId, exerciseId: "db-shoulder-press",
      set: newPlannedSet(slotId.slice(0, 24) + (i + 1).toString(16).padStart(12, "0"),
        { repMin: 8, repMax: 12, targetRirMin: 2, targetRirMax: 2 }),
      history, catalog: EXERCISE_BY_ID, stats: [], bodyweight: null, isDeload: false }));
    expect(targets.map(s => [s.suggestedWeight, s.targetReps])).toEqual([[25, 11], [25, 10]]);
  });
});
