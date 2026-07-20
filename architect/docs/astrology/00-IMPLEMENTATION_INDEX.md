# Astrology Implementation Package — subsystem index

## Status

`ASTROLOGY_SUBSYSTEM_BASELINE_V1`

This directory remains the normative contract for astronomy, geometry, school rules, rectification and astrology UI internals. It is no longer the global source of truth for the whole application.

Global architecture, health, momentary state, Personal Dynamics and Readiness, prediction boundaries, privacy and information architecture are governed by:

`architect/docs/life-architect-v2/00-INDEX.md`

## Read order

1. root `CLAUDE.md`;
2. `STUDIO_HANDOFF.md`;
3. `architect/AGENT_BRIEF.md`;
4. global v2 index;
5. this index;
6. task-specific astrology document.

## Conflict rule

- raw astronomy/time/geography/school/rectification: this package;
- global epistemic, health, PDRE, UX and regulatory boundary: v2 package;
- stricter safety and privacy rule wins.

## Implementation

Do not build the whole subsystem in one turn. Phase 0 repository audit remains mandatory. No production code is changed by documentation migration.
