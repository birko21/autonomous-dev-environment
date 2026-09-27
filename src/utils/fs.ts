import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export function safeResolve(root: string, relativePath: string): string {
  if (relativePath.includes("\0")) throw new Error("Path contains a null byte");
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, relativePath);
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${sep}`)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return candidate;
}

/**
 * Resolve a tool path lexically and verify its nearest existing ancestor stays
 * inside the real workspace. This prevents symlink/junction escapes for both
 * existing files and new files below an existing link.
 */
export async function safeResolveExistingOrParent(root: string, relativePath: string): Promise<string> {
  const candidate = safeResolve(root, relativePath);
  const rootReal = await realpath(resolve(root));
  let probe = candidate;
  while (true) {
    try {
      const actual = await realpath(probe);
      const rel = relative(rootReal, actual);
      if (isOutside(rel)) throw new Error(`Path resolves outside workspace: ${relativePath}`);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(probe);
      if (parent === probe) throw error;
      probe = parent;
    }
  }
}

function isOutside(relativePath: string): boolean {
  return relativePath !== "" && (relativePath === ".." || relativePath.startsWith(`..${sep}`) || resolve(relativePath) === relativePath);
}
