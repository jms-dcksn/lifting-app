import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("./supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("Unauthenticated"); } }));

import { saveProfile } from "@/app/(app)/settings/actions";

const owner = "a0000000-0000-0000-0000-000000000001";
const updates: Record<string, unknown>[] = [];
function from() {
  const query = {
    select: () => query,
    eq: () => query,
    update: (data: Record<string, unknown>) => {
      updates.push(data);
      return query;
    },
    single: async () => ({
      data: updates.length
        ? { id: owner }
        : { sex: "unspecified", period_tracking_enabled: false },
      error: null,
    }),
  };
  return query;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  mocks.client.mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: owner } } }) },
    from,
  });
});

describe("saveProfile rest tone", () => {
  it("stores rest_tone_enabled true when the checkbox is on", async () => {
    await saveProfile(form({
      default_rest_seconds: "90",
      rest_tone_enabled: "on",
      sex: "unspecified",
    }));
    expect(updates[0]).toMatchObject({
      default_rest_seconds: 90,
      rest_tone_enabled: true,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/session/[id]", "page");
  });

  it("stores rest_tone_enabled false when the checkbox is omitted", async () => {
    await saveProfile(form({ default_rest_seconds: "120", sex: "unspecified" }));
    expect(updates[0]).toMatchObject({ rest_tone_enabled: false });
  });
});
