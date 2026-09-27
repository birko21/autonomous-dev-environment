# Ticket 021: Evidence retention and pruning

- Epic: 14 Evidence lifecycle
- Status: COMPLETE
- Dependencies: 008, 012

Implement retention configuration and a pruning command that removes only terminal runs older than the configured cutoff.

Acceptance criteria:

- `ADE_EVIDENCE_RETENTION_DAYS` defaults to 30;
- `ade prune-evidence` preserves active runs;
- pruning is documented as an operator action requiring backup and legal-hold policy.
