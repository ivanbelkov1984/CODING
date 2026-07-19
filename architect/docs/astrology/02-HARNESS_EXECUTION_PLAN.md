# Harness Execution Plan

## Activation

At session start:

```text
/effort ultracode
/status
/studio-kickoff Phase 0 repository audit for astrology foundation
```

Ultracode is session-only. Project settings persist xhigh but do not persist workflow permission.

## Phase model

### Phase 0 — Understand

Use Fan Out and Synthesize with read-only agents. Deliver actual repository map, contradictions, data migration plan, safe module seams and updated backlog.

### Phase 1 — Prove

Parallel isolated spikes:

- Swiss Ephemeris license/build/WASM;
- tzdb resolver;
- registry schemas;
- scenario baseline data feasibility;
- rectification benchmark feasibility.

No production UI in this phase.

### Phase 2 — Foundation

Gated pipeline: data contracts → adapters → tests → integration. One epic per PR where practical.

### Phase 3 — Product UI

Tournament before new visual pattern. Adversarial UI review before acceptance.

### Phase 4 — Research Preview

Rectification and scenario experimentation remain clearly labeled, private and reversible.

### Phase 5 — Release

Full release gate. No automated deploy from agent team.

## Anti-rot task packet

Every delegated task includes:

```yaml
task_id:
owner_agent:
objective:
allowed_files:
read_only_files:
prohibited_changes:
input_contracts:
output_artifacts:
acceptance_checks:
dependencies:
time_budget:
```

## Concurrency rules

- Parallel: separate docs, independent read audits, isolated spikes, tests over immutable fixtures.
- Sequential: shared app.js, shared schema, migrations, service worker, integration.
- Worktree isolation for parallel code writers.
- 3–5 active agents by default.
