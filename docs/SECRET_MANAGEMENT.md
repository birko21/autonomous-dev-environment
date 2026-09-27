# Secret Management

Secrets are configuration inputs, not task data. The application accepts provider credentials through the process environment and never includes their values in provider descriptors, summaries, or evidence. Do not place them in the repository, task descriptions, workspace, or `config.txt`.

Production requirements:

- use the organization-approved secret manager or workload identity mechanism;
- issue separate least-privilege credentials for OpenAI, Jules, TypeSafe, GitHub, and telemetry;
- prefer short-lived credentials and rotate them on a defined schedule;
- inject secrets only into the supervisor-managed process environment;
- prevent autonomous tools from reading environment files, credential directories, or key material;
- audit access and revoke credentials on worker compromise.

`ade readiness` reports only whether required credentials are present. It never prints values.
