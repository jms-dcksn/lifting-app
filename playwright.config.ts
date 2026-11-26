import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { prerequisite } from "./scripts/verification-plan.mjs";

const blocked = prerequisite("browser", process.env);
if (blocked) throw new Error(blocked);
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const port = Number(new URL(baseURL).port || 80);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose an unprivileged local E2E_BASE_URL port.");
const coachRuntime = new URL(process.env.E2E_DATABASE_URL!);
coachRuntime.username = "coach_agent_runtime";
// Per-run password for the disposable login role; workers inherit it from the runner.
process.env.E2E_COACH_RUNTIME_PASSWORD ??= randomBytes(16).toString("hex");
coachRuntime.password = process.env.E2E_COACH_RUNTIME_PASSWORD;
// Release directory for the stub's held replies, shared by the app server and the tests.
process.env.E2E_COACH_STREAM_GATE ??= mkdtempSync(join(tmpdir(), "coach-stream-"));
// `legacy` runs only the Coach chat journeys against the default (legacy) runtime.
const legacy = process.env.E2E_COACH_RUNTIME === "legacy";

export default defineConfig({
  testDir: "./e2e", workers: 1, retries: 0, timeout: 90_000,
  expect: { timeout: 15_000 },
  grep: legacy ? /@coach-chat/ : undefined,
  reporter: [["list"]],
  use: { baseURL, viewport: { width: 390, height: 844 }, trace: "retain-on-failure",
    launchOptions: process.env.E2E_CHROMIUM_EXECUTABLE ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } : {} },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`, reuseExistingServer: false, timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_KEY!,
      COACH_INBOX_ENABLED: "true", COACH_COMMAND_SIGNING_KEY_ID: "browser-verification",
      COACH_COMMAND_SIGNING_KEY: "22".repeat(32),
      ...(legacy ? { COACH_RUNTIME_ENABLED: "0" } : { COACH_RUNTIME_ENABLED: "1", COACH_RUNTIME_DATABASE_URL: coachRuntime.href }),
      E2E_COACH_STREAM_GATE: process.env.E2E_COACH_STREAM_GATE,
      AI_GATEWAY_API_KEY: "browser-coach-fixture",
      LANGSMITH_TRACING: "false",
      LANGSMITH_API_KEY: "",
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import=./e2e/coach-gateway-stub.mjs"].filter(Boolean).join(" "),
    },
  },
});
