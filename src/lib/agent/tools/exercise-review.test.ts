import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXERCISES } from "@/lib/strength/coefficients";
import { exerciseReview, resolveExerciseIdentity } from "./exercise-review";
import { dbExercise, ledgerSet, REVIEW_NOW, REVIEW_USER, reviewTestDb } from "../evals/review-test-data";

const catalog = Object.fromEntries(EXERCISES.map((def) => [def.id, def]));
function matches(name: string) {
  const resolved = resolveExerciseIdentity(catalog, { name });
  return "exerciseId" in resolved ? [resolved.exerciseId] : "matches" in resolved ? resolved.matches.map((match) => match.id) : [];
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(REVIEW_NOW)); });
afterEach(() => vi.useRealTimers());

describe("relevant identities", () => {
  it("keeps equipment alternatives, aliases, typos, compounds and plurals", () => {
    expect(matches("incline bench press").sort()).toEqual(["bb-incline-bench", "db-incline-bench"]);
    expect(matches("incline benc").sort()).toEqual(["bb-incline-bench", "db-incline-bench"]);
    expect(matches("rdl")).toEqual(["bb-rdl"]);
    expect(matches("romanian deadlfit")).toEqual(["bb-rdl"]);
    expect(matches("cable lat pull down")).toEqual(["lat-pulldown"]);
    expect(matches("machine lat pull down")).toEqual(["machine-lat-pulldown"]);
    expect(matches("pull ups")).toEqual(["weighted-pullup"]);
    expect(matches("leg extensions")).toEqual(["leg-extension"]);
    expect(matches("barbell squat").sort()).toEqual(["bb-back-squat", "bb-front-squat"]);
    expect(matches("squat")).toEqual(expect.arrayContaining(["bb-back-squat", "bb-front-squat", "hack-squat", "db-split-squat"]));
    expect(matches("flat barbell bench")).toEqual(["bb-bench"]);
    expect(matches("front squat")).toEqual(["bb-front-squat"]);
    expect(matches("face pulls")).toEqual([]);
  });
  it("never uses a stats hint to remove candidates", () => {
    expect(resolveExerciseIdentity(catalog, { name: "barbell squat", loggedExerciseIds: ["bb-back-squat"] }))
      .toMatchObject({ needsDisambiguation: true, matches: expect.arrayContaining([{ id: "bb-front-squat", name: "Barbell Front Squat" }]) });
  });
});

