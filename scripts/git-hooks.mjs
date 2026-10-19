import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const env = { ...process.env, EVAL_LIVE: "0" };
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

const mode = process.argv[2];
if (mode === "commit") {
  // Export the index without stashing or changing the collaborator's working files.
  const snapshot = mkdtempSync(join(tmpdir(), "lifting-commit-"));
  let status = 1;
  try {
    status = run("git", ["checkout-index", "--all", `--prefix=${snapshot}/`]);
    if (status === 0) {
      if (!existsSync(join(root, "node_modules"))) throw Error("Run npm ci before committing.");
      if (!readFileSync(join(snapshot, "package-lock.json")).equals(readFileSync(join(root, "package-lock.json")))) {
        throw Error("Stage the dependency lockfile completely and run npm ci before committing.");
      }
      symlinkSync(join(root, "node_modules"), join(snapshot, "node_modules"), "junction");
      for (const script of ["lint", "typecheck:indexed", "test:hooks", "test"]) {
        console.log(`Checking staged snapshot: ${script}`);
        status = run("npm", ["run", script], snapshot);
        if (status !== 0) break;
      }
    }
  } catch (error) {
    console.error(error.message);
    status = 1;
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
  process.exitCode = status;
} else if (mode === "push") {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const refs = (process.stdin.isTTY ? "" : readFileSync(0, "utf8")).trim().split("\n").filter(Boolean);
  const otherCommit = refs.some(line => {
    const sha = line.split(/\s+/)[1];
    return !/^0+$/.test(sha) && sha !== head.stdout.trim();
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root });
  if (head.status !== 0 || untracked.status !== 0) {
    console.error("Unable to inspect the checkout before push.");
    process.exitCode = 1;
  } else if (otherCommit) {
    console.error("Check out the commit being pushed before running full verification.");
    process.exitCode = 1;
  } else if (untracked.stdout.length || run("git", ["diff", "--quiet", "HEAD", "--"]) !== 0) {
    console.error("Commit or stash tracked changes before pushing so verification checks HEAD.");
    process.exitCode = 1;
  } else if ([".next/dev/lock", ".next/lock"].some(path => existsSync(join(root, path)))) {
    console.error("Stop the Next dev server/build before pushing; verification regenerates route types.");
    process.exitCode = 1;
  } else {
    process.exitCode = run("npm", ["run", "verify"]);
  }
} else {
  console.error("Usage: node scripts/git-hooks.mjs commit|push");
  process.exitCode = 1;
}
