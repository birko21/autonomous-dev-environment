import assert from "node:assert/strict";
import test from "node:test";
import { SchemaError, taskSchema, toolRequestSchema } from "../../src/domain/schemas.js";

void test("task schema validates a typed task", () => {
  const task = taskSchema.parse({
    id: "task-1",
    title: "Safe task",
    description: "Change one scoped file",
    repository: { path: "/tmp/repo", baseBranch: "main" },
    acceptanceCriteria: [{ id: "ac-1", description: "passes", required: true }],
    scope: { allowedPaths: ["src/**"], forbiddenPaths: [".env"] },
    labels: [],
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  assert.equal(task.id, "task-1");
});

void test("schema rejects invalid tool request shape", () => {
  assert.throws(() => toolRequestSchema.parse({ id: "x", name: "write_file" }), SchemaError);
});
