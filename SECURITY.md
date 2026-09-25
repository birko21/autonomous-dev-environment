# SECURITY.md

## Security principles

This repository must remain safe for autonomous agent execution.

## Secrets

Never commit:

- API keys
- passwords
- access tokens
- private keys
- `.env`
- production credentials
- database connection strings containing credentials

Secrets must be stored in GitHub Secrets or an approved secret manager.

## High-risk changes

The following require explicit human approval before merge:

- authentication changes
- authorization / RBAC changes
- payment processing
- production database migrations
- destructive data operations
- infrastructure changes
- secret-management changes
- dependency upgrades with material security impact

## Agent safety

Agents must not:

- expose secrets in logs
- disable security tooling
- weaken validation to make tests pass
- bypass branch or pull-request rules
- execute destructive commands unless explicitly authorized

## Incident behaviour

If an agent discovers a possible security issue:

1. Stop expanding the scope.
2. Document the issue.
3. Mark the task for human review.
4. Do not disclose secrets or sensitive data in public issues or logs.
