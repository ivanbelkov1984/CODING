# Astrology Implementation Package — Index

## Status

`READY_FOR_PHASE_0_REPOSITORY_AUDIT`

This directory is the source of truth for implementing astrology, rectification and scenario forecasting. The earlier research journal is supporting evidence, not the coding contract.

## Read order by task

### Every astrology task

1. `CLAUDE.md`
2. `STUDIO_HANDOFF.md`
3. `architect/AGENT_BRIEF.md`
4. this index
5. task-specific document only

### Foundation

- `01-MASTER_SPEC.md`
- `02-HARNESS_EXECUTION_PLAN.md`
- `05-DATA_MODEL_AND_MIGRATIONS.md`
- `06-TEST_AND_RELEASE_GATES.md`

### Rectification

- `03-RECTIFICATION_SPEC.md`

### Forecasting

- `04-SCENARIO_FORECASTING_SPEC.md`
- `09-EPISTEMIC_SAFETY.md`

### UI

- `AWESOME_DESIGN.md`
- existing `architect/design_guide.md`
- existing `architect/PATTERN_LIBRARY.md`
- `design/tokens.json`

### Start Claude Code

- `07-CLAUDE_CODE_START_PROMPT.md`

## Implementation rule

Do not ask Claude to “build the whole application” in one turn. Start with Phase 0 audit, then one spike/epic at a time. Each phase updates CURRENT handoff and decision log.
