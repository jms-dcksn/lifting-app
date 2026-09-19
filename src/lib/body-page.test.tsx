import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  client: vi.fn(),
  history: vi.fn(async () => []),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/weight-history", () => ({ loadWeightHistory: mocks.history }));
vi.mock("@/app/(app)/analytics/weight-trend-card", () => ({
  WeightTrendCard: () => <section>Weight chart</section>,
}));
vi.mock("@/app/(app)/measurements/actions", () => ({
  writeMeasurements: async () => ({ ok: true }),
}));

import BodyPage from "@/app/(app)/analytics/body/page";

function from(table: string) {
  if (table === "profile") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { goal_weight: 150 }, error: null }),
        }),
      }),
    };
  }
  return {
    select: () => ({
      eq: () => ({
        lte: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: "owner" } } }) },
    from,
  });
});

describe("Body page", () => {
  it("renders the weight card first and the tape empty line under it", async () => {
    const html = renderToStaticMarkup(await BodyPage());
    expect(html.indexOf("Weight chart")).toBeGreaterThan(-1);
    expect(html.indexOf("Tape")).toBeGreaterThan(html.indexOf("Weight chart"));
    expect(html).toContain("Tape logs appear after the first save.");
  });
});
