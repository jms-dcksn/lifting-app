import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
async function boundaryErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(message => message.ruleId === "architecture/boundaries");
}
describe("architectural lint enforcement", () => {
  it.each([
    ["src/lib/strength/probe.ts", "import { cookies } from 'next/headers';"],
    ["src/lib/strength/probe.ts", "export * from '../supabase/server';"],
    ["src/lib/strength/probe.ts", "const x = import('@supabase/supabase-js');"],
    ["src/lib/agent/tools/probe.ts", "import { sessionTarget } from '../../strength/progression';"],
    ["src/app/probe.ts", "import * as targets from '@/lib/strength/progression';"],
    ["src/app/probe.ts", "export { resolveEffectiveWorkoutTarget } from '@/lib/effective-workout-target';"],
    ["src/lib/probe.ts", "import { run } from './agent/evals/live-experiment';"],
    ["src/components/probe.tsx", "const key = process.env.SUPABASE_SECRET_KEY;"],
    ["src/lib/probe.ts", "const { SUPABASE_SERVICE_ROLE_KEY: key } = process.env;"],
  ])("rejects prohibited dependency in %s", async (file, code) => {
    expect(await boundaryErrors(code, file)).not.toHaveLength(0);
  });
  it.each([
    ["src/lib/strength/probe.ts", "import { computeE1rm } from './e1rm';"],
    ["src/app/probe.ts", "import { startingWeight, type SessionTarget } from '@/lib/strength/progression';"],
    ["src/lib/agent/tools/probe.ts", "import { resolveExactWorkoutTarget } from '@/lib/effective-workout-target';"],
    ["src/lib/agent/evals/probe.ts", "const key = process.env.SUPABASE_SECRET_KEY;"],
    ["src/lib/strength/probe.test.ts", "import { vi } from 'vitest';"],
  ])("allows supported composition in %s", async (file, code) => {
    expect(await boundaryErrors(code, file)).toHaveLength(0);
  });
});
