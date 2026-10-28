import { describe, expect, it } from "vitest";
import { prerequisite, verificationPlan } from "../../scripts/verification-plan.mjs";

describe("verification selection and prerequisites", () => {
  it("always regenerates types and includes strict checking, tests, lint and build in the base profile", () => {
    expect(verificationPlan([]).map(step => step.script)).toEqual(["typecheck", "lint", "typecheck:indexed", "test:hooks", "test", "build"]);
    expect(verificationPlan(["agent"]).map(step => step.script)).toEqual(["test:agent"]);
    expect(verificationPlan(["database"]).map(step => step.script)).toEqual(["test:db", "test:db:compatibility", "test:db:concurrency"]);
    expect(() => verificationPlan(["unknown"])).toThrow();
  });
  it("keeps external/paid checks opt-in and blocks missing or remote prerequisites", () => {
    expect(prerequisite("base", {})).toBeNull();
    expect(prerequisite("live", {})).toContain("credentials");
    expect(prerequisite("database", { COACH_TEST_DATABASE_URL: "postgres://prod.example/db" })).toContain("loopback");
    expect(prerequisite("browser", {})).toContain("E2E_DISPOSABLE");
    const env = { E2E_DISPOSABLE: "1", E2E_DATABASE_URL: "postgres://localhost:54322/postgres", E2E_SUPABASE_URL: "http://127.0.0.1:54321", E2E_SUPABASE_KEY: "local" };
    expect(prerequisite("browser", env)).toBeNull();
    expect(prerequisite("browser", { ...env, E2E_BASE_URL: "https://production.example" })).toContain("loopback");
  });
});
