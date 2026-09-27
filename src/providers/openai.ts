import {
  classificationSchema,
  completionAssessmentSchema,
  planResultSchema,
  reviewResultSchema,
  workerResultSchema,
  type Schema,
} from "../domain/schemas.js";
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
import { withTimeout } from "../utils/time.js";

interface OpenAIResponse {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: Record<string, unknown>;
}

const classificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scope", "risk", "complexity", "uncertainty", "recommendedWorker", "reasons", "requiresSeniorReview"],
  properties: {
    scope: { type: "string" },
    risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "ESCALATE"] },
    complexity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    uncertainty: { type: "number", minimum: 0, maximum: 1 },
    recommendedWorker: { type: "string", enum: ["CODEX", "JULES", "HUMAN"] },
    reasons: { type: "array", items: { type: "string" } },
    requiresSeniorReview: { type: "boolean" },
  },
} as const;

const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps", "risks"],
  properties: {
    summary: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
  },
} as const;

const internalWorkerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "readyForVerification", "toolRequests", "artifacts"],
  properties: {
    summary: { type: "string" },
    readyForVerification: { type: "boolean" },
    toolRequests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "purpose", "argumentsJson", "idempotencyKey"],
        properties: {
          id: { type: "string" },
          name: { type: "string", enum: ["read_file", "write_file", "delete_file", "run_command"] },
          purpose: { type: "string" },
          argumentsJson: { type: "string" },
          idempotencyKey: { type: "string" },
        },
      },
    },
    artifacts: { type: "array", items: { type: "string" } },
  },
} as const;

const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "approved", "findings", "recommendedAction"],
  properties: {
    summary: { type: "string" },
    approved: { type: "boolean" },
    findings: { type: "array", items: { type: "string" } },
    recommendedAction: { type: "string", enum: ["CONTINUE", "RETRY", "VERIFY", "ESCALATE", "COMPLETE"] },
  },
} as const;

const completionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "confidence", "reasons"],
  properties: {
    action: { type: "string", enum: ["CONTINUE", "RETRY", "VERIFY", "ESCALATE", "COMPLETE"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasons: { type: "array", items: { type: "string" } },
  },
} as const;

const summaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: { text: { type: "string" } },
} as const;

function extractOutputText(response: OpenAIResponse): string {
  const pieces: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") pieces.push(content.text);
    }
  }
  if (pieces.length === 0) throw new Error("OpenAI response contained no output_text content");
  return pieces.join("\n");
}

function parseWorkerInternal(input: unknown): WorkerResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Worker output must be an object");
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.toolRequests)) throw new Error("Worker toolRequests must be an array");
  const toolRequests = raw.toolRequests.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("Invalid tool request");
    const tool = item as Record<string, unknown>;
    if (typeof tool.argumentsJson !== "string") throw new Error("Tool argumentsJson must be a string");
    return {
      id: tool.id,
      name: tool.name,
      purpose: tool.purpose,
      arguments: JSON.parse(tool.argumentsJson) as unknown,
      idempotencyKey: tool.idempotencyKey,
    };
  });
  return workerResultSchema.parse({
    summary: raw.summary,
    readyForVerification: raw.readyForVerification,
    toolRequests,
    artifacts: raw.artifacts,
    providerMetadata: {},
  });
}

export interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
}

export class OpenAICodexProvider implements Provider {
  readonly descriptor: ProviderDescriptor;
  private readonly baseUrl: string;

  constructor(private readonly config: OpenAIProviderConfig) {
    if (!config.apiKey) throw new Error("OPENAI_API_KEY is required for live OpenAI provider");
    if (!config.model) throw new Error("OPENAI_MODEL is required; no undocumented Codex model is assumed");
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/u, "");
    this.descriptor = {
      id: "openai-codex",
      vendor: "openai",
      model: config.model,
      mode: "live",
      relativeCost: 2,
      capabilities: ["classify", "plan", "implement", "review", "repair", "summarize", "assessCompletion"],
    };
  }

  private async requestJson<T>(
    operation: string,
    instructions: string,
    input: unknown,
    schemaName: string,
    jsonSchema: Record<string, unknown>,
    parser: Schema<T> | ((value: unknown) => T),
  ): Promise<T> {
    const response = await withTimeout(
      async (signal) => {
        const raw = await fetch(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            store: false,
            instructions,
            input: JSON.stringify(input),
            text: {
              format: {
                type: "json_schema",
                name: schemaName,
                strict: true,
                schema: jsonSchema,
              },
            },
          }),
          signal,
        });
        if (!raw.ok) {
          const body = await raw.text();
          throw new Error(`OpenAI ${operation} failed with HTTP ${raw.status}: ${body.slice(0, 500)}`);
        }
        return (await raw.json()) as OpenAIResponse;
      },
      this.config.timeoutMs,
      `OpenAI ${operation}`,
    );

    const decoded = JSON.parse(extractOutputText(response)) as unknown;
    return typeof parser === "function" ? parser(decoded) : parser.parse(decoded);
  }

  async classify(request: ClassificationRequest): Promise<Classification> {
    return this.requestJson(
      "classify",
      "Classify the software task. Do not decide tool safety. Return only the required schema.",
      request,
      "classification",
      classificationJsonSchema,
      classificationSchema,
    );
  }

  async plan(request: WorkerRequest): Promise<PlanResult> {
    return this.requestJson(
      "plan",
      "Plan the smallest complete implementation within the allowed paths. Do not claim checks ran.",
      request,
      "plan",
      planJsonSchema,
      planResultSchema,
    );
  }

  private async worker(operation: "implement" | "repair", request: WorkerRequest): Promise<WorkerResult> {
    return this.requestJson(
      operation,
      [
        "Act as the coding worker. Propose only registered tool requests; never execute side effects yourself.",
        "Use read_file, write_file, delete_file, or run_command.",
        "argumentsJson must be a JSON object string. For write_file use {\"path\":\"...\",\"content\":\"...\"}; for read/delete use {\"path\":\"...\"}; for run_command use {\"executable\":\"...\",\"args\":[\"...\"]}.",
        "Stay inside the task scope and never request secrets, production changes, merges, or branch-protection bypasses.",
      ].join(" "),
      request,
      "worker_result",
      internalWorkerJsonSchema,
      parseWorkerInternal,
    );
  }

  async implement(request: WorkerRequest): Promise<WorkerResult> {
    return this.worker("implement", request);
  }

  async repair(request: WorkerRequest): Promise<WorkerResult> {
    return this.worker("repair", request);
  }

  async review(request: WorkerRequest): Promise<ReviewResult> {
    return this.requestJson(
      "review",
      "Review evidence and code-task context. Deterministic checks are authoritative. Never approve with a required failing check.",
      request,
      "review",
      reviewJsonSchema,
      reviewResultSchema,
    );
  }

  async summarize(request: SummaryRequest): Promise<SummaryResult> {
    return this.requestJson(
      "summarize",
      "Summarize only the supplied evidence. Do not invent tests or completion.",
      request,
      "summary",
      summaryJsonSchema,
      (value) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid summary");
        const text = (value as Record<string, unknown>).text;
        if (typeof text !== "string") throw new Error("Invalid summary text");
        return { text };
      },
    );
  }

  async assessCompletion(request: CompletionAssessmentRequest): Promise<CompletionAssessment> {
    return this.requestJson(
      "assess completion",
      "Choose the next action from the bounded set. A required deterministic failure can never be COMPLETE.",
      request,
      "completion_assessment",
      completionJsonSchema,
      completionAssessmentSchema,
    );
  }
}
