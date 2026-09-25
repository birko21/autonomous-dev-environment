# AGENTS.md

## Purpose

This repository is an autonomous software-development environment.

AI agents must follow these instructions before making changes.

## Source of truth

Use this priority order:

1. The assigned ticket
2. AGENTS.md
3. DEFINITION_OF_DONE.md
4. SECURITY.md
5. Repository documentation
6. Existing implementation

If requirements conflict, do not guess. Stop and surface the conflict.

## Development rules

For every task:

1. Read the entire assigned ticket.
2. Inspect the relevant existing code.
3. Work only on the assigned scope.
4. Create or use a feature branch.
5. Do not commit directly to `main`.
6. Implement the smallest complete solution.
7. Add or update tests.
8. Run linting.
9. Run type checking.
10. Run relevant tests.
11. Run the full test suite when appropriate.
12. Run the build.
13. Check for security or regression risks.
14. Update documentation where necessary.
15. Open a pull request.

## Never

Do not:

- bypass CI
- disable tests to obtain a passing result
- weaken security controls
- commit secrets
- commit `.env` files
- change unrelated functionality
- silently change architecture
- delete data or destructive migrations without explicit approval
- modify production infrastructure without explicit approval
- merge your own high-risk change without required review

## Escalation

Stop and request review when:

- requirements conflict
- confidence is low
- security-sensitive code is involved
- authentication or authorization changes
- payments are involved
- destructive database changes are required
- more than three repair attempts fail
- the requested change would alter architecture materially
