import {
  COMPLEXITY_LEVELS,
  NEXT_ACTIONS,
  RISK_LEVELS,
  RUN_STATES,
  type AcceptanceCriterion,
  type CompletionAssessment,
  type CompletionResult,
  type EvidenceKind,
  type EvidenceRecord,
  type Escalation,
  type PlanResult,
  type PolicyDecision,
  type ReviewResult,
  type RunSummary,
  type Task,
  type Ticket,
  type ToolRequest,
  type VerificationResult,
  type WorkerRequest,
  type WorkerResult,
} from "./types.js";

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export interface Schema<T> {
  readonly name: string;
  parse(input: unknown): T;
}

type JsonObject = Record<string, unknown>;

function object(input: unknown, path = "$"): JsonObject {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SchemaError(`${path} must be an object`);
  }
  return input as JsonObject;
}

function stringValue(input: unknown, path: string, allowEmpty = false): string {
  if (typeof input !== "string" || (!allowEmpty && input.trim() === "")) {
    throw new SchemaError(`${path} must be a non-empty string`);
  }
  return input;
}

function booleanValue(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") throw new SchemaError(`${path} must be a boolean`);
  return input;
}

function numberValue(input: unknown, path: string, min?: number, max?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new SchemaError(`${path} must be a finite number`);
  }
  if (min !== undefined && input < min) throw new SchemaError(`${path} must be >= ${min}`);
  if (max !== undefined && input > max) throw new SchemaError(`${path} must be <= ${max}`);
  return input;
}

function integerValue(input: unknown, path: string, min = Number.MIN_SAFE_INTEGER): number {
  const value = numberValue(input, path, min);
  if (!Number.isInteger(value)) throw new SchemaError(`${path} must be an integer`);
  return value;
}

function stringArray(input: unknown, path: string): string[] {
  if (!Array.isArray(input)) throw new SchemaError(`${path} must be an array`);
  return input.map((value, index) => stringValue(value, `${path}[${index}]`));
}

function enumValue<T extends readonly string[]>(input: unknown, allowed: T, path: string): T[number] {
  const value = stringValue(input, path);
  if (!allowed.includes(value)) {
    throw new SchemaError(`${path} must be one of ${allowed.join(", ")}`);
  }
  return value as T[number];
}

function recordValue(input: unknown, path: string): Record<string, unknown> {
  return object(input, path);
}

export const acceptanceCriterionSchema: Schema<AcceptanceCriterion> = {
  name: "AcceptanceCriterion",
  parse(input) {
    const value = object(input);
    return {
      id: stringValue(value.id, "$.id"),
      description: stringValue(value.description, "$.description"),
      required: booleanValue(value.required, "$.required"),
    };
  },
};

export const taskSchema: Schema<Task> = {
  name: "Task",
  parse(input) {
    const value = object(input);
    const repo = object(value.repository, "$.repository");
    const scope = object(value.scope, "$.scope");
    if (!Array.isArray(value.acceptanceCriteria)) {
      throw new SchemaError("$.acceptanceCriteria must be an array");
    }
    return {
      id: stringValue(value.id, "$.id"),
      title: stringValue(value.title, "$.title"),
      description: stringValue(value.description, "$.description"),
      repository: {
        ...(repo.owner === undefined ? {} : { owner: stringValue(repo.owner, "$.repository.owner") }),
        ...(repo.name === undefined ? {} : { name: stringValue(repo.name, "$.repository.name") }),
        ...(repo.path === undefined ? {} : { path: stringValue(repo.path, "$.repository.path") }),
        baseBranch: stringValue(repo.baseBranch, "$.repository.baseBranch"),
      },
      acceptanceCriteria: value.acceptanceCriteria.map((item) => acceptanceCriterionSchema.parse(item)),
      scope: {
        allowedPaths: stringArray(scope.allowedPaths, "$.scope.allowedPaths"),
        forbiddenPaths: stringArray(scope.forbiddenPaths, "$.scope.forbiddenPaths"),
      },
      labels: stringArray(value.labels, "$.labels"),
      createdAt: stringValue(value.createdAt, "$.createdAt"),
    };
  },
};

