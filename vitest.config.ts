import { defineConfig } from "vitest/config";

// Default node for pure modules. InfoButton tests opt into jsdom via a file pragma.
// Next resolves `server-only` itself; Vitest gets the same empty server build.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": "next/dist/compiled/server-only/empty.js" },
  },
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/lib/**/*.test.tsx"],
  },
});
