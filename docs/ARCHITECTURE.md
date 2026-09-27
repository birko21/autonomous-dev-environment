# Architecture: Safe Autonomous Development Loop

## Purpose

The repository implements a local-first control plane for `TASK_IN → DISPATCH → ACT → CHECK → FINISH`. The architecture separates probabilistic model work from deterministic control so a model cannot grant itself permissions, bypass verification, or merge its own pull request.

## Component map

1. **Task intake and domain (`src/domain`)** — runtime-validated schemas for Task, Ticket, acceptance criteria, worker/tool requests, policy decisions, verification/evidence, escalations, summaries, and completion results.
2. **Durable state (`src/state`)** — explicit state machine plus atomic `state.json`, append-only `events.ndjson`, and append-only `evidence.ndjson`. Every tool request has an idempotency key and a persisted next-tool cursor.
3. **Decision and worker providers (`src/providers`)** — a common interface isolates OpenAI/Codex, Google Jules, TypeSafe AI Jev, and mocks.
4. **Routing (`src/routing`)** — Jev classification selects scope/risk/complexity/worker intent; deterministic rules independently detect mandatory approval categories and route the smallest configured capable worker.
5. **Tool control (`src/tools`)** — models may request tools, but only registered tools execute. Descriptors declare purpose, read/write/destructive class, permitted paths, network need, timeout, approval requirement, and recovery behavior. A deterministic policy evaluates every request.
6. **Workspace (`src/workspace`)** — repository snapshots collect file/governance/Git metadata while excluding runtime/build directories.
7. **Verification (`src/verification`)** — repository integrity, lint, typecheck, unit/integration tests, build, security, changed-file scope, secret/private-key detection, and Git diff validation run as executable checks.
8. **Evidence (`src/evidence`)** — provider selection, policy decisions, tool results, commands/checks, retries, escalations, latency/cost (when supplied), and summaries are persisted after redaction.
9. **GitHub (`src/github`)** — source-control operations are isolated behind an adapter. The contract supports inspection, branch creation, changed-file/diff inspection, PR creation, checks, review requests, and escalation metadata; no merge method exists.
10. **Orchestrator (`src/orchestrator`)** — owns classification, dispatch, approval gates, action, deterministic verification, bounded repair, escalation, completion, cancellation, and recovery.

## State model

`RECEIVED → CLASSIFIED → DISPATCHED → RUNNING → VERIFYING → COMPLETED`

Non-happy paths use `AWAITING_APPROVAL`, `RETRYING`, `ESCALATED`, `FAILED`, and `CANCELLED`. Transitions are allowlisted in code. Terminal states cannot be resumed into execution.

A process can stop after any persisted state/tool step. `resume` reloads the run, preserved worker response, next tool index, executed idempotency keys, approvals, prior evidence, and verification state.

## Trust boundaries

### Models are allowed to

- classify, plan, implement, repair, review, summarize, and interpret deterministic evidence through provider contracts;
- propose registered tool requests inside the task scope;
- recommend `CONTINUE`, `RETRY`, `VERIFY`, `ESCALATE`, or `COMPLETE` where the provider supports completion assessment.

### Models are not allowed to

- execute raw shell or arbitrary network operations directly;
- decide that a destructive/high-risk action is safe;
- override a deterministic failed check;
- read secret paths;
- bypass task path scope;
- merge a pull request or bypass GitHub protection.

## Completion invariant

`COMPLETED` is reachable only from `VERIFYING`. The orchestrator checks every required deterministic result immediately before completion. If any required result is not `PASS`, `COMPLETE` from Jev is explicitly rejected and the run moves to bounded repair or escalation.

## Recovery and idempotency

- Run state writes use temp-file + atomic rename.
- Events/evidence append rather than overwrite.
- Each model tool request carries an idempotency key. A resumed run skips a previously executed key and records that decision.
- Existing file content is backed up before replacement/deletion under ignored `.ade-recovery/<run-id>/`.
- Retries and action steps are bounded in configuration.

## Security risks retained for production

Prompt injection, malicious dependency proposals, provider compromise, remote-worker drift, and credential handling remain operational risks. Deterministic policy narrows their effect but does not eliminate them. See `docs/SECURITY_MODEL.md` and `docs/PRODUCTION_READINESS.md`.