describe("exerciseReview public contract", () => {
  it("retains empty alternatives and transparently prefers the only logged match", async () => {
    const { client, requests } = reviewTestDb({ set_log: [ledgerSet()], user_exercise_stat: [] });
    const result = await exerciseReview(client, REVIEW_USER, { name: "barbell squat" });
    expect(result).toMatchObject({ selectionStatus: "preferred_history", exerciseId: "bb-back-squat",
      recommendation: { reason: "only_match_with_logged_sets" }, availability: { historicalTrend: false } });
    expect(result.matches.map((match) => [match.id, match.history.loggedSetCount])).toEqual([["bb-back-squat", 1], ["bb-front-squat", 0]]);
    expect(requests.some((url) => url.pathname.endsWith("user_exercise_stat"))).toBe(false);
  });
  it("preserves explicit identity even when another lift has data", async () => {
    const { client } = reviewTestDb({ set_log: [ledgerSet()], user_exercise_stat: [{ exercise_id: "bb-front-squat" }] });
    expect(await exerciseReview(client, REVIEW_USER, { name: "front squat" }))
      .toMatchObject({ exerciseId: "bb-front-squat", last: null, availability: { loggedSetCount: 0 } });
  });
  it("reports zero and multiple logged matches without choosing from recency/strength", async () => {
    const { client, tables } = reviewTestDb();
    expect(await exerciseReview(client, REVIEW_USER, { name: "barbell squat" }))
      .toMatchObject({ selectionStatus: "clarification_needed", recommendation: null });
    tables.set_log = [ledgerSet(), ledgerSet({ id: "front", exercise_id: "bb-front-squat", e1rm: 500 })];
    expect(await exerciseReview(client, REVIEW_USER, { name: "barbell squat" }))
      .toMatchObject({ selectionStatus: "clarification_needed", recommendation: null });
  });
  it("groups ordinary-pound stations before annotating history and keeps dumbbells visible", async () => {
    const station = "bb-incline-bench__hoist";
    const { client } = reviewTestDb({ exercise: [dbExercise(station, "Barbell Incline Bench — Hoist", "bb-incline-bench", "barbell", "horizontal_press")],
      set_log: [ledgerSet({ exercise_id: station })] });
    const result = await exerciseReview(client, REVIEW_USER, { name: "incline bench press" });
    expect(result.matches.map((match) => match.id)).toEqual(["bb-incline-bench", "db-incline-bench"]);
    expect(result).toMatchObject({ exerciseId: "bb-incline-bench", availability: { loggedSetCount: 1 } });
  });
  it("keeps machine brands/types/instances separate and excludes calf apparatus hits", async () => {
    const { client } = reviewTestDb({ exercise: [dbExercise("cybex", "Leg Press — Cybex (plate)", "leg-press"),
      dbExercise("nautilus", "Leg Press — Nautilus (stack)", "leg-press"), dbExercise("calf", "Leg Press Calf Press", null, "machine", "calf")],
      set_log: [ledgerSet({ id: "a", exercise_id: "cybex", equipment_instance_id: "station-a" }),
        ledgerSet({ id: "b", exercise_id: "cybex", equipment_instance_id: "station-b", e1rm: 400 }), ledgerSet({ id: "c", exercise_id: "nautilus" })],
      equipment_instance: [{ id: "station-a", user_id: REVIEW_USER, label: "Gym A" }, { id: "station-b", user_id: REVIEW_USER, label: "Gym B" }] });
    const result = await exerciseReview(client, REVIEW_USER, { name: "leg press" });
    expect(result.matches.map((match) => match.id)).not.toContain("calf");
    expect(result.matches).toHaveLength(4);
    expect(result).toMatchObject({ selectionStatus: "clarification_needed" });
    expect(await exerciseReview(client, REVIEW_USER, { name: "cybex leg press", equipmentInstanceId: "station-a" }))
      .toMatchObject({ exerciseId: "cybex", equipmentInstanceId: "station-a", latestEligibleE1rm: { e1rm: 228 } });
  });
  it("matches brand/type metadata even when a custom display name omits them", async () => {
    const { client } = reviewTestDb({ exercise: [{ ...dbExercise("owned-press", "Leg Press", "leg-press"), brand: "Cybex", machine_type: "plate_loaded" }],
      set_log: [ledgerSet({ exercise_id: "owned-press" })] });
    expect(await exerciseReview(client, REVIEW_USER, { name: "cybex plate loaded leg press" }))
      .toMatchObject({ exerciseId: "owned-press", availability: { loggedSetCount: 1 } });
  });
  it("revalidates original all-review choices and makes stale/foreign keys an explicit error", async () => {
    const { client } = reviewTestDb();
    expect(await exerciseReview(client, REVIEW_USER, { name: "dumbbell bench", all: true,
      matchKeys: ["movement:db-bench", "station:foreign-machine:foreign-instance"] }))
      .toMatchObject({ selectionStatus: "no_match", error: expect.stringContaining("no longer available") });
  });
  it("continues complete candidate metadata and separate reviews with explicit offsets", async () => {
    const exercise = Array.from({ length: 35 }, (_, i) => dbExercise(`machine-${String(i).padStart(2, "0")}`, `Leg Press — Brand ${i}`, "leg-press"));
    const { client } = reviewTestDb({ exercise });
    const first = await exerciseReview(client, REVIEW_USER, { name: "leg press" });
    const rest = await exerciseReview(client, REVIEW_USER, { name: "leg press", matchOffset: 30 });
    expect(first).toMatchObject({ selectionStatus: "more_matches", nextMatchOffset: 30, totalMatches: 36 });
    expect(rest).toMatchObject({ nextMatchOffset: null, totalMatches: 36 });
    expect(new Set([...first.matches, ...rest.matches].map((match) => match.key)).size).toBe(36);
    const allFirst = await exerciseReview(client, REVIEW_USER, { name: "leg press", all: true });
    const allSecond = await exerciseReview(client, REVIEW_USER, { name: "leg press", all: true, offset: 3 });
    if (!("reviews" in allFirst) || !("reviews" in allSecond)) throw new Error("Missing batched reviews");
    expect(allFirst.reviews).toHaveLength(3);
    expect(allSecond.reviews).toHaveLength(3);
    expect(allFirst.reviews[0]?.exerciseId).not.toBe(allSecond.reviews[0]?.exerciseId);
  });
  it("counts deload/missing-RIR activity separately from eligible strength", async () => {
    const { client } = reviewTestDb({ set_log: [ledgerSet({ is_deload: true }), ledgerSet({ id: "missing", rir: null, e1rm: null })] });
    expect(await exerciseReview(client, REVIEW_USER, { exerciseId: "bb-back-squat" }))
      .toMatchObject({ availability: { loggedSetCount: 2, eligiblePointCount: 0, historicalTrend: false }, latestEligibleE1rm: null });
  });
  it("excludes warmups, unfinished, future and foreign rows", async () => {
    const { client } = reviewTestDb({ set_log: [ledgerSet({ is_warmup: true }), ledgerSet({ id: "foreign", user_id: "someone-else" }),
      ledgerSet({ id: "unfinished", workout_session: { performed_at: "2026-10-10", finished_at: null } }),
      ledgerSet({ id: "future", workout_session: { performed_at: "2026-12-10", finished_at: "2026-12-11" } })] });
    expect(await exerciseReview(client, REVIEW_USER, { exerciseId: "bb-back-squat" }))
      .toMatchObject({ availability: { loggedSetCount: 0 } });
  });
  it("covers ledger/catalog pagination and more than eight relevant matches", async () => {
    const exercise = Array.from({ length: 501 }, (_, i) => dbExercise(`custom-${String(i).padStart(3, "0")}`, `Leg Press — Brand ${i}`, "leg-press"));
    const { client, requests } = reviewTestDb({ exercise, set_log: Array.from({ length: 501 }, (_, i) => ledgerSet({ id: `set-${String(i).padStart(3, "0")}` })) });
    expect(await exerciseReview(client, REVIEW_USER, { exerciseId: "bb-back-squat" }))
      .toMatchObject({ availability: { loggedSetCount: 501 } });
    const result = await exerciseReview(client, REVIEW_USER, { name: "leg press", all: true });
    expect(result.matches).toHaveLength(30);
    expect(result).toMatchObject({ nextMatchOffset: 30, matchesComplete: false });
    expect(result).toMatchObject({ nextOffset: 3, reviews: expect.any(Array), totalMatches: 502 });
    expect(requests.filter((url) => url.searchParams.get("offset") === "500").length).toBeGreaterThanOrEqual(2);
  });
  it("permits older dated trends despite a 21-day gap, and distinguishes latest deload", async () => {
    const { client } = reviewTestDb({ set_log: [ledgerSet(), ledgerSet({ id: "second", session_id: "session-2", e1rm: 240,
      workout_session: { performed_at: "2026-09-10", finished_at: "2026-09-11" } })] });
    expect(await exerciseReview(client, REVIEW_USER, { exerciseId: "bb-back-squat" }))
      .toMatchObject({ recent21Days: { kind: "gap" }, availability: { recentComparison: false, historicalTrend: true }, latestEligibleE1rm: { e1rm: 240 } });
  });
});
