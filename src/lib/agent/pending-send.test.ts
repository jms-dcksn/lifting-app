import { describe, expect, it } from "vitest";
import { preparePendingSend } from "./pending-send";

describe("pending send identity", () => {
  it("reuses an ID after a lost acknowledgement without storing message text", async () => {
    const payload = { text: "Private question", threadId: null };
    const first = await preparePendingSend(payload, null);
    const retry = await preparePendingSend(payload, first.stored);
    expect(retry.body).toBe(first.body);
    expect(first.stored).not.toContain("Private question");
    const changed = await preparePendingSend({ ...payload, text: "Different" }, first.stored);
    expect(JSON.parse(changed.body).requestId).not.toBe(JSON.parse(first.body).requestId);
  });
});
