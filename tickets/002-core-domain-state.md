# Ticket 002: Epic 1 — Core domain and task state

## Status

COMPLETE — implementation, local validation, and required PR CI passed.

## Dependencies

- Ticket 001

## Acceptance Criteria

- [x] Typed runtime schemas exist for Task, Ticket, acceptance criteria, WorkerRequest, ToolRequest, PolicyDecision, VerificationResult, EvidenceRecord, Escalation, RunSummary, and CompletionResult.
- [x] All required run states and allowed transitions are explicit and validated.
- [x] Run state is atomically persisted and resumable after process interruption.

## Verification gate

Do not mark this ticket COMPLETE until `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run security`, and `npm run build` pass in required GitHub CI for the implementation PR.
