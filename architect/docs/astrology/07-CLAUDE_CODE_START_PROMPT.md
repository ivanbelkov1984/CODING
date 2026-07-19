# Claude Code Start Prompt

Run Claude Code from repository root on a supported current version.

```text
/effort ultracode
/status
/studio-kickoff

Objective: begin Phase 0 repository audit for the astrology foundation in architect/. Do not implement production features yet.

Read CLAUDE.md, STUDIO_HANDOFF.md, architect/AGENT_BRIEF.md and architect/docs/astrology/00-IMPLEMENTATION_INDEX.md. Synchronize git history first.

Use a Dynamic Workflow with isolated read-only workstreams for:
1. current frontend/state/migrations;
2. backend/sync/E2EE;
3. build/tests/service worker/performance;
4. UI/design insertion points;
5. security/license and scientific gates.

Synthesize one repository-grounded Phase 1 plan. Identify exact files and safe seams; do not assume TypeScript or framework migration. Update .claude/handoffs/CURRENT.md and architect/docs/astrology/08-DECISION_LOG.md. No personal data. No deployment.
```

After `/status` confirms it, Claude may state:

`Harness Engineering Integration Complete. Ultracode Effort is ACTIVE. Context Rot protection enabled. 14-Agent roster is ready; the active team will be selected dynamically.`

It must not state this before verification.
