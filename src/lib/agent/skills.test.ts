import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReadOnlySkillsBackend } from "./skills";

const fixture = resolve("src/lib/agent/skills");
const path = "/coach-context-check/SKILL.md";

describe("read-only Coach skills", () => {
  it("rejects every backend mutation and traversal while keeping skill files intact", async () => {
    const backend = new ReadOnlySkillsBackend({ rootDir: fixture, virtualMode: true });
    const original = readFileSync(resolve(fixture, "coach-context-check/SKILL.md"), "utf8");
    expect(await backend.write(path, "Changed")).toHaveProperty("error");
    expect(await backend.edit(path, "Coach", "Changed")).toHaveProperty("error");
    expect(await backend.delete("/")).toHaveProperty("error");
    expect(await backend.uploadFiles([[path, new TextEncoder().encode("Changed")]])).toEqual([{ path, error: "permission_denied" }]);
    expect((await backend.read(path)).content).toContain("Coach context check");
    expect((await backend.read("/../../prompt.ts")).error).toBeDefined();
    expect(readFileSync(resolve(fixture, "coach-context-check/SKILL.md"), "utf8")).toBe(original);
  });

  it("denies symlink reads outside the bundled directory", async () => {
    const rootDir = mkdtempSync(resolve(tmpdir(), "skill-bundle-"));
    try {
      cpSync(fixture, rootDir, { recursive: true });
      symlinkSync(resolve("src/lib/agent/prompt.ts"), resolve(rootDir, "outside.md"));
      const backend = new ReadOnlySkillsBackend({ rootDir, virtualMode: true });
      expect((await backend.read("/outside.md")).error).toBeDefined();
      expect((await backend.downloadFiles(["/outside.md"]))[0]?.error).not.toBeNull();
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
  });
});
