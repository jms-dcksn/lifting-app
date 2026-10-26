import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askJev } from "./jev";

beforeEach(() => {
  vi.stubEnv("LANGSMITH_TRACING", "false");
  vi.stubEnv("LANGCHAIN_TRACING_V2", "false");
  vi.stubEnv("JEV_API_KEY", "fixture-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const request = { state: { answer: "synthetic" }, questions: { grounded: { type: "noul" as const, instructions: "Check evidence." } } };

describe("traced Jev transport (mocked HTTP, no paid calls)", () => {
  it("preserves Noul request/response values and keeps credentials out of the traceable input", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ answers: { grounded: { noul: 0.87 } } }));
    vi.stubGlobal("fetch", fetch);
    expect(await askJev(request)).toEqual({ grounded: 0.87 });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.state).toEqual(request.state);
    expect(body.questions).toEqual(request.questions);
    expect(JSON.stringify(body)).not.toContain("fixture-key");
    expect(JSON.stringify(request)).not.toContain("fixture-key");
  });
  it("keeps judge transport and malformed-score failures visible", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}, { status: 429 })); vi.stubGlobal("fetch", fetch);
    await expect(askJev(request)).rejects.toThrow("Jev returned 429");
    fetch.mockResolvedValue(Response.json({ answers: { grounded: { noul: 1.5 } } }));
    await expect(askJev(request)).rejects.toThrow("Jev answer grounded has no noul");
  });
});
