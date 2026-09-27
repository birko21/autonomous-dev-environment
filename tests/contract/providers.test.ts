import assert from "node:assert/strict";
import test from "node:test";
import { JulesProvider } from "../../src/providers/jules.js";
import { DeterministicJevProvider, MockCodexProvider, MockJulesProvider } from "../../src/providers/mock.js";
import { OpenAICodexProvider } from "../../src/providers/openai.js";
import { TypesafeJevProvider } from "../../src/providers/jev.js";
import type { Provider } from "../../src/providers/provider.js";

function assertContract(provider: Provider): void {
  assert.ok(provider.descriptor.id);
  assert.ok(provider.descriptor.vendor);
  assert.ok(provider.descriptor.model);
  assert.ok(provider.descriptor.capabilities.length > 0);
  for (const method of ["classify", "plan", "implement", "review", "repair", "summarize", "assessCompletion"] as const) {
    assert.equal(typeof provider[method], "function");
  }
}

void test("all provider adapters expose the common provider contract without performing network I/O", () => {
  const providers: Provider[] = [
    new DeterministicJevProvider(),
    new MockCodexProvider(),
    new MockJulesProvider(),
    new OpenAICodexProvider({ apiKey: "test-only", model: "explicit-model", baseUrl: "https://api.openai.com/v1", timeoutMs: 100 }),
    new JulesProvider({ apiKey: "test-only", source: "sources/github/test/repo", startingBranch: "main", baseUrl: "https://jules.googleapis.com/v1alpha", timeoutMs: 100, pollIntervalMs: 1 }),
    new TypesafeJevProvider({ apiKey: "test-only", baseUrl: "https://api.typesafe.ai", model: "jev-latest", timeoutMs: 100 }),
  ];
  providers.forEach(assertContract);
  assert.equal(providers.some((provider) => JSON.stringify(provider.descriptor).includes("test-only")), false);
});
