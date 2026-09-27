# Ticket 012: Runtime readiness and preflight

- Epic: 11 Secure runtime and isolation
- Status: COMPLETE
- Dependencies: 011

Implement a non-secret readiness report that validates live credential presence, explicit model selection, endpoint shape, state/workspace separation, retention, lock settings, and policy-profile readability.

Acceptance criteria:

- `ade readiness` exits non-zero for blocked live configuration;
- no credential value is emitted;
- mock mode remains usable without external credentials;
- unit tests cover blocked and warning states.
