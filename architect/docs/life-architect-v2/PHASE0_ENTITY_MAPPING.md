# Phase 0 Entity Mapping

Status: `DOCUMENTATION_ONLY`

## Observed repository fact

| v2 conceptual entity | Current storage/UI/code mapping | Evidence | Behavior | Confidence | Conflict |
|---|---|---|---|---|---|
| Diary / insight note | `DB.insights`; add/detail/map/digest flows | `architect/app.js`; `DEFAULT_DB` lines 52-79; `exportData` line 3353; `themeIndex` line 1643; `showDet` searchable | User-created insight records are primary free-text meaning objects. | High | v2 separates claims/classes more strictly than current free-form record. |
| Dream | `DB.dreams` | `architect/app.js`; `DEFAULT_DB` lines 52-79; ChatGPT import pushes dreams lines 3544-3547 | Dream records are separate collection and can be imported from ChatGPT classification. | High | None. |
| Check-in / Momentary State | `DB.checkins`, `DB.vit` | `architect/app.js`; `saveCI` lines 1884-1900; `DEFAULT_DB.vit` line 77 | Daily state is saved as vitals/checkins with sleep, clarity, stress, mood, substances flags, activity, tone, note. | High | v2 Momentary State will need schema hardening. |
| Goals / habits / metrics | `DB.spheres`, `DB.sphereLogs`; sphere `type` | `architect/app.js`; `createSphere` lines 2849-2854; `sphereLogs.push` line 2873 | One generic sphere model supports habits, goals, counters, and numeric logs. | High | v2 should not create parallel goal store without migration. |
| Psychology annotations | `insight.psy` | `architect/app.js`; `PSY_SYSTEM` line 5340; schema lines 5345-5355; assignment lines 5365-5369 | AI annotation adds symptom/function/gain/need/ego/emotion/game/conf/themes to insight records. | High | Current annotation is LLM-derived and stored near source note; v2 needs provenance/claim class separation. |
| Health Organizer | `DB.cravings`, health tab, craving risk | `architect/app.js`; `DEFAULT_DB.cravings` line 71; `cravingRisk` lines 905-949; `rHealth` line 2137 | Existing health is craving/habit/risk support, not medical record extraction. | High | v2 health documents are not implemented yet. |
| Nudges / insights | `smartNudge`, `smartInsights`, contextual cards | `architect/app.js`; `smartNudge` lines 955-1004; `smartInsights` searchable | Nudges are deterministic/heuristic UI outputs based on DB state. | High | v2 JITAI requires explicit decision rule and risk gates. |
| AI synthesis | `callClaude` and inline prompt users | `architect/app.js`; `AI_PROVIDERS` lines 4202-4286; `callClaude` lines 4288-4322; `AI_SYSTEM` line 4327 | AI calls support multiple providers and tasks but prompts live inline. | High | v2 policy/evals/validators not modular yet. |
| Import/export | JSON/Markdown export and ChatGPT import | `architect/app.js`; `exportData` line 3353; `parseChatGPT` around lines 3460-3480; `import` searchable | Export exists; ChatGPT export import creates insights/dreams from selected diary-like conversations. | Medium-high | v2 must avoid importing private data into fixtures/PRs. |
| Sync space | Client `api`, `packPayload`, backend `/api/space/:key` | `architect/app.js`; `api` line 3674; `packPayload` lines 3810-3818; `architect/backend/server.js` searchable `app.post('/api/space/:key'` | Server sync appears blob-oriented; client can encrypt before push. | Medium-high | Need verify exact deployed backend schema before v2 migration. |
| Feedback | Separate feedback outbox and backend triage | `architect/app.js`; `sendFeedback` searchable; `ERRBUF_KEY` around lines 4626-4643; `.github/workflows/feedback-triage.yml` | Feedback is a separate channel and may include UI message/errors, not diary DB by default. | High | Privacy docs must distinguish feedback plaintext from E2EE personal store. |

## Architectural inference

Current collections map to v2 concepts but do not yet encode formal source/provenance/claim-class distinctions. The most compatible migration path is additive metadata fields plus validators, not replacing collections. Confidence: high.

## Risk

Data classes that v2 treats separately can currently coexist on one object (`insight` plus `psy`). This risks accidental mixing of self-report and LLM hypothesis. Confidence: high.

## Recommendation

Phase 1 should introduce entity metadata and provenance contracts while preserving current IDs and collections.

## Open question

Should `insight.psy` remain embedded with provenance fields, or be migrated to a separate annotation collection after roundtrip tests exist?
