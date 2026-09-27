import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Task } from "../domain/types.js";
import { nowIso } from "../utils/time.js";

const governance: Record<string, string> = {
  "AGENTS.md": "# Demo agent policy\nOperate only inside the demo workspace.\n",
  "SECURITY.md": "# Demo security\nNo secrets or destructive actions.\n",
  "CONTRIBUTING.md": "# Demo contributing\nUse verification before completion.\n",
  "DEFINITION_OF_DONE.md": "# Demo done\nAll required checks must pass.\n",
  ".github/CODEOWNERS": "* @demo-owner\n",
  ".github/pull_request_template.md": "## Summary\n\n## Checks\n",
  ".github/workflows/ci.yml": "name: Demo CI\non: [pull_request]\n",
};

const packageJson = {
  name: "ade-deterministic-demo",
  version: "1.0.0",
  private: true,
  type: "module",
  scripts: {
    lint: "node verify.mjs lint",
    typecheck: "node verify.mjs typecheck",
    "test:unit": "node verify.mjs unit",
    "test:integration": "node verify.mjs integration",
    test: "node verify.mjs unit",
    build: "node verify.mjs build",
    security: "node verify.mjs security",
  },
};

const verifier = `import { readFile } from "node:fs/promises";
const check = process.argv[2];
if (check === "unit") {
  let value = "";
  try { value = await readFile("demo-output/result.txt", "utf8"); } catch {}
  if (value.trim() !== "PASS") {
    console.error("unit check: expected demo-output/result.txt to contain PASS");
    process.exit(1);
  }
}
console.log(check + " check passed");
`;

export async function prepareDemoWorkspace(baseDir: string): Promise<{ workspace: string; task: Task }> {
  const workspace = join(baseDir, "workspace");
  await mkdir(workspace, { recursive: true });
  for (const [path, content] of Object.entries(governance)) {
    const full = join(workspace, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  await writeFile(join(workspace, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  await writeFile(join(workspace, "verify.mjs"), verifier, "utf8");
  const task: Task = {
    id: `task-demo-${randomUUID()}`,
    title: "Deterministic local retry demo",
    description: "Write a harmless demo result, observe one deterministic unit-test failure, repair it, verify all required checks, and complete.",
    repository: { path: workspace, baseBranch: "main" },
    acceptanceCriteria: [
      { id: "ac-1", description: "demo-output/result.txt contains PASS", required: true },
      { id: "ac-2", description: "all deterministic verification checks pass", required: true },
    ],
    scope: { allowedPaths: ["demo-output/**"], forbiddenPaths: [".env", ".env.*", "**/*.pem", "**/*.key"] },
    labels: ["demo"],
    createdAt: nowIso(),
  };
  return { workspace, task };
}
