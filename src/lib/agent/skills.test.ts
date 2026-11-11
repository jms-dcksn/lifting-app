import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createCoachSkills } from "./skills";

const fixture = resolve("src/lib/agent/__fixtures__/skills");
const path = "/skills/coach-context-check/SKILL.md";

describe("trusted Coach skill bundle", () => {
  it("rejects every backend mutation and traversal while keeping skill files intact", async () => {
    const { backend } = createCoachSkills({ rootDir: fixture });
    const original = readFileSync(resolve(fixture, "coach-context-check/SKILL.md"), "utf8");
    expect(await backend.write(path, "Changed")).toHaveProperty("error");
    expect(await backend.edit(path, "Coach", "Changed")).toHaveProperty("error");
    expect(await backend.delete("/skills/")).toHaveProperty("error");
    expect(await backend.uploadFiles([[path, new TextEncoder().encode("Changed")]])).toEqual([{ path, error: "permission_denied" }]);
    expect((await backend.read(path)).content).toContain("Coach context check");
    expect((await backend.read("/skills/../../prompt.ts")).error).toBeDefined();
    expect(readFileSync(resolve(fixture, "coach-context-check/SKILL.md"), "utf8")).toBe(original);
  });

  it("hashes reference contents and rejects missing, malformed and escaping assets", () => {
    const rootDir = mkdtempSync(resolve(tmpdir(), "skill-bundle-"));
    try {
      cpSync(fixture, rootDir, { recursive: true });
      const original = createCoachSkills({ rootDir }).skills;
      const reference = resolve(rootDir, "coach-context-check/references/checklist.md");
      writeFileSync(reference, "Changed reference.");
      expect(createCoachSkills({ rootDir }).skills).not.toEqual(original);
      rmSync(reference);
      expect(() => createCoachSkills({ rootDir })).toThrow();
      symlinkSync(resolve("src/lib/agent/prompt.ts"), reference);
      expect(() => createCoachSkills({ rootDir })).toThrow("escapes bundle");
      writeFileSync(resolve(rootDir, "manifest.json"), '{"skills":[{"name":"../escape","version":"1","files":["SKILL.md"]}]}');
      expect(() => createCoachSkills({ rootDir })).toThrow();
    } finally { rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("keeps the fixture out of production registration", () => {
    expect(createCoachSkills().skills).toEqual([]);
  });
});
