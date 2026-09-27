import type { Classification, RiskLevel, Task } from "../domain/types.js";
import type { Provider } from "../providers/provider.js";
import { requireCapability } from "../providers/provider.js";
import type { ProviderRegistry } from "../providers/registry.js";

export interface RoutingConfig {
  decisionProvider: string;
  primaryWorker: string;
  lowCostWorker: string;
  reviewWorker: string;
}

export interface RoutingDecision {
  worker: Provider;
  reviewer?: Provider;
  effectiveRisk: RiskLevel;
  approvalRequired: boolean;
  reasons: string[];
}

const HIGH_RISK_RULES: Array<{ pattern: RegExp; risk: RiskLevel; reason: string }> = [
  { pattern: /\b(auth(?:entication|orization)?|rbac|permission model)\b/iu, risk: "HIGH", reason: "authentication or authorization change" },
  { pattern: /\b(payment|billing|credit card|checkout)\b/iu, risk: "HIGH", reason: "payment-sensitive change" },
  { pattern: /\b(production|terraform|kubernetes|cloudformation|infrastructure)\b/iu, risk: "HIGH", reason: "production infrastructure change" },
  { pattern: /\b(drop table|truncate|destructive migration|delete (?:all|production) data)\b/iu, risk: "HIGH", reason: "destructive database/data operation" },
  { pattern: /\b(secret(?:s)? management|rotate (?:key|token|secret)|private key)\b/iu, risk: "HIGH", reason: "secret-management change" },
  { pattern: /\b(ambiguous|unclear|conflicting requirements|unknown requirement)\b/iu, risk: "ESCALATE", reason: "unresolved ambiguity" },
];

export function deterministicRiskGate(task: Task): { risk: RiskLevel; reasons: string[] } {
  const text = `${task.title}\n${task.description}\n${task.labels.join(" ")}`;
  let risk: RiskLevel = "LOW";
  const reasons: string[] = [];
  for (const rule of HIGH_RISK_RULES) {
    if (rule.pattern.test(text)) {
      reasons.push(rule.reason);
      if (rule.risk === "ESCALATE") risk = "ESCALATE";
      else if (risk !== "ESCALATE") risk = "HIGH";
    }
  }
  return { risk, reasons };
}

function strongerRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, ESCALATE: 3 };
  return order[a] >= order[b] ? a : b;
}

export class RoutingPolicy {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly config: RoutingConfig,
  ) {}

  decisionProvider(): Provider {
    const provider = this.registry.get(this.config.decisionProvider);
    requireCapability(provider, "classify");
    requireCapability(provider, "assessCompletion");
    return provider;
  }

  route(task: Task, classification: Classification): RoutingDecision {
    const deterministic = deterministicRiskGate(task);
    const effectiveRisk = strongerRisk(classification.risk, deterministic.risk);
    const reasons = [...classification.reasons, ...deterministic.reasons.map((reason) => `Deterministic risk gate: ${reason}.`)];

    const preferred = classification.complexity === "LOW" ? this.config.lowCostWorker : this.config.primaryWorker;
    const worker = this.registry.get(preferred);
    requireCapability(worker, "implement");
    requireCapability(worker, "repair");

    let reviewer: Provider | undefined;
    if (classification.requiresSeniorReview || effectiveRisk === "HIGH") {
      reviewer = this.registry.get(this.config.reviewWorker);
      requireCapability(reviewer, "review");
    }

    return {
      worker,
      ...(reviewer ? { reviewer } : {}),
      effectiveRisk,
      approvalRequired: effectiveRisk === "HIGH" || effectiveRisk === "ESCALATE",
      reasons,
    };
  }
}
