# Phase 0 Repository Reality Report — Life Architect v2

Status: `PHASE_0_AUDIT_DOCUMENTATION_ONLY`

Scope: repository reality audit only. No production code, dependencies, schema, migrations, fixtures, GitHub Actions, or deploy configuration were intentionally changed.


## Evidence format

Each material statement uses: file path; symbol/search fragment; line range or searchable fragment; observed behavior; confidence; documentation conflict where applicable. Categories: Observed repository fact, Architectural inference, Risk, Recommendation, Open question.


## Executive summary

### Observed repository fact

| Area | Evidence | Observed behavior | Confidence | Conflict with v2 docs |
|---|---|---|---|---|
| Frontend architecture | `architect/index.html`; fragment `serviceWorker.register('sw.js')`; line 15. `architect/app.js`; fragment `let DB = JSON.parse(JSON.stringify(DEFAULT_DB))`; line 84. | The app is a vanilla JavaScript PWA with one main state object and inline DOM-rendering functions, not React/Next/TypeScript. | High | None. This matches the v2 constraint to extend the existing vanilla PWA. |
| Storage default | `architect/app.js`; `DEFAULT_DB`; lines 52-79. | Default data model includes insights, dreams, patterns, evolution, spiritual, checkins, spheres, sphereLogs, bots, chapters, digests, chats, cravings, questions, vitals, environment flags, deletion tombstones, and document timestamp. | High | v2 conceptual model is broader than current code, but no direct conflict: current code is v1/v1.5 reality. |
| Profile isolation | `architect/app.js`; fragments `PKEY = 'arch5_profiles'`, `dbKey`, `cfgKey`, `passKey`; lines 100-116. | Data, config, and passphrase are namespaced by active profile id in localStorage. | High | None; supports migration requirement for profile isolation. |
| Legacy profile migration | `architect/app.js`; `ensureProfiles`; searchable fragments `arch5_db`, `arch5_cfg`, `arch5_pass`; lines 118-136. | If no profile exists, old flat keys are copied into a new default profile and removed. | High | None, but v2 migration must preserve this upgrade path. |
| Local persistence | `architect/app.js`; `persistLocal`; lines 141-170. | Writes DB/CFG to localStorage and blocks accidental empty overwrite when previous user data exists. | High | None. |
| Hydration and backup recovery | `architect/app.js`; `hydrate`; lines 181-199. | Hydration loads profile DB/CFG, recovers from local backup if the primary slot is missing/corrupt, then runs `migrateRecords`. | High | None. |
| Daily snapshots | `architect/app.js`; `snapshotDaily`, `listSnapshots`, `restoreSnapshot`; lines 208-229. | Snapshots are localStorage JSON copies per profile/day; retention is seven snapshots; restore replaces current DB after confirmation. | High | None, but v2 migration must add roundtrip tests before changing shape. |
| Record migration | `architect/app.js`; `migrateRecords`; lines 249-268. | Existing migration backfills `createdAt`, `day`, `sv`, and rewrites prompt-like titles. | High | v2 docs propose richer migrations; current implementation is lightweight and inline. |
| IndexedDB media | `architect/app.js`; `idbOpen`; line 1164. | IndexedDB is used for local media blob storage, not as the main app database. | High | Conflict with any assumption that IndexedDB is current primary persistence. |
| Tombstones and merge | `architect/app.js`; `IDCOLS`, `tomb`, `mergeById`, `mergeDB`; lines 3775-3808. | Sync merges listed ID collections by id and deletion tombstones, plus document timestamps for scalar fields. | High | v2 must not assume a normalized relational local store exists. |
| E2EE envelope | `architect/app.js`; `encryptPayload`, `decryptPayload`; lines 3738-3769. | Payload encryption uses WebCrypto envelope semantics with passphrase and optional recovery wrapping. | High | None, but needs cryptographic review before v2 expands sync. |
| Server boundary | `architect/app.js`; `packPayload`, `unpackServer`; lines 3810-3828. `architect/backend/server.js`; fragments `GET /api/space/:key`, `POST /api/space/:key`; searchable. | Client packages encrypted payload before sync when passphrase is configured; server API stores/retrieves space blobs and should not need plaintext personal content. | Medium-high | Potential conflict if docs imply all server paths are proven ciphertext-only; feedback endpoints are separate plaintext feedback channel. |
| AI providers | `architect/app.js`; `AI_PROVIDERS`; lines 4202-4286. | Browser-side provider adapters exist for Anthropic, OpenAI, and Gemini-style APIs. | High | v2 docs should treat this as current reality, not a future-only abstraction. |
| AI call wrapper | `architect/app.js`; `callClaude`; lines 4288-4322. | `callClaude` routes by provider/task/model, checks budget, supports schema argument, records ledger, and returns text. | High | Name is Anthropic-specific although routing is multi-provider. |
| AI prompts | `architect/app.js`; `AI_SYSTEM`; line 4327. `PSY_SYSTEM`; line 5340. | Prompts are inline constants in app.js, including self-reflection and psychology annotation behavior. | High | Conflict with v2 ideal of policy/validators/evals as separate governed modules. |
| Psychology annotation | `architect/app.js`; `markPsyBatch`; lines 5345-5369. | LLM receives diary text snippets and returns structured JSON with symptom/function/need/ego/emotion/game/conf/themes. | High | Risk: private diary content may be sent to cloud provider when AI key is configured. |
| Health/cravings | `architect/app.js`; `cravingRisk`; lines 905-949. `rHealth`; line 2137. | Current health area is behavior/craving/habit support and heuristic risk, not regulated diagnosis. | High | Must remain framed as self-management, not medical decision support. |
| Notifications | `architect/index.html`; notification row line 265. `architect/app.js`; push functions lines 3616-3648. `architect/sw.js`; push handlers lines 59-72. | Push notification UI and web push handlers exist, guarded by browser support and backend configuration. | High | Native wrapper must revisit push entitlement/platform behavior. |
| PWA service worker | `architect/sw.js`; `V`, `SHELL`, `fetch`; lines 8-52. | App shell is cached, navigation is network-first, static assets stale-while-revalidate, external APIs passthrough. | High | None; offline data behavior still depends on localStorage/IDB. |
| Manifest | `architect/manifest.json`; full file. | Standalone portrait PWA with Russian metadata and icons. | High | Capacitor readiness needs additional icons/splash/native config later. |
| Dual Realm | `architect/styles.css`; `[data-theme=light]`, `[data-theme=dark]`; lines 75-108 and 1227-1287. `design/tokens.json`; fragment `studio.source`; lines 445-447. | Dual Realm is implemented with CSS variables and exported tokens. | High | None; do not introduce Tailwind/theme rewrite. |
| CI | `.github/workflows/ci.yml`; lines 1-24. | CI runs `npm install`, Playwright Chromium install, and `npm test` for architect changes. | High | Current CI lacks mobile screenshot matrix and PR preview artifact. |
| Deploy | `.github/workflows/deploy.yml`; lines 1-45. | Deploy builds `architect/dist` and force-pushes gh-pages after successful CI on MAIN or manual dispatch. | High | Phase 0 docs must not modify deploy. |

