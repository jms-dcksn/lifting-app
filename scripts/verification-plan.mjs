export const profiles = ["base", "database", "browser", "agent", "live"];
export function verificationPlan(args) {
  const selected = args.length ? args.map(arg => arg.replace(/^--/, "")) : ["base"];
  for (const name of selected) if (!profiles.includes(name)) throw Error(`Unknown verification profile: ${name}. Choose ${profiles.join(", ")}.`);
  const commands = [];
  if (selected.includes("base")) commands.push(["typecheck"], ["lint"], ["typecheck:indexed"], ["test"], ["build"]);
  if (selected.includes("database")) commands.push(["test:db"], ["test:db:concurrency"]);
  if (selected.includes("browser")) commands.push(["test:browser"]);
  if (selected.includes("agent")) commands.push(["test:agent"]);
  if (selected.includes("live")) commands.push(["eval:agent"]);
  return commands.map(([script]) => ({ script, profile: script.startsWith("test:db") ? "database"
    : script === "test:browser" ? "browser" : script === "test:agent" ? "agent" : script === "eval:agent" ? "live" : "base" }));
}

export function prerequisite(profile, env) {
  if (profile === "database") {
    if (!env.COACH_TEST_DATABASE_URL) return "Set COACH_TEST_DATABASE_URL to the disposable local database.";
    if (!isLoopback(env.COACH_TEST_DATABASE_URL)) return "Database verification requires a loopback database URL.";
  }
  if (profile === "browser") {
    if (env.E2E_DISPOSABLE !== "1" || !env.E2E_DATABASE_URL || !env.E2E_SUPABASE_URL || !env.E2E_SUPABASE_KEY) {
      return "Set E2E_DISPOSABLE=1 and E2E_DATABASE_URL, E2E_SUPABASE_URL, E2E_SUPABASE_KEY for the disposable local stack.";
    }
    if (![env.E2E_DATABASE_URL, env.E2E_SUPABASE_URL, env.E2E_BASE_URL ?? "http://127.0.0.1:3100"].every(isLoopback)) {
      return "Browser verification permits loopback app, database and Supabase URLs only.";
    }
  }
  if (profile === "live" && ["LANGSMITH_API_KEY", "AI_GATEWAY_API_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "JEV_API_KEY"].some(name => !env[name])) {
    return "Live eval credentials are missing. Live model calls are opt-in and may incur charges.";
  }
  return null;
}
export function isLoopback(value) {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname); } catch { return false; }
}
