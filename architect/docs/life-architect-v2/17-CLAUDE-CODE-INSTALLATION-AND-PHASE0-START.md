# Claude Code installation and Phase 0 launch guide

## Status

`READY_FOR_OWNER_SETUP`

This guide prepares the development machine and starts only the repository audit. It does not merge PR #40 and does not begin production implementation.

## Official requirements

According to the current Anthropic Claude Code setup documentation:

- macOS 10.15+;
- Ubuntu 20.04+/Debian 10+;
- Windows 10+ using WSL or Git for Windows/Git Bash;
- at least 4 GB RAM;
- Node.js 18+ for the npm installation method;
- internet access for authentication and model processing.

Official setup reference:

`https://docs.anthropic.com/en/docs/claude-code/getting-started`

Official CLI reference:

`https://docs.anthropic.com/en/docs/claude-code/cli-usage`

## 1. Verify prerequisites

Open Terminal, PowerShell with WSL, or Git Bash and run:

```bash
node --version
npm --version
git --version
```

Node must be version 18 or newer.

If Node is missing, install a supported current LTS release from the official Node.js distribution or through a trusted version manager. On Windows/WSL, `which node` and `which npm` should point to Linux paths when working inside WSL, not to `/mnt/c/...` Windows binaries.

## 2. Install Claude Code

Standard official npm installation:

```bash
npm install -g @anthropic-ai/claude-code
```

Do **not** use:

```bash
sudo npm install -g @anthropic-ai/claude-code
```

After installation:

```bash
claude --version
claude doctor
```

Claude Code can update itself. Manual update command:

```bash
claude update
```

## 3. Authenticate

Run:

```bash
claude
```

Choose the authentication option matching the account:

- Claude App subscription when the available Pro/Max plan includes Claude Code;
- Anthropic Console/API billing;
- enterprise Bedrock/Vertex configuration when intentionally used.

Complete the browser/OAuth flow. Do not paste account passwords, API keys or tokens into this repository, chat prompts, issues or files.

After authentication, exit Claude Code for the moment:

```text
/exit
```

## 4. Get the repository

### Fresh computer

```bash
git clone https://github.com/ivanbelkov1984/CODING.git
cd CODING
```

### Existing local clone

```bash
cd /path/to/CODING
git status
git fetch origin
```

If `git status` shows local changes, do not discard them. Commit them to their proper branch or make a named stash before switching:

```bash
git stash push -u -m "before-life-architect-v2-phase0"
```

## 5. Check out the architecture branch

```bash
git fetch origin
git checkout agent/astrology-harness-foundation
git pull --ff-only origin agent/astrology-harness-foundation
```

Verify:

```bash
git status
git log --oneline --decorate -10
```

Expected state:

- branch: `agent/astrology-harness-foundation`;
- working tree clean;
- branch contains the current `MAIN` Dual Realm baseline;
- `architect/docs/life-architect-v2/00-INDEX.md` exists;
- `architect/docs/life-architect-v2/16-LLM-SYNTHESIS-VOICE-AND-SAFETY.md` exists;
- `architect/docs/life-architect-v2/17-CLAUDE-CODE-INSTALLATION-AND-PHASE0-START.md` exists.

## 6. Start Claude Code in the repository root

From the `CODING` directory:

```bash
claude
```

Do not use `--dangerously-skip-permissions`.

Inside Claude Code run:

```text
/status
```

The project may expose the custom skill:

```text
/life-architect-v2-kickoff
```

If the slash command is not discovered, this is not a blocker. Paste the start prompt below.

Do **not** run `/init`: the repository already has a curated root `CLAUDE.md`, and regenerating it could overwrite or conflict with the architecture contract.

`/effort ultracode` is not part of the guaranteed official CLI contract. Use it only if the installed Claude Code explicitly recognizes it, and confirm the result through `/status`. Otherwise continue normally.

## 7. Exact first prompt

Paste this as one message:

