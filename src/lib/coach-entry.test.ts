import { describe, expect, it } from "vitest";
import { coachEntryHref, coachConversationHref, coachDetailsHref, parseCoachFocus } from "./coach-entry";
import { parseClientAction } from "./agent/client-tools";
const focus = { exerciseId: "db-bench", equipmentInstanceId: "11111111-1111-4111-8111-111111111111", month: "2026-09" };
describe("Coach entry compatibility and focus", () => {
  it("preserves exact exercise/equipment/month through entry, conversation and optional details", () => {
    for (const href of [coachEntryHref(focus), coachConversationHref(focus, "thread"), coachDetailsHref(focus)]) {
      const params = new URL(href, "https://app.test").searchParams;
      expect(parseCoachFocus(Object.fromEntries(params))).toEqual(focus);
    }
    expect(coachEntryHref()).toBe("/coach?review=1");
    expect(coachConversationHref({ exerciseId: null, equipmentInstanceId: null, month: null }, null)).toBe("/coach?thread=new");
    expect(coachDetailsHref(focus)).toContain("view=details");
    expect(coachConversationHref(focus, "thread")).not.toContain("review=1");
  });
  it("drops malformed context and encodes untrusted exercise text in query parameters", () => {
    expect(parseCoachFocus({ exercise: [], equipment: "foreign-id", month: "2026-99" })).toEqual({ exerciseId: null, equipmentInstanceId: null, month: null });
    expect(coachEntryHref({ exerciseId: "x&thread=foreign" })).toContain("exercise=x%26thread%3Dforeign");
  });
  it("routes saved legacy tool results into Coach without a required report stop", () => {
    const action = parseClientAction({ type: "tool-result", name: "openCoachCheckIn", id: "nav", result: { action: "navigate", href: "/analytics/coach?exercise=db-bench&month=2026-09#coach-next-steps" } });
    expect(action).toMatchObject({ href: "/coach?exercise=db-bench&equipment=none&month=2026-09&review=1" });
  });
});
