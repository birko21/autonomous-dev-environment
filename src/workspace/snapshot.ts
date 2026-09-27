import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { relative, join, resolve } from "node:path";
import type { RepositorySnapshot } from "../domain/types.js";

const execFileAsync = promisify(execFile);
const GOVERNANCE_FILES = [
  "AGENTS.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "DEFINITION_OF_DONE.md",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  ".github/workflows/ci.yml",
];

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".ade", ".ade-demo"]);

async function collectFiles(root: string, current = root, limit = 800): Promise<string[]> {
  const output: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (output.length >= limit) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (output.length >= limit) return;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) output.push(relative(root, absolute).replaceAll("\\", "/"));
    }
  }
  try {
    await walk(current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return output.sort();
}

async function tryGit(root: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-C", root, ...args], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch {
    return undefined;
  }
}

export async function collectRepositorySnapshot(root: string): Promise<RepositorySnapshot> {
  const governance: Record<string, string> = {};
  for (const file of GOVERNANCE_FILES) {
    try {
      const absolute = join(root, file);
      const info = await stat(absolute);
      if (info.size <= 32_000) governance[file] = await readFile(absolute, "utf8");
    } catch {
      // Missing governance files are reported by deterministic verification.
    }
  }

  const gitRoot = await tryGit(root, ["rev-parse", "--show-toplevel"]);
  const requestedRoot = resolve(root);
  const gitAvailable = gitRoot !== undefined && (process.platform === "win32" ? resolve(gitRoot).toLowerCase() === requestedRoot.toLowerCase() : resolve(gitRoot) === requestedRoot);
  const branch = gitAvailable ? await tryGit(root, ["branch", "--show-current"]) : undefined;
  const headSha = gitAvailable ? await tryGit(root, ["rev-parse", "HEAD"]) : undefined;
  const status = gitAvailable ? await tryGit(root, ["status", "--short"]) : undefined;

  return {
    root,
    gitAvailable,
    ...(branch === undefined || branch === "" ? {} : { branch }),
    ...(headSha === undefined ? {} : { headSha }),
    ...(status === undefined ? {} : { status }),
    files: await collectFiles(root),
    governance,
  };
}
