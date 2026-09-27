import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../src/orchestrator/config.js";
import { assessReadiness } from "../../src/orchestrator/readiness.js";

void test("readiness reports mock mode as usable without credentials", async () => {
  const report = await assessReadiness(loadConfig({ ADE_MODE: "mock" }, "C:/workspace"));
  assert.equal(report.ready, true);
  assert.equal(report.checks.find((entry) => entry.id === "runtime-mode")?.status, "WARN");
});

void test("readiness blocks incomplete live configuration without exposing secrets", async () => {
  const report = await assessReadiness(loadConfig({ ADE_MODE: "live", OPENAI_API_KEY: "secret-value", OPENAI_MODEL: "test-model" }, "C:/workspace"));
  assert.equal(report.ready, false);
  assert.match(report.checks.find((entry) => entry.id === "openai-credential")?.message ?? "", /supplied/iu);
  assert.doesNotMatch(JSON.stringify(report), /secret-value/u);
  assert.equal(report.checks.find((entry) => entry.id === "typesafe-credential")?.status, "BLOCKED");
});
