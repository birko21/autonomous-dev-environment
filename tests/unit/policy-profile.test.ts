import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPolicyProfile } from "../../src/tools/profile.js";

void test("organization policy profile can only tighten the built-in command policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "ade-policy-"));
  const path = join(root, "policy.json");
  try {
    await writeFile(path, JSON.stringify({ name: "engineering", allowedNpmScripts: ["lint", "test"], additionalForbiddenPaths: ["generated/**"] }));
    const profile = loadPolicyProfile(path);
    assert.deepEqual(profile.allowedNpmScripts, ["lint", "test"]);
    assert.deepEqual(profile.additionalForbiddenPaths, ["generated/**"]);
    await writeFile(path, JSON.stringify({ allowedNpmScripts: ["install"] }));
    assert.throws(() => loadPolicyProfile(path), /outside the built-in allowlist/iu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
