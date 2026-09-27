import type { PolicyDecision, RunRecord, ToolRequest } from "../domain/types.js";
import { withTimeout } from "../utils/time.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolPolicyEngine } from "./policy.js";
import type { ToolResult } from "./types.js";

export interface ToolExecutionOutcome {
  decision: PolicyDecision;
  result?: ToolResult;
}

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: ToolPolicyEngine,
  ) {}

  evaluate(request: ToolRequest, run: RunRecord, approved = false): PolicyDecision {
    return this.policy.evaluate(request, { run, workspace: run.workspace, approved });
  }

  async execute(request: ToolRequest, run: RunRecord, approved = false): Promise<ToolExecutionOutcome> {
    const decision = this.evaluate(request, run, approved);
    if (decision.outcome !== "ALLOW") return { decision };
    const tool = this.registry.get(request.name);
    if (!tool) return { decision: { ...decision, outcome: "DENY", reasons: ["Tool disappeared from registry before execution."] } };
    const result = await withTimeout(async (signal) => tool.execute(request, { workspace: run.workspace, run, signal }), tool.descriptor.timeoutMs, `tool:${request.name}`);
    return { decision, result };
  }
}
