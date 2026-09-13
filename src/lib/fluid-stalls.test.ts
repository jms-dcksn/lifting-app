import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPendingSuggestions } from "./fluid";
import { loadStallHistory } from "./stall-data";
import type { StallHistory } from "./stall-report";
import { EXERCISE_BY_ID } from "./strength/coefficients";
vi.mock("./stall-data", () => ({ loadStallHistory: vi.fn() }));
const now = new Date("2026-09-30T18:00:00Z");
function history(): StallHistory {
  const sessions = Array.from({ length: 4 }, (_, i) => ({ id: String(i), programId: "p", programDayId: "d", weekIndex: 1,
    performedAt: `2026-09-${String(1 + i * 7).padStart(2, "0")}T12:00:00Z`, finishedAt: `2026-09-${String(1 + i * 7).padStart(2, "0")}T13:00:00Z` }));
  return { userId: "u", sessions, slots: [{ id: "slot", programId: "p", programDayId: "d", exerciseId: "db-curl", targetSets: 1, repMin: 6, repMax: 10, targetRir: 1 }],
    phases: [], adaptations: [], sets: sessions.map(s => ({ id: s.id, user_id: "u", session_id: s.id, program_slot_id: "slot",
      exercise_id: "db-curl", equipment_instance_id: null, weight: 30, reps: 8, rir: 1, e1rm: 40, is_warmup: false,
      created_at: s.performedAt, workout_session: { performed_at: s.performedAt, finished_at: s.finishedAt } })) };
}
async function suggestions(h: StallHistory) {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.mocked(loadStallHistory).mockResolvedValue(h);
  return loadPendingSuggestions({} as Parameters<typeof loadPendingSuggestions>[0], "u", [{ programSlotId: "slot", exerciseId: "db-curl",
    pattern: "elbow_flexion", repMin: 6, repMax: 10, targetRir: 1, plateauPatience: null }], EXERCISE_BY_ID, [], 150);
}
afterEach(() => vi.useRealTimers());
describe("Fluid consumes shared stall evidence", () => {
  it("proposes a rep change for a supported plateau", async () => {
    expect(await suggestions(history())).toMatchObject({ slot: { action: "rep_change", stalledExposures: 3 } });
  });
  it("keeps a rep-gaining lift quiet despite flat estimated strength", async () => {
    const h = history(); h.sets[3].reps = 9;
    expect(await suggestions(h)).toEqual({});
  });
  it("preserves dismissal snoozing without changing the underlying plateau", async () => {
    const h = history(); h.adaptations = [{ id: "a", slotId: "slot", action: "dismiss", newExerciseId: null, newRepMin: null,
      newRepMax: null, createdAt: "2026-09-21T12:00:00Z" }];
    expect(await suggestions(h)).toEqual({});
  });
  it("never lets an unfinished fourth session earn a plateau", async () => {
    const h = history(); h.sessions[3].finishedAt = null;
    expect(await suggestions(h)).toEqual({});
  });
});
