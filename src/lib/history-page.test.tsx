import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  client: vi.fn(),
  catalog: vi.fn(),
  pins: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/catalog", () => ({ getCatalogMap: mocks.catalog }));
vi.mock("@/lib/pins-data", () => ({ loadUserPinRows: mocks.pins }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/(app)/pins/pin-button", () => ({ PinButton: () => null }));

import HistoryPage from "@/app/(app)/history/[exerciseId]/page";
import { EXERCISE_BY_ID } from "./strength/coefficients";

function from() {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }) },
    from,
  });
  mocks.catalog.mockResolvedValue(EXERCISE_BY_ID);
  mocks.pins.mockResolvedValue([]);
});

function render(exerciseId: string, search: { month?: string | string[]; equipment?: string }) {
  return HistoryPage({
    params: Promise.resolve({ exerciseId }),
    searchParams: Promise.resolve(search),
  });
}

describe("HistoryPage route", () => {
  it("keeps Exercise review when month is invalid instead of bouncing to Month review", async () => {
    const html = renderToStaticMarkup(await render("bb-bench", { month: "not-a-month" }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("No working sets logged yet.");
    expect(html).not.toContain("/analytics/month");
    expect(html).not.toContain("Month review could not load");
  });

  it("keeps Exercise review for a valid month query and adds the back link", async () => {
    const html = renderToStaticMarkup(await render("bb-bench", { month: "2026-09", equipment: "none" }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("No working sets logged yet.");
    expect(html).toContain('href="/analytics/month?month=2026-09"');
    expect(html).not.toContain("140.0 lb → 150.0 lb");
  });

  it("uses missing-exercise copy when the id is not in the catalog", async () => {
    mocks.catalog.mockResolvedValue({});
    const html = renderToStaticMarkup(await render("not-a-lift", { month: "2026-09" }));
    expect(html).toContain("Exercise not found");
    expect(html).toContain("This exercise is not in your catalog.");
    expect(html).toContain("Back to 2026-09 month review");
  });
});
