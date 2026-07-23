# Encrypted Portable Backup — модуль

WIP. Реализация зашифрованной переносимой резервной копии профиля по контракту
`architect/docs/claude-handoff/05-ENCRYPTED-BACKUP-SPEC.md`, заново от чистого
`MAIN` (`c0a37a6`). Предыдущие Codex-реализации (PR #63/#64, `codex/*`,
`agent/*-backup`) НЕ используются как источник.

## Архитектура (два production-слоя)

- `backup-core.mjs` — pure / browser-neutral core: versioned envelope+payload
  schema, exact allowed keys, documented limits, strict base64, canonical
  media bytes, SHA-256, PBKDF2-SHA-256 (ровно 600 000 iter) + AES-GCM-256,
  encrypt/decrypt, fail-closed validation, transactional restore orchestration.
  Использует только browser Web Crypto (`globalThis.crypto.subtle`), без Node
  `crypto`.
- `backup-adapter.mjs` — production browser adapter: реальные localStorage +
  IndexedDB (инъектируются как зависимости, чтобы Node-тесты гоняли тот же
  production-код), сборка переносимого bundle со снятием секретов, media
  collision/reuse/remap, snapshot, staged write, reread-verify, exact rollback,
  activation, connection preservation, GC-reference collection.

`app.js` вызывает adapter. Node-тесты импортируют тот же adapter через DI.
Дублирование логики в mock Store запрещено.

## Slices

- **Slice 1 — pure core (crypto + schema + limits + validation).** Без UI,
  localStorage, IndexedDB, profile registry, activation, media collision,
  replacement, browser restore, app.js integration.
- Slice 2 — production browser adapter (bundle build + media + snapshot/rollback).
- Slice 3 — transactional restore orchestration end-to-end (adapter-driven).
- Slice 4 — RU UI (data-only/complete, пароли, acknowledgements, restore-new /
  replace-with-second-confirm, progress/status) + app.js call.
- Slice 5 — build.mjs + sw.js integration (build output + SW shell + offline).
- Slice 6 — Chromium mobile + WebKit mobile UI evidence.

Каждый slice завершается: тесты → commit → push → обновление этого Draft PR →
checkpoint-комментарий с SHA и результатами. Ни один slice не остаётся только
локально.

## Acceptance gate

```
BUILD=PENDING
FOCUSED_BACKUP_TESTS=PENDING
EXISTING_E2E=PENDING
CHROMIUM_MOBILE=PENDING
WEBKIT_MOBILE=PENDING
OFFLINE_RELOAD=PENDING
INDEPENDENT_DIFF_REVIEW=PENDING
```

Недоступный браузер = BLOCKED, не PASS. Merge не выполняется до полного gate и
независимого diff-review (ChatGPT через GitHub).

## Границы

Не меняются: sync protocol/envelope, recovery-key flow, storage engine, backend,
health/AI/astrology, navigation, общий дизайн, dependency stack, production
schema (кроме самой portable backup schema). Пароль backup нигде не
персистится. Реальные данные — только синтетические фикстуры.
