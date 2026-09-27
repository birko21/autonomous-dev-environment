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
import { UnsupportedProviderCapabilityError } from "./provider.js";
import { withTimeout } from "../utils/time.js";

interface ChoiceAnswer {
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

interface JevResponse {
  answers?: Record<string, ChoiceAnswer>;
}

export interface TypesafeJevConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

function choiceQuestion(instructions: string, options: readonly string[]): Record<string, unknown> {
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(options.map((option) => [option, null])),
  };
}

function getChoice(response: JevResponse, key: string, allowed: readonly string[]): { value: string; confidence: number } {
  const answer = response.answers?.[key];
  if (!answer || typeof answer.choice !== "string" || !allowed.includes(answer.choice)) {
    throw new Error(`TypeSafe response missing valid ${key} choice`);
  }
  const confidence = typeof answer.confidence === "number" && Number.isFinite(answer.confidence)
    ? Math.max(0, Math.min(1, answer.confidence))
    : Math.max(...Object.values(answer.probabilities ?? { unknown: 0 }));
  return { value: answer.choice, confidence };
}

export class TypesafeJevProvider implements Provider {
  readonly descriptor: ProviderDescriptor;
  private readonly baseUrl: string;

  constructor(private readonly config: TypesafeJevConfig) {
    if (!config.apiKey) throw new Error("TYPESAFE_API_KEY is required for live Jev");
    if (!config.baseUrl) throw new Error("TYPESAFE_BASE_URL is required and must point to the documented TypeSafe API host");
    this.baseUrl = config.baseUrl.replace(/\/+$/u, "");
    this.descriptor = {
      id: "typesafe-jev",
      vendor: "typesafe",
      model: config.model,
      mode: "live",
      relativeCost: 0.1,
      capabilities: ["classify", "assessCompletion"],
    };
  }

  private async decide(state: unknown, questions: Record<string, unknown>): Promise<JevResponse> {
    return withTimeout(
      async (signal) => {
        const response = await fetch(`${this.baseUrl}/v1/systemone`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ state, questions, model: this.config.model }),
          signal,
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`TypeSafe Jev failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
        }
        return (await response.json()) as JevResponse;
      },
      this.config.timeoutMs,
      "TypeSafe Jev decision",
    );
  }

  async classify(request: ClassificationRequest): Promise<Classification> {
    const response = await this.decide(
      {
        task: request.task,
        repositorySummary: request.repositorySummary,
      },
      {
        risk: choiceQuestion("Classify execution risk.", ["LOW", "MEDIUM", "HIGH", "ESCALATE"]),
        complexity: choiceQuestion("Classify implementation complexity.", ["LOW", "MEDIUM", "HIGH"]),
        worker: choiceQuestion("Choose the smallest capable worker.", ["CODEX", "JULES", "HUMAN"]),
        review: choiceQuestion("Does this task require senior or multi-worker review?", ["YES", "NO"]),
      },
    );
    const risk = getChoice(response, "risk", ["LOW", "MEDIUM", "HIGH", "ESCALATE"]);
    const complexity = getChoice(response, "complexity", ["LOW", "MEDIUM", "HIGH"]);
    const worker = getChoice(response, "worker", ["CODEX", "JULES", "HUMAN"]);
    const review = getChoice(response, "review", ["YES", "NO"]);
    const confidence = Math.min(risk.confidence, complexity.confidence, worker.confidence, review.confidence);
    return {
      scope: request.task.scope.allowedPaths.join(", "),
      risk: risk.value as Classification["risk"],
      complexity: complexity.value as Classification["complexity"],
      uncertainty: 1 - confidence,
      recommendedWorker: worker.value as Classification["recommendedWorker"],
      reasons: [`Jev typed decisions; minimum confidence ${confidence.toFixed(3)}.`],
      requiresSeniorReview: review.value === "YES",
    };
  }

  async assessCompletion(request: CompletionAssessmentRequest): Promise<CompletionAssessment> {
    const response = await this.decide(
      request,
      {
        action: choiceQuestion("Choose the next control action from the bounded set.", ["CONTINUE", "RETRY", "VERIFY", "ESCALATE", "COMPLETE"]),
      },
    );
    const action = getChoice(response, "action", ["CONTINUE", "RETRY", "VERIFY", "ESCALATE", "COMPLETE"]);
    return {
      action: action.value as CompletionAssessment["action"],
      confidence: action.confidence,
      reasons: [`Jev typed action with confidence ${action.confidence.toFixed(3)}.`],
    };
  }

  async plan(_request: WorkerRequest): Promise<PlanResult> {
    throw new UnsupportedProviderCapabilityError(this.descriptor.id, "plan");
  }
  async implement(_request: WorkerRequest): Promise<WorkerResult> {
    throw new UnsupportedProviderCapabilityError(this.descriptor.id, "implement");
  }
  async review(_request: WorkerRequest): Promise<ReviewResult> {
    throw new UnsupportedProviderCapabilityError(this.descriptor.id, "review");
  }
  async repair(_request: WorkerRequest): Promise<WorkerResult> {
    throw new UnsupportedProviderCapabilityError(this.descriptor.id, "repair");
  }
  async summarize(_request: SummaryRequest): Promise<SummaryResult> {
    throw new UnsupportedProviderCapabilityError(this.descriptor.id, "summarize");
  }
}
