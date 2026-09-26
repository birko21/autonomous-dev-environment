# Contributing

## Branches

- Keep `main` protected and production-ready.
- Create a dedicated feature branch for every change; use a descriptive prefix such as `feature/`, `fix/`, `docs/`, or `audit/`.
- Do not commit directly to `main` or bypass pull-request checks.

## Pull requests

Every change must be proposed through a pull request that includes:

- a summary of the change and why it was required
- checks and tests that were run
- risks and follow-up items

Before requesting review, run all applicable lint, type-check, test, build, and security checks. High-risk changes listed in [SECURITY.md](SECURITY.md) require explicit human approval before merge.

## Autonomous agents

Agents may inspect the repository, create feature branches, make scoped changes, run checks, and open pull requests. They must not merge their own changes, weaken checks, commit secrets, or alter production infrastructure without approval.
