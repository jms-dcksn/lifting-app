import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gradeScenario, loadLocalEnv, syncLiveDataset } from "../src/lib/agent/evals/live-experiment";
import { LIVE_EXAMPLES, LIVE_POLICY_VERSION, type LiveTurnOutput } from "../src/lib/agent/evals/live";

async function main() {
const [command, ...flags] = process.argv.slice(2);
if (flags.includes("--help") || command === "--help") {
  console.log("sync [--adopt] [--apply]: preview by default; adopt existing source ids explicitly.\nregrade --input archive.json --output revised.json: judge stored outputs only; never run Coach or change historical feedback.");
  return;
}
if (command === "sync") {
  if (flags.some((flag) => !["--apply", "--adopt"].includes(flag))) throw new Error("Unknown sync flag; use --help.");
  await syncLiveDataset({ apply: flags.includes("--apply"), adopt: flags.includes("--adopt") });
} else if (command === "regrade") {
  const input = flags[flags.indexOf("--input") + 1], output = flags[flags.indexOf("--output") + 1];
  if (!flags.includes("--input") || !flags.includes("--output") || !input || !output || input === output) {
    throw new Error("Regrade requires distinct --input archived-review.json and --output revised-grades.json paths.");
  }
  if (existsSync(output)) throw new Error("Regrade output already exists; choose a new path.");
  loadLocalEnv();
  const archive = JSON.parse(readFileSync(input, "utf8")) as {
    rows: Array<{ run: { id: string; inputs: { id: string; question: string }; outputs: LiveTurnOutput };
      example: { inputs: { id: string } }; feedback: unknown }> };
  const rows = [];
  for (const row of archive.rows) {
    const example = LIVE_EXAMPLES.find((candidate) => candidate.id === (row.example?.inputs.id ?? row.run.inputs.id));
    if (!example) throw new Error(`No revised-policy reference for run ${row.run.id}`);
    const grades = await gradeScenario({ question: row.run.inputs.question }, { ...row.run.outputs, turns: [row.run.outputs] },
      { reference: example.reference, review: example.review, maxToolCalls: example.maxToolCalls });
    rows.push({ runId: row.run.id, originalFeedback: row.feedback, revisedPolicy: LIVE_POLICY_VERSION, grades });
  }
  writeFileSync(output, JSON.stringify({ policyVersion: LIVE_POLICY_VERSION, rows }, null, 2), { mode: 0o600, flag: "wx" });
} else {
  throw new Error("Use sync [--adopt] [--apply] or regrade --input archive.json --output revised.json.");
}

}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
