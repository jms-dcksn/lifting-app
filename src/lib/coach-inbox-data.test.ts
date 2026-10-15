import { describe, expect, it, vi, afterEach } from "vitest";
import { refreshCoachInbox, loadCoachInbox } from "./coach-inbox-data";
import { signCoachCommand } from "./coach-episode-command";
import { createHmac } from "node:crypto";
import type { createClient } from "./supabase/server";
type Client = Awaited<ReturnType<typeof createClient>>;
afterEach(() => vi.unstubAllEnvs());
function database({ race = false, failure = false } = {}) {
  let calls = 0;
  const from = vi.fn((table: string) => {
    const result = {
      data:
        table === "profile"
          ? { bodyweight: 180 }
          : table === "coach_refresh_state"
            ? { source_revision: 4, state_version: 2 }
            : table === "coach_preferences"
              ? null
              : [],
      error: null,
      count: 0,
    };
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve(result).then(resolve),
    };
    for (const name of [
      "select",
      "eq",
      "order",
      "limit",
      "gt",
      "lte",
      "is",
      "or",
    ])
      q[name] = vi.fn(() => q);
    q.maybeSingle = vi.fn(() => Promise.resolve(result));
    return q;
  });
  const rpc = vi.fn(async () => {
    calls++;
    return {
      data: { status: race && calls === 1 ? "refresh_required" : "ready" },
      error: failure ? { message: "key missing" } : null,
    };
  });
  return { client: { from, rpc } as unknown as Client, from, rpc };
}
describe("Coach refresh boundary", () => {
  it("is inert when delivery is disabled", async () => {
    vi.stubEnv("COACH_INBOX_ENABLED", "false");
    const db = database();
    expect(await refreshCoachInbox(db.client, "owner")).toEqual({
      status: "disabled",
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("fails closed without signing configuration, without throwing into training", async () => {
    vi.stubEnv("COACH_INBOX_ENABLED", "true");
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY", "");
    const db = database();
    expect(await refreshCoachInbox(db.client, "owner")).toEqual({
      status: "unavailable",
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("retries one source race with a new complete snapshot", async () => {
    vi.stubEnv("COACH_INBOX_ENABLED", "true");
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY", "11".repeat(32));
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY_ID", "test");
    const db = database({ race: true });
    expect((await refreshCoachInbox(db.client, "owner")).status).toBe("ready");
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
  it("returns retryable failure when a guarded RPC fails", async () => {
    vi.stubEnv("COACH_INBOX_ENABLED", "true");
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY", "11".repeat(32));
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY_ID", "test");
    const db = database({ failure: true });
    expect((await refreshCoachInbox(db.client, "owner")).status).toBe(
      "unavailable",
    );
  });
  it("signs exact unicode/newline JSON bytes with a 60-second lifetime", () => {
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY", "11".repeat(32));
    vi.stubEnv("COACH_COMMAND_SIGNING_KEY_ID", "test");
    const command = signCoachCommand(
      { owner: "owner", title: "Café “pain”\nreview" },
      new Date("2026-10-15T00:00:00Z"),
    );
    expect(command.p_mac).toBe(
      createHmac("sha256", Buffer.alloc(32, 0x11))
        .update(command.p_payload)
        .digest("hex"),
    );
    const payload = JSON.parse(command.p_payload);
    expect(payload.expiresAt).toBe("2026-10-15T00:01:00.000Z");
  });
  it("rejects cursor injection before issuing a query", async () => {
    const db = database();
    await expect(
      loadCoachInbox(
        db.client,
        "owner",
        JSON.stringify({ id: "bad),user_id.eq.other", at: "bad" }),
      ),
    ).rejects.toThrow();
  });
});
