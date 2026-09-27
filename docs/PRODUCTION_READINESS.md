# Production-Readiness Checklist

The local control-plane vertical slice is implemented and tested. Production enablement still requires operator-owned deployment controls.

## Implemented

- [x] Typed domain schemas and explicit validated state machine.
- [x] Durable resumable state, append-only events/evidence, redaction, and idempotency.
- [x] Common provider contract with OpenAI, Jules, Jev, and mocks.
- [x] Deterministic risk routing and human approval gates.
- [x] Least-privilege tool registry/policy/executor.
- [x] Deterministic repository/lint/type/unit/integration/build/security/scope/secret/diff verification.
- [x] Completion invariant preventing green state after failed required checks.
- [x] GitHub adapter with no merge capability.
- [x] CLI create/run/resume/status/approve/reject/cancel/evidence/summary/demo.
- [x] Unit, integration, contract, and security tests.
- [x] Credential-free demo including failed-check repair path.
- [x] Non-secret readiness report with live provider, endpoint, isolation, retention, lock, and policy checks.
- [x] Atomic per-run execution lock with stale-lock recovery for single-instance operation.
- [x] Configurable terminal-run evidence retention and explicit pruning command.
- [x] Tightening-only organization policy profiles for commands and forbidden paths.
- [x] Threat model, deployment profile, secret-management guidance, provider-readiness guidance, and operations runbook.

## Required before production credentials are enabled

- [ ] Run the orchestrator inside a hardened container/VM profile with OS-level filesystem/network restrictions. See `docs/DEPLOYMENT_PROFILE.md` and `tickets/013-sandbox-profile.md`.
- [ ] Store all keys in an approved secret manager and use least-privilege, short-lived GitHub credentials where possible. See `tickets/016-secret-manager-credentials.md`.
- [ ] Validate the exact OpenAI model selection and rate/cost limits for the production account. See `tickets/018-live-smoke-tests.md`.
- [ ] Validate the current Jules source/session configuration and establish a controlled patch-reconciliation workflow. See `tickets/019-jules-reconciliation.md`.
- [ ] Validate the pinned TypeSafe API base URL/model and production quota/latency behavior. See `tickets/020-jev-production-config.md`.
- [ ] Define retention/rotation, encryption, access logging, and deletion policy for `.ade` evidence and any sensitive repository metadata. The local pruning mechanism is implemented; see `docs/EVIDENCE_RETENTION.md`.
- [ ] Add the organization-specific dependency approval workflow. Tightening-only command/path policy profiles are implemented; see `docs/POLICY_PROFILES.md` and `tickets/024-dependency-approval.md`.
- [ ] Load/chaos test concurrent runs if multi-process execution is planned. Single-instance per-run locking is implemented; distributed locking is not. See `tickets/026-concurrency-chaos.md`.
- [ ] Complete threat modeling for prompt injection and remote provider compromise in the intended deployment network.

No live credentials are committed by this repository.
