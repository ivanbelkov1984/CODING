# Phase 0 Risk Register

Status: `DOCUMENTATION_ONLY`

| ID | Category | Risk | Evidence | Impact | Likelihood | Recommendation | Confidence |
|---|---|---|---|---|---|---|---|
| R1 | Privacy | User diary snippets can be sent directly to AI providers when AI features are enabled. | `architect/app.js`; `markPsyBatch` builds `user` from insight title/body lines 5356-5360; `AI_PROVIDERS` sends browser fetches lines 4202-4286. | High | Medium | Add explicit AI data boundary UI, synthetic evals, and prompt-injection sanitization before expanding synthesis. | High |
| R2 | Data leakage | Browser-side provider keys are stored in localStorage slots. | `architect/app.js`; `setAiKey`, `getAiKeyFor`; lines 4027-4030. | High | Medium | Document BYO-key tradeoff; consider encrypted key storage or backend proxy only with clear privacy model. | High |
| R3 | Prompt injection | Free-form diary/imported text is embedded into prompts without a dedicated prompt-injection delimiter/validator layer. | `architect/app.js`; `aiAnalyzeDet` user prompt lines 1818-1825; `markPsyBatch` lines 5356-5360. | Medium-high | Medium | Add structured input wrappers, instruction hierarchy, output validators, and tests using synthetic hostile notes. | High |
| R4 | Clinical/regulatory | Health/craving risk could be misread as medical prediction. | `architect/app.js`; `cravingRisk` lines 905-949; health UI `rHealth` line 2137. | High | Medium | Keep health features non-diagnostic, add intended-purpose language and feature gates for medical document extraction. | High |
| R5 | Data loss | Whole-DB localStorage writes lack transactionality and quota handling. | `architect/app.js`; `persistLocal` lines 141-170. | High | Medium | Add migration/backup/export roundtrip tests before v2 schema changes; consider future IndexedDB primary store ADR only after audit. | High |
| R6 | Merge correctness | Tombstones are global by id and ID collisions could delete records across collections if ids collide semantically. | `architect/app.js`; `_del` line 78; `IDCOLS`/`tomb` lines 3775-3777. | Medium | Low-medium | Keep existing semantics for now; Phase 1 tests should include cross-collection ids and tombstone cases. | Medium |
| R7 | Plaintext feedback | Feedback channel is separate from E2EE diary and may send errors/text to backend. | `architect/app.js`; error buffer lines 4626-4643; feedback fetch lines 4654-4678; backend triage workflow. | Medium | Medium | Explicitly document feedback data boundary in privacy UI and audit docs. | High |
| R8 | Offline/PWA | SW excludes API/AI from cache but app shell cache does not prove all dynamic paths are mobile-offline safe. | `architect/sw.js`; fetch handler lines 24-52. | Medium | Medium | Add offline reload and PWA standalone Playwright checks in later CI task. | High |
| R9 | Mobile workflow | CI lacks mobile viewport screenshot/accessibility gates. | `.github/workflows/ci.yml`; lines 1-24. | Medium | High | Add PR artifact/preview plan as Phase 1 contract, not Phase 0 production change. | High |
| R10 | Deploy safety | Deploy force-pushes gh-pages after MAIN CI; branch previews are absent. | `.github/workflows/deploy.yml`; lines 1-45. | Medium | Medium | Add preview strategy in a separate workflow task after owner approves. | High |

## Open questions

1. Should AI provider support remain fully client-side for all providers?
2. Should feedback triage be permitted to use Anthropic on plaintext feedback in production?
3. What exact language is acceptable for craving risk disclaimers?
