# Ticket 009: Epic 8 — GitHub integration

## Status

COMPLETE — implementation, local validation, and required PR CI passed.

## Dependencies

- Ticket 002

## Acceptance Criteria

- [x] GitHub adapter supports repository inspection, branch creation, changed files/diffs, PR creation, check status, review requests, and escalation comments/labels.
- [x] Credentials are environment-supplied and adapter operations are contract-tested.
- [x] No autonomous merge operation exists and branch protection is not bypassed.

## Verification gate

Do not mark this ticket COMPLETE until `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run security`, and `npm run build` pass in required GitHub CI for the implementation PR.
