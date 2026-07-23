# TASK CONTRACT — Этап C: Privacy at-rest + AI validator framework

> **Статус: READY_FOR_OWNER_GO (после Этапа B).** `riskClass=high` (крипто/AI-safety/крайние состояния) → independent review + owner-approval обязательны; отдельные подчасти могут иметь свои гейты. Documentation-only до «go». Провенанс: `product/09`.

## 1. Цель

Два фундамента безопасности до тяжёлых доменов:
1. **Приватность «на устройстве»** — зашифрованное хранилище для чувствительных blob'ов + session lock (обязательно до медицинских документов).
2. **Рамка безопасности ИИ** — конвейер вокруг `callClaude` с реально включёнными валидаторами, structured input/output, согласием и безопасным fallback; AI-догадка перестаёт молча влиять на риск.

Можно вести двумя под-срезами: **C1 (AI validator framework)** и **C2 (encrypted at-rest vault)**. C1 ниже риском и полезен раньше.

## 2. C1 — AI validator framework (под-срез, раньше)

### Scope
- Обёртка на choke-point `callClaude` (`app.js:4350`): `eligibility → consent → data minimisation → epistemic labels → structured SynthesisInput (versioned, allowed input IDs, purpose, consentScope) → prompt policy(version) → LLM → schema validation → grounding → claim-class → domain safety(health/psych/astrology) → numeric/temporal → uncertainty/alternatives → crisis override → one controlled retry → safe degraded response → metadata log (без личного текста; версии prompt/model/policy)`.
- **Реально включить минимум 2–3 валидатора** в первом PR: grounding, claim-class, domain-safety (astrology isolation + health boundary). Остальные — заглушки с регистрацией.
- **Перевести AI→`cravingRisk` связь под контракт:** AI-сигнал (`mood/stress/lonely`, `app.js:844`, факторы `app.js:1002–1003`) помечается `knowledgeType=llm_hypothesis`, показывается как гипотеза, требует подтверждения, **не повышает** risk без лейбла; отклонение/expiry/invalidation через ядро (Этап B).
- Consent receipts на передачу данных внешнему AI (`product/08` §1).

### Non-goals C1
Смена провайдеров/моделей/маршрутов; новый UI чата; encrypted vault (это C2); изменение кризисного regex-протокола без отдельного review.

### Файлы C1
`app.js` (framework вокруг `callClaude`, перевод risk-связи), `tests/ai-safety.test.mjs`. Возможно `index.html` (лейбл «гипотеза ИИ» + кнопка «отклонить»).

### Tests C1
grounding блокирует вывод без опоры на переданные IDs; claim-class не даёт гипотезе стать фактом/диагнозом/causal; astrology-isolation/health-boundary срабатывают; AI-сигнал не повышает risk без подтверждения; safe fallback при ошибке; журнал без личного текста.

### Rollback C1
Framework за флагом `flag_ai_safety`; при откате — прежнее поведение `callClaude`.

## 3. C2 — Encrypted at-rest vault (под-срез, до медицины)

### Scope
- Отдельный зашифрованный blob-vault для sensitive-классов (ключи ≠ общий passphrase), **session unlock**.
- Threat model + митигации (`product/09` §1): нет sensitive в SW cache/URL/логах/ошибках; selective export; удаление оригинала И производных; encrypted thumbnails или запрет.
- CSP/XSS hardening (в рамках статического PWA; без смены стека).

### Non-goals C2
Медицинские документы как домен (это Этап E); смена sync-крипто (`SECURITY_MODEL.md` неизменен); серверное хранение sensitive.

### Файлы C2
`app.js` (vault API поверх IndexedDB через Web Crypto), возможно `index.html` (session unlock UI), `tests/vault.test.mjs`. **Крипто — только browser Web Crypto, без Node crypto** (как в backup-core).

### Tests C2
blob шифруется до записи; без unlock не читается; экспорт только selective+consent; удаление стирает оригинал и производные; backup-roundtrip зашифрованного blob на synthetic данных.

### Rollback C2
Vault за флагом `flag_sensitive_vault`; без флага — существующее поведение медиа не меняется.

## 4. Общие: privacy/safety

Synthetic-only; крипто-параметры — известные (Web Crypto, как PBKDF2 600k+AES-GCM-256 в backup); никаких самодельных шифров; кризисный протокол не меняется без отдельного review (`product/09` §4, `product/14`).

## 5. Browser evidence / mobile / DoD

Как в общем DoD (`product/04`): Chromium+WebKit evidence, offline reload, focused tests PASS через production-модуль/DI, rollback проверен, мобильная приёмка, один PR на под-срез, явные non-goals.

## 6. Гейты

- C1 `riskClass=high` (AI-safety) → independent review + owner-approval до merge.
- C2 `riskClass=high` (крипто at-rest) → independent review + owner-approval; изменения крипто — отдельный контракт-подтверждение.
- Ветки: `claude/task-ai-safety-framework`, затем `claude/task-sensitive-vault` (по одной активной). Merge — только по явному решению Ивана после independent review.
