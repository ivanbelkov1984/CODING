# 09 — REPOSITORY AUDIT

> Status: TEMPLATE — Claude Code must replace every `TODO` with repository-grounded evidence before implementation starts.

## 1. Audit identity

- Audit date: TODO
- Auditor/session: TODO
- Repository: `ivanbelkov1984/CODING`
- Base branch: TODO
- Base SHA: TODO
- Audit branch: TODO
- Runtime files changed: MUST BE `none`

## 2. Branch and PR reality

- Default branch: TODO
- Current `MAIN` SHA: TODO
- Clean Claude branch SHA: TODO
- Archive branch SHA: TODO
- Open PR inventory: TODO
- Old Claude PR classification: TODO
- Branch deletion completed: TODO

## 3. Application structure

Document actual purpose and dependencies of:

- `architect/index.html`
- `architect/styles.css`
- `architect/app.js`
- `architect/build.mjs`
- `architect/sw.js`
- `architect/backend/`
- `architect/tests/`
- any additional runtime modules

Findings: TODO

## 4. Storage model

### Profiles

- registry keys/functions: TODO
- active profile: TODO
- profile lifecycle: TODO

### Main DB

- storage location/key format: TODO
- collections: TODO
- schema/migration behavior: TODO
- deletion/tombstone semantics: TODO
- merge/conflict semantics: TODO

### Configuration

- portable fields: TODO
- device-local connection fields: TODO
- secret fields: TODO

### IndexedDB media

- database/store names: TODO
- actual record formats: TODO
- media ID generation: TODO
- references from DB: TODO
- garbage collection: TODO
- multi-profile isolation risks: TODO

## 5. Sync and encryption

- API endpoints: TODO
- plain vs encrypted sync conditions: TODO
- envelope versions: TODO
- PBKDF2/AES-GCM parameters: TODO
- recovery flow: TODO
- backward compatibility: TODO
- failure/rollback behavior: TODO
- secrets stored locally: TODO

## 6. AI provider boundary

List every production AI call site:

| Feature | Function/file | Provider routing | Data sent | Structured schema | Timeout | Persistence after response |
|---|---|---|---|---|---|---|
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

Confirm whether text is sent directly from browser or through project backend: TODO

## 7. Backend and feedback

- backend structure: TODO
- feedback flow: TODO
- rate limits: TODO
- data retained: TODO
- redaction: TODO
- Railway/deployment configuration: TODO

## 8. PWA/build/deploy

- build inputs/outputs: TODO
- combined build behavior: TODO
- service worker strategy: TODO
- cached shell: TODO
- GitHub Pages/deploy workflow: TODO
- offline behavior: TODO
- update behavior: TODO

## 9. Tests

| Command | Purpose | Actual result | Browser/engine |
|---|---|---|---|
| `npm run build` | TODO | TODO | n/a |
| `npm test` | TODO | TODO | TODO |

Additional focused suites: TODO

Evidence gaps: TODO

## 10. Open old Claude PR classification

For PR #13, #14, #16, #25, #27, #30, #31, #37, #38, #43:

| PR | Diff against MAIN | Status | Recommendation | Reason |
|---|---|---|---|---|
| #13 | TODO | TODO | TODO | TODO |
| #14 | TODO | TODO | TODO | TODO |
| #16 | TODO | TODO | TODO | TODO |
| #25 | TODO | TODO | TODO | TODO |
| #27 | TODO | TODO | TODO | TODO |
| #30 | TODO | TODO | TODO | TODO |
| #31 | TODO | TODO | TODO | TODO |
| #37 | TODO | TODO | TODO | TODO |
| #38 | TODO | TODO | TODO | TODO |
| #43 | TODO | TODO | TODO | TODO |

## 11. Backup readiness

Before planning encrypted portable backup, answer:

- exact DB copy strategy: TODO
- actual media formats: TODO
- global/per-profile media identity: TODO
- connection fields to preserve/exclude: TODO
- snapshot and rollback feasibility: TODO
- browser file-size constraints: TODO
- service-worker module loading: TODO
- existing export/import interactions: TODO

## 12. Risk register

| Severity | Risk | Evidence | Proposed mitigation | Blocks backup? |
|---|---|---|---|---|
| TODO | TODO | TODO | TODO | TODO |

## 13. Minimal next plan

- exact implementation branch: TODO
- exact changed files expected: TODO
- non-goals: TODO
- focused tests: TODO
- browser evidence: TODO
- rollback: TODO
- stop conditions: TODO

## 14. Final markers

```text
BASELINE_VERIFIED=<sha>
RUNTIME_UNCHANGED=true
STORAGE_MODEL_MAPPED=true|false
MEDIA_FORMATS_MAPPED=true|false
AI_BOUNDARY_MAPPED=true|false
OLD_PR_CLASSIFICATION_COMPLETE=true|false
BRANCH_CLEANUP_COMPLETE=true|false
BACKUP_IMPLEMENTATION_AUTHORIZED=true|false
```
