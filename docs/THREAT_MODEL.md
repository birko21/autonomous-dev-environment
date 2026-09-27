# Threat Model

## Assets

- source code, repository metadata, and uncommitted changes;
- provider credentials and GitHub credentials;
- task descriptions, acceptance criteria, and evidence;
- the ability to write files or execute approved checks.

## Primary threats

| Threat | Control | Residual requirement |
| --- | --- | --- |
| Prompt injection in repository content | deterministic tool policy, scope checks, human gates | adversarial corpus from the target organization |
| Malicious provider output | typed schemas, capability routing, non-shell command allowlist | provider account and model evaluation |
| Symlink/junction escape | realpath-aware workspace guard | OS sandbox and read-only mounts |
| Credential disclosure | secret-path denial and recursive evidence redaction | external secret manager and access audit |
| Duplicate execution | per-run atomic lock and idempotency keys | distributed lock if multiple orchestrators are deployed |
| Remote-worker drift | explicit Jules escalation before local verification | documented patch reconciliation workflow |
| Evidence misuse | retention control and redaction | encryption, access policy, legal hold, deletion audit |

The control plane must treat provider text as untrusted input. Deterministic verification and policy decisions remain authoritative over model claims.
