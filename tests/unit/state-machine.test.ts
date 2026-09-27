import assert from "node:assert/strict";
import test from "node:test";
import { ALLOWED_TRANSITIONS, assertTransition, InvalidTransitionError } from "../../src/state/machine.js";

void test("state machine accepts explicit lifecycle transitions", () => {
  assert.equal(ALLOWED_TRANSITIONS.RECEIVED.includes("CLASSIFIED"), true);
  assert.equal(ALLOWED_TRANSITIONS.VERIFYING.includes("RETRYING"), true);
  assert.equal(ALLOWED_TRANSITIONS.VERIFYING.includes("COMPLETED"), true);
  assert.equal(ALLOWED_TRANSITIONS.COMPLETED.includes("RUNNING"), false);
});

void test("state machine rejects invalid transitions", () => {
  assert.throws(() => assertTransition("RECEIVED", "COMPLETED"), InvalidTransitionError);
  assert.throws(() => assertTransition("FAILED", "RUNNING"), InvalidTransitionError);
});