## Architectural inference

The smallest safe v2 seam is not a framework rewrite. It is a set of governed modules around the existing single-file application: schema/version metadata, import/export/migration tests, AI prompt policy and validators, privacy gates, mobile CI evidence, and eventually native wrapper readiness. Confidence: high. Evidence: `CLAUDE.md` explicitly forbids framework rewrite; current app remains single vanilla JS PWA.

## Risks

1. Inline AI prompts and validators are hard to audit separately from UI logic. Evidence: `AI_SYSTEM`, `PSY_SYSTEM`, `callClaude`, `markPsyBatch` in `architect/app.js`. Confidence: high.
2. Current localStorage primary DB can hit browser quota and lacks transactional semantics. Evidence: `persistLocal` writes whole DB JSON to localStorage. Confidence: high.
3. Browser-side AI keys and provider calls expose user-selected private snippets to third-party AI providers when enabled. Evidence: `getAiKeyFor`, `AI_PROVIDERS`, `markPsyBatch`. Confidence: high.
4. CI does not yet prove iPhone/iPad layouts, PWA installability, offline reload, or accessibility gates. Evidence: `.github/workflows/ci.yml` only runs `npm test`. Confidence: high.

## Recommendations

1. Phase 1 should add documentation/tests around the current schema before changing data shape.
2. Keep production behavior unchanged until migration roundtrip tests cover profiles, tombstones, snapshots, import/export, and encrypted sync.
3. Extract AI policy/validators only behind unchanged call sites and synthetic fixtures.
4. Add mobile preview evidence as CI/artifact work, not as owner-operated terminal workflow.

## Open questions

1. Which remote branch is canonical in this execution environment? No `origin` remote was configured during this run.
2. Should browser-side BYO AI keys remain acceptable for v2, or should v2 prefer a privacy gateway with E2EE constraints?
3. What is the exact intended-purpose boundary for Health Organizer before any native/app-store packaging?
