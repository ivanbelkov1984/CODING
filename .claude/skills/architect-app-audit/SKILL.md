---
name: architect-app-audit
description: Audit the current architect/ app before architecture or implementation changes.
effort: xhigh
context: fork
agent: studio-dispatcher
---

# Architect App Audit

Fan out read-only work across app/data, backend/sync, UI/design, tests/build and security. Inspect actual code rather than relying on old briefs. Synthesize:

- current file/module map;
- DB collections and migration path;
- sync/merge/tombstone behavior;
- build/test/deploy mechanics;
- UI insertion points;
- security and privacy constraints;
- safe extraction seams from the monolith;
- contradictions between docs and current code;
- exact Phase 1 plan.

Do not implement features in this skill.
