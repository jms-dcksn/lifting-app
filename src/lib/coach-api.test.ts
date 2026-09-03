import { describe, expect, it, vi } from "vitest";
import {
  constantTimeTokenEqual,
  createCoachWeeklyHandler,
  weeklyResponse,
} from "./coach-api";
import { buildCoachCheckInReport } from "./coach-check-in";

const TOKEN = "0123456789abcdef0123456789abcdef";
const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const report = buildCoachCheckInReport({
  generatedAt: new Date("2026-09-03T12:00:00.000Z"),
  sessions: [],
  sets: [],
  slots: [],
  phases: [],
  definitions: {},
});

function handler(overrides: Partial<{
  token: string;
  userId: string;
}> = {}) {
  const loadWeekly = vi.fn(async () => weeklyResponse(report, []));
  return {
    loadWeekly,
    GET: createCoachWeeklyHandler({
      expectedToken: () => overrides.token ?? TOKEN,
      userId: () => overrides.userId ?? USER_ID,
      loadWeekly,
    }),
  };
}

describe("weekly Coach API", () => {
  it("returns the canonical report for a valid bearer token", async () => {
    const { GET, loadWeekly } = handler();
    const response = await GET(new Request("https://example.test/api/coach/v1/weekly", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }));

    expect(response.status).toBe(200);
    expect(loadWeekly).toHaveBeenCalledWith(USER_ID);
    expect(await response.json()).toEqual({ apiVersion: "1", report, recommendations: [] });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it.each([
    new Request("https://example.test/api/coach/v1/weekly"),
    new Request("https://example.test/api/coach/v1/weekly", {
      headers: { Authorization: "Bearer incorrect" },
    }),
  ])("returns the same generic 401 for a missing or invalid credential", async (request) => {
    const { GET, loadWeekly } = handler();
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(loadWeekly).not.toHaveBeenCalled();
  });

  it("supports a scoped query capability when no authorization header is available", async () => {
    const { GET } = handler();
    const response = await GET(new Request(
      `https://example.test/api/coach/v1/weekly?token=${TOKEN}`,
    ));
    expect(response.status).toBe(200);
  });

  it("does not let a query token override an invalid authorization header", async () => {
    const { GET } = handler();
    const response = await GET(new Request(
      `https://example.test/api/coach/v1/weekly?token=${TOKEN}`,
      { headers: { Authorization: "Bearer incorrect" } },
    ));
    expect(response.status).toBe(401);
  });

  it("fails closed when the capability configuration is weak or malformed", async () => {
    const { GET: weakToken } = handler({ token: "too-short" });
    const { GET: badUser } = handler({ userId: "not-a-user" });
    const request = new Request("https://example.test/api/coach/v1/weekly", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect((await weakToken(request)).status).toBe(503);
    expect((await badUser(request)).status).toBe(503);
  });

  it("compares same-length digests instead of credential strings", () => {
    expect(constantTimeTokenEqual(TOKEN, TOKEN)).toBe(true);
    expect(constantTimeTokenEqual("short", TOKEN)).toBe(false);
  });

  it("does not expose internal identity fields in the empty response contract", () => {
    const json = JSON.stringify(weeklyResponse(report, []));
    expect(json).not.toMatch(/userId|user_id|sessionId|session_id|programId|program_id/);
  });
});
