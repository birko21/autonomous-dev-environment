import type {
  Classification,
  CompletionAssessment,
  PlanResult,
  ReviewResult,
  SummaryResult,
  Task,
  VerificationResult,
  WorkerRequest,
  WorkerResult,
} from "../domain/types.js";

export type ProviderCapability =
  | "classify"
  | "plan"
  | "implement"
  | "review"
  | "repair"
  | "summarize"
  | "assessCompletion";

export interface ProviderDescriptor {
  id: string;
  vendor: string;
  model: string;
  mode: "mock" | "live" | "deterministic";
  relativeCost: number;
  capabilities: readonly ProviderCapability[];
}

export interface ClassificationRequest {
  task: Task;
  repositorySummary: string;
}

export interface CompletionAssessmentRequest {
  task: Task;
  verificationResults: VerificationResult[];
  attempt: number;
  maxRetries: number;
}

export interface SummaryRequest {
  task: Task;
  evidenceSummary: string;
  verificationResults: VerificationResult[];
}

export interface Provider {
  readonly descriptor: ProviderDescriptor;
  classify(request: ClassificationRequest): Promise<Classification>;
  plan(request: WorkerRequest): Promise<PlanResult>;
  implement(request: WorkerRequest): Promise<WorkerResult>;
  review(request: WorkerRequest): Promise<ReviewResult>;
  repair(request: WorkerRequest): Promise<WorkerResult>;
  summarize(request: SummaryRequest): Promise<SummaryResult>;
  assessCompletion(request: CompletionAssessmentRequest): Promise<CompletionAssessment>;
}

export class UnsupportedProviderCapabilityError extends Error {
  constructor(providerId: string, capability: ProviderCapability) {
    super(`Provider ${providerId} does not support capability ${capability}`);
    this.name = "UnsupportedProviderCapabilityError";
  }
}

export function requireCapability(provider: Provider, capability: ProviderCapability): void {
  if (!provider.descriptor.capabilities.includes(capability)) {
    throw new UnsupportedProviderCapabilityError(provider.descriptor.id, capability);
  }
}
