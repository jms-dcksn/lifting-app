import { defineConfig } from "vitest/config";

// Scoped to the pure, framework-free modules (strength engine + analytics).
// These have no Next.js/React deps, so they run in a plain node environment.
// `@/` path alias resolves via the native tsconfig-paths support.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
  },
});
