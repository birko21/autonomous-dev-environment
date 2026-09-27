# Operating Limitations

## Live provider boundaries

- Live OpenAI calls require an explicitly configured model that is available to the operator’s account. The repository does not assert that a separate undocumented Codex endpoint exists.
- Live Jules runs remotely. Automatic patch transfer/reconciliation from a Jules session into the local workspace is not implemented; deterministic local verification must run after the operator reconciles remote changes.
- TypeSafe Jev is used only for typed decisions. Its API host is explicit configuration so endpoint changes do not silently alter behavior.
- Gemini is represented through the Jules worker integration requested for this system; there is no separate raw Gemini adapter in this build because doing so is unnecessary for the stated Jules worker contract.

## Workspace isolation

The implementation scopes filesystem operations to a configured workspace and blocks traversal, but it does not itself launch a container/VM. Production deployments should run the process in an OS/container sandbox with restricted network and filesystem permissions.

`ade readiness` warns when runtime state is inside the workspace and blocks that arrangement when `ADE_REQUIRE_ISOLATION=true`.

## Command execution

`run_command` is non-shell and heavily restricted. Package installation, publication, network utilities, destructive OS commands, and Git mutation/push/merge commands are denied. Dependency changes therefore need an approved outer development workflow rather than model-issued install commands.

## Acceptance criteria

Models can interpret semantic acceptance criteria, but deterministic completion depends on executable repository checks. Teams should encode important acceptance criteria in tests/checks; prose-only behavior cannot be made mathematically deterministic by the orchestrator.

## Cost accounting

The evidence schema supports provider cost/latency. Latency is captured for provider calls. Cost is recorded only when the provider/integration supplies trustworthy cost data; this implementation does not estimate billing from token counts.

## Concurrency and retention

The file store uses an atomic per-run execution lock and recovers locks older than `ADE_LOCK_STALE_MS`. This supports one orchestrator instance operating on a shared data directory. Multi-instance deployments require a distributed lock and chaos testing. Terminal evidence can be pruned with `ade prune-evidence` after the operator defines backup, encryption, legal-hold, and deletion requirements.
