# Setup

## Prerequisites

- Node.js 22 or newer
- npm
- Git for repository-aware verification
- No credentials are required for mock mode

## Install and verify

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run security
```

Do not create or commit a `.env` file. Export live credentials in the shell, GitHub Actions secrets, or an approved secret manager. `.env.example` contains names only.

## Runtime directories

- `ADE_DATA_DIR` defaults to `.ade` and stores tasks, run state, events, and evidence.
- `ADE_WORKSPACE` defaults to the current directory.
- `.ade`, `.ade-demo`, `.ade-recovery`, build output, secrets, and `config.txt` are ignored.

## Important limits

- `ADE_MAX_RETRIES` defaults to `2` repairs after the first implementation attempt.
- `ADE_MAX_ACTION_STEPS` defaults to `8` model action cycles.
- `ADE_PROVIDER_TIMEOUT_MS` defaults to `120000`.
- `ADE_VERIFICATION_TIMEOUT_MS` defaults to `180000` per command.

Mock mode is deliberately the default. Select `ADE_MODE=live` only after configuring the documented provider variables in `docs/PROVIDERS.md`.
