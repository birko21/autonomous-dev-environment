# Operations Runbook

1. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run security`, and `npm run build`.
2. Run `node dist/src/cli.js readiness` with the production environment injected. Resolve every `BLOCKED` check.
3. Confirm the sandbox profile, egress policy, secret manager, provider model/endpoint choices, and GitHub permissions.
4. Start with a non-destructive task in a disposable repository and inspect status, evidence, and summary output.
5. Test approval, rejection, cancellation, resume, provider timeout, and stale-lock recovery.
6. Monitor provider errors, rate-limit headers, request IDs, process resource limits, evidence volume, and failed verifications.
7. Do not treat a `COMPLETED` state as a merge or deployment authorization. Human review and branch protection remain mandatory.

Rollback means stopping new runs, preserving evidence, revoking credentials if compromise is suspected, and returning the repository to the last reviewed commit through the normal Git workflow.
