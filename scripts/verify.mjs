import { spawnSync } from "node:child_process";
import { verificationPlan, prerequisite, profiles } from "./verification-plan.mjs";

let plan;
try { plan = verificationPlan(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exit(1); }
const results = [];
for (const { script, profile } of plan) {
  const missing = prerequisite(profile, process.env);
  if (missing) { results.push({ script, status: "BLOCKED", detail: missing }); continue; }
  console.log(`\nChecking ${script}`);
  const env = { ...process.env };
  // Base verification builds locally even without an ignored environment file.
  if (profile === "base") {
    env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= "ci-placeholder-publishable-key";
  }
  const result = script === "test:db"
    ? spawnSync(process.execPath, ["scripts/database-local.mjs"], { stdio: "inherit", env })
    : spawnSync("npm", ["run", script], { stdio: "inherit", env });
  results.push({ script, status: result.status === 0 ? "PASS" : "FAIL", detail: result.error?.message ?? "" });
  if (result.status !== 0) break;
}
console.log("\nVerification results");
for (const result of results) console.log(`${result.status}: ${result.script}${result.detail ? ` — ${result.detail}` : ""}`);
for (const profile of profiles.filter(name => !plan.some(step => step.profile === name))) console.log(`SKIP: ${profile} (not selected)`);
for (const step of plan.filter(step => !results.some(result => result.script === step.script))) console.log(`SKIP: ${step.script} (earlier failure)`);
process.exitCode = results.some(result => result.status !== "PASS") ? 1 : 0;
