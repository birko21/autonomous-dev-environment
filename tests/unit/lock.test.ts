import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunExecutionLock } from "../../src/state/lock.js";

void test("run execution lock prevents concurrent processing and releases cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "ade-lock-"));
  const runDir = join(root, "run-1");
  await mkdir(runDir, { recursive: true });
  const first = new RunExecutionLock(runDir, 60_000);
  const second = new RunExecutionLock(runDir, 60_000);
  try {
    await first.acquire();
    await assert.rejects(() => second.acquire(), /already being processed|acquired by another process/iu);
    await first.release();
    await second.acquire();
    await second.release();
  } finally {
    await first.release();
    await second.release();
    await rm(root, { recursive: true, force: true });
  }
});
