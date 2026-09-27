# Provider Configuration

## Common contract

Every provider object implements `classify`, `plan`, `implement`, `review`, `repair`, `summarize`, and `assessCompletion`. A provider advertises the subset it genuinely supports. Routing calls only advertised capabilities; unsupported live capabilities fail explicitly.

Provider-specific code is isolated under `src/providers/`. Credentials are never included in provider descriptors or evidence.

## Mock mode

```text
ADE_MODE=mock
```

Registers:

- `deterministic-jev` — local typed decision rules;
- `mock-codex` — local coding worker;
- `mock-jules` — local independent reviewer/worker.

This is the fully working credential-free vertical slice and the mode used by integration tests and the demo.

## OpenAI / Codex role

Required in live mode:

```text
OPENAI_API_KEY=<secret supplied outside Git>
OPENAI_MODEL=<explicit Responses-API model available to the account>
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OpenAICodexProvider` calls the official Responses API and uses strict JSON-schema output for typed worker/control payloads. The implementation intentionally does not invent a special “Codex API” model name; the operator pins an available model through `OPENAI_MODEL`.

Reference: `https://platform.openai.com/docs/api-reference/responses`

## Google Jules

Required for the default live reviewer/remote-worker configuration:

```text
JULES_API_KEY=<secret supplied outside Git>
JULES_SOURCE=<documented Jules source resource name, e.g. sources/github/owner/repo>
JULES_STARTING_BRANCH=main
JULES_BASE_URL=https://jules.googleapis.com/v1alpha
```

The adapter creates/polls documented Jules sessions and reads activities. It does not request automatic PR creation, and it does not assume undocumented credentials/endpoints. If the configured review worker is `google-jules`, both `JULES_API_KEY` and `JULES_SOURCE` must be present or runtime creation fails fast.

Jules executes in Google’s remote workspace. The local orchestrator does not yet import a Jules remote patch back into the local filesystem automatically; therefore use live Jules for review/remote work only when the surrounding operator workflow reconciles its output before local deterministic verification. Mock Jules is fully covered end to end.

Reference: `https://developers.google.com/jules/api`

## TypeSafe AI Jev

The current vendor/API branding is **TypeSafe AI**. Required in live mode:

```text
TYPESAFE_API_KEY=<secret supplied outside Git>
TYPESAFE_BASE_URL=<documented TypeSafe API base URL pinned by the operator>
TYPESAFE_MODEL=jev-latest
```

`TypesafeJevProvider` maps System One typed-choice responses to risk, complexity, worker, review, and completion-action decisions. It has no tool-execution authority and cannot override deterministic verification/policy.

Reference: `https://www.npmjs.com/package/@typesafe-ai/sdk`

## Provider routing

Configuration keys:

```text
ADE_DECISION_PROVIDER
ADE_PRIMARY_WORKER
ADE_LOW_COST_WORKER
ADE_REVIEW_WORKER
```

Defaults select Codex as both primary and low-cost coding worker, Jules as reviewer, and Jev as decision layer for the selected runtime mode. LOW uses the configured low-cost capable worker; MEDIUM uses the primary worker; HIGH additionally requests review and human approval; ESCALATE requires explicit intervention.
