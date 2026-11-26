import { spawnSync } from "node:child_process";

// The full browser suite runs with the durable Coach runtime enabled. The @coach-chat
// journeys run again on the default legacy runtime, which production uses until the
// durable rollout flag is enabled. Extra arguments (files, --grep, --trace) go to both runs.
const args = process.argv.slice(2);
for (const [runtime, extra] of [["durable", []], ["legacy", ["--pass-with-no-tests"]]]) {
  console.log(`\nBrowser suite: ${runtime} Coach runtime`);
  const result = spawnSync("npx", ["--no-install", "playwright", "test", ...extra, ...args], {
    stdio: "inherit", env: { ...process.env, E2E_COACH_RUNTIME: runtime },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
