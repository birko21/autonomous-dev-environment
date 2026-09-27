# Organization Policy Profiles

Set `ADE_POLICY_FILE` to a JSON policy profile when the organization needs stricter command or path rules than the built-in policy. Profiles can only tighten behavior:

```json
{
  "name": "engineering-default",
  "allowedNpmScripts": ["lint", "typecheck", "test", "build"],
  "additionalForbiddenPaths": ["generated/**", "vendor/**"]
}
```

The profile cannot add commands outside the built-in non-shell allowlist. Dependency installation, publication, shell execution, network utilities, and Git mutation remain denied. Changes to the profile are governance changes and should be code-reviewed and protected like other policy files.
