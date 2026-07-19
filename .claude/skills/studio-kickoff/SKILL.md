---
name: studio-kickoff
description: Start any substantial CODING task safely with repository synchronization, context protection, task contract, agent selection and a verified plan.
effort: xhigh
---

# Studio Kickoff

1. Confirm session uses Claude Code version that supports the requested features.
2. Ask operator to run `/effort ultracode` if not active; verify `/status`.
3. Run repository synchronization required by `STUDIO_HANDOFF.md`.
4. Read `architect/AGENT_BRIEF.md` and task index only; do not preload all research.
5. Create `.claude/handoffs/CURRENT.md` containing objective, scope, prohibited changes, source-of-truth files, deliverables, tests and gates.
6. Choose the smallest useful team, normally 3–5 agents.
7. Decide orchestration pattern.
8. For code tasks, work on a branch/worktree and do not touch production before audit.
9. End kickoff with a phase plan and explicit blockers, then execute without asking the operator to write code.
