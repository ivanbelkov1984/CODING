# 01 — BASELINE REALITY

## 1. Репозиторий и ветки

- Репозиторий: `ivanbelkov1984/CODING`
- Default branch: `MAIN`
- Clean baseline SHA: `14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d`
- Clean Claude handoff branch создана непосредственно от `MAIN`.
- Ветка `agent/astrology-harness-foundation` была на 210 коммитов впереди `MAIN`, но не была слита обратно.
- Следовательно, GPT/Codex runtime-изменения не входят в production baseline.

## 2. Текущий технологический стек

По фактическому `architect/package.json`:

- приложение: vanilla JavaScript;
- модульный режим Node: `type: module`;
- build: `node build.mjs`;
- test build: `node build.mjs --combined dist/app.html`;
- E2E: Playwright;
- текущая версия приложения: `5.0.0`.

Основные runtime-файлы:

- `architect/index.html`
- `architect/styles.css`
- `architect/app.js`
- `architect/build.mjs`
- `architect/sw.js`
- `architect/backend/`

## 3. Хранилище и синхронизация

Подтверждённая существующая модель:

- данные профилей/настроек и основная DB живут локально в браузере;
- медиа хранятся отдельно в IndexedDB;
- поддерживается мультипрофильность;
- синк использует клиентское шифрование при наличии парольной фразы;
- PBKDF2-SHA256 и AES-GCM уже существуют в приложении;
- GitHub содержит только код, а не пользовательские данные;
- сервер синка при включённом E2EE получает шифроблоки.

Критическая честная граница: выбранный пользователем текст, отправляемый на AI-разбор, видит соответствующий AI-провайдер. Нельзя обещать, что ИИ не читает отправленный ему текст.

Источник правды по этой части: `architect/SECURITY_MODEL.md` и реальный код.

## 4. Дизайн baseline

В `MAIN` уже merged Claude Code изменения:

- Dual Realm темы: Deep Space / Ethereal Light;
- дизайн-токены;
- удаление грубых левых `border-left` акцентов на карточках;
- существующая визуальная система описана в `architect/design_guide.md`.

Нельзя откатывать эти изменения под видом очистки Codex: они были сделаны Claude Code и находятся в `MAIN`.

## 5. Что НЕ входит в baseline

Не входят в `MAIN`:

- runtime Phase 1 из ветки `agent/astrology-harness-foundation`;
- Codex encrypted backup из PR #63/#64;
- экспериментальные `backup-core.mjs`, `backup-browser-adapter.mjs` и связанные тесты из временных сред;
- 120-файловый пакет PR #40;
- незамерженные `studio/*` PR.

## 6. Нельзя считать доказанным без нового аудита

До read-only аудита Claude Code нельзя окончательно утверждать:

- точные схемы всех коллекций DB;
- полный перечень media record formats;
- полную семантику merge/tombstones;
- состояние каждого AI call site;
- пригодность PWA к native wrapper;
- фактическую работоспособность всех старых открытых PR.

Эти пункты должны быть подтверждены кодом, а не прежними отчётами GPT/Codex.

## 7. Контрольный маркер

```text
PRODUCTION_BASELINE=MAIN@14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d
CODEX_RUNTIME_IN_MAIN=false
DESTRUCTIVE_ROLLBACK_REQUIRED=false
READ_ONLY_AUDIT_REQUIRED=true
```
