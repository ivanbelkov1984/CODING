# Phase 0.5 Repository and Command Evidence

Status: `PHASE_0_5_REPOSITORY_EVIDENCE_COMPLETE`

Scope: evidence only. Production behavior, runtime files, workflows, schemas, dependencies, fixtures, deployment configuration, AI behavior, health behavior, and native configuration are unchanged.

## Claim taxonomy

Material statements are classified as **observed repository fact**, **architectural inference**, **confirmed risk**, **plausible risk**, **recommendation**, **evidence gap**, or **owner decision required**.

## Environment

| Item | Evidence | Result | Classification |
|---|---|---|---|
| Codex local branch | `git branch --show-current` | `agent/phase-0-5-repository-evidence` | observed repository fact |
| Codex local report commit | `git log -1 --oneline` | `6deb3a1edc563ee2e78ac1d65d45c5e2c9adc984` existed locally but could not be pushed | observed repository fact |
| Codex local Node | `node --version` | `v24.15.0` | observed repository fact |
| CI Node | `.github/workflows/ci.yml` | Node 22 | observed repository fact |
| Remote access in Codex container | `git fetch --all --prune` | exit 128, `CONNECT tunnel failed, response 403` | evidence gap caused by execution environment |
| GitHub API access in architect review | repository connector | available; remote branch facts verified below | observed repository fact |

## Branch and repository reality

| Claim | Result | Classification |
|---|---|---|
| Repository default branch | `MAIN` | observed repository fact |
| Current MAIN SHA | `14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d` | observed repository fact |
| Architecture branch SHA before this evidence PR | `aa262c48899068d32aa1da2c646b7807f7b14a28` | observed repository fact |
| Merge base | `27e34806decb7f6c706734a4ca253a25762248d4` | observed repository fact |
| Architecture branch relative to MAIN | diverged: architecture branch is 27 commits ahead and 1 commit behind MAIN | observed repository fact |
| MAIN-only runtime change | `architect/styles.css`, 12 additions and 12 deletions | observed repository fact |
| Architecture-only scope | architecture/harness/docs and Phase 0 documentation; compare contains many added files | observed repository fact |
| Canonical base for Phase 0.5 evidence work | `agent/astrology-harness-foundation`, because Phase 0 contracts were merged there | recommendation / owner decision required |
| Canonical production implementation base | not yet safe to declare until the MAIN-only CSS change is reviewed and the branches are reconciled intentionally | owner decision required |

### Branch conclusion

The architecture branch is not merely stale and is not a strict descendant of MAIN. It has diverged. It contains the approved architecture and Phase 0 documentation, while MAIN contains one runtime-only stylesheet commit absent from the architecture branch.

Phase 0.5 evidence tasks may continue from `agent/astrology-harness-foundation` because their purpose is to validate the approved architecture contracts. Production implementation must not begin until the MAIN-only `architect/styles.css` change is inspected and an explicit reconciliation strategy is approved.

## Repository install reality

| Area | Result | Classification |
|---|---|---|
| Frontend lockfile | no frontend lockfile was available in the Codex checkout | observed repository fact |
| CI install command | CI uses `npm install` rather than `npm ci` | observed repository fact |
| Local evidence install | `cd architect && npm install --no-package-lock` | observed repository fact |
| Install result | exit 0; only ignored `node_modules` affected | observed repository fact |
| Build command | `node architect/build.mjs` | observed repository fact |
| Build output | ignored `architect/dist/` | observed repository fact |
| Test command | `cd architect && npm test` | observed repository fact |
| Playwright requirement | Chromium executable is required | observed repository fact |
| Local browser installation | blocked by Playwright CDN 403 in Codex environment | evidence gap |

## Command ledger

