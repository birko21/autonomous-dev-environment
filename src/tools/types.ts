import type { PolicyDecision, RunRecord, ToolRequest } from "../domain/types.js";

export type ToolClassification = "READ" | "WRITE" | "DESTRUCTIVE";

export interface ToolDescriptor {
  name: string;
  purpose: string;
  classification: ToolClassification;
  permittedPaths: string[];
  networkRequired: boolean;
  timeoutMs: number;
  approvalRequired: boolean;
  recovery: string;
}

export interface ToolExecutionContext {
  workspace: string;
  run: RunRecord;
  signal: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
}

export interface RegisteredTool {
  descriptor: ToolDescriptor;
  execute(request: ToolRequest, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolPolicyContext {
  run: RunRecord;
  workspace: string;
  approved: boolean;
}

export interface EvaluatedToolRequest {
  request: ToolRequest;
  decision: PolicyDecision;
  descriptor?: ToolDescriptor;
}
