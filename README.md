# Autonomous Development Environment

A safe, resumable, evidence-driven autonomous software-development control plane for the loop:

`TASK_IN → DISPATCH → ACT → CHECK → FINISH`

The system is intentionally CLI/API first. Models may classify, plan, implement, review, repair, summarize, and interpret evidence, but deterministic code owns state transitions, tool permissions, verification, retry limits, approval gates, and the final completion invariant.

## Safety invariants

- `main` remains protected; work is proposed through feature branches and pull requests.
- The GitHub adapter deliberately has **no merge operation**.
- A failed required deterministic check can never produce `COMPLETED`.
- High-risk work pauses for explicit human approval before side effects.
- Destructive tools and governance/infrastructure writes have deterministic approval controls.
- Secret/credential paths are denied and evidence is redacted before persistence.
- Runs, events, evidence, idempotency keys, retries, approvals, and verification results are persisted and resumable.
- Existing governance in `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, `DEFINITION_OF_DONE.md`, CODEOWNERS, the PR template, and CI remains authoritative.

## Runtime

Requirements: Node.js 22+ and npm.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run security
```

Run the credential-free local vertical slice:

```bash
npm run demo
```

The demo intentionally fails its first unit verification, records the failure, performs a bounded repair, reruns deterministic verification, and completes only after required checks pass.

## CLI

After `npm run build`, use `node dist/src/cli.js` (or the `ade` package bin):

```text
ade create-task --title <text> --description <text> [--workspace <path>] [--allow <glob>]...
ade run <task-id> [--workspace <path>]
ade resume <run-id>
ade status <run-id>
ade approve <run-id> [--note <text>]
ade reject <run-id> [--note <text>]
ade cancel <run-id>
ade evidence <run-id>
ade summary <run-id>
ade demo [--data-dir <path>]
```

Output is machine-readable JSON. Durable runtime data defaults to `.ade/` and is ignored by Git.

## Providers

All model workers implement one common provider interface. Mock mode is the default and requires no credentials.

- **OpenAI/Codex role:** `OpenAICodexProvider` uses the official OpenAI Responses API with strict JSON-schema outputs. The model is supplied explicitly through `OPENAI_MODEL`; this repository does not invent a separate undocumented “Codex API”.
- **Gemini/Jules role:** `JulesProvider` uses Google’s documented Jules `v1alpha` sessions API and API-key authentication. Jules is available through the same worker contract for plan/implement/review/repair/summarize operations. Automatic PR creation is not requested by this adapter.
- **TypeSafe AI Jev role:** `TypesafeJevProvider` maps Jev/System One typed-choice decisions to classification and completion actions. The base URL is explicit configuration. A deterministic local Jev replacement is used in mock mode.
- **GitHub:** `GitHubAdapter` isolates repository inspection, branches, changed files/diffs, PR creation, check status, review requests, and escalation comments/labels. It exposes no autonomous merge method.

See [docs/PROVIDERS.md](docs/PROVIDERS.md) and `.env.example` for configuration.

## Architecture and operations

- [Architecture](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Provider configuration](docs/PROVIDERS.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Task lifecycle and escalation](docs/TASK_LIFECYCLE.md)
- [GitHub workflow](docs/GITHUB_WORKFLOW.md)
- [Local demo](docs/LOCAL_DEMO.md)
- [Operating limitations](docs/OPERATING_LIMITATIONS.md)
- [Production-readiness checklist](docs/PRODUCTION_READINESS.md)
- [Backlog](docs/backlog/README.md)

## Repository structure

```text
src/domain/          typed domain objects + runtime schemas
src/state/           validated state machine + durable file store
src/providers/       common provider contract + OpenAI/Jules/Jev/mock adapters
src/routing/         worker selection + deterministic risk gate
src/tools/           registry, least-privilege policy, built-in tools, executor
src/verification/    deterministic verification runner
src/evidence/        append-only evidence + redaction
src/github/          live and mock GitHub adapters
src/orchestrator/    end-to-end control loop + runtime factory
src/demo/            deterministic local demonstration workspace
tests/               unit/integration/contract/security tests
scripts/             build/test/lint/security helpers
tickets/             implementation tracking records
docs/                architecture and operator documentation
```

## Governance

This README does not replace repository policy. Agents must read the assigned ticket and governance files before editing, stay on a feature branch, run required checks, open a PR, and wait for required human review. High-risk work is never authorized merely because a model reports high confidence.
