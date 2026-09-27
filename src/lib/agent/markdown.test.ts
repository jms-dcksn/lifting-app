import { describe, expect, it } from "vitest";
import { parseCoachMarkdown, splitCoachReply } from "./markdown";

const reply = `This week went solidly — **4/4 sessions** completed, on track.

- **Working sets.** 45/48 completed (94%).
- **Progress.** Cable Curl **+8.5%**, Lateral Raise +28.3%

One Upper-B session was at a hotel gym.
**Source: Track Coach / Coach check-in**`;

describe("splitCoachReply", () => {
  it("lifts a single source line out of the body", () => {
    const split = splitCoachReply(reply);
    expect(split.sources).toEqual(["Track Coach / Coach check-in"]);
    expect(split.body).not.toMatch(/Source:/);
    expect(split.body).toContain("**4/4 sessions**");
  });

  it("keeps an answer that has no source line", () => {
    expect(splitCoachReply("Cable Curl is up +8.5%.")).toEqual({
      body: "Cable Curl is up +8.5%.",
      sources: [],
    });
  });
});

describe("parseCoachMarkdown", () => {
  it("renders paragraphs, bold, lists, and gain percents", () => {
    const { body } = splitCoachReply(reply);
    const blocks = parseCoachMarkdown(body);
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "list", "paragraph"]);
    const lead = blocks[0];
    expect(lead?.type).toBe("paragraph");
    if (lead?.type !== "paragraph") return;
    expect(lead.inlines).toContainEqual({ type: "strong", value: "4/4 sessions" });
    const list = blocks[1];
    expect(list?.type).toBe("list");
    if (list?.type !== "list") return;
    expect(list.items).toHaveLength(2);
    expect(list.items[1]).toContainEqual({ type: "gain", value: "+8.5%", strong: true });
    expect(list.items[1]).toContainEqual({ type: "gain", value: "+28.3%", strong: false });
  });

  it("treats an unclosed bold marker as strong so a stream can paint", () => {
    const [block] = parseCoachMarkdown("Lead with **4/4");
    expect(block).toEqual({
      type: "paragraph",
      inlines: [
        { type: "text", value: "Lead with " },
        { type: "strong", value: "4/4" },
      ],
    });
  });
});
