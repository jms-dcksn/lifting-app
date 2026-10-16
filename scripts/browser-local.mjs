import { execFileSync, spawnSync } from "node:child_process";

// Read only the local CLI's generated public connection fields; never print keys.
const output = execFileSync("npx", ["--no-install", "supabase", "status", "--output", "env"], { encoding: "utf8" });
const values = Object.fromEntries(output.split("\n").flatMap(line => {
  const match = line.match(/^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=(".*")$/);
  return match ? [[match[1], JSON.parse(match[2])]] : [];
}));
const result = spawnSync("npm", ["run", "verify", "--", "browser"], {
  stdio: "inherit", env: { ...process.env, E2E_DISPOSABLE: "1",
    E2E_DATABASE_URL: process.env.COACH_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    E2E_SUPABASE_URL: values.API_URL ?? "", E2E_SUPABASE_KEY: values.ANON_KEY ?? values.PUBLISHABLE_KEY ?? "" },
});
process.exitCode = result.status ?? 1;
