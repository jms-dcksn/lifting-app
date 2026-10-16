import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Both modes are included by Next's tsconfig. typegen alone leaves old dev validators.
// Run when no dev server/build is writing generated types.
for (const directory of [".next/types", ".next/dev/types"]) rmSync(directory, { recursive: true, force: true });
for (const args of [["next", "typegen"], ["tsc", "--noEmit"]]) {
  const result = spawnSync("npx", ["--no-install", ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
