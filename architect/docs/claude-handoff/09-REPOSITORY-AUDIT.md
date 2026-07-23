# 09 — REPOSITORY AUDIT

> Status: COMPLETED — filled from repository-grounded evidence by a read-only Claude Code audit. No runtime files were modified.

## 1. Audit identity

- Audit date: 2026-07-23
- Auditor/session: Claude Code (read-only reality audit, clean-restart handoff)
- Repository: `ivanbelkov1984/CODING`
- Base branch: `MAIN`
- Base SHA: `14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d`
- Audit branch: `claude/life-architect-clean-restart`
- Runtime files changed: **none** (only `architect/docs/claude-handoff/09-REPOSITORY-AUDIT.md` written)

## 2. Branch and PR reality

- Default branch: `MAIN`
- Current `MAIN` SHA: `14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d`
- Clean Claude branch SHA: `02cfc2c1e2e0448b9355de71e659e31aa7f901c6` (11 docs-only commits over MAIN; `merge-base == MAIN`, 0 behind — confirmed based directly on MAIN)
- Archive branch SHA: `a85397d6aa3d021e3a2b4eef44f7c38f485909d6` (= manifest source; history preserved)
- Codex PRs: **#40 closed/unmerged**, **#63 closed/unmerged**, **#64 closed/unmerged** (verified via API)
- Open PR inventory (13): #65 (this handoff, draft), #43, #38, #37, #31, #30, #27, #25, #16 (draft), #14, #13, #5 (legacy 2024 marketplace, base `fix-dashboard-screen`). No open PR uses any `agent/*` or `codex/*` head.
- Old Claude PR classification: see §10.
- **Branch deletion completed: NO — BLOCKED.** `git push --delete` and `git push origin :refs/heads/<b>` both return **HTTP 403** through the session git proxy; no GitHub MCP branch-delete tool exists (only `create_branch`/`delete_file`). This is the same connector limitation the manifest recorded for the ChatGPT connector. The 15 `agent/*` + `codex/fix-blocking-issues-in-pr-#63` are all reachable from the archive (safe to delete when a permitted environment is available). **3 codex branches are NOT reachable from the archive** and must NOT be deleted until archived or owner-approved (see §12).

## 3. Application structure

Vanilla-JS offline-first PWA (`architect/package.json` name `architect-web`, `version 5.0.0`, `type: module`). Runtime files:

- `architect/index.html` (1120 lines) — single-page shell, all screens as `.pg` sections, left sidebar nav `#nav`, inline SVG logo + per-element icons.
- `architect/styles.css` (1287 lines) — token-layer design system (`:root` + `[data-theme="light"]`); Dual Realm (Deep Space / Ethereal Light).
- `architect/app.js` (5438 lines) — all runtime logic: profiles, storage, DB, IndexedDB media, sync/E2EE crypto, AI routing, rendering, feedback, push.
- `architect/build.mjs` (68 lines) — build/deploy assembler (see §8).
- `architect/sw.js` (74 lines) — service worker (see §8).
- `architect/backend/` — Express + PostgreSQL sync API (`server.js`, `push.js`, `feedback.js`, `digest.mjs`, `triage.mjs`, `railway.json`).
- `architect/tests/e2e.mjs` — Playwright E2E (single suite).
- Assets: `lucide.js` (614 KB, self-hosted), `inter-latin.woff2`/`inter-cyrillic.woff2`, `manifest.json`, icons.
- Icons: **mixed** — Lucide `data-lucide` in nav/chrome + hand-written inline SVG in tiles/logo (noted for later design work; not a defect).

## 4. Storage model

### Profiles
- Registry keys: `PKEY='arch5_profiles'`, active `AKEY='arch5_active'`.
- Per-profile builders: `dbKey='arch5_db_'+id`, `cfgKey='arch5_cfg_'+id`, `passKey='arch5_pass_'+id`, `recKey='arch5_rec_'+id`, `aiKeySlot='arch5_aikey_'+[prov_]+activeId`, `bakKey='arch5_bak_'+id` (backup snapshot), `snapPrefix='arch5_snap_'+id+'_'`.
- Legacy single-profile keys `arch5_db`/`arch5_cfg`/`arch5_pass` are migrated into a profile on load, then removed.

### Main DB
- Storage: `localStorage[dbKey(id)]`, JSON.
- Collections (from `DEFAULT_DB`): `insights, dreams, patterns, evolution, spiritual, checkins, spheres, sphereLogs, bots, chapters, digests, chats, cravings, oq, vit, env` + meta `_del` (tombstones) + `__ts` (document timestamp).
- Merge/conflict: CRDT-like union by record `id`; newest per-record marker `_u` wins (`touch()` stamps `_u=Date.now()`); scalar fields (`vit/chapters/oq/env`) merged by document `__ts`.
- Deletion/tombstones: `_del[key]=timestamp`; deletes propagate via tombstones; old tombstones garbage-collected past a cutoff.
- Schema/migration: version marker `arch5_ver`; light in-place migrations on load. No formal versioned migration framework — **flag for backup/data work**.

