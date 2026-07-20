# Mobile-only Claude Code launch and Phase 0 guide

## Status

`MOBILE_ONLY_OWNER_WORKFLOW_READY`

This document supersedes the earlier desktop installation route for the project owner. Ivan has no Mac, Windows or Linux computer. The supported owner workflow uses iPad/iPhone, GitHub and cloud execution.

No Node.js, terminal, local clone or desktop Claude Code installation is required for the primary path.

## Supported surfaces

### Primary — official Claude Code cloud

Use either:

- the **Code** tab in the official Claude app for iOS/iPadOS; or
- `https://claude.ai/code` in Safari.

Claude runs in an Anthropic-managed isolated cloud environment, clones the selected GitHub repository, works on a branch and pushes results for review.

Official references:

- `https://code.claude.com/docs/en/web-quickstart`
- `https://code.claude.com/docs/en/claude-code-on-the-web`
- `https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link`

### Secondary — GitHub Codespaces in Safari

Use Codespaces only when a manual terminal, live forwarded port or deeper file inspection is needed. It is a cloud computer opened in the browser, not a physical computer owned by Ivan.

### Last-resort fallback — owned Linux VPS

A VPS plus an iOS SSH/Claude client is allowed only if official Claude Code cloud cannot perform a required task. It introduces server administration, credentials, patching and cost, so it is not the default.

Third-party mobile clients are optional interfaces, never the source of truth. The repository and pull requests remain the source of truth regardless of app name.

## Account prerequisites

1. Claude account with Claude Code cloud access.
2. GitHub account with access to `ivanbelkov1984/CODING`.
3. Claude GitHub App authorized for this repository.
4. Official Claude app installed on iPad/iPhone, or Safari access to `claude.ai/code`.
5. GitHub app or GitHub web available for PR review.

Do not paste API keys, GitHub tokens, Apple certificates, medical data or personal diary content into prompts or repository files.

## Connect GitHub

In Claude Code cloud:

1. Open the Code tab.
2. Connect GitHub when prompted.
3. Grant the minimum repository access needed: `ivanbelkov1984/CODING`.
4. Confirm that repository and branch selectors are visible.

Cloud sessions require GitHub access to clone the repository and push a result branch.

## Start Phase 0 from iPad or iPhone

Select:

- repository: `ivanbelkov1984/CODING`;
- base branch: `agent/astrology-harness-foundation`;
- mode: **Plan**.

Do not start from `MAIN`, because the v2 architecture and harness are still in draft PR #40.

A mobile deep link may be used when supported:

```text
claude://code/new?repo=ivanbelkov1984%2FCODING&branch=agent%2Fastrology-harness-foundation&mode=plan
```

The link only preselects context. Verify the repository and branch on screen before sending the task.

## Exact first mobile prompt

Paste as one message:

