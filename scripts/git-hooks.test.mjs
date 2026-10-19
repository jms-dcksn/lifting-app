import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const runner = fileURLToPath(new URL("./git-hooks.mjs", import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "lifting-hook-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env, EVAL_LIVE: "1" };
  // Git hooks can export an alternate index; fixtures must use their own repository.
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  function git(...args) {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  git("init", "--quiet");
  git("config", "core.hooksPath", "/dev/null");
  const check = "node -e \"if(require('fs').readFileSync('probe','utf8')!=='good'||process.env.EVAL_LIVE!=='0')process.exit(1)\"";
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: Object.fromEntries(
    ["lint", "typecheck:indexed", "test:hooks", "test", "verify"].map(name => [name, check]),
  ) }));
  writeFileSync(join(cwd, "package-lock.json"), "{}");
  writeFileSync(join(cwd, ".gitignore"), "node_modules/\n.next/\n");
  writeFileSync(join(cwd, "probe"), "good");
  mkdirSync(join(cwd, "node_modules"));
  git("add", ".");
  git("-c", "user.name=Hook Test", "-c", "user.email=hook@example.test", "commit", "--quiet", "-m", "fixture");
  return { cwd, git, run: (mode, input = "") => spawnSync(process.execPath, [runner, mode], { cwd, env, input, encoding: "utf8" }) };
}

test("commit checks staged content, preserves unstaged work, and disables paid evals", t => {
  const { cwd, run } = fixture(t);
  writeFileSync(join(cwd, "probe"), "bad");
  const result = run("commit");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(cwd, "probe"), "utf8"), "bad");
});

test("an unstaged fix cannot hide a failing staged commit", t => {
  const { cwd, git, run } = fixture(t);
  writeFileSync(join(cwd, "probe"), "bad");
  git("add", "probe");
  writeFileSync(join(cwd, "probe"), "good");
  assert.notEqual(run("commit").status, 0);
  assert.equal(readFileSync(join(cwd, "probe"), "utf8"), "good");
});

test("push runs verification but blocks dirty files and active Next processes", t => {
  const { cwd, run } = fixture(t);
  assert.equal(run("push").status, 0);
  assert.match(run("push", "refs/heads/other abc123 refs/heads/other def456\n").stderr, /Check out the commit/);
  writeFileSync(join(cwd, "untracked"), "bad");
  assert.match(run("push").stderr, /Commit or stash/);
  rmSync(join(cwd, "untracked"));
  writeFileSync(join(cwd, "probe"), "bad");
  assert.match(run("push").stderr, /Commit or stash/);
  writeFileSync(join(cwd, "probe"), "good");
  mkdirSync(join(cwd, ".next", "dev"), { recursive: true });
  writeFileSync(join(cwd, ".next", "dev", "lock"), "");
  assert.match(run("push").stderr, /Stop the Next/);
});
