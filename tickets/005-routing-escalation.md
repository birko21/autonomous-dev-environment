# Ticket 005: Epic 4 — Routing and escalation

## Status

COMPLETE — implementation, local validation, and required PR CI passed.

## Dependencies

- Ticket 003
- Ticket 004

## Acceptance Criteria

- [x] LOW/MEDIUM/HIGH/ESCALATE routing is configurable and evidence-driven.
- [x] Deterministic risk detection independently gates auth, payments, production infrastructure, destructive data, secrets, and ambiguity.
- [x] Retries/action steps are bounded; model availability alone never causes escalation.

## Verification gate

Do not mark this ticket COMPLETE until `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run security`, and `npm run build` pass in required GitHub CI for the implementation PR.
