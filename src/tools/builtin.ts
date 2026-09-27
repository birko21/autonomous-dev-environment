import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeResolveExistingOrParent } from "../utils/fs.js";
import type { RegisteredTool, ToolExecutionContext, ToolResult } from "./types.js";
import type { ToolRequest } from "../domain/types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 64_000;

function commandForPlatform(executable: string, args: string[]): [string, string[]] {
  if (process.platform === "win32" && (executable === "npm" || executable === "npm.cmd")) {
    const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    return [process.execPath, [npmCli, ...args]];
  }
  return [executable, args];
}

function stringArg(request: ToolRequest, name: string): string {
  const value = request.arguments[name];
  if (typeof value !== "string") throw new Error(`${request.name}.${name} must be a string`);
  return value;
}

function truncate(value: string): string {
  return value.length <= MAX_OUTPUT ? value : `${value.slice(0, MAX_OUTPUT)}\n...[truncated]`;
}

async function backupIfPresent(path: string, context: ToolExecutionContext): Promise<string | undefined> {
  try {
    const content = await readFile(path);
    const relativePath = path.slice(context.workspace.length).replace(/^[/\\]+/u, "");
    const backup = join(context.workspace, ".ade-recovery", context.run.id, relativePath);
    await mkdir(dirname(backup), { recursive: true });
    await writeFile(backup, content);
    return backup;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export const readFileTool: RegisteredTool = {
  descriptor: {
    name: "read_file",
    purpose: "Read a UTF-8 file inside the scoped workspace.",
    classification: "READ",
    permittedPaths: ["**"],
    networkRequired: false,
    timeoutMs: 10_000,
    approvalRequired: false,
    recovery: "No rollback required; read only.",
  },
  async execute(request, context): Promise<ToolResult> {
    const path = await safeResolveExistingOrParent(context.workspace, stringArg(request, "path"));
    const content = truncate(await readFile(path, "utf8"));
    return { ok: true, summary: `Read ${stringArg(request, "path")}.`, data: { content } };
  },
};

export const writeFileTool: RegisteredTool = {
  descriptor: {
    name: "write_file",
    purpose: "Write a UTF-8 file inside the scoped workspace.",
    classification: "WRITE",
    permittedPaths: ["**"],
    networkRequired: false,
    timeoutMs: 10_000,
    approvalRequired: false,
    recovery: "Prior content is copied under .ade-recovery/<run-id>/ before replacement.",
  },
  async execute(request, context): Promise<ToolResult> {
    const relativePath = stringArg(request, "path");
    const content = stringArg(request, "content");
    const path = await safeResolveExistingOrParent(context.workspace, relativePath);
    const backup = await backupIfPresent(path, context);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.ade-tmp-${process.pid}`;
    await writeFile(temp, content, "utf8");
    await rename(temp, path);
    return { ok: true, summary: `Wrote ${relativePath}.`, data: { path: relativePath, bytes: Buffer.byteLength(content), ...(backup ? { backup } : {}) } };
  },
};

export const deleteFileTool: RegisteredTool = {
  descriptor: {
    name: "delete_file",
    purpose: "Delete a scoped file only after explicit approval.",
    classification: "DESTRUCTIVE",
    permittedPaths: ["**"],
    networkRequired: false,
    timeoutMs: 10_000,
    approvalRequired: true,
    recovery: "File contents are backed up under .ade-recovery/<run-id>/ before deletion.",
  },
  async execute(request, context): Promise<ToolResult> {
    const relativePath = stringArg(request, "path");
    const path = await safeResolveExistingOrParent(context.workspace, relativePath);
    const backup = await backupIfPresent(path, context);
    await rm(path, { force: false });
    return { ok: true, summary: `Deleted ${relativePath}.`, data: { path: relativePath, ...(backup ? { backup } : {}) } };
  },
};

export const runCommandTool: RegisteredTool = {
  descriptor: {
    name: "run_command",
    purpose: "Run a non-shell, allowlisted local verification/development command.",
    classification: "WRITE",
    permittedPaths: ["**"],
    networkRequired: false,
    timeoutMs: 120_000,
    approvalRequired: false,
    recovery: "Commands are restricted by deterministic policy; source changes remain recoverable through Git.",
  },
  async execute(request, context): Promise<ToolResult> {
    const executable = stringArg(request, "executable");
    const argsRaw = request.arguments.args;
    if (!Array.isArray(argsRaw) || !argsRaw.every((value) => typeof value === "string")) throw new Error("run_command.args must be a string array");
    try {
      const [resolvedExecutable, resolvedArgs] = commandForPlatform(executable, argsRaw);
      const result = await execFileAsync(resolvedExecutable, resolvedArgs, { cwd: context.workspace, timeout: 120_000, maxBuffer: 1_000_000, signal: context.signal });
      return { ok: true, summary: `Command succeeded: ${executable} ${argsRaw.join(" ")}`, data: { exitCode: 0, stdout: truncate(result.stdout), stderr: truncate(result.stderr) } };
    } catch (error) {
      const e = error as Error & { code?: number | string; stdout?: string; stderr?: string };
      return { ok: false, summary: `Command failed: ${executable} ${argsRaw.join(" ")}`, data: { exitCode: typeof e.code === "number" ? e.code : 1, stdout: truncate(e.stdout ?? ""), stderr: truncate(e.stderr ?? e.message) } };
    }
  },
};
