import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules", "dist", "coverage", ".ade", ".ade-demo"]);
const extensions = new Set([".ts", ".mjs", ".json", ".md", ".yml", ".yaml"]);
const failures = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (extensions.has(extname(entry.name)) || ["AGENTS.md", "SECURITY.md", "CONTRIBUTING.md", "DEFINITION_OF_DONE.md"].includes(entry.name)) {
      const text = await readFile(full, "utf8");
      const name = relative(root, full);
      text.split(/\r?\n/u).forEach((line, index) => {
        if (/\s+$/u.test(line)) failures.push(`${name}:${index + 1}: trailing whitespace`);
        if (line.includes("\t")) failures.push(`${name}:${index + 1}: tab character`);
      });
      if (extname(entry.name) === ".json") {
        try { JSON.parse(text); } catch (error) { failures.push(`${name}: invalid JSON: ${error.message}`); }
      }
    }
  }
}
await walk(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Lint checks passed.");
