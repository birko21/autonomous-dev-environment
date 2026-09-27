# Ticket 007: Epic 6 — Deterministic verification

## Status

COMPLETE — implementation, local validation, and required PR CI passed.

## Dependencies

- Ticket 002

## Acceptance Criteria

- [x] Executable checks cover repository integrity, lint, typecheck, unit/integration tests, build, security, changed-file scope, secret/private-key detection, and Git diff validation.
- [x] Failed verification evidence is retained.
- [x] Completion is impossible while a required check is not PASS.

## Verification gate

Do not mark this ticket COMPLETE until `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run security`, and `npm run build` pass in required GitHub CI for the implementation PR.
