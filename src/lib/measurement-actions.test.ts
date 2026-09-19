import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { writeMeasurements } from "@/app/(app)/measurements/actions";

const owner = "a0000000-0000-0000-0000-000000000001";
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));
const claims = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T18:00:00Z"));
  claims.mockResolvedValue({ data: { claims: { sub: owner } } });
  mocks.client.mockResolvedValue({ auth: { getClaims: claims }, from });
  upsert.mockResolvedValue({ error: null });
});

afterEach(() => vi.useRealTimers());

describe("writeMeasurements", () => {
  it("rejects empty, future, zero, and unknown sites before a write", async () => {
    expect(await writeMeasurements({ loggedOn: "2026-09-19", readings: [] })).toEqual({
      ok: false,
      error: "Enter at least one site.",
    });
    expect(await writeMeasurements({ loggedOn: "2026-09-20", readings: [{ site: "waist", inches: 28 }] })).toEqual({
      ok: false,
      error: "Choose today or an earlier valid date.",
    });
    expect(await writeMeasurements({ loggedOn: "2026-09-19", readings: [{ site: "waist", inches: 0 }] })).toEqual({
      ok: false,
      error: "Enter inches greater than 0 and no more than 80.",
    });
    expect(await writeMeasurements({ loggedOn: "2026-09-19", readings: [{ site: "calf", inches: 14 }] })).toEqual({
      ok: false,
      error: "Choose a valid site.",
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("upserts provided sites for the owner and refreshes only Body", async () => {
    expect(
      await writeMeasurements({
        loggedOn: "2026-09-19",
        readings: [
          { site: "waist", inches: 28.5 },
          { site: "neck", inches: 13 },
        ],
      }),
    ).toEqual({ ok: true });

    expect(from).toHaveBeenCalledWith("body_measurement_log");
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          user_id: owner,
          logged_on: "2026-09-19",
          site: "waist",
          inches: 28.5,
          updated_at: "2026-09-19T18:00:00.000Z",
        },
        {
          user_id: owner,
          logged_on: "2026-09-19",
          site: "neck",
          inches: 13,
          updated_at: "2026-09-19T18:00:00.000Z",
        },
      ],
      { onConflict: "user_id,logged_on,site" },
    );
    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/analytics/body");
    expect(mocks.revalidate).not.toHaveBeenCalledWith("/workout/next");
    expect(mocks.revalidate).not.toHaveBeenCalledWith("/session/[id]", "page");
  });

  it("does not report success or refresh when the write fails", async () => {
    upsert.mockResolvedValue({ error: { message: "private database details" } });
    const result = await writeMeasurements({
      loggedOn: "2026-09-19",
      readings: [{ site: "chest", inches: 36 }],
    });
    expect(result).toEqual({ ok: false, error: "Unable to save your measurements. Please try again." });
    expect(JSON.stringify(result)).not.toContain("private database details");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects anonymous calls", async () => {
    claims.mockResolvedValue({ data: null });
    await expect(
      writeMeasurements({ loggedOn: "2026-09-19", readings: [{ site: "waist", inches: 28 }] }),
    ).rejects.toThrow("Sign in");
    expect(upsert).not.toHaveBeenCalled();
  });
});
