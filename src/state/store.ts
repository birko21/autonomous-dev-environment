import { appendFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { EvidenceRecord, RunRecord, RunState, Task } from "../domain/types.js";
import { taskSchema } from "../domain/schemas.js";
import { assertTransition } from "./machine.js";
import { atomicWriteJson, ensureDir, readJsonFile } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";
import { redactValue } from "../evidence/redactor.js";
import { RunExecutionLock } from "./lock.js";

export interface RunEvent {
  id: string;
  runId: string;
  taskId: string;
  timestamp: string;
  type: "STATE_TRANSITION" | "RUN_CREATED" | "RUN_UPDATED";
  data: Record<string, unknown>;
}

export class FileRunStore {
  readonly baseDir: string;

  constructor(baseDir: string, private readonly options: { lockStaleMs?: number } = {}) {
    this.baseDir = baseDir;
  }

  async withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const lock = new RunExecutionLock(this.runDir(runId), this.options.lockStaleMs ?? 300_000);
    await lock.acquire();
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  async pruneTerminalRuns(retentionDays: number, now = Date.now()): Promise<string[]> {
    if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) throw new Error("Evidence retention days must be greater than zero.");
    await this.initialize();
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    const removed: string[] = [];
    for (const runId of await readdir(this.runsDir())) {
      const statePath = this.runFile(runId);
      try {
        const run = await readJsonFile<RunRecord>(statePath);
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.state) && Date.parse(run.updatedAt) < cutoff) {
          await rm(this.runDir(runId), { recursive: true, force: true });
          removed.push(runId);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return removed.sort();
  }

  private tasksDir(): string {
    return join(this.baseDir, "tasks");
  }

  private runsDir(): string {
    return join(this.baseDir, "runs");
  }

  private runDir(runId: string): string {
    return join(this.runsDir(), runId);
  }

  private runFile(runId: string): string {
    return join(this.runDir(runId), "state.json");
  }

  async initialize(): Promise<void> {
    await Promise.all([ensureDir(this.tasksDir()), ensureDir(this.runsDir())]);
  }

  async saveTask(task: Task): Promise<void> {
    await this.initialize();
    const validated = taskSchema.parse(task);
    await atomicWriteJson(join(this.tasksDir(), `${validated.id}.json`), validated);
  }

  async loadTask(taskId: string): Promise<Task> {
    return taskSchema.parse(await readJsonFile<unknown>(join(this.tasksDir(), `${taskId}.json`)));
  }

  async listTaskIds(): Promise<string[]> {
    await this.initialize();
    const files = await readdir(this.tasksDir());
    return files.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
  }

  async createRun(task: Task, workspace: string, maxRetries: number): Promise<RunRecord> {
    await this.initialize();
    const now = nowIso();
    const run: RunRecord = {
      schemaVersion: 1,
      id: `run-${randomUUID()}`,
      revision: 0,
      task: taskSchema.parse(task),
      state: "RECEIVED",
      createdAt: now,
      updatedAt: now,
      workspace,
      attempt: 0,
      actionStep: 0,
      maxRetries,
      nextToolIndex: 0,
      executedTools: {},
      verificationResults: [],
      escalations: [],
      cancelRequested: false,
      riskApproved: false,
    };
    await mkdir(this.runDir(run.id), { recursive: true });
    await atomicWriteJson(this.runFile(run.id), run);
    await this.appendEvent(run.id, {
      id: randomUUID(),
      runId: run.id,
      taskId: run.task.id,
      timestamp: now,
      type: "RUN_CREATED",
      data: { state: run.state, workspace },
    });
    return run;
  }

  async loadRun(runId: string): Promise<RunRecord> {
    const raw = await readJsonFile<RunRecord>(this.runFile(runId));
    if (raw.schemaVersion !== 1) throw new Error(`Unsupported run schema version: ${String(raw.schemaVersion)}`);
    taskSchema.parse(raw.task);
    return raw;
  }

  async saveRun(run: RunRecord, expectedRevision?: number): Promise<RunRecord> {
    if (expectedRevision !== undefined && run.revision !== expectedRevision) {
      throw new Error(`Run revision mismatch before save: expected ${expectedRevision}, got ${run.revision}`);
    }
    const updated: RunRecord = {
      ...run,
      revision: run.revision + 1,
      updatedAt: nowIso(),
    };
    await atomicWriteJson(this.runFile(run.id), updated);
    return updated;
  }

  async transition(run: RunRecord, to: RunState, reason: string): Promise<RunRecord> {
    assertTransition(run.state, to);
    const from = run.state;
    let updated = await this.saveRun({ ...run, state: to });
    await this.appendEvent(updated.id, {
      id: randomUUID(),
      runId: updated.id,
      taskId: updated.task.id,
      timestamp: updated.updatedAt,
      type: "STATE_TRANSITION",
      data: { from, to, reason },
    });
    return updated;
  }

  async appendEvent(runId: string, event: RunEvent): Promise<void> {
    const safe = redactValue(event) as RunEvent;
    await ensureDir(this.runDir(runId));
    await appendFile(join(this.runDir(runId), "events.ndjson"), `${JSON.stringify(safe)}\n`, "utf8");
  }

  async appendEvidence(runId: string, evidence: EvidenceRecord): Promise<void> {
    const safe = redactValue(evidence) as EvidenceRecord;
    await ensureDir(this.runDir(runId));
    await appendFile(join(this.runDir(runId), "evidence.ndjson"), `${JSON.stringify(safe)}\n`, "utf8");
  }

  async readEvidence(runId: string): Promise<EvidenceRecord[]> {
    try {
      const content = await readFile(join(this.runDir(runId), "evidence.ndjson"), "utf8");
      return content
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as EvidenceRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async readEvents(runId: string): Promise<RunEvent[]> {
    try {
      const content = await readFile(join(this.runDir(runId), "events.ndjson"), "utf8");
      return content
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RunEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}
