import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";

// Next.js loads server code through React's `react-server` condition, and only that build
// memoizes `cache()` — the default build is a passthrough. Node resolves plain `react` to
// the default build here, so point this file's graph at the real server build instead.
// Everything under test imports `cache` from "react", so they pick this up too.
vi.mock("react", () => {
  const require = createRequire(import.meta.url);
  const reactDir = dirname(require.resolve("react/package.json"));
  return require(join(reactDir, "cjs/react.react-server.development.js"));
});

const cookieStore = { getAll: () => [], set: () => {} };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

// Count the loader queries a request issues, per table.
let queries: Record<string, number>;
let clientsBuilt: number;

function fakeClient() {
  clientsBuilt++;
  const from = (table: string) => {
    queries[table] = (queries[table] ?? 0) + 1;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
    };
    return chain;
  };
  return { from };
}
vi.mock("@supabase/ssr", () => ({ createServerClient: () => fakeClient() }));

import { createClient } from "./supabase/server";
import { getCatalogMap } from "./catalog";
import { getCurrentBodyweight } from "./current-bodyweight";

// One server request's cache scope, matching how Next.js provides React's async
// dispatcher. Without a scope `cache()` is a passthrough, so dedupe is unobservable.
const internals = (React as unknown as {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
    A: unknown;
  };
}).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

async function inOneRequest<T>(run: () => Promise<T>): Promise<T> {
  const scope = new Map<() => unknown, unknown>();
  const previous = internals.A;
  internals.A = {
    getCacheForType: (create: () => unknown) => {
      if (!scope.has(create)) scope.set(create, create());
      return scope.get(create);
    },
    cacheSignal: () => null,
  };
  queries = {};
  clientsBuilt = 0;
  try {
    return await run();
  } finally {
    internals.A = previous;
  }
}

describe("request-scoped loader memoization", () => {
  it("builds one supabase client per request", async () => {
    const [first, second] = await inOneRequest(async () =>
      Promise.all([createClient(), createClient()]),
    );
    expect(first).toBe(second);
    expect(clientsBuilt).toBe(1);
  });

  it("loads the catalog once no matter how many call sites ask for it", async () => {
    await inOneRequest(async () => {
      // Layout, page, and a server action each obtain their own client reference.
      await getCatalogMap(await createClient(), "user");
      await getCatalogMap(await createClient(), "user");
      await getCatalogMap(await createClient(), "user");
    });
    expect(queries.exercise).toBe(1);
  });

  it("loads bodyweight once no matter how many call sites ask for it", async () => {
    await inOneRequest(async () => {
      await getCurrentBodyweight(await createClient(), "user");
      await getCurrentBodyweight(await createClient(), "user");
      await getCurrentBodyweight(await createClient(), "user");
    });
    expect(queries.bodyweight_log).toBe(1);
    expect(queries.profile).toBe(1);
  });

  it("keeps each user's catalog and bodyweight separate", async () => {
    await inOneRequest(async () => {
      const supabase = await createClient();
      await getCatalogMap(supabase, "user-a");
      await getCatalogMap(supabase, "user-b");
      await getCurrentBodyweight(supabase, "user-a");
      await getCurrentBodyweight(supabase, "user-b");
    });
    expect(queries.exercise).toBe(2);
    expect(queries.bodyweight_log).toBe(2);
  });

  it("does not carry a cached load into the next request", async () => {
    await inOneRequest(async () => getCatalogMap(await createClient(), "user"));
    expect(queries.exercise).toBe(1);
    await inOneRequest(async () => getCatalogMap(await createClient(), "user"));
    expect(queries.exercise).toBe(1);
    expect(clientsBuilt).toBe(1);
  });
});
