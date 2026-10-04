import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideHostedMigrationGate } from "./migration-gate";

const swapFile = "20261004192600_swap_program_slot_exercise.sql";
const earlierFile = "20260927170000_agent_multi_thread.sql";

describe("decideHostedMigrationGate", () => {
  it("blocks production when the swap migration is missing from an earlier hosted ledger", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: [swapFile, earlierFile],
        hosted: { kind: "observed", appliedVersions: ["20260927170000"] },
      }),
    ).toEqual({
      kind: "block",
      reason: "missing-hosted-migrations",
      missing: [
        {
          version: "20261004192600",
          path: "supabase/migrations/20261004192600_swap_program_slot_exercise.sql",
        },
      ],
    });
  });

  it("allows production when the hosted ledger includes the swap migration", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: [swapFile, earlierFile],
        hosted: {
          kind: "observed",
          appliedVersions: ["20260927170000", "20261004192600"],
        },
      }),
    ).toEqual({ kind: "allow", reason: "hosted-current" });
  });

  it("treats an empty observed ledger as a real read", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: ["0001_init.sql"],
        hosted: { kind: "observed", appliedVersions: [] },
      }),
    ).toEqual({
      kind: "block",
      reason: "missing-hosted-migrations",
      missing: [{ version: "0001", path: "supabase/migrations/0001_init.sql" }],
    });
  });

  it("blocks production when the hosted proof is not installed", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: ["0001_init.sql"],
        hosted: { kind: "unavailable", cause: "gate-not-installed" },
      }),
    ).toEqual({
      kind: "block",
      reason: "hosted-unverifiable",
      cause: "gate-not-installed",
    });
  });

  it("allows a non-production build with valid sql names", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "non-production",
        migrationFiles: [earlierFile, swapFile],
      }),
    ).toEqual({ kind: "allow", reason: "non-production" });
  });

  it("blocks a non-production build when a sql file is misnamed", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "non-production",
        migrationFiles: ["notes.sql"],
      }),
    ).toEqual({ kind: "block", reason: "misnamed", files: ["notes.sql"] });
  });

  it("rejects an applied version that is not digits", () => {
    expect(() =>
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: ["0001_init.sql"],
        hosted: { kind: "observed", appliedVersions: ["nope"] },
      }),
    ).toThrow(new Error("Invalid migration version: nope"));
  });

  it("allows production when both versions are applied regardless of filename order", () => {
    const hosted = {
      kind: "observed" as const,
      appliedVersions: ["0002", "0001"],
    };
    const expected = { kind: "allow", reason: "hosted-current" };
    expect(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: ["0002_program_builder.sql", "0001_init.sql"],
        hosted,
      }),
    ).toEqual(expected);
    expect(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles: ["0001_init.sql", "0002_program_builder.sql"],
        hosted,
      }),
    ).toEqual(expected);
  });

  it("ignores a non-sql name such as .gitkeep", () => {
    expect(
      decideHostedMigrationGate({
        deployment: "non-production",
        migrationFiles: [".gitkeep", "0001_init.sql"],
      }),
    ).toEqual({ kind: "allow", reason: "non-production" });
  });

  it("runs the hosted migration check before next build", () => {
    const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts: { build: string };
    };
    expect(pkg.scripts.build).toBe(
      "tsx scripts/check-hosted-migrations.ts && next build",
    );
  });
});
