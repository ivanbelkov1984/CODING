# 09 — PRIVACY AT-REST AND AI SAFETY FRAMEWORK

> **Статус: NORMATIVE_CURRENT.** Пробелы 8, 9, 10 из review. Покрывает local-at-rest threat model, encrypted sensitive blob vault и **универсальный AI validator framework** (а не «один validator»). Крипто-контракт синхронизации не меняется (`SECURITY_MODEL.md`).

## Часть 1 — Local-at-rest threat model (пробел 8)

### Реальность на MAIN
- `DB` хранится **открытым JSON** в localStorage (`persistLocal` → `JSON.stringify(DB)`, `app.js:166–168`).
- Медиа хранится **открыто** в IndexedDB `arch5_media` (`app.js:1161,1169`).
- Парольная фраза (`arch5_pass_`), recovery (`arch5_rec_`), AI-ключи (`arch5_aikey_`) локально доступны JS приложения.
- **E2EE защищает синхронизацию, но не локальные данные** браузерного профиля.
- Без парольной фразы sync может отправлять plaintext bundle (`09-REPOSITORY-AUDIT` §5).

### Вывод
Это **не обязательно** блокирует дневник одного пользователя, но **блокирует безопасное добавление** паспортов здоровья, анализов и рецептов в текущем виде.

### Требования ДО medical documents (Этап C, `product/04`)
- encrypted local blob vault для sensitive blobs (отдельные ключи/обёртки);
- session unlock (session lock);
- защита от XSS + строгий CSP;
- encrypted thumbnails или запрет их сохранения;
- очистка временных файлов;
- отсутствие медицинских данных в SW cache, URL, логах и ошибках;
- selective export;
- удаление оригинала И производных;
- отдельное согласие на передачу медицинского фрагмента AI (`product/08` §1).

### Угрозы (threat model, кратко)
`XSS → чтение localStorage/IndexedDB` · `общий доступ к устройству` · `утечка в SW cache/логи/URL` · `экспорт с секретами` · `plaintext sync без passphrase`. Митигации — выше; sensitive-классы не хранятся в открытом виде.

## Часть 2 — Encrypted sensitive blob vault (пробел 9)

- Sensitive blobs (медиа/документы класса medical) шифруются **до** записи в IndexedDB, отдельными ключами (не общий passphrase), с session unlock.
- Vault отделён от обычного `arch5_media`; ключи не покидают устройство; экспорт — только через selective export с явным согласием.
- Backup/restore (PR #66) обязан корректно обрабатывать зашифрованные blobs (roundtrip-тест на synthetic данных).

## Часть 3 — Universal AI validator framework (пробел 10)

### Реальность
`callClaude()` (`app.js:4350`) — **транспорт и роутер** (провайдеры, модели, task-маршруты, token/cost ledger, бюджет), но **не доказательный синтезатор**. Отдельная проблема: AI-сигнал (`mood/stress/lonely`, `app.js:844`) уже подмешивается в `cravingRisk` (`app.js:1002–1003`) без эпистемического лейбла/подтверждения.

### Контракт: не «один validator», а framework (даже если в первом PR включаются 2–3)

Обязательный конвейер вокруг choke-point `callClaude`:

```text
eligibility → consent → data minimisation → epistemic labels →
structured input (versioned SynthesisInput, allowed input IDs, purpose, consentScope) →
prompt policy (version) → LLM →
schema validation → input-reference (grounding) validation → claim-class validation →
health/psych/astrology safety → numeric/temporal validation →
uncertainty/alternatives → crisis override →
one controlled retry → safe degraded response →
metadata log (без личного текста; prompt/model/policy version)
```

### Минимум первого AI-safety foundation
- versioned `SynthesisInput` + список допустимых input IDs;
- `purpose` и `consentScope`;
- structured output (schema);
- grounding validator (вывод опирается на переданные IDs);
- claim-class validator (гипотеза ≠ факт ≠ диагноз ≠ causal);
- health boundary + astrology isolation;
- numeric/temporal fidelity;
- uncertainty/alternatives;
- crisis override;
- один controlled retry + safe degraded response;
- журнал метаданных без личного текста; версии prompt/model/policy.

### Обязательные правила
- AI-сигнал **не повышает** алгоритмический риск сам по себе, без эпистемического лейбла, alternatives и подтверждения пользователя. Текущее подмешивание в `cravingRisk` подлежит переводу под этот контракт (лейбл `llm_hypothesis`, отдельный сигнал, возможность отклонить, invalidation после исправления).
- Один большой system prompt **недостаточен**: обязательны structured output + claim/provenance validation + domain safety.
- Crisis-режим: без астрологии и «глубоких интерпретаций»; см. `product/03` §8 и ниже.

## Часть 4 — Кризисный детектор ≠ клиническая защита

`crisisScreen()`/`CRISIS_RE` (`app.js:941`) + AI-флаг `crisis` (`app.js:2046`) — разумный safety fallback (в коде помечено «страховка, не [скрининг]», `app.js:928`), но **не** скрининг и **не** гарантия обнаружения. Нужны: adversarial synthetic suite; тесты отрицаний/цитат/рассказов о третьих лицах; локализованный протокол страны; offline emergency fallback; понятная кнопка связи с человеком; отсутствие astro/«глубоких интерпретаций» в crisis-safe. Изменение кризисного протокола — только через отдельный review (`product/14`).
