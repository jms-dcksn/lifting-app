import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// A temporary fixture proves the actual Next trace includes Markdown assets.
const root = resolve("src/lib/agent/skills");
const fixture = resolve("src/lib/agent/__fixtures__/skills/coach-context-check");
const probe = join(root, "coach-context-check");
const directory = await mkdtemp(join(tmpdir(), "coach-skill-package-"));
let copied = false;
try {
  assert.equal(await stat(probe).then(() => true, error => {
    if (error.code === "ENOENT") return false;
    throw error;
  }), false, "Packaging probe must not overwrite a bundled skill");
  await cp(fixture, probe, { recursive: true });
  copied = true;
  const build = spawnSync("npm", ["run", "build"], { stdio: "inherit", env: { ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ci-placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "ci-placeholder-publishable-key" } });
  assert.equal(build.status, 0, "Production build failed");
  for (const trace of [".next/server/app/api/agent/chat/route.js.nft.json", ".next/server/app/(app)/coach/page.js.nft.json"]) {
    const files = JSON.parse(await readFile(trace, "utf8")).files.map(file => resolve(dirname(trace), file));
    assert.ok(!files.includes(resolve("next.config.ts")), `${trace} traced the whole project`);
    assert.ok(files.every(file => !file.includes("/__fixtures__/")), `${trace} packaged test fixtures`);
    for (const file of ["coach-context-check/SKILL.md", "coach-context-check/references/checklist.md"]) {
      const source = join(root, file);
      assert.ok(files.includes(source), `${trace} omitted ${file}`);
      const target = join(directory, file);
      await cp(source, target, { recursive: true });
      assert.equal(await readFile(target, "utf8"), await readFile(source, "utf8"));
    }
  }
  console.log("PASS: both production function traces package SKILL.md and reference contents");
} finally {
  if (copied) await rm(probe, { recursive: true, force: true });
  await rm(directory, { recursive: true, force: true });
}
