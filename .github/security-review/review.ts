import {
  Agent,
  Cursor,
  CursorAgentError,
  IntegrationNotConnectedError,
  type ModelListItem,
  type Run,
  type RunResult,
} from "@cursor/sdk";

const MAX_ATTEMPTS = 4;
const MAX_BACKOFF_MS = 30_000;

let activeRun: Run | undefined;
let cancelling = false;

process.on("SIGTERM", () => {
  void cancelActiveRun("SIGTERM");
});
process.on("SIGINT", () => {
  void cancelActiveRun("SIGINT");
});

type PullRequest = {
  repoUrl: string;
  prUrl: string;
  number: string;
  title: string;
  headRef: string;
  headSha: string;
  baseRef: string;
};

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    logStartupError(error);
    process.exit(1);
  });

async function main(): Promise<number> {
  const pullRequest = readPullRequest();
  const apiKey = requiredEnv("CURSOR_API_KEY");
  const modelId = await withRetry("Cursor.models.list", () => resolveComposerModelId(apiKey));
  console.log(`Resolved Composer 2.5 model id: ${modelId}`);

  await using agent = await withRetry("Agent.create", () =>
    Agent.create({
      apiKey,
      name: `Security review PR #${pullRequest.number}`,
      model: { id: modelId },
      idempotencyKey: idempotencyKey(pullRequest, "create"),
      cloud: {
        repos: [
          {
            url: pullRequest.repoUrl,
            // startingRef keeps the new branch on top of this pull request's head.
            // prUrl would ignore startingRef and base the new branch on the pull request's base.
            startingRef: pullRequest.headRef,
          },
        ],
        autoCreatePR: true,
        workOnCurrentBranch: false,
        metadata: {
          source: "github-actions",
          pr: pullRequest.number,
          sha: pullRequest.headSha,
        },
      },
    }),
  );

  const run = await withRetry("agent.send", () =>
    agent.send(reviewPrompt(pullRequest), {
      idempotencyKey: idempotencyKey(pullRequest, "send"),
    }),
  );
  activeRun = run;
  console.log(`agent ${agent.agentId} run ${run.id}`);

  try {
    for await (const event of run.stream()) {
      if (cancelling) return 130;
      if (event.type === "status") console.log(`[status] ${event.status}`);
      if (event.type === "tool_call") console.log(`[tool] ${event.name}: ${event.status}`);
    }
  } catch (error) {
    if (cancelling) return 130;
    if (!(error instanceof CursorAgentError) || !error.isRetryable) throw error;
    console.error(`Stream interrupted (${error.message}). Waiting for the run result.`);
  }

  if (cancelling) return 130;

  const result = await withRetry("run.wait", () => run.wait());
  return reportResult(result);
}

