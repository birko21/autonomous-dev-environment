# Ticket 017: Provider configuration readiness

- Epic: 13 Live provider readiness
- Status: COMPLETE
- Dependencies: 004, 012

Validate explicit provider configuration and document the OpenAI Responses structured-output contract. Live model availability remains an account-level check.

Acceptance criteria:

- OpenAI requires an explicit `OPENAI_MODEL`;
- live provider endpoints reject embedded credentials and non-local HTTP URLs;
- provider configuration is covered by readiness checks.
