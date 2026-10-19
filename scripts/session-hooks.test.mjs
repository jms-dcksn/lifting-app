import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const hook = fileURLToPath(new URL("../.claude/hooks/load-last-session.sh", import.meta.url));

test("fresh, stale and other-branch handoffs stay quiet; matching notes load", t => {
  const cwd = mkdtempSync(join(tmpdir(), "lifting-session-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: cwd };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "--quiet", "--initial-branch=main");
  git("config", "core.hooksPath", "/dev/null");
  git("-c", "user.name=Session Test", "-c", "user.email=session@example.test", "commit", "--allow-empty", "--quiet", "-m", "fixture");
  const head = git("rev-parse", "HEAD");
  const run = () => {
    const result = spawnSync("bash", [hook], { cwd, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  assert.equal(run(), "");
  mkdirSync(join(cwd, ".claude"));
  const note = join(cwd, ".claude", "LAST_SESSION.md");
  for (const content of [
    `Commit: ${head}\n`,
    `Commit: ${"0".repeat(40)}\nBranch: main\n`,
    `Commit: ${head}\nBranch: other\n`,
    `Old Commit: ${head}\nBranch: main\n`,
  ]) {
    writeFileSync(note, content);
    assert.equal(run(), "");
  }
  const content = `Commit: ${head}\nBranch: main\nLocal task details\n`;
  writeFileSync(note, content);
  assert.ok(run().includes(content));
  assert.equal(readFileSync(note, "utf8"), content);
  git("checkout", "--quiet", "--detach");
  assert.equal(run(), "");
  writeFileSync(note, `Commit: ${head}\nBranch: DETACHED\n`);
  assert.match(run(), /Branch: DETACHED/);
});

test("Claude configuration has no Stop gate requiring local state", () => {
  const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
  assert.equal(settings.hooks.Stop, undefined);
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command,
    "${CLAUDE_PROJECT_DIR}/.claude/hooks/load-last-session.sh");
});
