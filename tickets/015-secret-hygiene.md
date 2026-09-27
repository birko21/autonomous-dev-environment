# Ticket 015: Secret hygiene and non-disclosing readiness

- Epic: 12 Secrets and credentials
- Status: COMPLETE
- Dependencies: 011

Keep provider credentials outside Git and report only presence, never values, through readiness and evidence.

Acceptance criteria:

- live configuration names are documented in `.env.example`;
- secret paths remain denied to autonomous tools;
- tests prove readiness output does not contain a supplied secret.
