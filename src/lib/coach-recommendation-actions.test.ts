import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("Unauthenticated"); } }));

import {
  acceptAllCoachRecommendations,
  saveCoachRecommendationDecision,
} from "@/app/(app)/analytics/actions";

const owner = "a0000000-0000-0000-0000-000000000001";
const key = "rec_0123456789abcdef";
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));
const claims = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
  claims.mockResolvedValue({ data: { claims: { sub: owner } } });
  mocks.client.mockResolvedValue({ auth: { getClaims: claims }, from });
  upsert.mockResolvedValue({ error: null });
});

afterEach(() => vi.useRealTimers());

describe("saveCoachRecommendationDecision", () => {
  it("rejects invalid keys and statuses before writing", async () => {
    expect(await saveCoachRecommendationDecision({ recommendationKey: "nope", status: "accepted" }))
      .toEqual({ ok: false, error: "Invalid recommendation key." });
    expect(await saveCoachRecommendationDecision({ recommendationKey: key, status: "later" }))
      .toEqual({ ok: false, error: "Invalid recommendation decision." });
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("upserts an accept and returns without throwing", async () => {
    expect(await saveCoachRecommendationDecision({ recommendationKey: key, status: "accepted" }))
      .toEqual({ ok: true, deferredUntil: null });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: owner,
        recommendation_key: key,
        status: "accepted",
        deferred_until: null,
        updated_at: "2026-09-25T12:00:00.000Z",
      },
      { onConflict: "user_id,recommendation_key" },
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/analytics/coach");
  });

  it("stores a seven-day deferral and surfaces a failed write", async () => {
    expect(await saveCoachRecommendationDecision({ recommendationKey: key, status: "deferred" }))
      .toEqual({ ok: true, deferredUntil: "2026-10-02T12:00:00.000Z" });
    upsert.mockResolvedValueOnce({ error: { message: "private database details" } });
    const failed = await saveCoachRecommendationDecision({ recommendationKey: key, status: "dismissed" });
    expect(failed).toEqual({ ok: false, error: "Unable to save that decision. Try again." });
    expect(JSON.stringify(failed)).not.toContain("private database details");
  });
});

describe("acceptAllCoachRecommendations", () => {
  it("accepts unique valid keys and rejects a bad list", async () => {
    expect(await acceptAllCoachRecommendations([key, key])).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      [{
        user_id: owner,
        recommendation_key: key,
        status: "accepted",
        deferred_until: null,
        updated_at: "2026-09-25T12:00:00.000Z",
      }],
      { onConflict: "user_id,recommendation_key" },
    );
    expect(await acceptAllCoachRecommendations([])).toEqual({ ok: false, error: "Invalid recommendation keys." });
    expect(await acceptAllCoachRecommendations(["nope"])).toEqual({
      ok: false,
      error: "Invalid recommendation keys.",
    });
  });
});
