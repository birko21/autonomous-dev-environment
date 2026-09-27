# Ticket 010: Epic 9 — CLI and local demonstration

## Status

COMPLETE — implementation, local validation, and required PR CI passed.

## Dependencies

- Ticket 003
- Ticket 004
- Ticket 005
- Ticket 006
- Ticket 007
- Ticket 008
- Ticket 009

## Acceptance Criteria

- [x] CLI can create/run/resume/status/approve/reject/cancel/evidence/summary tasks and runs.
- [x] Credential-free demo exercises classification, dispatch, policy, execution, failed verification, repair, evidence, and completion.
- [x] Resumption is integration-tested across a fresh runtime instance.

## Verification gate

Do not mark this ticket COMPLETE until `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run security`, and `npm run build` pass in required GitHub CI for the implementation PR.
