# Implementation Backlog

The repository uses `tickets/` as the executable backlog record. Ticket 001 is the previously completed Phase 1 architecture ticket. The implementation build is decomposed as follows; required CI has passed on implementation PR #7.

| Epic | Ticket | Dependency | Status |
| --- | --- | --- | --- |
| 1 Core domain and task state | `tickets/002-core-domain-state.md` | 001 | COMPLETE |
| 2 Orchestrator | `tickets/003-orchestrator.md` | 002 | COMPLETE |
| 3 Providers/workers | `tickets/004-provider-system.md` | 002 | COMPLETE |
| 4 Routing/escalation | `tickets/005-routing-escalation.md` | 003,004 | COMPLETE |
| 5 Safe tools | `tickets/006-safe-tools.md` | 002 | COMPLETE |
| 6 Verification | `tickets/007-deterministic-verification.md` | 002 | COMPLETE |
| 7 Evidence/observability | `tickets/008-evidence-audit.md` | 002,003 | COMPLETE |
| 8 GitHub | `tickets/009-github-integration.md` | 002 | COMPLETE |
| 9 CLI/demo | `tickets/010-cli-demo.md` | 003-009 | COMPLETE |
| 10 Tests/docs/backlog | `tickets/011-tests-docs.md` | 002-010 | COMPLETE |

A ticket is changed to `COMPLETE` only after implementation plus the required repository checks pass. The final CI verification commit records that transition.

## Production-enablement backlog

The original implementation epics are complete. The following epics turn the local vertical slice into an operable production candidate. Tickets marked `BLOCKED` require an operator decision, external account, deployment platform, or provider workflow and are intentionally not guessed by the repository.

| Epic | Tickets | Status |
| --- | --- | --- |
| 11 Secure runtime and isolation | `012-runtime-readiness.md`, `013-sandbox-profile.md`, `014-workspace-state-separation.md` | PARTIAL |
| 12 Secrets and credentials | `015-secret-hygiene.md`, `016-secret-manager-credentials.md` | PARTIAL |
| 13 Live provider readiness | `017-provider-readiness.md`, `018-live-smoke-tests.md`, `019-jules-reconciliation.md`, `020-jev-production-config.md` | PARTIAL |
| 14 Evidence lifecycle | `021-evidence-retention.md`, `022-sensitive-metadata.md` | COMPLETE |
| 15 Organization governance | `023-policy-profiles.md`, `024-dependency-approval.md` | PARTIAL |
| 16 Concurrency and recovery | `025-run-locking.md`, `026-concurrency-chaos.md` | PARTIAL |
| 17 Threat modeling | `027-threat-model.md`, `028-adversarial-tests.md` | COMPLETE |
| 18 Operations and release | `029-readiness-command.md`, `030-production-go-live.md` | PARTIAL |