| Command | Working directory | Exit | Result | Tracked files changed | Classification |
|---|---|---:|---|---|---|
| `git remote -v` | repository root | 0 | origin configured as `https://github.com/ivanbelkov1984/CODING.git` | no | observed repository fact |
| `git fetch --all --prune` | repository root | 128 | blocked by CONNECT tunnel 403 | no | evidence gap |
| `git branch -a` | repository root | 0 | only local refs visible in Codex before task branch creation | no | observed repository fact |
| `git rev-parse HEAD` | repository root | 0 | pre-report local HEAD `420af0697844b99de9d80dfe8540dafd93c1d9e4` | no | observed repository fact |
| `git rev-parse origin/MAIN` | repository root | 128 | unavailable because fetch failed | no | evidence gap, now closed independently through GitHub API |
| `git rev-parse origin/agent/astrology-harness-foundation` | repository root | 128 | unavailable because fetch failed | no | evidence gap, now closed independently through GitHub API |
| `git merge-base origin/MAIN origin/agent/astrology-harness-foundation` | repository root | 128 | unavailable because fetch failed | no | evidence gap, now closed independently through GitHub API |
| `git rev-list --left-right --count origin/MAIN...origin/agent/astrology-harness-foundation` | repository root | 128 | unavailable because fetch failed | no | evidence gap, now closed independently through GitHub API |
| `git diff --name-status origin/MAIN...origin/agent/astrology-harness-foundation` | repository root | 128 | unavailable because fetch failed | no | evidence gap, now closed independently through GitHub API |
| `git status --short` | repository root | 0 | clean before report creation | no | observed repository fact |
| `git diff --stat` | repository root | 0 | empty before report creation | no | observed repository fact |
| `git diff --name-only` | repository root | 0 | empty before report creation | no | observed repository fact |
| `node --check architect/app.js` | repository root | 0 | syntax passed | no | observed repository fact |
| `node --check architect/sw.js` | repository root | 0 | syntax passed | no | observed repository fact |
| `node --check architect/backend/server.js` | repository root | 0 | syntax passed | no | observed repository fact |
| `cd architect && npm install --no-package-lock` | repository root | 0 | dependencies available; ignored `node_modules` only | no | observed repository fact |
| `node architect/build.mjs` | repository root | 0 | build completed; ignored `architect/dist/` generated | no | observed repository fact |
| `cd architect && npm test` | repository root | 1 | build succeeded; Playwright could not launch missing Chromium | no | observed repository fact / environment blocker |
| `cd architect && npx playwright install chromium` | repository root | 1 | Playwright CDN returned 403 | no | evidence gap caused by environment |

## CI correlation

| CI property | Result | Classification |
|---|---|---|
| Node version | 22 | observed repository fact |
| Dependency install | `npm install` | observed repository fact |
| Browser install | Playwright Chromium install | observed repository fact |
| Test path | `npm test`, including build and E2E | observed repository fact |
| Latest Phase 0 PR evidence | PR #47 CI completed successfully | observed repository fact |
| Syntax checks | not separately proven as dedicated CI steps; runtime parsing/build/test may cover portions indirectly | evidence gap |
| Mobile viewport matrix | not proven | confirmed evidence gap |
| Artifacts/screenshots/traces | not published by the observed workflow | observed repository fact |
| Per-PR preview | not available | observed repository fact |

CI proves that the repository builds and its configured Chromium E2E test path passes in the GitHub runner environment. It does not prove iPhone/iPad behavior, offline update behavior, accessibility, native readiness, or privacy boundaries.

## Generated-file behavior

- `node_modules/` is ignored and did not create tracked changes.
- `architect/dist/` is generated and ignored.
- The local install/build/test sequence did not modify tracked runtime files.
- This PR must contain only this evidence report.

## Evidence gaps and blockers

1. **Closed independently:** default branch, remote SHAs, merge base, ahead/behind, and remote branch diff were unavailable in Codex but verified through GitHub API.
2. **Open:** local Chromium E2E could not run because browser download was blocked. GitHub CI provides successful equivalent runner evidence, but reproducible local execution in Codex remains unavailable.
3. **Open:** local Node 24 differs from CI Node 22.
4. **Blocking production implementation:** MAIN and the architecture branch are diverged, with a MAIN-only `architect/styles.css` change requiring inspection and deliberate reconciliation.
5. **Not blocking further evidence-only Phase 0.5 work:** the branch divergence does not prevent synthetic tests or privacy/mobile evidence based on the approved architecture branch, provided no production merge occurs.

## Canonical-base recommendation

Continue Phase 0.5-B, Phase 0.5-C, and Phase 0.5-D from `agent/astrology-harness-foundation`, each in a separate evidence-only branch and PR.

Before any Phase 1 implementation, perform a dedicated branch-reconciliation decision:

- inspect the MAIN-only `architect/styles.css` change;
- determine whether it must be merged/cherry-picked into the architecture branch;
- confirm whether the architecture branch will later merge into MAIN or be rebased/recreated from MAIN;
- rerun CI after reconciliation.

## Owner decisions required

1. Approve `agent/astrology-harness-foundation` as the temporary canonical base for remaining Phase 0.5 evidence tasks.
2. Decide the final branch reconciliation strategy before Phase 1.
3. Decide whether CI success is acceptable evidence for Chromium E2E while the Codex environment cannot download Chromium.

## Allowed next task

`P0.5-B — Data roundtrip and tombstone tests`, evidence-only, synthetic fixtures only, separate branch and PR.

## Forbidden next task

Phase 1 implementation, production branch merge, destructive migration, runtime defect fix, deploy modification, or native packaging.

## Rollback

Revert this documentation-only commit. No runtime state, user data, schema, or deployment behavior is affected.

## Final markers

`PHASE_0_5_REPOSITORY_EVIDENCE_COMPLETE`

`PRODUCTION_BEHAVIOR_UNCHANGED`

`PHASE_1_NOT_STARTED`

`READY_FOR_ARCHITECT_REVIEW`
