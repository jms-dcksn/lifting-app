export type HostedProofFailure =
  | "gate-not-installed"
  | "production-config-missing"
  | "proof-request-failed"
  | "proof-response-invalid";

export type HostedMigrationObservation =
  | { readonly kind: "observed"; readonly appliedVersions: readonly string[] }
  | { readonly kind: "unavailable"; readonly cause: HostedProofFailure };

export type RepositoryMigration = {
  readonly version: string;
  readonly path: string;
};

export type GateInput =
  | {
      readonly deployment: "non-production";
      readonly migrationFiles: readonly string[];
    }
  | {
      readonly deployment: "production";
      readonly migrationFiles: readonly string[];
      readonly hosted: HostedMigrationObservation;
    };

export type GateDecision =
  | { readonly kind: "allow"; readonly reason: "non-production" | "hosted-current" }
  | { readonly kind: "block"; readonly reason: "misnamed"; readonly files: readonly string[] }
  | { readonly kind: "block"; readonly reason: "hosted-unverifiable"; readonly cause: HostedProofFailure }
  | {
      readonly kind: "block";
      readonly reason: "missing-hosted-migrations";
      readonly missing: readonly RepositoryMigration[];
    };

const MIGRATION_FILENAME = /^([0-9]+)_(.*)\.sql$/;
const APPLIED_VERSION = /^[0-9]+$/;

export function migrationVersion(filename: string): string | null {
  return MIGRATION_FILENAME.exec(filename)?.[1] ?? null;
}

export function decideHostedMigrationGate(input: GateInput): GateDecision {
  const misnamed = input.migrationFiles
    .filter((name) => name.endsWith(".sql") && migrationVersion(name) === null)
    .sort();
  if (misnamed.length > 0) return { kind: "block", reason: "misnamed", files: misnamed };

  if (input.deployment === "non-production") return { kind: "allow", reason: "non-production" };

  if (input.hosted.kind === "unavailable") {
    return { kind: "block", reason: "hosted-unverifiable", cause: input.hosted.cause };
  }

  const byVersion = new Map<string, RepositoryMigration>();
  for (const name of input.migrationFiles) {
    const version = migrationVersion(name);
    if (version === null) continue;
    const path = `supabase/migrations/${name}`;
    const current = byVersion.get(version);
    if (!current || path < current.path) byVersion.set(version, { version, path });
  }

  for (const version of input.hosted.appliedVersions) {
    if (!APPLIED_VERSION.test(version)) throw new Error(`Invalid migration version: ${version}`);
  }

  const applied = new Set(input.hosted.appliedVersions);
  const missing = [...byVersion.values()]
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (missing.length > 0) return { kind: "block", reason: "missing-hosted-migrations", missing };

  return { kind: "allow", reason: "hosted-current" };
}
