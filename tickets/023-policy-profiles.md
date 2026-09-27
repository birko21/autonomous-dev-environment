# Ticket 023: Organization policy profiles

- Epic: 15 Organization governance
- Status: COMPLETE
- Dependencies: 006, 012

Add a JSON profile that can tighten the built-in npm command allowlist and add forbidden path patterns without enabling arbitrary commands.

Acceptance criteria:

- profiles reject commands outside the built-in allowlist;
- profile paths are additive forbiddens;
- profile loading and rejection are unit-tested.
