import assert from "node:assert/strict";
import test from "node:test";
import { redactString, redactValue } from "../../src/evidence/redactor.js";

void test("redactor removes credential-shaped values", () => {
  const bearer = ["secret", "token", "value"].join("-");
  const openai = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
  const redacted = redactString(`Authorization: Bearer ${bearer} and ${openai}`);
  assert.equal(redacted.includes(bearer), false);
  assert.equal(redacted.includes(openai), false);
});

void test("redactor removes sensitive object keys recursively", () => {
  const value = redactValue({ apiKey: "top-secret", nested: { password: "also-secret", safe: "ok" } }) as Record<string, unknown>;
  assert.equal(value.apiKey, "[REDACTED]");
  assert.deepEqual(value.nested, { password: "[REDACTED]", safe: "ok" });
});
