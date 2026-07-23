# 04 — DEVELOPMENT WORKFLOW

## Цель процесса

Минимум ручной работы для Ивана, минимум веток, максимум проверяемости.

## Постоянные ветки

### `MAIN`

- production/default;
- только проверенный код;
- изменение только после явного решения владельца.

### `claude/life-architect-clean-restart`

- единая integration/documentation branch для продолжения работы в Claude Code;
- содержит handoff и решения;
- не является production;
- не должна превращаться в свалку параллельных реализаций.

## Временные ветки

Разрешена максимум одна временная ветка одновременно:

```text
claude/task-<short-slug>
```

Она создаётся от актуальной integration branch только для конкретной функции. После merge удаляется. Новая задача не начинается, пока предыдущая ветка не закрыта.

## Стандарт одной задачи

### 1. Reality check

Claude обязан проверить:

- branch;
- HEAD/base relationship;
- clean worktree;
- реальные файлы и функции;
- существующие тесты;
- пересечение с открытыми PR.

### 2. Plan mode

План должен содержать:

- цель;
- non-goals;
- changed files;
- data/privacy impact;
- rollback;
- tests;
- stop conditions.

До подтверждения плана запрещены широкие runtime-изменения.

### 3. Реализация

- маленькими последовательными коммитами либо одним атомарным коммитом;
- без временных генераторов/патчеров в финальном diff;
- без зависимостей, если задача решается существующим стеком;
- без изменения чужих модулей «заодно».

### 4. Проверка

Минимум:

```bash
cd architect
npm run build
npm test
```

Дополнительные focused tests обязательны для storage, privacy, AI validators, backup и migrations.

Если Playwright browser отсутствует, это статус `BLOCKED`, а не `PASS`.

### 5. Draft PR

Только один draft PR. В описании:

- что изменилось;
- почему;
- точный diff scope;
- что не менялось;
- test results;
- blocked evidence;
- rollback;
- screenshots/preview для UI.

### 6. Независимый аудит

Перед merge:

- проверить PR diff;
- проверить production module, а не только mock;
- проверить data compatibility;
- проверить мобильный сценарий;
- проверить CI.

### 7. Завершение

После merge:

- удалить task branch;
- обновить `08-DECISION-LOG.md`;
- обновить backlog;
- убедиться, что осталась максимум одна активная implementation branch.

## Правило передачи между Claude и ChatGPT

Источник правды — GitHub PR/commit. Никаких вставок огромных diff в чат и никаких временных patch/bundle как обычного процесса.

ChatGPT может читать GitHub PR и проводить аудит. Claude Code должен публиковать рабочий результат в существующую task-ветку и draft PR.

## Запрет на автоматическую автономию

Нельзя:

- создавать пачку веток;
- создавать заменяющий PR без закрытия предыдущего;
- объединять несколько фаз в один PR;
- merge без решения владельца;
- удалять старые ветки до cleanup audit;
- использовать временный workspace как единственный источник результата.

## Формат финального отчёта Claude

```text
TASK=<name>
BASE_SHA=<sha>
HEAD_SHA=<sha>
BRANCH=<branch>
PR=<number>
CHANGED_FILES=<count/list>
BUILD=<PASS/FAIL>
FOCUSED_TESTS=<PASS/FAIL/BLOCKED>
E2E=<PASS/FAIL/BLOCKED>
MOBILE_EVIDENCE=<PASS/FAIL/BLOCKED>
DATA_MIGRATION=<NONE/description>
ROLLBACK=<description>
READY_FOR_OWNER_REVIEW=true|false
```
