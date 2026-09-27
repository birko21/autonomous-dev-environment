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
import { sleep, withTimeout } from "../utils/time.js";

interface JulesSession {
  id?: string;
  name?: string;
  state?: string;
  url?: string;
  outputs?: Array<{ pullRequest?: { url?: string; title?: string; description?: string } }>;
}

interface JulesActivities {
  activities?: Array<{
    description?: string;
    agentMessaged?: { agentMessage?: string };
    sessionFailed?: { reason?: string };
  }>;
}

export interface JulesProviderConfig {
  apiKey: string;
  source: string;
  startingBranch: string;
  baseUrl?: string;
  timeoutMs: number;
  pollIntervalMs?: number;
}

export class JulesProvider implements Provider {
  readonly descriptor: ProviderDescriptor = {
    id: "google-jules",
    vendor: "google",
    model: "jules",
    mode: "live",
    relativeCost: 1.5,
    capabilities: ["plan", "implement", "review", "repair", "summarize"],
  };

  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;

  constructor(private readonly config: JulesProviderConfig) {
    if (!config.apiKey) throw new Error("JULES_API_KEY is required for live Jules");
    if (!config.source) throw new Error("JULES_SOURCE is required for live Jules repository sessions");
    this.baseUrl = (config.baseUrl ?? "https://jules.googleapis.com/v1alpha").replace(/\/+$/u, "");
    this.pollIntervalMs = config.pollIntervalMs ?? 2_000;
  }

  private headers(): Record<string, string> {
    return { "x-goog-api-key": this.config.apiKey, "content-type": "application/json" };
  }

  private async createSession(prompt: string, title: string): Promise<JulesSession> {
    return withTimeout(
      async (signal) => {
        const sourceContext = {
          source: this.config.source,
          githubRepoContext: { startingBranch: this.config.startingBranch },
        };
        const response = await fetch(`${this.baseUrl}/sessions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            prompt,
            title,
            sourceContext,
            requirePlanApproval: false,
          }),
          signal,
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Jules create session failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
        }
        return (await response.json()) as JulesSession;
      },
      this.config.timeoutMs,
      "Jules session creation",
    );
  }

  private async getSession(sessionNameOrId: string, signal: AbortSignal): Promise<JulesSession> {
    const id = sessionNameOrId.replace(/^sessions\//u, "");
    const response = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(id)}`, {
      headers: this.headers(),
      signal,
    });
    if (!response.ok) throw new Error(`Jules get session failed with HTTP ${response.status}`);
    return (await response.json()) as JulesSession;
  }

  private async getActivities(sessionNameOrId: string, signal: AbortSignal): Promise<JulesActivities> {
    const id = sessionNameOrId.replace(/^sessions\//u, "");
    const response = await fetch(`${this.baseUrl}/sessions/${encodeURIComponent(id)}/activities?pageSize=100`, {
      headers: this.headers(),
      signal,
    });
    if (!response.ok) throw new Error(`Jules activities failed with HTTP ${response.status}`);
    return (await response.json()) as JulesActivities;
  }

  private async runSession(prompt: string, title: string): Promise<{ session: JulesSession; message: string }> {
    const created = await this.createSession(prompt, title);
    const identifier = created.name ?? created.id;
    if (!identifier) throw new Error("Jules session response contained no name or id");

    return withTimeout(
      async (signal) => {
        for (;;) {
          const session = await this.getSession(identifier, signal);
          if (session.state === "COMPLETED") {
            const activities = await this.getActivities(identifier, signal);
            const messages = (activities.activities ?? [])
              .map((activity) => activity.agentMessaged?.agentMessage)
              .filter((message): message is string => typeof message === "string");
            return { session, message: messages.at(-1) ?? "Jules session completed." };
          }
          if (session.state === "FAILED") {
            const activities = await this.getActivities(identifier, signal);
            const failure = (activities.activities ?? []).map((activity) => activity.sessionFailed?.reason).find(Boolean);
            throw new Error(`Jules session failed: ${failure ?? "unspecified reason"}`);
          }
          if (session.state === "AWAITING_PLAN_APPROVAL" || session.state === "AWAITING_USER_FEEDBACK" || session.state === "PAUSED") {
            throw new Error(`Jules session requires external intervention: ${session.state}`);
          }
          await sleep(this.pollIntervalMs);
        }
      },
      this.config.timeoutMs,
      "Jules session execution",
    );
  }

  async plan(request: WorkerRequest): Promise<PlanResult> {
    const result = await this.runSession(
      `Review this task and return a concise implementation plan only. Do not create a PR or merge anything.\n${JSON.stringify(request.task)}`,
      `Plan ${request.task.id}`,
    );
    return { summary: result.message, steps: [result.message], risks: [] };
  }

  async implement(request: WorkerRequest): Promise<WorkerResult> {
    const result = await this.runSession(
      [
        "Implement the task in your Jules workspace. Do not merge. Do not create a PR automatically.",
        "Respect repository governance and branch protections.",
        JSON.stringify({ task: request.task, verification: request.verificationResults }),
      ].join("\n"),
      `Implement ${request.task.id}`,
    );
    return {
      summary: result.message,
      readyForVerification: true,
      toolRequests: [],
      artifacts: [],
      ...(result.session.id === undefined ? {} : { externalRunId: result.session.id }),
      ...(result.session.url === undefined ? {} : { externalUrl: result.session.url }),
      providerMetadata: {
        state: result.session.state ?? "UNKNOWN",
        remoteWorkspace: true,
        outputs: result.session.outputs ?? [],
      },
    };
  }

  async repair(request: WorkerRequest): Promise<WorkerResult> {
    return this.implement({ ...request, mode: "REPAIR" });
  }

  async review(request: WorkerRequest): Promise<ReviewResult> {
    const result = await this.runSession(
      [
        "Review the task and supplied deterministic verification results. Do not modify or merge anything.",
        "Return findings in plain text. Deterministic failures are authoritative.",
        JSON.stringify({ task: request.task, verification: request.verificationResults }),
      ].join("\n"),
      `Review ${request.task.id}`,
    );
    const failed = request.verificationResults.some((item) => item.required && item.status !== "PASS");
    return {
      summary: result.message,
      approved: !failed,
      findings: failed ? ["Deterministic verification contains required failures."] : [],
      recommendedAction: failed ? "RETRY" : "COMPLETE",
    };
  }

  async summarize(request: SummaryRequest): Promise<SummaryResult> {
    const result = await this.runSession(
      `Summarize this run evidence without changing any repository files.\n${JSON.stringify(request)}`,
      `Summarize ${request.task.id}`,
    );
    return { text: result.message };
  }

  async classify(_request: ClassificationRequest): Promise<Classification> {
    throw new Error("Jules is not configured as the decision-layer classifier; use Jev or deterministic Jev.");
  }

  async assessCompletion(_request: CompletionAssessmentRequest): Promise<CompletionAssessment> {
    throw new Error("Jules is not configured as the decision-layer completion assessor; use Jev or deterministic Jev.");
  }
}
