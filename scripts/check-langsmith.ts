import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";
import { agentTraceMetadata, enableLangSmithTracing } from "../src/lib/agent/policy";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (!enableLangSmithTracing()) throw new Error("LANGSMITH_API_KEY is required.");
  if (process.env.LANGSMITH_PROJECT !== "lifting-app-dev") throw new Error("Routing check requires LANGSMITH_PROJECT=lifting-app-dev.");
  if (process.env.LANGSMITH_TRACING !== "true") throw new Error("Routing check requires LANGSMITH_TRACING=true.");
  const client = new Client();
  const project = await client.readProject({ projectName: process.env.LANGSMITH_PROJECT });
  const id = randomUUID();
  const check = traceable(async () => ({ ok: true, modelCalls: 0, databaseReads: 0 }), {
    id, name: "lifting-app-routing-check", run_type: "chain", client,
    metadata: { ...agentTraceMetadata(), source: "routing-check", synthetic: true,
      codeSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() },
  });
  await check();
  await client.awaitPendingTraceBatches();
  // New traces can take a few seconds to become queryable after ingestion.
  let run;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { run = await client.runs.retrieve(id, { project_id: project.id, selects: ["ID", "PROJECT_ID", "OUTPUTS", "EXTRA", "METADATA"] }); break; }
    catch (error) {
      if ((error as { status?: number }).status !== 404 || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  if (!run || run.project_id !== project.id || run.outputs?.modelCalls !== 0) throw new Error("Synthetic trace routing verification failed.");
  console.log(JSON.stringify({ project: project.name, projectId: project.id, traceId: id,
    url: (await client.runs.getURL(id, { project_id: project.id, trace_id: id })).url, metadata: run.extra?.metadata, modelCalls: 0 }, null, 2));
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
