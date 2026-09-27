# Task Lifecycle and Escalation

## Lifecycle

1. **TASK_IN / RECEIVED** — persist the validated task and repository reference.
2. **CLASSIFIED** — Jev classifies scope, risk, complexity, uncertainty, worker intent, and review need; deterministic risk rules are also evaluated.
3. **DISPATCHED** — route the smallest configured capable coding worker. High risk pauses at an approval gate first.
4. **RUNNING / ACT** — the worker plans/implements/repairs and proposes typed tool requests. Policy evaluates each request before execution. Progress is persisted after every tool.
5. **VERIFYING / CHECK** — executable checks collect evidence. An optional senior/Jules review interprets the same repository/evidence context.
6. **RETRYING** — required failures receive a bounded repair attempt.
7. **ESCALATED** — thresholds, ambiguity, policy denial, or unresolved verification require explicit intervention.
8. **FINISH / COMPLETED** — only after all required deterministic checks pass and Jev selects `COMPLETE`.

## Approval flow

`ade status <run-id>` shows a pending approval. A human uses `ade approve <run-id>` or `ade reject <run-id>`. The decision and note are persisted to evidence. Approval/rejection works after process restart because the pending action is part of durable run state.

## Retry thresholds

`ADE_MAX_RETRIES` bounds repair attempts. `ADE_MAX_ACTION_STEPS` bounds repeated CONTINUE/VERIFY cycles. Exhaustion escalates; it never silently converts a failure into success.

## Cancellation

`ade cancel <run-id>` sets a durable cancellation flag. The next orchestration pass moves a nonterminal run to `CANCELLED`.

## Escalation triggers

Deterministic triggers include security-sensitive work, auth/RBAC, payments, production infrastructure, destructive database/data operations, secret management, unresolved ambiguity, tool-policy denial, repeated failures, and verification failures after retry budget exhaustion. The existence of a stronger model by itself is not an escalation reason.