### Configuration (CFG)
- Portable/user fields: `userName`, `domainLabel`, `axes`, `aiProvider`, `chatModel`, week focuses, etc.
- Device-local connection fields (must NOT go into portable backup): `apiUrl` (backend override), `spaceKey` (sync space id), `lastSync`.
- Secret fields (must NOT be exported): passphrase `passKey(id)`, recovery key `recKey(id)`, AI keys `aiKeySlot`.

### IndexedDB media
- Database `IDB_NAME='arch5_media'`, object store `IDB_STORE='media'`, version 1, plain key→value (`idbPut/idbGet/idbDel`, `getAllKeys` for GC).
- **Single global store shared across profiles** (not namespaced by profile id in the store name). Media IDs referenced from DB records. Exact record format, media-ID generation, GC completeness and per-profile isolation **need a deeper focused read before backup** (see §11/§12) — not fully proven in this pass.

## 5. Sync and encryption

- Endpoints (client → backend): `POST /api/space`, `GET /api/space/:key`, `PUT /api/space/:key`, `DELETE /api/space/:key`, plus `GET /health`, push `GET /api/push/vapid` / `POST /api/push/subscribe`, `POST /api/feedback`.
- Encrypted vs plain: if a passphrase is set (`getPass()`), the whole bundle is encrypted client-side via `encryptPayload` → envelope `{_enc, salt, iv, ct, wraps{pass, recovery?}}`; server stores an opaque blob. **If no passphrase is set, sync uploads plaintext JSON** (documented forward-encryption gap; see §12).
- Crypto: PBKDF2-SHA-256, `KDF_ITER=600000` (v2); legacy `100000` still readable (v1 back-compat). AES-GCM-256. Random `salt(16)`/`iv(12)`. Envelope v2 = random DEK encrypts data; DEK wrapped by passphrase AND optionally by recovery key (`_wrapDek/_unwrapDek`).
- Recovery: recovery key generated as 20 random bytes (grouped string); `restoreByRecovery` fetches space and decrypts with `decryptPayload(..., 'recovery')`; downgrade protection after recovery.
- Secrets stored locally only: passphrase, recovery key, AI keys — never sent to sync server.

## 6. AI provider boundary

Provider registry `AI_PROVIDERS`; dispatcher `callClaude()` routes by `CFG.aiProvider` (default `anthropic`); ledger `arch5_ai_ledger`; budget warn `arch5_ai_budget_warned`.

| Feature | Function/file | Provider routing | Data sent | Structured schema | Timeout | Persistence after response |
|---|---|---|---|---|---|---|
| All AI features (dialog, dream, psy, "разобрать", reviews) | `callClaude()` → `AI_PROVIDERS[p].call` (`app.js` ~4202–4304) | `anthropic` `POST https://api.anthropic.com/v1/messages` (`x-api-key`); `openai` `POST https://api.openai.com/v1/chat/completions`; `gemini` `.../v1beta/models/{model}:generateContent?key=` | User-selected text + system prompt, **plaintext**, **direct from browser** | optional JSON schema per call | provider default (no explicit client timeout observed) | usage tokens appended to local `arch5_ai_ledger`; response content stored in DB only where the feature saves it |

Direct browser→provider (NOT through project backend). Models offered: Claude Sonnet 5 / Opus 4.8 / Haiku 4.5, GPT-4o / 4o-mini, Gemini 2.5 Pro / 2.0 Flash. **Honest boundary:** the AI provider sees exactly the text the user sends; E2EE does not cover the AI layer (matches `SECURITY_MODEL.md`).

## 7. Backend and feedback

