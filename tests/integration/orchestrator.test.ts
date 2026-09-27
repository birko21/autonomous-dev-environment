import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareDemoWorkspace } from "../../src/demo/workspace.js";
import { loadConfig } from "../../src/orchestrator/config.js";
import { createRuntime } from "../../src/orchestrator/runtime.js";

async function fixture(maxRetries = 2) {
  const base = await mkdtemp(join(tmpdir(), "ade-test-"));
  const data = join(base, ".ade");
  const { workspace, task } = await prepareDemoWorkspace(base);
  const config = loadConfig({ ADE_MODE: "mock", ADE_DATA_DIR: data, ADE_WORKSPACE: workspace, ADE_MAX_RETRIES: String(maxRetries) }, workspace);
  return { base, data, workspace, task, config };
}

void test("local vertical slice classifies, dispatches, executes, retries failed verification and completes", async () => {
  const f = await fixture(2);
  const runtime = createRuntime(f.config);
  const result = await runtime.orchestrator.start(f.task, f.workspace);
  assert.equal(result.state, "COMPLETED");
  assert.equal(result.completed, true);
  assert.equal(result.requiredChecksPassed, true);
  const run = await runtime.store.loadRun(result.runId);
  assert.equal(run.attempt, 1);
  assert.deepEqual(result.summary.changedFiles, ["demo-output/result.txt"]);
  const evidence = await runtime.store.readEvidence(result.runId);
  assert.ok(evidence.some((entry) => entry.kind === "RETRY"));
  assert.ok(evidence.some((entry) => entry.kind === "VERIFICATION"));
  assert.ok(evidence.some((entry) => entry.kind === "POLICY"));
});

void test("persisted approval state resumes in a fresh runtime after interruption", async () => {
  const f = await fixture(2);
  f.task.description += " This intentionally represents an authentication change requiring human approval.";
  const firstRuntime = createRuntime(f.config);
  const paused = await firstRuntime.orchestrator.start(f.task, f.workspace);
  assert.equal(paused.state, "AWAITING_APPROVAL");
  const persisted = await firstRuntime.store.loadRun(paused.runId);
  assert.equal(persisted.pendingApproval?.type, "RISK_GATE");

  const restartedRuntime = createRuntime(f.config);
  const resumed = await restartedRuntime.orchestrator.approve(paused.runId, "Test approval after restart");
  assert.equal(resumed.state, "COMPLETED");
  assert.equal(resumed.completed, true);
});

void test("failed required verification can never produce COMPLETED", async () => {
  const f = await fixture(0);
  const runtime = createRuntime(f.config);
  const result = await runtime.orchestrator.start(f.task, f.workspace);
  assert.equal(result.completed, false);
  assert.equal(result.state, "ESCALATED");
  assert.equal(result.requiredChecksPassed, false);
  const run = await runtime.store.loadRun(result.runId);
  assert.equal(run.pendingApproval?.type, "ESCALATION");
});
