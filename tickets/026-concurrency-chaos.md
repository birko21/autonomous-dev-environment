# Ticket 026: Multi-process concurrency and chaos validation

- Epic: 16 Concurrency and recovery
- Status: BLOCKED
- Dependencies: 025

Load and chaos test the intended deployment topology, including process termination during writes, provider timeout, lock recovery, and simultaneous operators.

Open requirement: single-instance versus multi-instance deployment decision. A distributed lock is required for multiple orchestrator instances.
