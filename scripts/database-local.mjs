import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { prerequisite } from "./verification-plan.mjs";

const blocked = prerequisite("database", process.env);
if (blocked) throw Error(blocked);
const files = readdirSync("supabase/tests").filter(name => name.endsWith("_rls.sql")).map(name => `supabase/tests/${name}`);
// Invoke directly so npm's command echo never prints the database credential.
const result = spawnSync("npx", ["--no-install", "supabase", "test", "db", "--db-url", process.env.COACH_TEST_DATABASE_URL, ...files], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
