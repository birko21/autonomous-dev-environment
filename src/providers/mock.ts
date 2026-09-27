import { randomUUID } from "node:crypto";
import type {
  Classification,
  CompletionAssessment,
  PlanResult,
  ReviewResult,
  SummaryResult,
  WorkerRequest,
  WorkerResult,
} from "../domain/types.js";
import type {
  ClassificationRequest,
  CompletionAssessmentRequest,
  Provider,
  ProviderDescriptor,
  SummaryRequest,
} from "./provider.js";

function riskFromText(text: string): Classification["risk"] {
  const normalized = text.toLowerCase();
  if (/(production|payment|authentication|authorization|rbac|secret|database migration|drop table|delete data)/u.test(normalized)) {
    return "HIGH";
  }
  if (/(ambiguous|unknown|unclear)/u.test(normalized)) return "ESCALATE";
  if (/(architecture|multi-service|migration)/u.test(normalized)) return "MEDIUM";
  return "LOW";
}

export class DeterministicJevProvider implements Provider {
  readonly descriptor: ProviderDescriptor = {
    id: "deterministic-jev",
    vendor: "local",
    model: "deterministic-rules-v1",
    mode: "deterministic",
    relativeCost: 0,
    capabilities: ["classify", "assessCompletion", "review", "summarize", "plan", "implement", "repair"],
  };

  async classify(request: ClassificationRequest): Promise<Classification> {
    const risk = riskFromText(`${request.task.title}\n${request.task.description}\n${request.task.labels.join(" ")}`);
    return {
      scope: request.task.scope.allowedPaths.join(", "),
      risk,
      complexity: request.task.acceptanceCriteria.length > 8 ? "HIGH" : request.task.acceptanceCriteria.length > 3 ? "MEDIUM" : "LOW",
      uncertainty: risk === "ESCALATE" ? 0.8 : 0.05,
      recommendedWorker: risk === "ESCALATE" ? "HUMAN" : "CODEX",
      reasons: ["Local deterministic decision policy used; no model confidence substitutes for verification."],
      requiresSeniorReview: risk === "HIGH",
    };
  }

  async assessCompletion(request: CompletionAssessmentRequest): Promise<CompletionAssessment> {
    const failed = request.verificationResults.filter((result) => result.required && result.status !== "PASS");
    if (failed.length === 0) {
      return { action: "COMPLETE", confidence: 1, reasons: ["All required deterministic checks passed."] };
    }
    if (request.attempt < request.maxRetries) {
      return { action: "RETRY", confidence: 1, reasons: [`${failed.length} required check(s) failed.`] };
    }
    return { action: "ESCALATE", confidence: 1, reasons: ["Required checks still fail after bounded retries."] };
  }

  async plan(request: WorkerRequest): Promise<PlanResult> {
    return { summary: `Deterministic plan for ${request.task.id}`, steps: ["Execute scoped worker action", "Verify deterministically"], risks: [] };
  }

  async implement(): Promise<WorkerResult> {
    return { summary: "Decision provider does not implement code in normal routing.", readyForVerification: true, toolRequests: [], artifacts: [], providerMetadata: {} };
  }

  async repair(): Promise<WorkerResult> {
    return this.implement();
  }

  async review(request: WorkerRequest): Promise<ReviewResult> {
    const failed = request.verificationResults.some((result) => result.required && result.status !== "PASS");
    return { summary: failed ? "Required verification has failures." : "Required verification is green.", approved: !failed, findings: failed ? ["Resolve deterministic verification failures."] : [], recommendedAction: failed ? "RETRY" : "COMPLETE" };
  }

  async summarize(request: SummaryRequest): Promise<SummaryResult> {
    return { text: `${request.task.id}: ${request.verificationResults.filter((v) => v.required && v.status === "PASS").length} required checks passed.` };
  }
}

export class MockCodexProvider implements Provider {
  readonly descriptor: ProviderDescriptor = {
    id: "mock-codex",
    vendor: "openai",
    model: "mock-codex",
    mode: "mock",
    relativeCost: 1,
    capabilities: ["classify", "plan", "implement", "review", "repair", "summarize", "assessCompletion"],
  };

  async classify(request: ClassificationRequest): Promise<Classification> {
    return new DeterministicJevProvider().classify(request);
  }

  async plan(request: WorkerRequest): Promise<PlanResult> {
    return {
      summary: `Mock coding plan for ${request.task.title}`,
      steps: ["Write scoped output", "Run deterministic verification", "Repair once if verification fails"],
      risks: [],
    };
  }

  async implement(request: WorkerRequest): Promise<WorkerResult> {
    const demo = request.task.labels.includes("demo");
    return {
      summary: demo ? "Write intentionally failing first-pass demo output." : "Create a harmless scoped implementation marker.",
      readyForVerification: true,
      toolRequests: [
        {
          id: `tool-${randomUUID()}`,
          name: "write_file",
          purpose: "Apply the mock implementation inside the permitted workspace.",
          arguments: {
            path: demo ? "demo-output/result.txt" : "automation-output/result.txt",
            content: demo ? "BROKEN\n" : "PASS\n",
          },
          idempotencyKey: `${request.runId}:implement:${request.attempt}:${request.actionStep}`,
        },
      ],
      artifacts: [],
      providerMetadata: { mock: true },
    };
  }

  async repair(request: WorkerRequest): Promise<WorkerResult> {
    const demo = request.task.labels.includes("demo");
    return {
      summary: "Repair the failing deterministic demo artifact.",
      readyForVerification: true,
      toolRequests: [
        {
          id: `tool-${randomUUID()}`,
          name: "write_file",
          purpose: "Repair the scoped file after failed verification.",
          arguments: {
            path: demo ? "demo-output/result.txt" : "automation-output/result.txt",
            content: "PASS\n",
          },
          idempotencyKey: `${request.runId}:repair:${request.attempt}:${request.actionStep}`,
        },
      ],
      artifacts: [],
      providerMetadata: { mock: true },
    };
  }

  async review(request: WorkerRequest): Promise<ReviewResult> {
    return new DeterministicJevProvider().review(request);
  }

  async summarize(request: SummaryRequest): Promise<SummaryResult> {
    return { text: `Mock Codex completed ${request.task.title}. ${request.evidenceSummary}` };
  }

  async assessCompletion(request: CompletionAssessmentRequest): Promise<CompletionAssessment> {
    return new DeterministicJevProvider().assessCompletion(request);
  }
}

export class MockJulesProvider extends MockCodexProvider {
  override readonly descriptor: ProviderDescriptor = {
    id: "mock-jules",
    vendor: "google",
    model: "mock-jules",
    mode: "mock",
    relativeCost: 0.5,
    capabilities: ["classify", "plan", "implement", "review", "repair", "summarize", "assessCompletion"],
  };

  override async review(request: WorkerRequest): Promise<ReviewResult> {
    const base = await super.review(request);
    return { ...base, summary: `Mock Jules review: ${base.summary}` };
  }
}
