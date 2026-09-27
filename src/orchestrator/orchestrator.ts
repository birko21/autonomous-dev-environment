import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type {
  CompletionResult,
  Escalation,
  PendingApproval,
  ReviewResult,
  RunRecord,
  RunSummary,
  Task,
  ToolRequest,
  VerificationResult,
  WorkerRequest,
} from "../domain/types.js";
import type { EvidenceRecorder } from "../evidence/recorder.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { RoutingPolicy } from "../routing/policy.js";
import { isTerminalState } from "../state/machine.js";
import type { FileRunStore } from "../state/store.js";
import type { ToolExecutor } from "../tools/executor.js";
import { nowIso } from "../utils/time.js";
import type { VerificationRunner } from "../verification/runner.js";
import { collectRepositorySnapshot } from "../workspace/snapshot.js";

const execFileAsync = promisify(execFile);

export interface OrchestratorDependencies {
  store: FileRunStore;
  providers: ProviderRegistry;
  routing: RoutingPolicy;
  executor: ToolExecutor;
  verifier: VerificationRunner;
  evidence: EvidenceRecorder;
  maxRetries: number;
  maxActionSteps: number;
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDependencies) {}

  async createTask(task: Task): Promise<void> {
    await this.deps.store.saveTask(task);
  }

  async start(task: Task, workspace: string): Promise<CompletionResult> {
    await this.createTask(task);
    const run = await this.deps.store.createRun(task, workspace, this.deps.maxRetries);
    return this.process(run.id);
  }

  async resume(runId: string): Promise<CompletionResult> {
    return this.process(runId);
  }

  async status(runId: string): Promise<RunRecord> {
    return this.deps.store.loadRun(runId);
  }

  async approve(runId: string, note?: string): Promise<CompletionResult> {
    let run = await this.deps.store.loadRun(runId);
    if (!run.pendingApproval || run.pendingApproval.status !== "PENDING") throw new Error(`Run ${runId} has no pending approval.`);
    const approval = { ...run.pendingApproval, status: "APPROVED" as const, resolvedAt: nowIso(), ...(note ? { note } : {}) };
    run.pendingApproval = approval;
    run = await this.deps.store.saveRun(run);
    await this.deps.evidence.record(run, "APPROVAL", "human", "Pending action approved.", { approvalId: approval.id, type: approval.type, ...(note ? { note } : {}) });
    return this.process(run.id);
  }

  async reject(runId: string, note?: string): Promise<CompletionResult> {
    let run = await this.deps.store.loadRun(runId);
    if (!run.pendingApproval || run.pendingApproval.status !== "PENDING") throw new Error(`Run ${runId} has no pending approval.`);
    const approval = { ...run.pendingApproval, status: "REJECTED" as const, resolvedAt: nowIso(), ...(note ? { note } : {}) };
    run.pendingApproval = approval;
    run = await this.deps.store.saveRun(run);
    await this.deps.evidence.record(run, "APPROVAL", "human", "Pending action rejected.", { approvalId: approval.id, type: approval.type, ...(note ? { note } : {}) });
    return this.process(run.id);
  }

  async cancel(runId: string): Promise<CompletionResult> {
    let run = await this.deps.store.loadRun(runId);
    if (isTerminalState(run.state)) return this.toResult(run);
    run.cancelRequested = true;
    run = await this.deps.store.saveRun(run);
    return this.process(run.id);
  }

  private async process(runId: string): Promise<CompletionResult> {
    return this.deps.store.withRunLock(runId, () => this.processLocked(runId));
  }

  private async processLocked(runId: string): Promise<CompletionResult> {
    let iterations = 0;
    try {
      while (iterations++ < 100) {
        let run = await this.deps.store.loadRun(runId);
        if (isTerminalState(run.state)) return this.toResult(run);
        if (run.cancelRequested) {
          run = await this.deps.store.transition(run, "CANCELLED", "Cancellation requested.");
          await this.deps.evidence.record(run, "STATE", "orchestrator", "Run cancelled.");
          return this.toResult(run);
        }

        switch (run.state) {
          case "RECEIVED":
            await this.classify(run);
            break;
          case "CLASSIFIED":
            await this.dispatch(run);
            break;
          case "DISPATCHED":
            await this.planAndRun(run);
            break;
          case "RUNNING":
            await this.act(run);
            break;
          case "AWAITING_APPROVAL":
            return await this.handleApproval(run);
          case "VERIFYING":
            await this.verify(run);
            break;
          case "RETRYING":
            await this.retry(run);
            break;
          case "ESCALATED":
            return await this.handleEscalation(run);
          default:
            throw new Error(`Unhandled run state: ${String(run.state)}`);
        }
      }
      throw new Error("Orchestrator iteration limit exceeded.");
    } catch (error) {
      let run = await this.deps.store.loadRun(runId);
      await this.deps.evidence.record(run, "ERROR", "orchestrator", (error as Error).message, { name: (error as Error).name });
      if (!isTerminalState(run.state)) run = await this.deps.store.transition(run, "FAILED", "Unhandled orchestrator error.");
      return this.toResult(run);
    }
  }

  private async classify(run: RunRecord): Promise<void> {
    const snapshot = await collectRepositorySnapshot(run.workspace);
    const decision = this.deps.routing.decisionProvider();
    const started = Date.now();
    const classification = await decision.classify({ task: run.task, repositorySummary: JSON.stringify({ branch: snapshot.branch, headSha: snapshot.headSha, files: snapshot.files.slice(0, 200), governance: Object.keys(snapshot.governance) }) });
    run.classification = classification;
    run = await this.deps.store.saveRun(run);
    await this.deps.evidence.record(run, "PROVIDER", decision.descriptor.id, "Task classified.", { model: decision.descriptor.model, vendor: decision.descriptor.vendor, classification }, { latencyMs: Date.now() - started });
    await this.deps.store.transition(run, "CLASSIFIED", "Classification complete.");
  }

  private async dispatch(run: RunRecord): Promise<void> {
    if (!run.classification) throw new Error("Cannot dispatch an unclassified run.");
    const routing = this.deps.routing.route(run.task, run.classification);
    run.selectedWorker = routing.worker.descriptor.id;
    if (routing.reviewer) run.reviewWorker = routing.reviewer.descriptor.id;
    run.classification = { ...run.classification, risk: routing.effectiveRisk, reasons: routing.reasons };
    run = await this.deps.store.saveRun(run);
    await this.deps.evidence.record(run, "PROVIDER", "routing-policy", "Worker routing selected.", { worker: run.selectedWorker, reviewWorker: run.reviewWorker ?? null, effectiveRisk: routing.effectiveRisk, reasons: routing.reasons });

    if (routing.approvalRequired) {
      const approval = this.pendingApproval("RISK_GATE", `Risk ${routing.effectiveRisk} requires explicit human approval before side effects.`);
      run.pendingApproval = approval;
      run = await this.deps.store.saveRun(run);
      await this.deps.evidence.record(run, "APPROVAL", "routing-policy", "Run paused at deterministic risk gate.", { approvalId: approval.id, risk: routing.effectiveRisk });
      await this.deps.store.transition(run, "AWAITING_APPROVAL", "High-risk task requires human approval.");
      return;
    }
    await this.deps.store.transition(run, "DISPATCHED", `Dispatched to ${routing.worker.descriptor.id}.`);
  }

  private async planAndRun(run: RunRecord): Promise<void> {
    await this.plan(run);
    await this.deps.store.transition(run, "RUNNING", "Worker plan recorded; implementation may begin.");
  }

  private async plan(run: RunRecord): Promise<void> {
    if (!run.selectedWorker) throw new Error("No selected worker.");
    const provider = this.deps.providers.get(run.selectedWorker);
    const request = await this.workerRequest(run, "PLAN");
    const started = Date.now();
    const plan = await provider.plan(request);
    await this.deps.evidence.record(run, "PROVIDER", provider.descriptor.id, "Worker plan produced.", { model: provider.descriptor.model, plan }, { latencyMs: Date.now() - started });
  }

  private async act(run: RunRecord): Promise<void> {
    if (!run.selectedWorker) throw new Error("No selected worker for RUNNING state.");
    const provider = this.deps.providers.get(run.selectedWorker);

    if (!run.pendingWorkerResult) {
      const request = await this.workerRequest(run, run.attempt === 0 ? "IMPLEMENT" : "REPAIR");
      const started = Date.now();
      const workerResult = run.attempt === 0 ? await provider.implement(request) : await provider.repair(request);
      run.pendingWorkerResult = workerResult;
      run.nextToolIndex = 0;
      run = await this.deps.store.saveRun(run);
      await this.deps.evidence.record(run, "PROVIDER", provider.descriptor.id, run.attempt === 0 ? "Implementation response received." : "Repair response received.", { model: provider.descriptor.model, summary: workerResult.summary, toolRequestCount: workerResult.toolRequests.length, artifacts: workerResult.artifacts, providerMetadata: workerResult.providerMetadata }, { latencyMs: Date.now() - started });
    }

    const workerResult = run.pendingWorkerResult;
    if (!workerResult) throw new Error("Worker result was not persisted.");
    if (workerResult.providerMetadata.remoteWorkspace === true && workerResult.toolRequests.length === 0) {
      await this.escalate(run, "HUMAN_REQUESTED", "Remote worker output must be reconciled into the local workspace before deterministic verification can authorize completion.");
      return;
    }
    while (run.nextToolIndex < workerResult.toolRequests.length) {
      const request = workerResult.toolRequests[run.nextToolIndex];
      if (!request) throw new Error("Tool index is out of bounds.");
      const previous = run.executedTools[request.idempotencyKey];
      if (previous) {
        await this.deps.evidence.record(run, "TOOL", "idempotency", "Skipped already-executed tool request during resume.", { requestId: request.id, idempotencyKey: request.idempotencyKey, previousRequestId: previous.requestId });
        run.nextToolIndex += 1;
        run = await this.deps.store.saveRun(run);
        continue;
      }

      const decision = this.deps.executor.evaluate(request, run, false);
      await this.deps.evidence.record(run, "POLICY", "tool-policy", `Tool policy decision: ${decision.outcome}.`, { request: this.safeToolRequest(request), decision });
      if (decision.outcome === "DENY") {
        await this.escalate(run, "POLICY_DENIED", `Tool request ${request.name} denied: ${decision.reasons.join(" ")}`);
        return;
      }
      if (decision.outcome === "REQUIRE_APPROVAL") {
        run.pendingApproval = this.pendingApproval("TOOL", decision.reasons.join(" "), request);
        run = await this.deps.store.saveRun(run);
        await this.deps.store.transition(run, "AWAITING_APPROVAL", "Tool request requires human approval.");
        return;
      }

      const outcome = await this.deps.executor.execute(request, run, false);
      if (!outcome.result) throw new Error(`Tool ${request.name} was allowed but produced no result.`);
      await this.deps.evidence.record(run, "TOOL", request.name, outcome.result.summary, { requestId: request.id, idempotencyKey: request.idempotencyKey, ok: outcome.result.ok, result: outcome.result.data });
      if (!outcome.result.ok) {
        await this.escalate(run, "POLICY_DENIED", `Tool ${request.name} failed during execution.`);
        return;
      }
      run.executedTools[request.idempotencyKey] = { requestId: request.id, result: outcome.result.data };
      run.nextToolIndex += 1;
      run = await this.deps.store.saveRun(run);
    }

    if (!workerResult.readyForVerification) {
      run.actionStep += 1;
      delete run.pendingWorkerResult;
      run.nextToolIndex = 0;
      if (run.actionStep >= this.deps.maxActionSteps) {
        await this.escalate(run, "REPEATED_FAILURE", "Worker exceeded the bounded action-step budget without requesting verification.");
        return;
      }
      await this.deps.store.saveRun(run);
      return;
    }

    delete run.pendingWorkerResult;
    run.nextToolIndex = 0;
    run = await this.deps.store.saveRun(run);
    await this.deps.store.transition(run, "VERIFYING", "Worker requested deterministic verification.");
  }

  private async verify(run: RunRecord): Promise<void> {
    const results = await this.deps.verifier.run(run.workspace, run.task);
    run.verificationResults = results;
    run = await this.deps.store.saveRun(run);
    for (const item of results) {
      await this.deps.evidence.record(run, "VERIFICATION", "deterministic-verifier", `${item.check}: ${item.status}.`, { result: item });
    }

    let review: ReviewResult | undefined;
    if (run.reviewWorker) {
      const provider = this.deps.providers.get(run.reviewWorker);
      const started = Date.now();
      review = await provider.review(await this.workerRequest(run, "REVIEW"));
      await this.deps.evidence.record(run, "PROVIDER", provider.descriptor.id, "Independent review completed.", { model: provider.descriptor.model, review }, { latencyMs: Date.now() - started });
    }

    const decision = this.deps.routing.decisionProvider();
    const started = Date.now();
    const assessment = await decision.assessCompletion({ task: run.task, verificationResults: results, attempt: run.attempt, maxRetries: run.maxRetries });
    await this.deps.evidence.record(run, "PROVIDER", decision.descriptor.id, "Evidence interpreted for next-state decision.", { model: decision.descriptor.model, assessment }, { latencyMs: Date.now() - started });

    const requiredPassed = this.deps.verifier.requiredPassed(results);
    if (!requiredPassed) {
      if (assessment.action === "COMPLETE") {
        await this.deps.evidence.record(run, "VERIFICATION", "orchestrator", "Completion decision overridden because deterministic verification failed.", { requestedAction: assessment.action });
      }
      if (run.attempt < run.maxRetries) {
        await this.deps.evidence.record(run, "RETRY", "orchestrator", "Required verification failed; bounded retry scheduled.", { attempt: run.attempt, maxRetries: run.maxRetries, failedChecks: results.filter((entry) => entry.required && entry.status !== "PASS").map((entry) => entry.check) });
        await this.deps.store.transition(run, "RETRYING", "Required deterministic verification failed.");
      } else {
        await this.escalate(run, "FAILED_VERIFICATION", "Required deterministic verification still fails after bounded retries.");
      }
      return;
    }

    if (review && !review.approved) {
      if (run.attempt < run.maxRetries && review.recommendedAction === "RETRY") {
        await this.deps.store.transition(run, "RETRYING", "Independent review requested repair.");
      } else {
        await this.escalate(run, "FAILED_VERIFICATION", `Independent reviewer blocked completion: ${review.findings.join(" ")}`);
      }
      return;
    }

    if (assessment.action === "ESCALATE") {
      await this.escalate(run, "HUMAN_REQUESTED", assessment.reasons.join(" "));
      return;
    }
    if (assessment.action === "RETRY") {
      if (run.attempt < run.maxRetries) await this.deps.store.transition(run, "RETRYING", "Jev requested bounded repair after interpreting green evidence.");
      else await this.escalate(run, "REPEATED_FAILURE", "Jev requested another retry beyond the configured retry threshold.");
      return;
    }
    if (assessment.action === "CONTINUE") {
      run.actionStep += 1;
      if (run.actionStep >= this.deps.maxActionSteps) await this.escalate(run, "REPEATED_FAILURE", "CONTINUE exceeded the configured action-step threshold.");
      else {
        run = await this.deps.store.saveRun(run);
        await this.deps.store.transition(run, "RUNNING", "Jev selected CONTINUE after verification.");
      }
      return;
    }
    if (assessment.action === "VERIFY") {
      run.actionStep += 1;
      if (run.actionStep >= this.deps.maxActionSteps) await this.escalate(run, "REPEATED_FAILURE", "VERIFY exceeded the configured action-step threshold.");
      else await this.deps.store.saveRun(run);
      return;
    }

    await this.complete(run, results);
  }

  private async retry(run: RunRecord): Promise<void> {
    run.attempt += 1;
    run.actionStep = 0;
    run.nextToolIndex = 0;
    delete run.pendingWorkerResult;
    run = await this.deps.store.saveRun(run);
    await this.deps.store.transition(run, "RUNNING", `Starting bounded repair attempt ${run.attempt}.`);
  }

  private async handleApproval(run: RunRecord): Promise<CompletionResult> {
    const approval = run.pendingApproval;
    if (!approval || approval.status === "PENDING") return this.toResult(run);
    if (approval.status === "REJECTED") {
      delete run.pendingApproval;
      run = await this.deps.store.saveRun(run);
      run = await this.deps.store.transition(run, "CANCELLED", "Human rejected pending action.");
      return this.toResult(run);
    }

    if (approval.type === "RISK_GATE") {
      run.riskApproved = true;
      delete run.pendingApproval;
      run = await this.deps.store.saveRun(run);
      await this.plan(run);
      run = await this.deps.store.transition(run, "RUNNING", "Human approved high-risk task gate.");
      return this.processLocked(run.id);
    }

    if (approval.type === "TOOL" && approval.request) {
      const outcome = await this.deps.executor.execute(approval.request, run, true);
      if (!outcome.result || !outcome.result.ok) {
        await this.escalate(run, "POLICY_DENIED", `Approved tool ${approval.request.name} could not be executed safely.`);
        return this.toResult(await this.deps.store.loadRun(run.id));
      }
      run.executedTools[approval.request.idempotencyKey] = { requestId: approval.request.id, result: outcome.result.data };
      run.nextToolIndex += 1;
      await this.deps.evidence.record(run, "TOOL", approval.request.name, `Approved tool executed: ${outcome.result.summary}`, { requestId: approval.request.id, result: outcome.result.data });
      delete run.pendingApproval;
      run = await this.deps.store.saveRun(run);
      run = await this.deps.store.transition(run, "RUNNING", "Approved tool executed; worker loop resumed.");
      return this.processLocked(run.id);
    }

    return this.toResult(run);
  }

  private async handleEscalation(run: RunRecord): Promise<CompletionResult> {
    const approval = run.pendingApproval;
    if (!approval || approval.status === "PENDING") return this.toResult(run);
    if (approval.status === "REJECTED") {
      delete run.pendingApproval;
      run = await this.deps.store.saveRun(run);
      run = await this.deps.store.transition(run, "CANCELLED", "Human rejected escalation continuation.");
      return this.toResult(run);
    }
    delete run.pendingApproval;
    run = await this.deps.store.saveRun(run);
    if (run.attempt < run.maxRetries) run = await this.deps.store.transition(run, "RETRYING", "Human approved retry after escalation.");
    else run = await this.deps.store.transition(run, "RUNNING", "Human approved continuation after escalation.");
    return this.processLocked(run.id);
  }

  private async escalate(run: RunRecord, code: Escalation["code"], reason: string): Promise<void> {
    const escalation: Escalation = { id: `esc-${randomUUID()}`, runId: run.id, code, reason, evidenceIds: [], createdAt: nowIso() };
    run.escalations.push(escalation);
    run.pendingApproval = this.pendingApproval("ESCALATION", reason);
    run = await this.deps.store.saveRun(run);
    await this.deps.evidence.record(run, "ESCALATION", "orchestrator", reason, { escalation });
    await this.deps.store.transition(run, "ESCALATED", reason);
  }

  private async complete(run: RunRecord, results: VerificationResult[]): Promise<void> {
    const requiredChecksPassed = this.deps.verifier.requiredPassed(results);
    if (!requiredChecksPassed) throw new Error("Invariant violation: completion attempted with failed required verification.");
    const changedFiles = await this.changedFiles(run);
    const summary: RunSummary = {
      runId: run.id,
      taskId: run.task.id,
      state: "COMPLETED",
      startedAt: run.createdAt,
      finishedAt: nowIso(),
      attempts: run.attempt + 1,
      selectedWorkers: [...new Set([run.selectedWorker, run.reviewWorker].filter((value): value is string => Boolean(value)))],
      checks: results,
      escalations: run.escalations,
      changedFiles,
      outcome: "All required deterministic verification passed and the decision layer selected COMPLETE.",
    };
    run.summary = summary;
    run = await this.deps.store.saveRun(run);
    await this.deps.evidence.record(run, "SUMMARY", "orchestrator", "Run completion summary recorded.", { summary });
    await this.deps.store.transition(run, "COMPLETED", "All completion invariants satisfied.");
  }

  private async workerRequest(run: RunRecord, mode: WorkerRequest["mode"]): Promise<WorkerRequest> {
    return {
      runId: run.id,
      task: run.task,
      repository: await collectRepositorySnapshot(run.workspace),
      attempt: run.attempt,
      actionStep: run.actionStep,
      mode,
      priorEvidence: await this.deps.store.readEvidence(run.id),
      verificationResults: run.verificationResults,
    };
  }

  private pendingApproval(type: PendingApproval["type"], reason: string, request?: ToolRequest): PendingApproval {
    return { id: `approval-${randomUUID()}`, type, ...(request ? { request } : {}), reason, status: "PENDING", createdAt: nowIso() };
  }

  private safeToolRequest(request: ToolRequest): Record<string, unknown> {
    return { id: request.id, name: request.name, purpose: request.purpose, idempotencyKey: request.idempotencyKey, argumentKeys: Object.keys(request.arguments) };
  }

  private async changedFiles(run: RunRecord): Promise<string[]> {
    try {
      const rootResponse = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: run.workspace, timeout: 10_000 });
      const gitRoot = resolve(rootResponse.stdout.trim());
      const workspaceRoot = resolve(run.workspace);
      const sameRoot = process.platform === "win32" ? gitRoot.toLowerCase() === workspaceRoot.toLowerCase() : gitRoot === workspaceRoot;
      if (!sameRoot) throw new Error("Workspace is nested inside another Git worktree.");
      const response = await execFileAsync("git", ["status", "--porcelain=v1", "-uall"], { cwd: run.workspace, timeout: 10_000, maxBuffer: 1_000_000 });
      return response.stdout.split(/\r?\n/u).filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1) ?? "").filter(Boolean);
    } catch {
      return [...new Set(Object.values(run.executedTools).map((entry) => entry.result.path).filter((value): value is string => typeof value === "string"))];
    }
  }

  private toResult(run: RunRecord): CompletionResult {
    const checksPassed = this.deps.verifier.requiredPassed(run.verificationResults);
    const fallbackSummary: RunSummary = {
      runId: run.id,
      taskId: run.task.id,
      state: run.state,
      startedAt: run.createdAt,
      ...(isTerminalState(run.state) ? { finishedAt: run.updatedAt } : {}),
      attempts: run.attempt + 1,
      selectedWorkers: [...new Set([run.selectedWorker, run.reviewWorker].filter((value): value is string => Boolean(value)))],
      checks: run.verificationResults,
      escalations: run.escalations,
      changedFiles: [],
      outcome: run.state === "COMPLETED" ? "Completed." : `Run is ${run.state}.`,
    };
    return { runId: run.id, completed: run.state === "COMPLETED", state: run.state, requiredChecksPassed: checksPassed, summary: run.summary ?? fallbackSummary };
  }
}
