import { isAbsolute, relative, resolve, sep } from "node:path";
import type { PolicyDecision, ToolRequest } from "../domain/types.js";
import { nowIso } from "../utils/time.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolPolicyContext } from "./types.js";
import type { PolicyProfile } from "./profile.js";

const GOVERNANCE_FILES = new Set([
  "AGENTS.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "DEFINITION_OF_DONE.md",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  ".github/workflows/ci.yml",
]);

const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|\.ssh|credentials?|secrets?)(\/|$)|\.(?:pem|key|p12|pfx)$/iu;
const INFRA_PATH = /(^|\/)(terraform|infra(?:structure)?|k8s|kubernetes|helm)(\/|$)/iu;
const SAFE_NPM_SCRIPTS = new Set(["lint", "typecheck", "test", "test:unit", "test:integration", "build", "security", "demo"]);

function normalize(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function pathMatches(pattern: string, path: string): boolean {
  const normalizedPattern = normalize(pattern);
  const normalizedPath = normalize(path);
  if (normalizedPattern === "**") return true;
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  const regex = new RegExp(`^${escaped.replaceAll("**", ".*").replaceAll("*", "[^/]*")}$`, "u");
  return regex.test(normalizedPath);
}

function requestedPath(request: ToolRequest): string | undefined {
  const value = request.arguments.path;
  return typeof value === "string" ? normalize(value) : undefined;
}

function pathEscapesWorkspace(workspace: string, path: string): boolean {
  const resolved = resolve(workspace, path);
  const rel = relative(workspace, resolved);
  return isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`);
}

function isSafeRunCommand(executable: string, args: string[], workspace: string, profile: PolicyProfile): boolean {
  const normalizedExecutable = executable.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase();
  if (normalizedExecutable === "npm" || normalizedExecutable === "npm.cmd") {
    return args.length === 2 && args[0] === "run" && typeof args[1] === "string" && profile.allowedNpmScripts.includes(args[1]);
  }
  if (normalizedExecutable === "node" || normalizedExecutable === "node.exe") {
    return args.length >= 1 && args.every((arg, index) => index === 0 ? !arg.startsWith("-") && !pathEscapesWorkspace(workspace, arg) : !arg.startsWith("-"));
  }
  if (normalizedExecutable === "git" || normalizedExecutable === "git.exe") {
    const [subcommand, ...subcommandArgs] = args;
    const allowedArgs: Record<string, readonly string[]> = {
      status: ["--short", "--porcelain", "--porcelain=v1", "-uall"],
      diff: ["--check", "--stat", "--name-only"],
      log: [],
      "rev-parse": ["--show-toplevel", "--is-inside-work-tree", "HEAD"],
      branch: ["--show-current"],
      "ls-files": ["--cached", "--others", "--exclude-standard"],
    };
    return typeof subcommand === "string" && Object.hasOwn(allowedArgs, subcommand) && subcommandArgs.every((arg) => allowedArgs[subcommand]?.includes(arg));
  }
  return false;
}

export class ToolPolicyEngine {
  constructor(private readonly registry: ToolRegistry, private readonly profile: PolicyProfile = { name: "built-in-restrictive", allowedNpmScripts: [...SAFE_NPM_SCRIPTS], additionalForbiddenPaths: [] }) {}

  evaluate(request: ToolRequest, context: ToolPolicyContext): PolicyDecision {
    const tool = this.registry.get(request.name);
    const reasons: string[] = [];
    if (!tool) return this.decision(request, "DENY", ["Tool is not registered."]);

    const path = requestedPath(request);
    if (path !== undefined) {
      if (pathEscapesWorkspace(context.workspace, path)) return this.decision(request, "DENY", ["Requested path escapes the workspace."]);
      if (SECRET_PATH.test(path)) return this.decision(request, "DENY", ["Secret and credential paths are never exposed to autonomous tools."]);
      if ([...context.run.task.scope.forbiddenPaths, ...this.profile.additionalForbiddenPaths].some((pattern) => pathMatches(pattern, path))) {
        return this.decision(request, "DENY", ["Requested path is explicitly forbidden by task scope."]);
      }
      const taskAllows = context.run.task.scope.allowedPaths.some((pattern) => pathMatches(pattern, path));
      const toolAllows = tool.descriptor.permittedPaths.some((pattern) => pathMatches(pattern, path));
      if (!taskAllows || !toolAllows) return this.decision(request, "DENY", ["Requested path is outside the permitted task/tool scope."]);
      if (GOVERNANCE_FILES.has(path) && tool.descriptor.classification !== "READ" && !context.approved) reasons.push("Governance-file modification requires human approval.");
      if (INFRA_PATH.test(path) && tool.descriptor.classification !== "READ" && !context.approved) reasons.push("Infrastructure-related write requires human approval.");
    }

    if (request.name === "run_command") {
      const executable = request.arguments.executable;
      const args = request.arguments.args;
      if (typeof executable !== "string" || !Array.isArray(args) || !args.every((value) => typeof value === "string")) {
        return this.decision(request, "DENY", ["Command requests require a string executable and string argument array."]);
      }
      if (!isSafeRunCommand(executable, args, context.workspace, this.profile)) return this.decision(request, "DENY", ["Command is outside the autonomous non-shell command allowlist."]);
    }

    if ((tool.descriptor.approvalRequired || tool.descriptor.classification === "DESTRUCTIVE") && !context.approved) reasons.push("Tool classification requires human approval.");
    if (context.run.classification?.risk === "HIGH" && !context.run.riskApproved && tool.descriptor.classification !== "READ" && !context.approved) reasons.push("High-risk write requires human approval.");

    return reasons.length > 0 ? this.decision(request, "REQUIRE_APPROVAL", reasons) : this.decision(request, "ALLOW", ["Deterministic least-privilege policy allows this request."]);
  }

  private decision(request: ToolRequest, outcome: PolicyDecision["outcome"], reasons: string[]): PolicyDecision {
    return { requestId: request.id, outcome, reasons, decidedAt: nowIso() };
  }
}
