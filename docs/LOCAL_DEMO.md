# Deterministic Local Demo

Run:

```bash
npm ci
npm run demo
```

No external credentials or network provider calls are required.

The demo creates an isolated `.ade-demo/workspace` with harmless verification scripts, then executes:

1. deterministic Jev classifies LOW risk;
2. mock Codex is dispatched;
3. policy approves a scoped `write_file` request;
4. the first worker writes `BROKEN`;
5. the deterministic unit check fails while the remaining executable checks run;
6. the orchestrator records failed verification and transitions to `RETRYING`;
7. mock Codex repair writes `PASS`;
8. required checks pass;
9. deterministic Jev selects `COMPLETE`;
10. the orchestrator records the summary and transitions to `COMPLETED`.

The demo workspace is intentionally not a Git worktree, so Git-only scope/diff checks report optional `SKIP`; integration tests cover the same behavior. In a real Git worktree those checks are required.
