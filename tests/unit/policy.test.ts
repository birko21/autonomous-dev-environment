import assert from "node:assert/strict";
import test from "node:test";
import type { RunRecord, ToolRequest } from "../../src/domain/types.js";
import { deleteFileTool, readFileTool, runCommandTool, writeFileTool } from "../../src/tools/builtin.js";
import { ToolPolicyEngine } from "../../src/tools/policy.js";
import { ToolRegistry } from "../../src/tools/registry.js";

function run(): RunRecord {
  return {
    schemaVersion: 1,
    id: "run-1",
    revision: 0,
    task: {
      id: "task-1", title: "test", description: "test", repository: { path: "/tmp/repo", baseBranch: "main" },
      acceptanceCriteria: [{ id: "ac", description: "pass", required: true }],
      scope: { allowedPaths: ["src/**", "AGENTS.md"], forbiddenPaths: ["src/forbidden/**"] }, labels: [], createdAt: "2026-09-27T00:00:00.000Z",
    },
    state: "RUNNING", createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", workspace: "/tmp/repo",
    attempt: 0, actionStep: 0, maxRetries: 2, nextToolIndex: 0, executedTools: {}, verificationResults: [], escalations: [], cancelRequested: false, riskApproved: false,
  };
}

function request(name: string, args: Record<string, unknown>): ToolRequest {
  return { id: `req-${name}`, name, purpose: "test", arguments: args, idempotencyKey: `idem-${name}` };
}

const registry = new ToolRegistry();
for (const tool of [readFileTool, writeFileTool, deleteFileTool, runCommandTool]) registry.register(tool);
const policy = new ToolPolicyEngine(registry);

void test("policy allows scoped normal writes", () => {
  assert.equal(policy.evaluate(request("write_file", { path: "src/a.ts", content: "x" }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "ALLOW");
});

void test("policy denies secret and out-of-scope paths", () => {
  assert.equal(policy.evaluate(request("read_file", { path: ".env" }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "DENY");
  assert.equal(policy.evaluate(request("write_file", { path: "README.md", content: "x" }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "DENY");
});

void test("policy requires approval for destructive and governance writes", () => {
  assert.equal(policy.evaluate(request("delete_file", { path: "src/a.ts" }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "REQUIRE_APPROVAL");
  assert.equal(policy.evaluate(request("write_file", { path: "AGENTS.md", content: "x" }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "REQUIRE_APPROVAL");
});

void test("policy denies dangerous commands even when requested by a model", () => {
  assert.equal(policy.evaluate(request("run_command", { executable: "git", args: ["push", "origin", "main"] }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "DENY");
  assert.equal(policy.evaluate(request("run_command", { executable: "node", args: ["-e", "require('child_process').execSync('whoami')"] }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "DENY");
  assert.equal(policy.evaluate(request("run_command", { executable: "python", args: ["-c", "print('arbitrary')"] }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "DENY");
  assert.equal(policy.evaluate(request("run_command", { executable: "git", args: ["status", "--work-tree=C:/outside"] }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "DENY");
});

void test("policy allows only explicit local verification commands", () => {
  assert.equal(policy.evaluate(request("run_command", { executable: "npm", args: ["run", "lint"] }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "ALLOW");
  assert.equal(policy.evaluate(request("run_command", { executable: "git", args: ["status", "--porcelain=v1"] }), { run: run(), workspace: "/tmp/repo", approved: false }).outcome, "ALLOW");
});
