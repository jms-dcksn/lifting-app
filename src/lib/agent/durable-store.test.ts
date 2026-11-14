import { afterEach, describe, expect, it, vi } from "vitest";

// Pool construction is lazy: these configuration checks never connect to a database.
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Coach database TLS", () => {
  it("passes an environment-specific CA to the pool without disabling verification", async () => {
    vi.stubEnv("COACH_RUNTIME_DATABASE_URL", "postgresql://coach_agent_runtime.fixture:unused@db.example.invalid:6543/postgres");
    const certificate = "-----BEGIN CERTIFICATE-----\nfixture-ca\n-----END CERTIFICATE-----";
    vi.stubEnv("COACH_RUNTIME_CA_CERT", certificate);
    const { configuredDurableStore } = await import("./durable-store");
    const store = configuredDurableStore();
    try {
      expect(store.pool.options.ssl).toEqual({ rejectUnauthorized: true, ca: certificate });
    } finally { await store.pool.end(); }
  });

  it("keeps normal certificate verification when no custom CA is configured", async () => {
    vi.stubEnv("COACH_RUNTIME_DATABASE_URL", "postgresql://coach_agent_runtime.fixture:unused@db.example.invalid/postgres");
    vi.stubEnv("COACH_RUNTIME_CA_CERT", "");
    const { configuredDurableStore } = await import("./durable-store");
    const store = configuredDurableStore();
    try {
      expect(store.pool.options.ssl).toEqual({ rejectUnauthorized: true });
    } finally { await store.pool.end(); }
  });
});
