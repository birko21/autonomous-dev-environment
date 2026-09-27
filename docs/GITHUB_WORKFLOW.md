# GitHub Workflow

GitHub remains the source of truth for repository history, pull requests, reviews, status checks, and audit trails.

`GitHubAdapter` supports:

- repository inspection;
- branch creation from an existing ref;
- base/head changed-file collection;
- diff retrieval;
- pull-request creation;
- commit check-status retrieval;
- review-request preparation/submission;
- escalation comments and labels.

The adapter deliberately exposes **no merge operation**. It cannot bypass repository rulesets, CODEOWNERS, or required status checks.

Live configuration:

```text
GITHUB_TOKEN=<secret supplied outside Git>
GITHUB_REPOSITORY=owner/repository
GITHUB_API_URL=https://api.github.com
```

The local autonomous loop does not silently push or open a PR. A caller may invoke the adapter explicitly after a verified run, preserving separation between workspace changes and GitHub publication. In this repository, feature-branch/PR creation is also enforced by governance and the active GitHub ruleset.
