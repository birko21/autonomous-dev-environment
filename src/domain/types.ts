export const RUN_STATES = [
  "RECEIVED",
  "CLASSIFIED",
  "DISPATCHED",
  "RUNNING",
  "AWAITING_APPROVAL",
  "VERIFYING",
  "RETRYING",
  "ESCALATED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "ESCALATE"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const COMPLEXITY_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

export const NEXT_ACTIONS = [
  "CONTINUE",
  "RETRY",
  "VERIFY",
  "ESCALATE",
  "COMPLETE",
] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

export interface AcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface RepositoryRef {
  owner?: string;
  name?: string;
  path?: string;
  baseBranch: string;
}

export interface TaskScope {
  allowedPaths: string[];
  forbiddenPaths: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  repository: RepositoryRef;
  acceptanceCriteria: AcceptanceCriterion[];
  scope: TaskScope;
  labels: string[];
  createdAt: string;
}

export interface Ticket {
  id: string;
  title: string;
  epic: string;
  description: string;
  dependencies: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETE";
}

export interface RepositorySnapshot {
  root: string;
  gitAvailable: boolean;
  branch?: string;
  headSha?: string;
  status?: string;
  files: string[];
  governance: Record<string, string>;
}

export interface Classification {
  scope: string;
  risk: RiskLevel;
  complexity: ComplexityLevel;
  uncertainty: number;
  recommendedWorker: "CODEX" | "JULES" | "HUMAN";
  reasons: string[];
  requiresSeniorReview: boolean;
}

export interface WorkerRequest {
  runId: string;
  task: Task;
  repository: RepositorySnapshot;
  attempt: number;
  actionStep: number;
  mode: "PLAN" | "IMPLEMENT" | "REPAIR" | "REVIEW";
  priorEvidence: EvidenceRecord[];
  verificationResults: VerificationResult[];
}

export interface ToolRequest {
  id: string;
  name: string;
  purpose: string;
  arguments: Record<string, unknown>;
  idempotencyKey: string;
}

export type PolicyOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyDecision {
  requestId: string;
  outcome: PolicyOutcome;
  reasons: string[];
  decidedAt: string;
}

export type VerificationStatus = "PASS" | "FAIL" | "SKIP";

export interface VerificationResult {
  id: string;
  check: string;
  required: boolean;
  status: VerificationStatus;
  command?: string;
  exitCode?: number;
  output: string;
  durationMs: number;
  recordedAt: string;
}

export type EvidenceKind =
  | "STATE"
  | "PROVIDER"
  | "TOOL"
  | "POLICY"
  | "COMMAND"
  | "DIFF"
  | "VERIFICATION"
  | "RETRY"
  | "ESCALATION"
  | "APPROVAL"
  | "SUMMARY"
  | "ERROR";

export interface EvidenceRecord {
  id: string;
  runId: string;
  taskId: string;
  kind: EvidenceKind;
  timestamp: string;
  source: string;
  message: string;
  data: Record<string, unknown>;
  latencyMs?: number;
  costUsd?: number;
}

export interface Escalation {
  id: string;
  runId: string;
  code:
    | "SECURITY_SENSITIVE"
    | "AUTHORIZATION"
    | "PAYMENTS"
    | "PRODUCTION_INFRA"
    | "DESTRUCTIVE_DATABASE"
    | "AMBIGUITY"
    | "REPEATED_FAILURE"
    | "FAILED_VERIFICATION"
    | "POLICY_DENIED"
    | "PROVIDER_FAILURE"
    | "HUMAN_REQUESTED";
  reason: string;
  evidenceIds: string[];
  createdAt: string;
  resolvedAt?: string;
}

export interface PendingApproval {
  id: string;
  type: "TOOL" | "RISK_GATE" | "ESCALATION";
  request?: ToolRequest;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  resolvedAt?: string;
  note?: string;
}

export interface WorkerResult {
  summary: string;
  readyForVerification: boolean;
  toolRequests: ToolRequest[];
  artifacts: string[];
  externalRunId?: string;
  externalUrl?: string;
  providerMetadata: Record<string, unknown>;
}

export interface PlanResult {
  summary: string;
  steps: string[];
  risks: string[];
}

export interface ReviewResult {
  summary: string;
  approved: boolean;
  findings: string[];
  recommendedAction: NextAction;
}

export interface SummaryResult {
  text: string;
}

export interface CompletionAssessment {
  action: NextAction;
  confidence: number;
  reasons: string[];
}

export interface RunSummary {
  runId: string;
  taskId: string;
  state: RunState;
  startedAt: string;
  finishedAt?: string;
  attempts: number;
  selectedWorkers: string[];
  checks: VerificationResult[];
  escalations: Escalation[];
  changedFiles: string[];
  outcome: string;
}

export interface CompletionResult {
  runId: string;
  completed: boolean;
  state: RunState;
  requiredChecksPassed: boolean;
  summary: RunSummary;
}

export interface RunRecord {
  schemaVersion: 1;
  id: string;
  revision: number;
  task: Task;
  state: RunState;
  createdAt: string;
  updatedAt: string;
  workspace: string;
  classification?: Classification;
  selectedWorker?: string;
  reviewWorker?: string;
  attempt: number;
  actionStep: number;
  maxRetries: number;
  pendingWorkerResult?: WorkerResult;
  nextToolIndex: number;
  executedTools: Record<string, { requestId: string; result: Record<string, unknown> }>;
  pendingApproval?: PendingApproval;
  verificationResults: VerificationResult[];
  escalations: Escalation[];
  summary?: RunSummary;
  cancelRequested: boolean;
  riskApproved: boolean;
}
