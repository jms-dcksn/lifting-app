import { defineConfig } from "@playwright/test";
import { prerequisite } from "./scripts/verification-plan.mjs";

const blocked = prerequisite("browser", process.env);
if (blocked) throw new Error(blocked);
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const port = Number(new URL(baseURL).port || 80);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose an unprivileged local E2E_BASE_URL port.");

export default defineConfig({
  testDir: "./e2e", workers: 1, retries: 0, timeout: 90_000,
  expect: { timeout: 15_000 },
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
    },
  },
});