```text
You are starting Phase 0 for Life Architect v2 in a cloud-only, mobile-owner workflow.

The owner has only an iPad and iPhone. Do not require a local computer, local terminal, desktop IDE or manual coding by the owner.

Work only as a repository analyst. Do not implement product features and do not modify production application behavior.

Read completely, in this order:
1. CLAUDE.md
2. STUDIO_HANDOFF.md
3. architect/AGENT_BRIEF.md
4. architect/docs/life-architect-v2/00-INDEX.md
5. architect/docs/life-architect-v2/10-CLAUDE-CODE-EXECUTION-PLAN.md
6. architect/docs/life-architect-v2/16-LLM-SYNTHESIS-VOICE-AND-SAFETY.md
7. architect/docs/life-architect-v2/17-CLAUDE-CODE-INSTALLATION-AND-PHASE0-START.md
8. architect/docs/life-architect-v2/18-MOBILE-ONLY-DEVELOPMENT-AND-NATIVE-MIGRATION.md

Inspect the actual repository and prepare REPOSITORY_REALITY_REPORT.md.

The report must include:
- actual frontend, navigation, state and storage architecture;
- DEFAULT_DB, collections, IDCOLS, migrations, merge, tombstones, snapshots, import/export and correction behavior;
- local encryption, E2EE sync, server ciphertext/plaintext boundaries and profile isolation;
- existing diary, check-in, psychological annotations, health, cravings, smart insights and nudges;
- current AI routing, provider adapters, prompts, payloads, logging, retention, safety/post-processing and structured-output support;
- service worker, caches, offline/version behavior;
- actual Dual Realm design, tokens, components, safe-area and accessibility behavior;
- conceptual-v2-entity to current-code/storage/UI mapping;
- conflicts between documentation and code;
- privacy, security, migration, licensing and regulatory risks;
- smallest safe module seams without rewriting the vanilla-JS application;
- minimal ordered migration plan with rollback;
- repository-grounded locations for LLM prompt policy, validators and evals;
- current deployment/preview path and a mobile-accessible PR preview proposal;
- readiness of the existing web app for a later Capacitor iOS/Android wrapper;
- Phase 1 task contracts with owners, files, dependencies, acceptance criteria, tests and rollback.

Strict restrictions:
- do not modify app.js, index.html, styles.css, sw.js, backend code, database schema, production fixtures or deploy configuration;
- do not create Next.js, React, TypeScript, Tailwind, shadcn, RxDB or a second application;
- do not create prompts/synthesis_oracle.ts by assumption;
- do not put real personal, health, psychological, birth or diary data into git, logs, issues or fixtures;
- do not add production secrets to Claude cloud environments;
- do not merge PRs or deploy;
- do not start Phase 1;
- do not ask the owner to run desktop commands.

Create only audit/handoff documentation on a new Claude-generated branch based on agent/astrology-harness-foundation. Before writing, show the proposed file list. At completion, open a draft PR and stop.
```

## Permission mode

Use **Plan mode** for Phase 0.

Cloud sessions may also offer an edit-accepting mode. Do not use it for the initial audit. The owner must first see the plan and proposed file list.

For later implementation tasks, auto-accepted edits are allowed only when all of the following are true:

- a dedicated task branch is used;
- the files owned by the task are explicit;
- migrations and rollback are defined;
- production secrets and real personal data are absent;
- CI and mobile preview gates are required;
- merge remains manual.

## Expected Phase 0 result

Claude must create a separate draft PR containing only audit/handoff documentation, including:

1. `REPOSITORY_REALITY_REPORT.md`;
2. conceptual entity → actual code/storage/UI map;
3. AI routing and provider payload audit;
4. current deploy and preview map;
5. mobile-only development constraints;
6. native-readiness findings;
7. minimal migration sequence;
8. Phase 1 task contracts;
9. explicit statement that production behavior was not changed.

Claude must then stop.

## Review from iPad

Prefer iPad Safari in desktop-site mode for large diffs. The GitHub mobile app is suitable for status, comments, checks and simple diffs.

Review only:

- changed filenames;
- whether any production file was touched;
- report completeness;
- CI/check status;
- Claude's final summary;
- unresolved owner/legal/licensing decisions.

Do not merge the audit PR or PR #40 until the report is reviewed against the v2 architecture.

## If official Claude Code cloud is unavailable

### Fallback A — GitHub Codespaces

Create a codespace from the architecture branch in Safari:

```text
https://codespaces.new/ivanbelkov1984/CODING/tree/agent/astrology-harness-foundation
```

Codespaces provides a browser editor, terminal and private forwarded ports. Use it for manual inspection and previews. Keep ports private unless a specific test requires a temporary public URL.

Claude Code can be installed inside the Linux codespace using the current official native Linux installer when needed. Do not use obsolete desktop-specific instructions from earlier versions of this document.

### Fallback B — VPS

Use a personal Linux VPS only after a security task defines:

- non-root account;
- SSH-key authentication;
- firewall and automatic security updates;
- encrypted backups;
- secret storage;
- repository access scope;
- session persistence;
- monthly budget and deletion procedure.

## Current project status

```text
UNIFIED_V2_ARCHITECTURE_COMPLETE
MOBILE_ONLY_OWNER_WORKFLOW_DEFINED
DUAL_REALM_BASELINE_SYNCED
LLM_VOICE_AND_SAFETY_CONTRACT_COMPLETE
DRAFT_PR_40_OPEN
PRODUCTION_IMPLEMENTATION_NOT_STARTED
READY_FOR_CLOUD_PHASE_0_REPOSITORY_AUDIT
```
