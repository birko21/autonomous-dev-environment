import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { Task, VerificationResult } from "../domain/types.js";
import { nowIso } from "../utils/time.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 80_000;

function npmInvocation(script: string): [string, string[]] {
  if (process.platform === "win32") {
    const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    return [process.execPath, [npmCli, "run", script]];
  }
  return ["npm", ["run", script]];
}
const GOVERNANCE = ["AGENTS.md", "SECURITY.md", "CONTRIBUTING.md", "DEFINITION_OF_DONE.md", ".github/CODEOWNERS", ".github/pull_request_template.md", ".github/workflows/ci.yml"];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bAIza[0-9A-Za-z_-]{30,}\b/u,
  /\bjv_live_[A-Za-z0-9_-]{12,}\b/u,
];

function truncate(value: string): string {
  return value.length <= MAX_OUTPUT ? value : `${value.slice(0, MAX_OUTPUT)}\n...[truncated]`;
}

function result(check: string, required: boolean, status: VerificationResult["status"], output: string, durationMs: number, command?: string, exitCode?: number): VerificationResult {
  return {
    id: `verify-${randomUUID()}`,
    check,
    required,
    status,
    ...(command !== undefined ? { command } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    output: truncate(output),
    durationMs,
    recordedAt: nowIso(),
  };
}

async function commandCheck(workspace: string, check: string, command: string, args: string[], timeoutMs: number): Promise<VerificationResult> {
  const started = Date.now();
  const rendered = `${command} ${args.join(" ")}`.trim();
  try {
    const response = await execFileAsync(command, args, { cwd: workspace, timeout: timeoutMs, maxBuffer: 2_000_000 });
    return result(check, true, "PASS", `${response.stdout}${response.stderr}`, Date.now() - started, rendered, 0);
  } catch (error) {
    const e = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return result(check, true, "FAIL", `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ? `\n${e.message}` : ""}`, Date.now() - started, rendered, typeof e.code === "number" ? e.code : 1);
  }
}

async function gitAvailable(workspace: string): Promise<boolean> {
  try {
    const response = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: workspace, timeout: 5_000 });
    const gitRoot = resolve(response.stdout.trim());
    const requestedRoot = resolve(workspace);
    return process.platform === "win32" ? gitRoot.toLowerCase() === requestedRoot.toLowerCase() : gitRoot === requestedRoot;
  } catch {
    return false;
  }
}

