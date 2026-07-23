# CLAUDE.md — «Архитектор жизни»

## 1. Назначение

Этот репозиторий содержит действующее веб-приложение «Архитектор» — локальный, offline-first личный дневник и систему осмысления жизни. Рабочая программа исторически создавалась в Claude Code. После неудачного эксперимента с GPT Codex проект возвращён к чистой базе `MAIN`.

## 2. Единственная исходная база

- Репозиторий: `ivanbelkov1984/CODING`
- Production/default branch: `MAIN`
- Зафиксированный чистый baseline: `14db0a911773e3dfa0d9de63ad72ce7fdf9a0d0d`
- Рабочая документационная ветка Claude: `claude/life-architect-clean-restart`
- GPT/Codex PR #40, #63 и #64 закрыты без merge.
- Не использовать `agent/*` и `codex/*` как источник production-кода.

Перед любой работой обязательно подтвердить, что текущая задача основана на `MAIN` либо на этой Claude-ветке, а не на старой GPT/Codex-ветке.

## 3. Сначала прочитать

1. `architect/docs/claude-handoff/00-START-HERE.md`
2. `architect/docs/claude-handoff/01-BASELINE-REALITY.md`
3. `architect/docs/claude-handoff/02-PRODUCT-VISION.md`
4. `architect/docs/claude-handoff/03-NONNEGOTIABLE-CONSTRAINTS.md`
5. `architect/docs/claude-handoff/04-DEVELOPMENT-WORKFLOW.md`
6. `architect/docs/claude-handoff/05-ENCRYPTED-BACKUP-SPEC.md`
7. `architect/SECURITY_MODEL.md`
8. `architect/design_guide.md`

## 4. Техническая база, которую нельзя переписывать без отдельного решения владельца

- Vanilla JavaScript PWA.
- Существующие `architect/index.html`, `styles.css`, `app.js`, `build.mjs`, `sw.js`.
- Local-first storage: localStorage для профилей/DB/CFG и IndexedDB для медиа.
- Существующий E2EE-синк и обратная совместимость данных.
- Существующая маршрутизация Anthropic/OpenAI/Gemini.
- GitHub Pages/static build и существующий backend.

Запрещён самовольный переход на React, Next.js, TypeScript, Tailwind, shadcn, новую базу данных, новый sync-протокол или переписывание приложения «с нуля».

## 5. Правила работы

- Сначала читать реальный код, затем составлять план.
- Не выдавать предположение за факт.
- Не менять production-данные и не использовать реальные личные данные в тестах.
- Один активный implementation task за раз.
- Максимум одна временная task-ветка одновременно.
- Никаких автоматических цепочек веток и PR.
- Никаких force-push.
- Каждый PR — минимальный, проверяемый и с rollback.
- После merge временная ветка удаляется.
- `MAIN` меняется только через явное решение Ивана после проверки.

## 6. Мобильный владелец

Иван работает с iPad/iPhone и не должен выполнять shell-команды, писать код или вручную переносить patch/bundle. Claude Code обязан самостоятельно работать с GitHub, запускать доступные тесты и предоставлять понятный мобильный PR.

## 7. Первый обязательный этап

До реализации новых функций выполнить read-only аудит текущего `MAIN`:

- карта файлов и модулей;
- хранилище и профили;
- медиа IndexedDB;
- синк/E2EE;
- AI-вызовы;
- build/deploy/service worker;
- реальные тесты;
- список открытых старых Claude PR и рекомендация keep/close/superseded.

Результат оформить в `architect/docs/claude-handoff/09-REPOSITORY-AUDIT.md`. На этом этапе production-код не менять.

## 8. Текущая первая функция после аудита

Заново реализовать зашифрованную переносимую резервную копию по документу `05-ENCRYPTED-BACKUP-SPEC.md`. Предыдущий Codex-код не переносить и не считать эталоном.

## 9. Стоп-условия

Остановиться и сообщить владельцу, если:

- база задачи не соответствует `MAIN`;
- нужно удалять или мигрировать пользовательские данные;
- требуется force-push;
- тесты не доказывают работу production-кода;
- затрагивается криптография, медицинская логика или privacy boundary без отдельного контракта;
- невозможно провести мобильную проверку критического пользовательского пути.