function readPullRequest(): PullRequest {
  return {
    repoUrl: requiredEnv("REPO_URL"),
    prUrl: requiredEnv("PR_URL"),
    number: requiredEnv("PR_NUMBER"),
    title: process.env.PR_TITLE?.trim() || "(untitled)",
    headRef: requiredEnv("HEAD_REF"),
    headSha: requiredEnv("HEAD_SHA"),
    baseRef: requiredEnv("BASE_REF"),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function idempotencyKey(pr: PullRequest, operation: "create" | "send"): string {
  return `security-review-${operation}-${pr.number}-${pr.headSha}`;
}

async function resolveComposerModelId(key: string): Promise<string> {
  const models = await Cursor.models.list({ apiKey: key });
  const id = selectComposerModel(models);
  const selected = models.find((model) => model.id === id);
  if (selected?.parameters?.length) {
    console.log(
      `Model parameters: ${selected.parameters.map((parameter) => parameter.id).join(", ")}`,
    );
  }
  return id;
}

function selectComposerModel(models: ModelListItem[]): string {
  const exact = models.find((model) => model.id === "composer-2.5");
  if (exact) return exact.id;

  const alias = models.find((model) => model.aliases?.includes("composer-2.5"));
  if (alias) return alias.id;

  const named = models.filter(
    (model) =>
      model.id.startsWith("composer-2.5") || /composer\s*2\.5/i.test(model.displayName),
  );
  const available = models.map((model) => `${model.id} (${model.displayName})`).join(", ");
  if (named.length === 1) return named[0].id;

  throw new Error(
    named.length > 1
      ? `Composer 2.5 matched more than one model (${named.map((model) => model.id).join(", ")}). Available: ${available}`
      : `Composer 2.5 is not available to this API key. Available: ${available}`,
  );
}

function reviewPrompt(pr: PullRequest): string {
  return `You are reviewing pull request #${pr.number} in ${pr.repoUrl}.
Title: ${pr.title}
URL: ${pr.prUrl}
Head: ${pr.headRef} @ ${pr.headSha}
Base: ${pr.baseRef}

Review only this pull request for security vulnerabilities. Read the diff against ${pr.baseRef} and the surrounding code needed to judge each change. Do not review unrelated history. Do not restyle, refactor, or add features.

Treat these as in scope when the diff touches them:
- authentication and session handling
- owner-scoped row level security, and any query that can read another user's data
- the weekly Coach API: it is the only elevated read path, must filter by an explicit user id, and must stay read-only
- server secrets in client bundles, logs, or committed files
- injection, cross-site scripting, open redirects, and server-side request forgery
- GitHub Actions workflows that print or forward secrets

If you do not find a vulnerability that requires a code or workflow change, do not edit files and do not commit. Reply with a short review of what you checked and why you changed nothing.

If a change is required:
- Fix only the vulnerability. Keep the fix small.
- Update the owning doc for the behavior you changed. Use docs/README.md to find that owner. Do not add a new top-level document.
- Leave the commits on the new branch Cursor created from ${pr.headRef}. Do not push to ${pr.headRef}.
- The follow-up pull request must use ${pr.headRef} as its base, so the diff contains only this fix stacked on pull request #${pr.number}. If the opened pull request targets a different base, retarget it to ${pr.headRef}.
- Title the pull request: Security review for #${pr.number}
- Start the pull request body with this exact line:
<!-- security-review-follow-up -->
Then explain each issue: what is vulnerable, why it matters in this app, what you changed, and which doc you updated. Be concise and clear, and complete enough that a reviewer can merge without reading the whole diff first.`;
}

async function cancelActiveRun(signal: string): Promise<void> {
  if (cancelling) return;
  cancelling = true;
  console.error(`Received ${signal}. Cancelling the cloud run.`);
  try {
    if (activeRun?.supports("cancel")) await activeRun.cancel();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(130);
}

function reportResult(result: RunResult): number {
  if (cancelling) return 130;
  const prUrls = result.git?.branches.flatMap((branch) => (branch.prUrl ? [branch.prUrl] : [])) ?? [];
  if (prUrls.length > 0) {
    console.log(`Follow-up pull request: ${prUrls.join(", ")}`);
  }
  if (result.result) console.log(result.result);

  if (result.status === "finished") return 0;

  console.error(`Run ${result.id} ended with status ${result.status}.`);
  if (result.error) {
    console.error(`${result.error.message}${result.error.code ? ` (${result.error.code})` : ""}`);
  }
  return 2;
}

async function withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  let delayMs = 1_000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof CursorAgentError && error.isRetryable;
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;

      const waitMs = retryDelayMs(error, delayMs);
      console.error(
        `${operation} failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${waitMs}ms. ${error.message}`,
      );
      await sleep(waitMs);
      delayMs = Math.min(delayMs * 2, MAX_BACKOFF_MS);
    }
  }
  throw new Error(`${operation} retry loop exited without a result.`);
}

function retryDelayMs(error: CursorAgentError, fallbackMs: number): number {
  const hinted = readRetryAfterMs(error);
  if (hinted === undefined) return fallbackMs + Math.floor(Math.random() * 250);
  return Math.min(Math.max(hinted, 0), MAX_BACKOFF_MS);
}

// The TypeScript SDK exposes isRetryable and not a retry delay. Honor retryAfter
// when a future error includes seconds or an HTTP-date, and cap the wait below.
function readRetryAfterMs(error: CursorAgentError): number | undefined {
  const candidate = (error as CursorAgentError & { retryAfter?: unknown }).retryAfter;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate > 1_000 ? candidate : candidate * 1_000;
  }
  if (typeof candidate === "string") {
    const asNumber = Number(candidate);
    if (Number.isFinite(asNumber)) return asNumber > 1_000 ? asNumber : asNumber * 1_000;
    const asDate = Date.parse(candidate);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  }
  return undefined;
}

function logStartupError(error: unknown): void {
  if (error instanceof IntegrationNotConnectedError) {
    console.error(`GitHub is not connected for this API key (${error.provider}). ${error.helpUrl}`);
    return;
  }
  if (error instanceof CursorAgentError) {
    const helpUrl = "helpUrl" in error && typeof error.helpUrl === "string" ? ` ${error.helpUrl}` : "";
    console.error(
      `Startup failed: ${error.message} retryable=${error.isRetryable} code=${error.code ?? ""} requestId=${error.requestId ?? ""}${helpUrl}`,
    );
    return;
  }
  console.error(error instanceof Error ? error.message : error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
