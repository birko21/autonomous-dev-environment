# Evidence Retention

Evidence is append-only during a run and recursively redacted before persistence. Terminal runs can be removed with `ade prune-evidence`; the configured `ADE_EVIDENCE_RETENTION_DAYS` defaults to 30 days.

The pruning operation only removes terminal runs older than the retention cutoff. Active, awaiting-approval, and otherwise non-terminal runs are retained. Operators must define backup, encryption-at-rest, access logging, legal hold, and deletion requirements before enabling automated pruning in production.
