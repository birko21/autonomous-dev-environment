import type { RunState } from "../domain/types.js";

export const ALLOWED_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  RECEIVED: ["CLASSIFIED", "FAILED", "CANCELLED"],
  CLASSIFIED: ["DISPATCHED", "AWAITING_APPROVAL", "ESCALATED", "FAILED", "CANCELLED"],
  DISPATCHED: ["RUNNING", "AWAITING_APPROVAL", "ESCALATED", "FAILED", "CANCELLED"],
  RUNNING: ["RUNNING", "AWAITING_APPROVAL", "VERIFYING", "ESCALATED", "FAILED", "CANCELLED"],
  AWAITING_APPROVAL: ["RUNNING", "VERIFYING", "ESCALATED", "CANCELLED", "FAILED"],
  VERIFYING: ["RETRYING", "RUNNING", "ESCALATED", "COMPLETED", "FAILED", "CANCELLED"],
  RETRYING: ["RUNNING", "ESCALATED", "FAILED", "CANCELLED"],
  ESCALATED: ["RUNNING", "RETRYING", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: RunState, to: RunState) {
    super(`Invalid state transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: RunState, to: RunState): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminalState(state: RunState): boolean {
  return state === "COMPLETED" || state === "FAILED" || state === "CANCELLED";
}
