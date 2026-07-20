# Phase 0 Repository Reality Report — Life Architect v2

Status: `PHASE_0_CORRECTION_PASS_DOCUMENTATION_ONLY`

Scope: repository reality audit only. No production code, dependencies, schemas, fixtures, workflows, deploy configuration, or runtime behavior are changed by this report.

## Claim taxonomy

Every material statement is classified as one of: **observed repository fact**, **architectural inference**, **confirmed risk**, **plausible risk**, **recommendation**, **open question**, **evidence gap**, or **owner decision required**.

## Branch and repository reality

| Claim | Value | Classification |
|---|---|---|
| Audit base | `agent/astrology-harness-foundation` at `264c6cd74ff49e02d1f1107c907b5b847472fd92` | observed repository fact |
| Previous audit head | `codex/-phase-0-life-architect-v2` | observed repository fact |
| Replacement correction branch | `codex/phase-0-life-architect-v2-correction-pass` | observed repository fact |
| Previous PR | PR #46, Draft, not merged | observed repository fact |
| Canonical baseline for this audit | `agent/astrology-harness-foundation` because the approved architecture work and PR base are anchored there | owner decision required / architectural inference |
| MAIN relationship | Must be re-verified immediately before implementation because this audit intentionally targets the approved architecture branch rather than assuming MAIN is identical | evidence gap |

The audit must not be treated as proof that MAIN and the architecture branch are identical. A Phase 0.5 branch comparison is mandatory before schema or migration implementation.

## Command evidence

The following evidence is available from the repository and PR workflow. Where a command was not directly executed in the audit environment, it is marked as an evidence gap rather than claimed as passed.

| Command / check | Working directory | Result | Exit | Changed files | Limitation |
|---|---|---|---:|---|---|
| `git status --short` | repository root | Previous Codex correction run reported clean working tree | 0 reported | no | Local Codex environment could not push to GitHub |
| `git diff --stat` | repository root | Replacement PR verification must prove seven Markdown files only | pending remote verification | no | Phase 0.5 gate |
| `git diff --name-only` | repository root | Expected seven approved files only | pending remote verification | no | Phase 0.5 gate |
| `node --check architect/app.js` | repository root | Not independently recorded in PR #46 audit | evidence gap | no | Must be executed in Phase 0.5 |
| `node --check architect/sw.js` | repository root | Not independently recorded in PR #46 audit | evidence gap | no | Must be executed in Phase 0.5 |
| `node --check architect/backend/server.js` | repository root | Not independently recorded in PR #46 audit | evidence gap | no | Must be executed in Phase 0.5 |
| repository install command | `architect/` or repository-defined location | CI used install step successfully | 0 in CI | dependency workspace only | Exact lockfile policy must be confirmed |
| `npm test` | repository-defined location | GitHub Actions job `e2e` completed successfully; `Build + E2E` succeeded | 0 in CI | generated artifacts only | Does not replace explicit Phase 0.5 command ledger |
| build command (`node build.mjs` or repository-defined equivalent) | repository-defined location | Included in successful CI step, exact standalone invocation not separately logged in audit | evidence gap | generated `dist` only | Must be recorded explicitly in Phase 0.5 |

## Observed repository facts

| Area | Evidence | Observed behavior | Confidence |
|---|---|---|---|
| Frontend architecture | `architect/index.html`, `architect/app.js` | Vanilla JavaScript PWA with a large in-memory `DB` object and DOM rendering functions; no React/Next/TypeScript runtime | high |
| Primary persistence | `architect/app.js`: `DEFAULT_DB`, `persistLocal`, `hydrate` | Main profile data is serialized to localStorage; IndexedDB is not the primary database | high |
| Profile isolation | `PKEY`, `dbKey`, `cfgKey`, `passKey` | Data/config/passphrase storage is namespaced by active profile id | high |
| Legacy migration | `ensureProfiles` | Legacy flat keys are copied into a default profile and removed | high |
| Recovery | `hydrate`, local backup slots, `snapshotDaily` | Primary local data can recover from local backup; daily snapshots are retained locally | high |
| Record migration | `migrateRecords` | Lightweight inline migration backfills selected metadata such as `createdAt`, `day`, and `sv` | high |
| Media storage | `idbOpen` and related media functions | IndexedDB stores media blobs separately from the main DB | high |
| Sync merge | `IDCOLS`, `tomb`, `mergeById`, `mergeDB` | ID collections are merged by record id with tombstones and document timestamps | high |
| E2EE envelope | `encryptPayload`, `decryptPayload`, `packPayload`, `unpackServer` | Sync payload can be encrypted client-side before server storage when configured | high |
| AI providers | `AI_PROVIDERS`, `callClaude`, `AI_SYSTEM`, `PSY_SYSTEM` | Browser-side calls exist for multiple providers; prompts remain inline in `app.js` | high |
| Sensitive AI use | `markPsyBatch` and diary-related functions | User-selected diary/reflection text can be sent to a cloud AI provider when AI is enabled | high |
| Health scope | `cravingRisk`, health rendering functions | Current health logic is heuristic self-management, not validated diagnosis | high |
| PWA/offline | `architect/sw.js`, `manifest.json` | App shell caching and offline-capable PWA behavior exist | high |
| CI | `.github/workflows/ci.yml` | Current CI runs install, Chromium, build/test path; no verified mobile screenshot matrix or per-PR preview artifact | high |
| Deploy | `.github/workflows/deploy.yml` | Production deployment is separate and must not be modified in Phase 0/0.5 | high |