export const ticketSchema: Schema<Ticket> = {
  name: "Ticket",
  parse(input) {
    const value = object(input);
    if (!Array.isArray(value.acceptanceCriteria)) {
      throw new SchemaError("$.acceptanceCriteria must be an array");
    }
    const status = enumValue(value.status, ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETE"] as const, "$.status");
    return {
      id: stringValue(value.id, "$.id"),
      title: stringValue(value.title, "$.title"),
      epic: stringValue(value.epic, "$.epic"),
      description: stringValue(value.description, "$.description"),
      dependencies: stringArray(value.dependencies, "$.dependencies"),
      acceptanceCriteria: value.acceptanceCriteria.map((item) => acceptanceCriterionSchema.parse(item)),
      status,
    };
  },
};

export const toolRequestSchema: Schema<ToolRequest> = {
  name: "ToolRequest",
  parse(input) {
    const value = object(input);
    return {
      id: stringValue(value.id, "$.id"),
      name: stringValue(value.name, "$.name"),
      purpose: stringValue(value.purpose, "$.purpose"),
      arguments: recordValue(value.arguments, "$.arguments"),
      idempotencyKey: stringValue(value.idempotencyKey, "$.idempotencyKey"),
    };
  },
};

export const policyDecisionSchema: Schema<PolicyDecision> = {
  name: "PolicyDecision",
  parse(input) {
    const value = object(input);
    return {
      requestId: stringValue(value.requestId, "$.requestId"),
      outcome: enumValue(value.outcome, ["ALLOW", "DENY", "REQUIRE_APPROVAL"] as const, "$.outcome"),
      reasons: stringArray(value.reasons, "$.reasons"),
      decidedAt: stringValue(value.decidedAt, "$.decidedAt"),
    };
  },
};

export const verificationResultSchema: Schema<VerificationResult> = {
  name: "VerificationResult",
  parse(input) {
    const value = object(input);
    return {
      id: stringValue(value.id, "$.id"),
      check: stringValue(value.check, "$.check"),
      required: booleanValue(value.required, "$.required"),
      status: enumValue(value.status, ["PASS", "FAIL", "SKIP"] as const, "$.status"),
      ...(value.command === undefined ? {} : { command: stringValue(value.command, "$.command") }),
      ...(value.exitCode === undefined ? {} : { exitCode: integerValue(value.exitCode, "$.exitCode") }),
      output: stringValue(value.output, "$.output", true),
      durationMs: numberValue(value.durationMs, "$.durationMs", 0),
      recordedAt: stringValue(value.recordedAt, "$.recordedAt"),
    };
  },
};

const EVIDENCE_KINDS = [
  "STATE",
  "PROVIDER",
  "TOOL",
  "POLICY",
  "COMMAND",
  "DIFF",
  "VERIFICATION",
  "RETRY",
  "ESCALATION",
  "APPROVAL",
  "SUMMARY",
  "ERROR",
] as const satisfies readonly EvidenceKind[];

export const evidenceRecordSchema: Schema<EvidenceRecord> = {
  name: "EvidenceRecord",
  parse(input) {
    const value = object(input);
    return {
      id: stringValue(value.id, "$.id"),
      runId: stringValue(value.runId, "$.runId"),
      taskId: stringValue(value.taskId, "$.taskId"),
      kind: enumValue(value.kind, EVIDENCE_KINDS, "$.kind"),
      timestamp: stringValue(value.timestamp, "$.timestamp"),
      source: stringValue(value.source, "$.source"),
      message: stringValue(value.message, "$.message", true),
      data: recordValue(value.data, "$.data"),
      ...(value.latencyMs === undefined ? {} : { latencyMs: numberValue(value.latencyMs, "$.latencyMs", 0) }),
      ...(value.costUsd === undefined ? {} : { costUsd: numberValue(value.costUsd, "$.costUsd", 0) }),
    };
  },
};

export const escalationSchema: Schema<Escalation> = {
  name: "Escalation",
  parse(input) {
    const value = object(input);
    const codes = [
      "SECURITY_SENSITIVE",
      "AUTHORIZATION",
      "PAYMENTS",
      "PRODUCTION_INFRA",
      "DESTRUCTIVE_DATABASE",
      "AMBIGUITY",
      "REPEATED_FAILURE",
      "FAILED_VERIFICATION",
      "POLICY_DENIED",
      "PROVIDER_FAILURE",
      "HUMAN_REQUESTED",
    ] as const;
    return {
      id: stringValue(value.id, "$.id"),
      runId: stringValue(value.runId, "$.runId"),
      code: enumValue(value.code, codes, "$.code"),
      reason: stringValue(value.reason, "$.reason"),
      evidenceIds: stringArray(value.evidenceIds, "$.evidenceIds"),
      createdAt: stringValue(value.createdAt, "$.createdAt"),
      ...(value.resolvedAt === undefined ? {} : { resolvedAt: stringValue(value.resolvedAt, "$.resolvedAt") }),
    };
  },
};

export const runSummarySchema: Schema<RunSummary> = {
  name: "RunSummary",
  parse(input) {
    const value = object(input);
    if (!Array.isArray(value.checks)) throw new SchemaError("$.checks must be an array");
    if (!Array.isArray(value.escalations)) throw new SchemaError("$.escalations must be an array");
    return {
      runId: stringValue(value.runId, "$.runId"),
      taskId: stringValue(value.taskId, "$.taskId"),
      state: enumValue(value.state, RUN_STATES, "$.state"),
      startedAt: stringValue(value.startedAt, "$.startedAt"),
      ...(value.finishedAt === undefined ? {} : { finishedAt: stringValue(value.finishedAt, "$.finishedAt") }),
      attempts: integerValue(value.attempts, "$.attempts", 0),
      selectedWorkers: stringArray(value.selectedWorkers, "$.selectedWorkers"),
      checks: value.checks.map((item) => verificationResultSchema.parse(item)),
      escalations: value.escalations.map((item) => escalationSchema.parse(item)),
      changedFiles: stringArray(value.changedFiles, "$.changedFiles"),
      outcome: stringValue(value.outcome, "$.outcome", true),
    };
  },
};

export const completionResultSchema: Schema<CompletionResult> = {
  name: "CompletionResult",
  parse(input) {
    const value = object(input);
    return {
      runId: stringValue(value.runId, "$.runId"),
      completed: booleanValue(value.completed, "$.completed"),
      state: enumValue(value.state, RUN_STATES, "$.state"),
      requiredChecksPassed: booleanValue(value.requiredChecksPassed, "$.requiredChecksPassed"),
      summary: runSummarySchema.parse(value.summary),
    };
  },
};

export const workerRequestSchema: Schema<WorkerRequest> = {
  name: "WorkerRequest",
  parse(input) {
    const value = object(input);
    const repository = object(value.repository, "$.repository");
    if (!Array.isArray(value.priorEvidence)) throw new SchemaError("$.priorEvidence must be an array");
    if (!Array.isArray(value.verificationResults)) throw new SchemaError("$.verificationResults must be an array");
    return {
      runId: stringValue(value.runId, "$.runId"),
      task: taskSchema.parse(value.task),
      repository: {
        root: stringValue(repository.root, "$.repository.root"),
        gitAvailable: booleanValue(repository.gitAvailable, "$.repository.gitAvailable"),
        ...(repository.branch === undefined ? {} : { branch: stringValue(repository.branch, "$.repository.branch") }),
        ...(repository.headSha === undefined ? {} : { headSha: stringValue(repository.headSha, "$.repository.headSha") }),
        ...(repository.status === undefined ? {} : { status: stringValue(repository.status, "$.repository.status", true) }),
        files: stringArray(repository.files, "$.repository.files"),
        governance: Object.fromEntries(
          Object.entries(recordValue(repository.governance, "$.repository.governance")).map(([key, raw]) => [
            key,
            stringValue(raw, `$.repository.governance.${key}`, true),
          ]),
        ),
      },
      attempt: integerValue(value.attempt, "$.attempt", 0),
      actionStep: integerValue(value.actionStep, "$.actionStep", 0),
      mode: enumValue(value.mode, ["PLAN", "IMPLEMENT", "REPAIR", "REVIEW"] as const, "$.mode"),
      priorEvidence: value.priorEvidence.map((item) => evidenceRecordSchema.parse(item)),
      verificationResults: value.verificationResults.map((item) => verificationResultSchema.parse(item)),
    };
  },
};

export const workerResultSchema: Schema<WorkerResult> = {
  name: "WorkerResult",
  parse(input) {
    const value = object(input);
    if (!Array.isArray(value.toolRequests)) throw new SchemaError("$.toolRequests must be an array");
    return {
      summary: stringValue(value.summary, "$.summary", true),
      readyForVerification: booleanValue(value.readyForVerification, "$.readyForVerification"),
      toolRequests: value.toolRequests.map((item) => toolRequestSchema.parse(item)),
      artifacts: stringArray(value.artifacts, "$.artifacts"),
      ...(value.externalRunId === undefined ? {} : { externalRunId: stringValue(value.externalRunId, "$.externalRunId") }),
      ...(value.externalUrl === undefined ? {} : { externalUrl: stringValue(value.externalUrl, "$.externalUrl") }),
      providerMetadata: recordValue(value.providerMetadata, "$.providerMetadata"),
    };
  },
};

export const planResultSchema: Schema<PlanResult> = {
  name: "PlanResult",
  parse(input) {
    const value = object(input);
    return {
      summary: stringValue(value.summary, "$.summary", true),
      steps: stringArray(value.steps, "$.steps"),
      risks: stringArray(value.risks, "$.risks"),
    };
  },
};

export const reviewResultSchema: Schema<ReviewResult> = {
  name: "ReviewResult",
  parse(input) {
    const value = object(input);
    return {
      summary: stringValue(value.summary, "$.summary", true),
      approved: booleanValue(value.approved, "$.approved"),
      findings: stringArray(value.findings, "$.findings"),
      recommendedAction: enumValue(value.recommendedAction, NEXT_ACTIONS, "$.recommendedAction"),
    };
  },
};

export const completionAssessmentSchema: Schema<CompletionAssessment> = {
  name: "CompletionAssessment",
  parse(input) {
    const value = object(input);
    return {
      action: enumValue(value.action, NEXT_ACTIONS, "$.action"),
      confidence: numberValue(value.confidence, "$.confidence", 0, 1),
      reasons: stringArray(value.reasons, "$.reasons"),
    };
  },
};

export const classificationSchema: Schema<import("./types.js").Classification> = {
  name: "Classification",
  parse(input) {
    const value = object(input);
    return {
      scope: stringValue(value.scope, "$.scope"),
      risk: enumValue(value.risk, RISK_LEVELS, "$.risk"),
      complexity: enumValue(value.complexity, COMPLEXITY_LEVELS, "$.complexity"),
      uncertainty: numberValue(value.uncertainty, "$.uncertainty", 0, 1),
      recommendedWorker: enumValue(value.recommendedWorker, ["CODEX", "JULES", "HUMAN"] as const, "$.recommendedWorker"),
      reasons: stringArray(value.reasons, "$.reasons"),
      requiresSeniorReview: booleanValue(value.requiresSeniorReview, "$.requiresSeniorReview"),
    };
  },
};
