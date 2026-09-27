import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function testFiles(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await testFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".test.js")) output.push(full);
  }
  return output.sort();
}

const suite = process.argv[2];
const targets = suite ? [`dist/tests/${suite}`] : ["dist/tests/unit", "dist/tests/integration", "dist/tests/contract", "dist/tests/security"];
for (const target of targets) {
  const files = await testFiles(target);
  if (files.length === 0) throw new Error(`No tests found under ${target}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", ...files], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Test suite ${target} failed with exit code ${code}`)));
  });
}
