import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

const requiredJobs = ["Lint, typecheck, test, build", "Database RLS tests"];
const browserStep = "Verify authenticated phone journeys";

export function selectRun(runs, prNumber, sha) {
  return runs.filter(run => run.event === "pull_request" && run.head_sha === sha &&
    run.pull_requests?.some(pr => pr.number === prNumber))
    .sort((a, b) => b.id - a.id)[0];
}

export function assessVerification(run, jobs) {
  if (!run) return { status: "PENDING", detail: "Waiting for the PR's CI workflow to appear." };
  if (run.status !== "completed") return { status: "PENDING", detail: `CI is ${run.status}.` };
  if (run.conclusion !== "success") return { status: "FAIL", detail: `CI concluded ${run.conclusion}.` };
  for (const name of requiredJobs) {
    const job = jobs.find(job => job.name === name);
    if (!job) return { status: "BLOCKED", detail: `Missing required job: ${name}.` };
    if (job.status !== "completed" || job.conclusion !== "success") {
      return { status: "FAIL", detail: `${name}: ${job.conclusion ?? job.status}.` };
    }
  }
  const browser = jobs.find(job => job.name === "Database RLS tests").steps?.find(step => step.name === browserStep);
  if (!browser) return { status: "BLOCKED", detail: `Missing execution evidence: ${browserStep}.` };
  if (browser.status !== "completed" || browser.conclusion !== "success") {
    return { status: "FAIL", detail: `Browser verification: ${browser.conclusion ?? browser.status}.` };
  }
  return { status: "PASS", detail: "Base, database and authenticated browser verification passed." };
}

function command(program, args) {
  return execFileSync(program, args, { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function api(path) { return JSON.parse(command("gh", ["api", path])); }

export async function verifyPullRequest(args) {
  const [number, ...options] = args;
  if (!/^[1-9]\d*$/.test(number ?? "")) throw Error("Usage: npm run verify:pr -- <PR number> [--once] [--timeout <seconds>]");
  let once = false, timeout = 1200;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === "--once") once = true;
    else if (options[i] === "--timeout" && /^\d+$/.test(options[i + 1] ?? "")) timeout = Number(options[++i]);
    else throw Error(`Unknown option: ${options[i]}`);
  }
  if (timeout < 1 || timeout > 3600) throw Error("Timeout must be 1–3600 seconds.");
  const repo = JSON.parse(command("gh", ["repo", "view", "--json", "nameWithOwner"])).nameWithOwner;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw Error("Could not resolve this checkout's GitHub repository.");
  const sha = command("git", ["rev-parse", "HEAD"]);
  const deadline = Date.now() + timeout * 1000;
  while (true) {
    const pr = api(`repos/${repo}/pulls/${number}`);
    if (pr.head?.sha !== sha) throw Error("PR head differs from local HEAD. Check out the published PR head, then rerun verify:pr.");
    const response = api(`repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${sha}&per_page=100`);
    const run = selectRun(response.workflow_runs ?? [], Number(number), sha);
    let jobs = [];
    if (run?.status === "completed" && run.conclusion === "success") {
      const pages = JSON.parse(command("gh", ["api", "--paginate", "--slurp", `repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`]));
      jobs = pages.flatMap(page => page.jobs ?? []);
    }
    // A push during the API reads invalidates this checkout's evidence.
    if (api(`repos/${repo}/pulls/${number}`).head?.sha !== sha) throw Error("PR head changed while checking. Fetch the new head and rerun verify:pr.");
    const result = assessVerification(run, jobs);
    const evidence = { ...result, repository: repo, pr: Number(number), head: sha, runUrl: run?.html_url ?? null };
    console.log(JSON.stringify(evidence));
    if (result.status === "PASS") return 0;
    if (result.status !== "PENDING") return 1;
    if (once || Date.now() >= deadline) {
      console.log(JSON.stringify({ ...evidence, status: "BLOCKED", detail: "CI is not complete. Inspect the PR Actions tab and rerun verify:pr; do not report verification as passed." }));
      return 1;
    }
    await setTimeout(Math.min(15_000, Math.max(0, deadline - Date.now())));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await verifyPullRequest(process.argv.slice(2)); }
  catch (error) {
    console.error(`BLOCKED: ${error.message}\nIf gh authentication or API access is unavailable, use the connected GitHub tools per docs/VERIFICATION.md#published-pr-verification.`);
    process.exitCode = 1;
  }
}
