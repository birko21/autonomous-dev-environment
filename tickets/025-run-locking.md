# Ticket 025: Per-run execution locking

- Epic: 16 Concurrency and recovery
- Status: COMPLETE
- Dependencies: 002

Add an atomic per-run lock around orchestration, stale-lock recovery, and contention tests so duplicate `run`/`resume` calls cannot execute the same tool sequence concurrently.
