# Ticket 014: Workspace and state separation

- Epic: 11 Secure runtime and isolation
- Status: COMPLETE
- Dependencies: 012

Detect runtime state placed inside the checkout and provide an opt-in production gate through `ADE_REQUIRE_ISOLATION=true`.

Acceptance criteria:

- readiness warns by default for local compatibility;
- readiness blocks when isolation is required;
- the application path guard remains active regardless of the setting.