function normalize(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function matches(pattern: string, path: string): boolean {
  const p = normalize(pattern);
  const v = normalize(path);
  if (p === "**") return true;
  const escaped = p.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${escaped.replaceAll("**", ".*").replaceAll("*", "[^/]*")}$`, "u").test(v);
}

async function repositoryIntegrity(workspace: string): Promise<VerificationResult> {
  const started = Date.now();
  const missing: string[] = [];
  for (const file of GOVERNANCE) {
    try { await access(resolve(workspace, file)); } catch { missing.push(file); }
  }
  return result("repository-integrity", true, missing.length === 0 ? "PASS" : "FAIL", missing.length === 0 ? "Required governance files are present." : `Missing governance files: ${missing.join(", ")}`, Date.now() - started);
}

async function collectFiles(root: string, dir = root, output: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "coverage", ".ade", ".ade-demo", ".ade-recovery"].includes(entry.name)) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(root, full, output);
    else output.push(normalize(relative(root, full)));
  }
  return output;
}

async function secretScan(workspace: string): Promise<VerificationResult> {
  const started = Date.now();
  const files = await collectFiles(workspace);
  const findings: string[] = [];
  for (const path of files) {
    if (/^\.env(?:\.|$)/u.test(path) && path !== ".env.example") findings.push(`${path}: forbidden environment file`);
    if (/\.(?:pem|key|p12|pfx)$/iu.test(path)) findings.push(`${path}: private-key-like file extension`);
    let content: string;
    try { content = await readFile(resolve(workspace, path), "utf8"); } catch { continue; }
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) findings.push(`${path}: credential/private-key material pattern`);
  }
  return result("secret-private-key-detection", true, findings.length === 0 ? "PASS" : "FAIL", findings.length === 0 ? "No forbidden secrets/private-key material detected." : findings.join("\n"), Date.now() - started);
}

async function changedFileScope(workspace: string, task: Task, hasGit: boolean): Promise<VerificationResult> {
  const started = Date.now();
  if (!hasGit) return result("changed-file-scope", false, "SKIP", "No Git worktree is present in this local demo workspace.", Date.now() - started);
  try {
    const response = await execFileAsync("git", ["status", "--porcelain=v1", "-uall"], { cwd: workspace, timeout: 10_000, maxBuffer: 1_000_000 });
    const changed = response.stdout.split(/\r?\n/u).filter(Boolean).map((line) => normalize(line.slice(3).split(" -> ").at(-1) ?? ""));
    const violations = changed.filter((path) => {
      if (path.startsWith(".ade-recovery/")) return false;
      if (task.scope.forbiddenPaths.some((pattern) => matches(pattern, path))) return true;
      return !task.scope.allowedPaths.some((pattern) => matches(pattern, path));
    });
    return result("changed-file-scope", true, violations.length === 0 ? "PASS" : "FAIL", violations.length === 0 ? `Changed files remain in scope (${changed.length} file(s)).` : `Out-of-scope changes: ${violations.join(", ")}`, Date.now() - started, "git status --porcelain=v1 -uall", 0);
  } catch (error) {
    return result("changed-file-scope", true, "FAIL", (error as Error).message, Date.now() - started, "git status --porcelain=v1 -uall", 1);
  }
}

async function gitDiffValidation(workspace: string, hasGit: boolean): Promise<VerificationResult> {
  const started = Date.now();
  if (!hasGit) return result("git-diff-validation", false, "SKIP", "No Git worktree is present in this local demo workspace.", Date.now() - started);
  try {
    const response = await execFileAsync("git", ["diff", "--check"], { cwd: workspace, timeout: 10_000, maxBuffer: 1_000_000 });
    return result("git-diff-validation", true, "PASS", response.stdout || "git diff --check passed.", Date.now() - started, "git diff --check", 0);
  } catch (error) {
    const e = error as Error & { stdout?: string; stderr?: string };
    return result("git-diff-validation", true, "FAIL", `${e.stdout ?? ""}${e.stderr ?? ""}${e.message}`, Date.now() - started, "git diff --check", 1);
  }
}

export class VerificationRunner {
  constructor(private readonly timeoutMs = 180_000) {}

  async run(workspace: string, task: Task): Promise<VerificationResult[]> {
    const hasGit = await gitAvailable(workspace);
    const results: VerificationResult[] = [];
    results.push(await repositoryIntegrity(workspace));
    results.push(await commandCheck(workspace, "formatting-linting", ...npmInvocation("lint"), this.timeoutMs));
    results.push(await commandCheck(workspace, "type-checking", ...npmInvocation("typecheck"), this.timeoutMs));
    results.push(await commandCheck(workspace, "unit-tests", ...npmInvocation("test:unit"), this.timeoutMs));
    results.push(await commandCheck(workspace, "integration-tests", ...npmInvocation("test:integration"), this.timeoutMs));
    results.push(await commandCheck(workspace, "build", ...npmInvocation("build"), this.timeoutMs));
    results.push(await commandCheck(workspace, "security-checks", ...npmInvocation("security"), this.timeoutMs));
    results.push(await changedFileScope(workspace, task, hasGit));
    results.push(await secretScan(workspace));
    results.push(await gitDiffValidation(workspace, hasGit));
    return results;
  }

  requiredPassed(results: VerificationResult[]): boolean {
    return results.every((entry) => !entry.required || entry.status === "PASS");
  }
}