## Data-flow and privacy boundary

| State/path | Plaintext or ciphertext | Location/destination | Data potentially included | Trigger | Retention / unresolved |
|---|---|---|---|---|---|
| Active local DB | plaintext at runtime and in localStorage | browser profile storage | diary, dreams, health/self-management, chats, settings | automatic | browser-managed; quota/eviction risk |
| Local backup slots | plaintext JSON | localStorage | full profile DB/config depending on implementation | automatic/manual recovery | exact retention must be verified |
| Daily snapshots | plaintext JSON | localStorage | profile DB snapshot | automatic daily | current code retains limited history |
| Export JSON/Markdown | plaintext | user-selected download/share target | selected or full exported content | explicit user action | outside app control after export |
| Sync payload before encryption | plaintext in browser memory | client runtime | syncable profile state | sync action | transient; must avoid logs |
| Encrypted sync payload | ciphertext envelope | network/server space storage | encrypted profile payload plus metadata necessary for transport | user-configured sync | server retention policy requires verification |
| Server storage | intended ciphertext for sync spaces | backend storage | opaque encrypted blob when E2EE configured | sync | exact deployed backend path requires proof |
| AI provider request | plaintext | third-party AI provider | prompt, selected diary/reflection/health context, metadata | explicit AI feature use | provider policy outside app; disclosure required |
| Feedback form | plaintext unless separately protected | feedback endpoint/workflow | user-entered feedback and possibly diagnostics | explicit submit | retention/access policy unresolved |
| Error buffer | plaintext diagnostic data | browser memory/local storage depending on implementation | errors, possibly UI/context strings | automatic | must prove personal data minimization |
| Feedback triage | plaintext | operator workflow | submitted feedback and diagnostics | manual review | access control/retention unresolved |

The system is therefore **not globally E2EE**. E2EE applies to the encrypted sync path, not automatically to AI-provider requests, feedback, exports, local storage, or operational diagnostics.

## Tombstone and merge correctness

**Plausible risk, not confirmed defect.** `DB._del`, `tomb()`, `IDCOLS`, `mergeById()`, and `mergeDB()` appear to use record ids as merge/deletion keys. If tombstones are global rather than collection-qualified, equal ids in different collections could theoretically collide. This must not be elevated to a confirmed defect without a synthetic test.

Required Phase 0.5 test:

1. Create two records with the same `id` in two different `IDCOLS` collections.
2. Tombstone only one collection's record.
3. Execute local merge and encrypted sync roundtrip.
4. Assert the other collection's record survives.
5. Repeat in both merge directions and after snapshot restore/import.

Classification remains `plausible risk` until this test proves or disproves the behavior.

## Key risks

1. **Confirmed risk — privacy:** browser-side AI requests send selected plaintext content to third-party providers.
2. **Confirmed risk — storage/data loss:** whole-DB localStorage persistence has quota and transactional limitations.
3. **Confirmed risk — governance:** inline prompts/policies are difficult to review and test independently.
4. **Confirmed risk — mobile evidence:** current CI does not prove iPhone/iPad layout, installability, offline reload, or accessibility.
5. **Plausible risk — sync correctness:** cross-collection tombstone collisions require synthetic tests.
6. **Evidence gap — backend boundary:** deployed server must be proven not to persist plaintext personal sync content.
7. **Confirmed risk — regulatory:** health features must remain self-management and must not drift into diagnosis/treatment claims.

## Phase sequencing decision

Phase 1 must not begin directly from this audit. An explicit **Phase 0.5** is required to produce executable evidence for branch freshness, syntax/build/test commands, migration roundtrips, tombstone isolation, privacy boundaries, mobile CI evidence, and owner decisions.

## Open questions / owner decisions

- Is browser-side BYO AI key storage acceptable for v2, or must a privacy gateway become the target architecture?
- What exact intended-purpose wording governs the Health Organizer?
- What retention/access rules apply to feedback and diagnostics?
- Which branch is canonical for production implementation after comparing MAIN and the architecture branch?

## Final status

`REPOSITORY_REALITY_AUDIT_CORRECTED`

`PHASE_0_5_REQUIRED_BEFORE_PHASE_1`

`PRODUCTION_IMPLEMENTATION_NOT_STARTED`
