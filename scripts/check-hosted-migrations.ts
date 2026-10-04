import { readdirSync } from "node:fs";
import {
  decideHostedMigrationGate,
  migrationVersion,
  type GateDecision,
  type HostedMigrationObservation,
} from "../src/lib/migration-gate";

const PUSH_LINE = "Run npx supabase db push from a linked checkout of main, then redeploy.";

function listMigrationFiles(): string[] {
  return readdirSync("supabase/migrations");
}

function requestedVersions(files: readonly string[]): string[] {
  const versions: string[] = [];
  const seen = new Set<string>();
  for (const name of files) {
    const version = migrationVersion(name);
    if (version === null || seen.has(version)) continue;
    seen.add(version);
    versions.push(version);
  }
  return versions;
}

function report(decision: GateDecision): never {
  if (decision.kind === "allow") {
    console.log(`Hosted migration gate: allow (${decision.reason}).`);
    process.exit(0);
  }
  if (decision.reason === "misnamed") {
    console.log(
      `Misnamed migration files: ${decision.files.join(", ")}. supabase db push skips a file that is not <version>_<name>.sql.`,
    );
    process.exit(1);
  }
  if (decision.reason === "missing-hosted-migrations") {
    for (const migration of decision.missing) console.log(migration.path);
    console.log(PUSH_LINE);
    process.exit(1);
  }
  if (decision.cause === "gate-not-installed") {
    console.log(
      "The hosted project has no deployment_applied_migration_versions, so this gate's migration is not on the live database.",
    );
    console.log(PUSH_LINE);
    process.exit(1);
  }
  console.log(`Hosted migration ledger is unverifiable: ${decision.cause}.`);
  process.exit(1);
}

function isRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null;
}

function isStringArray(body: unknown): body is string[] {
  return Array.isArray(body) && body.every((item) => typeof item === "string");
}

async function observeHosted(files: readonly string[]): Promise<HostedMigrationObservation> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { kind: "unavailable", cause: "production-config-missing" };

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/deployment_applied_migration_versions`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requested_versions: requestedVersions(files) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { kind: "unavailable", cause: "proof-request-failed" };
  }

  if (response.status === 404) return { kind: "unavailable", cause: "gate-not-installed" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      kind: "unavailable",
      cause: response.ok ? "proof-response-invalid" : "proof-request-failed",
    };
  }

  if (isRecord(body) && body.code === "PGRST202") {
    return { kind: "unavailable", cause: "gate-not-installed" };
  }
  if (!response.ok) return { kind: "unavailable", cause: "proof-request-failed" };
  if (!isStringArray(body)) return { kind: "unavailable", cause: "proof-response-invalid" };
  return { kind: "observed", appliedVersions: body };
}

async function main(): Promise<void> {
  const migrationFiles = listMigrationFiles();
  if (process.env.VERCEL_ENV !== "production") {
    report(decideHostedMigrationGate({ deployment: "non-production", migrationFiles }));
  } else {
    report(
      decideHostedMigrationGate({
        deployment: "production",
        migrationFiles,
        hosted: await observeHosted(migrationFiles),
      }),
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
