import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachEvidence, coachObservation } from "./testing/coach-fixtures";
import { DEFAULT_COACH_PREFERENCES, planCoachEpisodes } from "./coach-episodes";
import { resolveCoachEntry } from "./coach-entry-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), snapshot: vi.fn(), open: vi.fn() }));
vi.mock("./coach-inbox-data", () => ({ coachInboxEnabled: () => true, refreshCoachInbox: mocks.refresh, coachStateSnapshot: mocks.snapshot }));
vi.mock("./coach-conversation-data", () => ({ openCoachEpisode: mocks.open }));
const db = {} as SupabaseClient<Database>;
const focus = { exerciseId: "bb-bench", equipmentInstanceId: null, month: "2026-09" };
function row(id: string, equipment: string | null = null) {
  const evidence = coachEvidence("plateau");
  if (evidence.candidate.scope.kind === "lift") evidence.candidate.scope.context.equipmentInstanceId = equipment;
  const episode = planCoachEpisodes({ previous: [], observations: [coachObservation(evidence)], preferences: DEFAULT_COACH_PREFERENCES }).episodes[0];
  return { id, data: episode };
}
beforeEach(() => { vi.resetAllMocks(); mocks.refresh.mockResolvedValue({ status: "ready" }); mocks.open.mockResolvedValue("owned-thread"); });
describe("relevant Coach entry", () => {
  it("reuses an authorized exact-identity episode while keeping historical month focus", async () => {
    mocks.snapshot.mockResolvedValue({ episodes: [row("exact"), row("other-machine", "machine")] });
    const result = await resolveCoachEntry(db, "owner", focus);
    expect(mocks.open).toHaveBeenCalledWith(db, "owner", "exact");
    expect(result).toMatchObject({ kind: "navigate" });
    expect("href" in result && result.href).toContain("month=2026-09");
    expect("href" in result && result.href).toContain("thread=owned-thread");
  });
  it("offers a choice for multiple matching slots rather than selecting one arbitrarily", async () => {
    mocks.snapshot.mockResolvedValue({ episodes: [row("one"), row("two")] });
    expect(await resolveCoachEntry(db, "owner", focus)).toMatchObject({ kind: "choose", episodes: [{ id: "one" }, { id: "two" }] });
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("starts an on-demand draft when no current exception matches", async () => {
    mocks.snapshot.mockResolvedValue({ episodes: [row("other-machine", "machine")] });
    const result = await resolveCoachEntry(db, "owner", focus);
    expect(result).toMatchObject({ kind: "navigate" }); expect(result.href).toContain("thread=new");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("does not treat a failed refresh as absence or recovery", async () => {
    mocks.refresh.mockResolvedValue({ status: "unavailable" });
    expect(await resolveCoachEntry(db, "owner", focus)).toMatchObject({ kind: "unavailable" });
    expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
  });
});
