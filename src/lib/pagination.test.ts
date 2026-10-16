import { describe, expect, it } from "vitest";
import { collectIdPages } from "./pagination";

describe("ID pagination", () => {
  it("continues through short capped pages and an empty final page", async () => {
    const cursors: Array<string | null> = [];
    const rows = await collectIdPages(async after => {
      cursors.push(after);
      return after === null ? [{ id: "a", user_id: "owner" }] : after === "a" ? [{ id: "b", user_id: "owner" }] : [];
    });
    expect(rows.map(row => row.id)).toEqual(["a", "b"]);
    expect(cursors).toEqual([null, "a", "b"]);
  });
  it.each([{ rows: [{ id: "a" }, { id: "a" }] }, { rows: [{ id: "" }] }])("rejects non-advancing pages $rows", async ({ rows }) => {
    await expect(collectIdPages(async () => rows)).rejects.toThrow("unique ID order");
  });
  it("preserves database collation order for text exercise IDs", async () => {
    const rows = await collectIdPages(async after => after === null ? [{ id: "a_b" }, { id: "a-b" }] : []);
    expect(rows.map(row => row.id)).toEqual(["a_b", "a-b"]);
  });
  it("propagates read failure instead of returning incomplete history", async () => {
    await expect(collectIdPages(async () => { throw Error("offline"); })).rejects.toThrow("offline");
    expect(await collectIdPages(async () => [])).toEqual([]);
  });
});