- `backend/server.js` — Express; single table `spaces(key uuid pk, name, db jsonb, cfg jsonb, created_at, updated_at)` in PostgreSQL (Railway `DATABASE_URL`). `helmet` (CSP off — it's an API), `trust proxy`, CORS allowlist (`ALLOWED_ORIGINS`, default `https://ivanbelkov1984.github.io`; no-Origin requests allowed), `express.json({limit:'5mb'})`, rate limit **120 req/min per IP on `/api`**.
- Data retained: whatever the client stores in its space — an **opaque encrypted blob when E2EE is on**, or plaintext JSON when the user set no passphrase. No server-side redaction (server cannot read encrypted content).
- `push.js` — Web Push under a VAPID guard (no keys → no-op). `feedback.js` — append-only feedback log (`POST /api/feedback`). `digest.mjs`/`triage.mjs` — auxiliary jobs.

## 8. PWA/build/deploy

- `build.mjs`: inlines `styles.css` + `app.js` into `index.html` → `dist/index.html`; content-hash version (`sha256`, `arch-<hash>`); replaces `__BUILD__` in `sw.js`; copies static (`lucide.js`, fonts, `manifest.json`, icons). `--combined <out>` emits a single HTML for tests.
- `sw.js`: cache `arch-__BUILD__` (bumped every build; old caches purged on `activate`). Precache SHELL (`./`, index, lucide, fonts, manifest, icons). **Navigation = network-first** (update cached `index.html`, fallback to cache offline); other requests = cache-first with background revalidate.
- Deploy: `dist/` published to `gh-pages` (GitHub Pages `ivanbelkov1984.github.io/CODING/architect/`) via the repo's `.github/workflows` (CI job "CI — Архитектор" on `architect/**`, plus a gh-pages deploy workflow). Offline-first; update on next navigation after new build.

## 9. Tests

| Command | Purpose | Actual result | Browser/engine |
|---|---|---|---|
| `npm run build` (`node build.mjs`) | assemble `dist/` | **PASS** (`✓ dist/ собран · версия arch-v81f162ed1c · файлов: 9`) | n/a |
| `node --check` build.mjs/app.js/sw.js/tests/e2e.mjs | syntax gate | **PASS** (all clean) | n/a |
| `npm test` (`build --combined` + `node tests/e2e.mjs`) | Playwright E2E | **BLOCKED** — Playwright wants Chromium revision 1228; container has only 1194 (also prior note of Playwright CDN 403). E2E did not execute here. | Chromium (unavailable) |

Evidence gaps: E2E not run in this container (infra, not a code defect — CI on GitHub Actions runs it). Media record format / GC semantics not exhaustively read.

## 10. Open old Claude PR classification

Each compared against **current** `MAIN@14db0a9` by diff, not by title. All bases are stale pre-Dual-Realm MAIN SHAs → any future merge requires rebase.

| PR | Diff vs MAIN | Status vs MAIN | Recommendation | Reason |
|---|---|---|---|---|
| #13 `studio/order-d7a252004066` | +STUDIO_HANDOFF.md, DESIGN_STATUS.md, REFACTOR_BRIEF.md (docs) | not in MAIN | **CLOSE WITHOUT MERGE** | Ephemeral studio status docs; superseded by the clean `claude-handoff/` set. |
| #14 `studio/order-2c20d441e59c` | +VISION.md, AGENT_BRIEF.md, STUDIO_HANDOFF.md | not in MAIN | **SUPERSEDED** | `VISION.md` replaced by `02-PRODUCT-VISION.md`; recommend close without merge. |
| #16 `orders/architect-inbox` | +ORDERS_INBOX.md (permanent auto-inbox channel, marked "не мержить") | not in MAIN | **CLOSE WITHOUT MERGE** (owner-pending) | Auto-inbox/5-min-poll model retired by the low-branch Claude workflow (04); decision-log §pending-2 flags it for owner. |
| #25 `studio/order-49598620e725` | +`architect/design/tokens.json` (Linear tokens) | not in MAIN | **SUPERSEDED** | Superseded by merged root `design/tokens.json` (#39) + Dual Realm retune; content is stale Linear `#5e6ad2`. |
| #27 `studio/order-19` | `.github/workflows/ci.yml` (+`node --check` lint step; +`studio/**` push trigger) | not in MAIN | **REBUILD CLEANLY** | The `node --check` lint is worth salvaging under the `claude/**` CI; the `studio/**` trigger is obsolete. Do not merge as-is. |
| #30 `studio/order-27f9de14101e` | +`docs/adr/0001..0005` (5 ADRs) | not in MAIN | **SUPERSEDED** (salvageable) | Content is factually accurate (vanilla arch, E2EE, AI routing) but superseded by the clean handoff/decision-log; salvage into handoff rather than merge studio-era ADRs. |
| #31 `studio/order-0b978d40e47e` | `styles.css` +11 (graph node/edge build animation) | not in MAIN | **MERGE CANDIDATE AFTER REBASE/TEST** | Small, additive, CSS-only, low risk; still applicable on Dual Realm. Deferred behind P1 backup. |
| #37 `studio/order-966faaa2cdf3` | `.gitignore` +5 (`.DS_Store`, `Thumbs.db`, `*.log`) | not in MAIN (MAIN `.gitignore` lacks these) | **MERGE CANDIDATE AFTER TEST** | Trivial, safe, additive; genuinely missing from MAIN. |
| #38 `studio/order-0b978d40e47e-menu` | `app.js`/`index.html`/`styles.css` (nav 6→3 + segmented "Сегодня") | not in MAIN | **REBUILD CLEANLY** | Real runtime nav change on a pre-Dual-Realm base; re-evaluate/rebuild against current MAIN under the clean workflow, don't merge as-is. |
| #43 `studio/order-mira-variant-a` | `design_guide.md`/`styles.css`/`design/tokens.json` (elevation variant) | not in MAIN | **SUPERSEDED** | Elevation/shadows reworked entirely by merged #44 (Dual Realm) + #45 (declutter). |

## 11. Backup readiness

Before planning encrypted portable backup (`05-ENCRYPTED-BACKUP-SPEC.md`), the following must be answered by a focused read (NOT started here):

- exact DB copy strategy: per-profile `arch5_db_<id>` + `arch5_cfg_<id>` snapshot — **confirmed shape**; formal snapshot/rollback helper needs design.
- actual media formats: **NOT fully mapped** — `arch5_media` store record shape (Blob vs typed array vs metadata) needs a focused read.
- global vs per-profile media identity: media store is **global (single `arch5_media`)** — must decide how to scope/export media per profile without cross-profile leakage. **Key open question.**
- connection fields to preserve/exclude: exclude `apiUrl`, `spaceKey`, passphrase, recovery key, AI keys; include user content + portable CFG.
- snapshot/rollback feasibility: `bakKey`/`snapPrefix` exist; transactional restore across localStorage + IndexedDB needs a compensating protocol (they are not one transaction).
- browser file-size constraints: `express.json` 5mb limit is server-side; local backup file size depends on media volume — needs measurement.
- service-worker module loading: `build.mjs` inlines JS; any new backup module must be inlined + cache-versioned.
- existing export/import interactions: verify no collision with current sync/export paths.

## 12. Risk register

| Severity | Risk | Evidence | Proposed mitigation | Blocks backup? |
|---|---|---|---|---|
| HIGH | Global IndexedDB media store shared across profiles (`arch5_media`, single store, keys not profile-namespaced in store name) → cross-profile media mixing / wrong-profile export | `app.js:1161` `IDB_NAME='arch5_media'`; `idbPut(key,val)` global | Confirm media-ID namespacing; scope backup media per active profile | **YES** — resolve before backup |
| MED | Plaintext sync when no passphrase set (diary leaves device in clear to sync server) | sync path uploads plain JSON if `getPass()` empty; `SECURITY_MODEL.md` forward-encryption note | Forward-encryption + explicit warning UI (already "делается" per SECURITY_MODEL) | No (privacy, not backup) |
| MED (by design) | AI provider receives user-selected text in plaintext, direct from browser | `AI_PROVIDERS` fetch to anthropic/openai/gemini | Keep honest labelling; optional local light PII pass (deferred) | No |
| LOW/UNKNOWN | Media record format / GC completeness not fully verified | not exhaustively read this pass | Focused read before backup impl | Contributes to backup gap |
| INFO | Branch cleanup blocked (HTTP 403 on delete via proxy); 20 `agent/*`+`codex/*` heads remain | §2 | Delete from a permitted environment; **do NOT delete the 3 non-archived codex branches without archiving first** | No |

Non-archived codex branches (do NOT delete until archived or owner-approved): `codex/-phase-0-life-architect-v2` (`1c5c44d`), `codex/phase-0-life-architect-v2-correction-pass` (`7a218e4`), `codex/-agent/phase-2-encrypted-portable-backup` (`0bf6770`, PR #63).

## 13. Minimal next plan

- exact implementation branch: `claude/task-encrypted-backup` (one temporary branch, from this handoff branch) — **not created in this audit**.
- exact changed files expected: new `architect/backup-*.js` (inlined), wiring in `app.js`/`index.html`/`styles.css`/`build.mjs`/`sw.js`, focused test in `tests/`.
- non-goals: no framework migration, no schema rewrite, no runtime change outside backup, no Codex code import.
- focused tests: backup roundtrip (include/exclude fields, media bytes, integrity), transactional restore + rollback, on synthetic fixtures only.
- browser evidence: Playwright Chromium + WebKit mobile + offline reload (must actually run in CI; `BLOCKED` ≠ `PASS`).
- rollback: snapshot-and-restore for localStorage + IndexedDB; abort leaves prior state intact.
- stop conditions: any need to migrate/delete real data, force-push, or crypto change without a separate contract.

## 14. Final markers

```text
BASELINE_VERIFIED=14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d
RUNTIME_UNCHANGED=true
STORAGE_MODEL_MAPPED=true
MEDIA_FORMATS_MAPPED=false
AI_BOUNDARY_MAPPED=true
OLD_PR_CLASSIFICATION_COMPLETE=true
BRANCH_CLEANUP_COMPLETE=false
BACKUP_IMPLEMENTATION_AUTHORIZED=false
```
