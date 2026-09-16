import { defineConfig } from "vitest/config";

// Default node for pure modules. InfoButton tests opt into jsdom via a file pragma.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/lib/**/*.test.tsx"],
  },
});
