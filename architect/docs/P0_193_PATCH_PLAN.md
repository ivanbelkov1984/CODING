# P0 #193 — guarded hotfix plan

Production evidence shows sync succeeds (`GET 200`, `PUT 200`, `sync ok`) and the later AI psych-contour request fails independently with Anthropic HTTP 400 because its structured-output schema contains integer `minimum` / `maximum`.

This branch carries a one-shot workflow that, after merge to `MAIN`, applies an exact-count guarded source patch:

- removes unsupported integer bounds from the Anthropic-facing psych-contour schema;
- preserves `confidence` 0..100 as deterministic application validation before any psych record mutation/persist;
- applies the same provider-compatibility correction to backend feedback triage;
- adds a regression guard to the normal `npm test` chain;
- runs focused regression, lint and build before committing the source hotfix;
- appends the cross-session handoff journal entry.

The workflow is temporary and must be removed after it has produced the guarded source commit. Removing it with a normal repository commit also triggers the standard CI/deploy pipeline for the actual hotfix source state.

No user data, production identifiers, credentials or API keys are included.
