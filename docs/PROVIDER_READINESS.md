# Provider Readiness

Provider adapters are contract-tested locally, but live readiness is account- and deployment-specific.

## OpenAI / Codex

Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL`. The adapter uses the Responses API with strict JSON-schema output. The selected model must be verified against the production account and budget/rate limits. Structured Outputs requires a compatible model and a schema with `additionalProperties: false`; the adapter already follows that constraint.

## Jules

Configure `JULES_API_KEY`, `JULES_SOURCE`, `JULES_STARTING_BRANCH`, and `JULES_BASE_URL`. Jules operates in a remote workspace. An operator must define how a reviewed or implemented patch is reconciled into the local workspace before deterministic verification runs.

## TypeSafe AI Jev

Configure `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, and `TYPESAFE_MODEL`. The operator must pin the documented endpoint, validate quotas and latency, and confirm the response contract in the target account.

`ade readiness` checks configuration shape and credential presence only; it does not perform billable provider calls.
