# FINAL A — Continuous GPT / Google Drive Bridge: implementation contract

Реализация `FINAL_BRIDGE_CONTRACT.md` (Phase A мастер-программы завершения).
Base: MAIN `76d0b90`. Ветка: `claude/phase-a-continuous-bridge`. Один Draft PR,
merge только по независимой приёмке владельца.

---

## 1. Архитектурное решение (минимально жизнеспособное, п.2 контракта)

**Ingestion остаётся owner-controlled.** OAuth/Drive API/фоновая сеть НЕ
добавлены: контракт Волны 6 («без сети, без AI, без Google OAuth») сохранён,
privacy boundary браузера не ослаблена. «Continuous» реализован как:

1. **Именованные подключения** — новая коллекция `externalConnections`
   (SCHEMA_VERSION 8 → 9, аддитивно): `{ id, label, kind
   (google_drive|gpt_export|other), status, checkpoint, stats,
   sourceStatusNote, privacyClass:'sensitive', sv, _u }`.
2. **Явная модель состояний** — `connected | syncing | error_requires_user |
   permission_revoked | disconnected`. Ошибка разбора/чтения НИКОГДА не
   маскируется под «новых данных нет»: статус переходит в
   `error_requires_user` с текстом ошибки в `checkpoint.lastError`.
3. **Инкрементальный детерминированный курсор** —
   `checkpoint.committedPackageHashes` (bounded, последние 200). Курсор
   двигается ТОЛЬКО после успешного transactional commit пакета (или
   честного noop — см. §3). Крэш между commit и продвижением курсора
   безопасен: повторный проход ловится ledger'ом contentHash → 0 дублей.
   Устаревший/потерянный курсор безопасен по той же причине.
4. **Feed-обёртка** `architect-external-work-feed-v1` (≤50 пакетов) поверх
   НЕИЗМЕНЁННЫХ форматов `architect-external-work-v1` (9 типов) и `…-v2`
   (14 типов). Одиночный пакет тоже принимается (оборачивается в feed из
   одного элемента). **v2 не бампался**: существующего контракта достаточно
   (identity/provenance/claims уже выражают всё нужное), новый write-протокол
   не вводился — feed только группирует пакеты для инкрементального прохода.

## 2. Строгое разделение FETCH / PREVIEW / COMMIT

- **FETCH** — `extBridgeRefresh(connId, text)`: разбор feed, per-package
  `extBuildPlan` на чистом клоне БД, ноль канонических мутаций. Итоги:
  `{packages, skippedByCheckpoint, new, existing, conflicts, rejected,
  unresolved, alreadyImported}`.
- **PREVIEW** — существующий Wave 6/7 предпросмотр плана: новые записи,
  exact-dedup, alias/sourceRef merges, конфликты, отклонённые, claim classes.
- **COMMIT** — «Применить»: `extBridgeApply(connId)` по пакетам через
  `extCommitPlan` (transactional, zero-mutation-on-error). Ошибка commit →
  feed останавливается, статус `error_requires_user`, курсор НЕ двигается.
  «Отмена» — `extBridgeCancel()`: pending сбрасывается, ноль мутаций.

## 3. Noop-пакеты

Пакет, где всё уже импортировано (нет новых записей/связей/addRefs-merge) И
нет проблем (conflict/invalid/unsupported/unresolvedRefs) — честный noop:
курсор двигается без commit. Пакет с конфликтом обязан пройти через commit и
честно упасть (закреплено мутацией `noop-swallows-conflicts`).

## 4. Идентичность и дедупликация (без изменений, подтверждено тестами)

- Семантический `sourceId` = идентичность; module/chat/session/batch =
  provenance. Тот же sourceId другим маршрутом → ОДНА запись, merged
  sourceRefs/aliases.
- Одинаковый текст + разные sourceId → ДВЕ записи. **Text-dedup запрещён**
  и закреплён мутацией `text-dedup-introduced`.

## 5. Claim safety — новое правило A7

В `extParsePackage` добавлен fail-closed отказ:
`claimClass:'user_fact'` + `textOrigin:'assistant_interpretation'` →
пакет отклоняется («интерпретация ассистента не является фактом
пользователя»). Сны/символические интерпретации с честными claim classes
(`user_experience`, `symbolic_interpretation`) проходят с сохранением всех
слоёв. Закреплено мутацией `claim-promotion-allowed`.

## 6. Исчезновение источника ≠ удаление

`extConnMarkRevoked` / `extConnDisconnect` / `extConnForget` не трогают
канонические записи. Forget = tombstone подключения + удаление только самой
записи подключения; импортированные данные остаются с ext-provenance.
`sourceStatusNote` — provenance-статус, не удаление. Закреплено мутациями
`revoke-deletes-canonical`, `forget-deletes-canonical`.

## 7. Управление пользователем (UI, ov-ext-import)

Подключить (label+kind) → Обновить (файл/вставка feed) → Предпросмотр →
Применить / Отмена → Отключить / Переподключить / Забыть. Все операции
transactional со snapshot+rollback; write-lock восстановления уважается;
labels экранируются (XSS-тест).

## 8. Тесты

- `tests/finalA-bridge.spec.mjs` — 54 проверки: схема v9, lifecycle
  подключений, malformed feed fail-closed, первый импорт,
  checkpoint-after-commit, инкремент/replay/stale-cursor → 0 дублей,
  same-text-different-sourceId → 2 записи, interrupted transaction,
  claim safety (adversarial fixtures), disappearance≠delete, изоляция
  профилей + recovery lock, XSS, privacy canary, network=0, JS errors=0.
- `tests/finalA-mutation.mjs` — 10 мутаций, каждая обязана уронить свой
  сценарий: cursor-before-commit, claim-promotion-allowed,
  noop-swallows-conflicts, ledger-skip-removed, error-hidden-as-connected,
  revoke-deletes-canonical, forget-deletes-canonical, text-dedup-introduced,
  provenance-dropped, profile-isolation-broken.
- `tests/finalA-backup-roundtrip.test.mjs` — 10 проверок: подключения +
  checkpoint через encrypted backup/restore byte-identical; в envelope нет
  labels/hashes/sourceId открытым текстом; wrong password/corrupt → ноль
  мутаций.
- Все сюиты включены в `npm test` / `npm run test:backup`.

## 9. Известные ограничения

- Автоматического сетевого опроса Drive/GPT нет (осознанно): владелец
  приносит feed-файл/вставку; состояния подключения отражают
  owner-mediated pipeline, а не фоновый коннектор.
- Feed ≤50 пакетов за один проход; больший объём — несколькими проходами
  (курсор делает это безопасным).
- `committedPackageHashes` bounded (200): выпавшие из окна пакеты ловятся
  ledger'ом contentHash (проверено тестом stale cursor).

## 10. Rollback

Один revert-commit PR возвращает MAIN к `76d0b90`. Схема аддитивна
(v8 → v9: пустой `externalConnections` + правило A7 в parse); данные
пользователей v8 читаются без миграционных потерь; откат не разрушает
существующие записи (новая коллекция просто игнорируется старым кодом).
