# Security Model

This document supplements, and does not weaken, `SECURITY.md`.

## Deterministic policy

Every side effect must pass `ToolPolicyEngine`. Policy decisions are code, not model prose. The engine denies unknown tools, workspace traversal, secret/credential paths, forbidden/out-of-scope paths, and dangerous/network/destructive command classes. It requires approval for destructive operations, governance writes, infrastructure writes, and unapproved high-risk changes.

A task-level high-risk approval is persisted as `riskApproved`; it does not waive destructive-tool or governance/infrastructure approvals.

## Tool registry

Registered tools declare:

- name and purpose;
- `READ`, `WRITE`, or `DESTRUCTIVE` classification;
- permitted paths;
- whether network is required;
- timeout;
- approval requirement;
- recovery behavior.

Built-ins are `read_file`, `write_file`, `delete_file`, and non-shell `run_command`. The command policy blocks package installation/publishing, network utilities, destructive OS commands, and Git push/merge/reset/clean/switch/checkout.

## Secrets

- `.env`, key/certificate formats, credential directories, and secret paths are denied to autonomous tools.
- `.env.example` has names only.
- evidence is recursively redacted before persistence.
- deterministic security checks scan tracked files for forbidden environment/key files and credential/private-key signatures.
- raw provider keys never enter provider descriptors, summaries, or evidence payloads.

## Human approval categories

Human approval is required for authentication/authorization, payments, production infrastructure, destructive database/data operations, secret-management changes, destructive tools, governance writes, and unresolved ambiguity. Repeated failed verification escalates rather than looping indefinitely.

## Branch protection

The control plane cannot grant permission to bypass GitHub branch rules. The GitHub adapter has no merge operation. Repository CODEOWNERS and required status checks remain external enforcement.
