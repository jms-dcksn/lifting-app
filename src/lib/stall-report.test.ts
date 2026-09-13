import { describe, expect, it } from "vitest";
import { buildStallAssessments, type StallHistory, type StallAdaptation } from "./stall-report";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import { buildMonthlyReport } from "./monthly-progress";

const now = new Date("2026-09-30T20:00:00Z");
function fixture(count = 5, exerciseId = "bb-bench"): StallHistory {
  const sessions = Array.from({ length: count }, (_, i) => ({ id: `s${i}`, performedAt: `2026-09-${String(1 + i * 5).padStart(2, "0")}T12:00:00Z`,
    finishedAt: `2026-09-${String(1 + i * 5).padStart(2, "0")}T13:00:00Z`, programId: "p", programDayId: "d", weekIndex: i + 1 }));
  return { userId: "u", sessions, sets: sessions.map((s, i) => ({ id: `r${i}`, user_id: "u", session_id: s.id, exercise_id: exerciseId,
    equipment_instance_id: null, program_slot_id: "slot", weight: 100, reps: 8, rir: 1, e1rm: 130, is_warmup: false,
    created_at: s.performedAt.replace("12:00", "12:05"), workout_session: { performed_at: s.performedAt, finished_at: s.finishedAt } })),
    slots: [{ id: "slot", programId: "p", programDayId: "d", exerciseId, targetSets: 2, repMin: 6, repMax: 10, targetRir: 1 }], phases: [], adaptations: [] };
}
const assess = (h: StallHistory) => buildStallAssessments(h, EXERCISE_BY_ID, now)[0];
const change = (overrides: Partial<StallAdaptation> = {}): StallAdaptation => ({ id: "a", slotId: "slot", action: "rep_change", newExerciseId: null,
  newRepMin: 12, newRepMax: 15, createdAt: "2026-09-17T12:00:00Z", ...overrides });

describe("shared context-aware stalls", () => {
  it("requires four stalled barbell exposures and fourteen elapsed training days", () => {
    expect(assess(fixture())).toMatchObject({ state: "plateau", patience: 4, stalledExposures: 4, stalledSinceDays: 20, lastImprovementAt: "2026-09-01T12:00:00Z" });
    expect(assess(fixture(4)).state).toBe("insufficient_data");
    const short = fixture();
    short.sessions.forEach((s, i) => { s.performedAt = `2026-09-0${i + 1}T12:00:00Z`; });
    expect(assess(short).state).toBe("monitoring");
    expect(assess(fixture(4, "db-curl"))).toMatchObject({ state: "plateau", patience: 3 });
  });
  it("keeps a single down session and sparse history quiet", () => {
    const h = fixture(2); h.sets[1].e1rm = 90;
    expect(assess(h).state).toBe("insufficient_data");
  });
  it("resets on fixed-load rep gains even with flat stored e1RM", () => {
    const h = fixture(); h.sets[4].reps = 9;
    expect(assess(h)).toMatchObject({ state: "monitoring", stalledExposures: 0, lastImprovementAt: h.sessions[4].performedAt });
    expect(assess(h).points[4].repGain).toBe(true);
  });
  it("does not count a first observation at a new load as a rep gain", () => {
    const h = fixture(); h.sets[4].weight = 105; h.sets[4].reps = 9;
    expect(assess(h).state).toBe("plateau");
  });
  it("does not join an away-and-back exercise or equipment sequence", () => {
    const h = fixture(); h.sets[3].exercise_id = "db-bench";
    expect(assess(h).points.map(p => p.sessionId)).toEqual(["s4"]);
    h.sets[3].exercise_id = "bb-bench"; h.sets[3].equipment_instance_id = "other";
    expect(assess(h).points.map(p => p.sessionId)).toEqual(["s4"]);
  });
  it("breaks on mixed-identity sessions even when the final set returns to the old lift", () => {
    const h = fixture(); h.sets.push({ ...h.sets[3], id: "other", exercise_id: "db-bench", created_at: "2026-09-16T12:01:00Z" });
    expect(assess(h).points.map(p => p.sessionId)).toEqual(["s4"]);
  });
  it("resets across phase and deload boundaries instead of skipping the weak exposure", () => {
    const h = fixture(); h.phases = [{ id: "phase", programId: "p", name: "Deload", position: 0, description: null,
      weekStart: 4, weekEnd: 4, targetRirMin: 3, targetRirMax: 4, setMultiplier: 0.5 }];
    expect(assess(h).points.map(p => p.sessionId)).toEqual(["s4"]);
    h.phases[0].weekEnd = 5;
    expect(assess(h)).toMatchObject({ state: "deload", points: [] });
    h.phases[0].name = "Intensification"; h.phases[0].setMultiplier = 1;
    expect(assess(h).points).toHaveLength(2);
  });
  it("resets for recorded rep changes, manual swaps and changes accepted after the last workout", () => {
    for (const action of ["rep_change", "manual_swap", "swap"] as const) {
      const h = fixture(); h.adaptations = [change({ action, newExerciseId: "bb-bench" })];
      expect(assess(h).points.map(p => p.sessionId)).toEqual(["s4"]);
      h.adaptations[0].createdAt = "2026-09-25T12:00:00Z";
      expect(assess(h).points).toEqual([]);
    }
  });
  it("a dismiss does not reset evidence and future adaptations cannot affect the report", () => {
    const h = fixture(); h.adaptations = [change({ action: "dismiss" }), change({ id: "future", createdAt: "2026-10-01T12:00:00Z" })];
    expect(assess(h).state).toBe("plateau");
  });
  it("missing estimates or unknown phase weeks break continuity", () => {
    const h = fixture(); h.sets[3].e1rm = null;
    expect(assess(h).points.map(p => p.sessionId)).toEqual(["s4"]);
  });
  it("ignores unfinished, future, foreign-owner, warmup, and unrelated-slot evidence", () => {
    for (const kind of ["unfinished", "future", "foreign", "warmup", "slot"] as const) {
      const h = fixture();
      if (kind === "unfinished") h.sessions[4].finishedAt = null;
      if (kind === "future") h.sessions[4].finishedAt = "2026-10-01T12:00:00Z";
      if (kind === "foreign") h.sets[4].user_id = "other";
      if (kind === "warmup") h.sets[4].is_warmup = true;
      if (kind === "slot") h.sets[4].program_slot_id = "other";
      expect(assess(h).state).toBe("insufficient_data");
    }
  });
  it("groups by session ID, not the date on which a historical set was entered", () => {
    const h = fixture(); h.sets.forEach(s => { s.created_at = "2026-09-22T12:00:00Z"; });
    expect(assess(h).points).toHaveLength(5);
    expect(assess(h).stalledSinceDays).toBe(20);
    expect(assess({ ...h, sets: [...h.sets, ...h.sets] }).points).toHaveLength(5);
  });
  it("monthly signals use only lifts with a latest exposure in the selected window", () => {
    const h = fixture(); const stalls = buildStallAssessments(h, EXERCISE_BY_ID, now);
    const input = { userId: "u", sessions: [], sets: [], catalog: EXERCISE_BY_ID, now, stalls };
    expect(buildMonthlyReport({ ...input, month: "2026-09" }).stalls).toHaveLength(1);
    expect(buildMonthlyReport({ ...input, month: "2026-08" }).stalls).toEqual([]);
  });
});
