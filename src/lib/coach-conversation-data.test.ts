import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmCoachEpisodeAction, episodeContextForThread } from "./coach-conversation-data";
import type { Database } from "./supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coachIntentFingerprint, type CoachActionIntent } from "./coach-intervention";
afterEach(() => vi.unstubAllEnvs());
const intent: CoachActionIntent = { episodeId: crypto.randomUUID(), requestId: crypto.randomUUID(), action: "rep_change", occurrence: 1, revision: 1, scope: "program", replacementId: null, sessionId: null };
const receipt = { requestId: intent.requestId, episodeId: intent.episodeId, action: "rep_change", status: "applied", adaptationId: crypto.randomUUID(), sessionId: null, slotId: crypto.randomUUID(), replacementId: null, repMin: 12, repMax: 15 };
function savedReceipt(fingerprint = coachIntentFingerprint(intent)) {
  const calls: Array<[string, unknown]> = [];
  const q = { select: () => q, eq: (key: string, value: unknown) => { calls.push([key, value]); return q; }, maybeSingle: async () => ({ data: { intent_fingerprint: fingerprint, result: receipt }, error: null }) };
  const from = vi.fn(() => q), rpc = vi.fn();
  return { db: { from, rpc } as unknown as SupabaseClient<Database>, from, rpc, calls };
}
describe("episode data authorization and replay", () => {
  it("recovers a saved receipt with no recomputation, signing key or new RPC", async () => {
    const { db, from, rpc, calls } = savedReceipt();
    expect(await confirmCoachEpisodeAction(db, "owner", intent)).toEqual(receipt);
    expect(from).toHaveBeenCalledOnce(); expect(from).toHaveBeenCalledWith("coach_action_receipt");
    expect(calls).toContainEqual(["user_id", "owner"]); expect(calls).toContainEqual(["request_id", intent.requestId]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a changed choice reusing a request ID", async () => {
    const { db, rpc } = savedReceipt();
    await expect(confirmCoachEpisodeAction(db, "owner", { ...intent, sessionId: crypto.randomUUID() })).rejects.toThrow("different choice");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does no episode reads for ordinary chat when inbox is disabled", async () => {
    vi.stubEnv("COACH_INBOX_ENABLED", "false"); const { db, from } = savedReceipt();
    expect(await episodeContextForThread(db, "owner", crypto.randomUUID())).toBeNull(); expect(from).not.toHaveBeenCalled();
  });
});
