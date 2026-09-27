import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules", "dist", "coverage", ".ade", ".ade-demo"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bAIza[0-9A-Za-z_-]{30,}\b/u,
  /\bjv_live_[A-Za-z0-9_-]{12,}\b/u,
];
let files = [];
try {
  const response = await execFileAsync("git", ["ls-files"], { cwd: root, timeout: 10_000 });
  files = response.stdout.split(/\r?\n/u).filter(Boolean);
} catch {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && ignored.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(relative(root, full).replaceAll("\\", "/"));
    }
  }
  await walk(root);
}
const failures = [];
for (const path of files) {
  if (/^\.env(?:\.|$)/u.test(path) && path !== ".env.example") failures.push(`${path}: forbidden environment file`);
  if (/\.(?:pem|key|p12|pfx)$/iu.test(path)) failures.push(`${path}: forbidden private-key-like file`);
  let content;
  try { content = await readFile(join(root, path), "utf8"); } catch { continue; }
  if (secretPatterns.some((pattern) => pattern.test(content))) failures.push(`${path}: possible secret/private key material`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Security checks passed; no committed secret/private-key patterns detected.");
