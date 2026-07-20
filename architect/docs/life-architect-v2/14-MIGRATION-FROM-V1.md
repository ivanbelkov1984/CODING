# Migration from astrology/harness v1

## Keep

- 14-agent harness;
- orchestration patterns;
- astrology calculation/rectification contracts;
- scenario safety decisions;
- tests/release discipline;
- existing draft PR history.

## Reclassify

- `architect/docs/astrology/` becomes subsystem source, not global source;
- previous master DOCX/Google Docs become archived baseline;
- previous «ready for Phase 0» status is superseded until v2 docs are reviewed.

## Add

- global v2 index and architecture;
- health/state/PDRE/privacy/UX contracts;
- schemas;
- v2 kickoff skills;
- feature flags and regulatory quarantine requirements;
- implementation backlog.

## Do not do

- do not delete v1 history;
- do not merge PR before verifying v2 files;
- do not change app code in documentation migration;
- do not copy personal health/diary examples into fixtures.

## PR strategy

Update existing draft PR #40 rather than creating competing branches. Change its role from “astrology implementation foundation” to “unified architecture and Claude Code harness foundation”. If PR metadata cannot be changed automatically, append a reviewer note and ensure file content clearly supersedes old status.

## Acceptance

- root CLAUDE points to v2;
- old astrology index points back to v2 for global concerns;
- v2 package validates schemas and file manifest;
- no production code diff;
- Phase 0 instructions are repository-grounded.
