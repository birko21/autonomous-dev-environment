import { randomUUID } from "node:crypto";
import type { EvidenceKind, EvidenceRecord, RunRecord } from "../domain/types.js";
import { FileRunStore } from "../state/store.js";
import { nowIso } from "../utils/time.js";

export class EvidenceRecorder {
  constructor(private readonly store: FileRunStore) {}

  async record(
    run: RunRecord,
    kind: EvidenceKind,
    source: string,
    message: string,
    data: Record<string, unknown> = {},
    metrics: { latencyMs?: number; costUsd?: number } = {},
  ): Promise<EvidenceRecord> {
    const record: EvidenceRecord = {
      id: randomUUID(),
      runId: run.id,
      taskId: run.task.id,
      kind,
      timestamp: nowIso(),
      source,
      message,
      data,
      ...(metrics.latencyMs === undefined ? {} : { latencyMs: metrics.latencyMs }),
      ...(metrics.costUsd === undefined ? {} : { costUsd: metrics.costUsd }),
    };
    await this.store.appendEvidence(run.id, record);
    return record;
  }
}
