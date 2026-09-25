# DEFINITION_OF_DONE.md

A ticket is complete only when all applicable conditions are met.

## Functional

- Acceptance criteria are satisfied.
- The requested behaviour works.
- Edge cases have been considered.
- No unrelated behaviour was changed.

## Quality

- Lint passes.
- Type checking passes.
- Unit tests pass.
- Relevant integration tests pass.
- Build passes.
- Existing tests remain green.

## Security

- No secrets are committed.
- Inputs are validated where appropriate.
- Authorization rules are preserved.
- New dependencies have been reviewed.
- No known high-severity vulnerabilities are introduced.

## Documentation

- Relevant documentation is updated.
- Configuration changes are documented.
- Any new environment variables are documented without exposing values.

## Pull Request

The pull request must explain:

- what changed
- why it changed
- how it was tested
- any risks
- any follow-up work

## Completion rule

If any required condition fails, the ticket is not done.