```text
You are starting Phase 0 for Life Architect v2.

Work only as a repository analyst. Do not implement product features and do not modify production application behavior.

Read completely, in this order:
1. CLAUDE.md
2. STUDIO_HANDOFF.md
3. architect/AGENT_BRIEF.md
4. architect/docs/life-architect-v2/00-INDEX.md
5. architect/docs/life-architect-v2/10-CLAUDE-CODE-EXECUTION-PLAN.md
6. architect/docs/life-architect-v2/16-LLM-SYNTHESIS-VOICE-AND-SAFETY.md
7. architect/docs/life-architect-v2/17-CLAUDE-CODE-INSTALLATION-AND-PHASE0-START.md

Then inspect the actual repository and create REPOSITORY_REALITY_REPORT.md.

The report must include:
- actual frontend, navigation, state and storage architecture;
- DEFAULT_DB, collections, IDCOLS, migrations, merge, tombstones, snapshots, import/export and correction behavior;
- local encryption, E2EE sync, server ciphertext/plaintext boundaries and profile isolation;
- existing diary, check-in, psychological annotations, health, cravings, smart insights and nudges;
- current AI routing, provider adapters, prompts, payloads, logging, retention, safety/post-processing and structured-output support;
- current service worker, caches, offline/version behavior;
- actual design system, Dual Realm implementation, tokens, components and accessibility constraints;
- conceptual-v2-entity to current-code/storage/UI mapping;
- conflicts between documentation and code;
- privacy, security, migration, licensing and regulatory risks;
- smallest safe module seams without rewriting the vanilla-JS application;
- minimal ordered migration plan with rollback;
- a repository-grounded proposal for LLM prompt-policy, validators and eval locations;
- Phase 1 task contracts with owners, files, dependencies, acceptance criteria, tests and rollback.

Strict restrictions:
- do not modify app.js, index.html, styles.css, sw.js, backend code, database schema, production fixtures or deploy configuration;
- do not create Next.js, React, TypeScript, Tailwind, shadcn, RxDB or a second application;
- do not create prompts/synthesis_oracle.ts by assumption;
- do not put real personal, health, psychological, birth or diary data into git, logs, issues or fixtures;
- do not merge PRs or deploy;
- do not start Phase 1.

You may create only audit/handoff documentation on a dedicated audit branch after showing the proposed file list. Use read-only commands first. At completion, run only relevant read-only or existing verification commands and show exact git diff/status evidence.
```

## 8. Permission decisions during the audit

Approve read-only commands such as:

- `git status`, `git log`, `git diff`, `git grep`;
- `find`, `ls`, `cat`, `sed`, `rg`;
- existing syntax/build/test commands when they do not rewrite tracked source files.

Pause and inspect before approving:

- package installation;
- database migrations;
- commands that delete or overwrite files;
- secrets/environment access;
- network uploads;
- commits, pushes, merges or deploys;
- changes outside audit documentation.

Never approve `--dangerously-skip-permissions` for this workflow.

## 9. What Claude must return before coding

Required Phase 0 handoff:

1. repository reality summary;
2. file/function/data map with evidence;
3. current versus proposed architecture matrix;
4. conflicts and risks;
5. proposed audit-document diff;
6. migration sequence and rollback strategy;
7. Phase 1 task contracts;
8. explicit list of questions requiring owner/legal/clinical/licensing decisions;
9. explicit statement that production behavior was not changed.

Do not proceed to Phase 1 automatically. The owner sends the report for architecture review first.

## 10. If installation fails

Run:

```bash
claude doctor
npm config get prefix
node --version
npm --version
```

Common rules:

- do not solve npm permissions with `sudo`;
- on Windows, use supported WSL or Git Bash and ensure `bash.exe`/Node paths are correct;
- check network/proxy configuration;
- update with `claude update` when the installation is recognized;
- use Anthropic's official troubleshooting documentation rather than random install scripts.

## 11. Current project status at launch

```text
UNIFIED_V2_ARCHITECTURE_COMPLETE
DUAL_REALM_BASELINE_SYNCED
LLM_VOICE_AND_SAFETY_CONTRACT_COMPLETE
DRAFT_PR_40_OPEN
PRODUCTION_IMPLEMENTATION_NOT_STARTED
READY_FOR_PHASE_0_REPOSITORY_AUDIT
```
