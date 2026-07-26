# Архитектор жизни — протокол постановки задач Claude

Статус: NORMATIVE_PROPOSAL. После принятия владельцем применяется ко всем UX/product задачам.

## 1. Почему нужен новый процесс

Формат «сделай приложение лучше» приводит к:
- слишком широкому scope;
- смешению расчётной логики, UI и архитектуры;
- быстрым merge без достаточного визуального review;
- росту количества функций без улучшения пользовательского пути;
- исправлению одного экрана ценой непоследовательности остальных.

Правильная единица работы — один проверяемый пользовательский результат.

## 2. Стандартный цикл

### Шаг A — Audit only
Claude читает актуальный MAIN и релевантные документы. Код не меняет.

Возвращает:
- реальный текущий путь пользователя;
- доказательства по файлам/функциям;
- проблемы;
- benchmark references;
- варианты решения;
- риски;
- минимальный task contract.

### Шаг B — Owner/independent review
Проверяется:
- решается ли реальная проблема;
- не потеряны ли функции;
- не смешаны ли домены;
- соответствует ли решение iPhone/iPad;
- достаточно ли acceptance criteria.

### Шаг C — Implementation
Одна ветка, один Draft PR, один результат.

### Шаг D — Evidence
- tests;
- screenshots;
- route list;
- accessibility;
- performance when relevant;
- rollback.

### Шаг E — Independent review
Claude не утверждает собственную работу как окончательно принятую.

### Шаг F — Merge
Только после явного принятия или установленного low-risk gate.

## 3. Размер задачи

Один PR должен обычно укладываться в:
- один экран или один сквозной flow;
- до 3–6 production-файлов, если нет обоснованного extraction;
- без одновременной миграции данных и redesign;
- без добавления нового домена;
- с rollback одним revert.

Если задача требует больше — сначала documentation/design contract.

## 4. Обязательная структура каждого prompt

1. **Контекст MAIN** — точный SHA или требование обновиться до текущего MAIN.
2. **Пользовательская проблема** — не название компонента.
3. **Желаемый результат** — что человек сможет понять или сделать.
4. **Scope** — что можно менять.
5. **Non-goals** — что нельзя трогать.
6. **Сохраняемые функции** — список обязательной обратной совместимости.
7. **UX-принципы** — hierarchy, progressive disclosure, one primary CTA.
8. **Accessibility/mobile** — устройства, темы, размеры текста.
9. **Acceptance criteria** — проверяемые утверждения.
10. **Evidence** — screenshots/tests.
11. **Merge gate** — Draft, no auto-merge.
12. **Stop conditions** — privacy, medical, destructive migration, uncertain source.

## 5. Универсальный мастер-шаблон

```text
Работай от актуального MAIN. Сначала проверь реальный код и маршруты; не полагайся на старые отчёты.

ЗАДАЧА
[один пользовательский результат]

ПРОБЛЕМА
[что сейчас мешает пользователю]

ЦЕЛЕВОЙ ПУТЬ
[шаги пользователя после изменения]

SCOPE
[экраны/файлы/компоненты, которые разрешено менять]

NON-GOALS
- не менять расчётную логику;
- не менять storage/schema/crypto/sync;
- не добавлять новые функции вне задачи;
- не переписывать приложение на framework;
- не удалять существующие возможности.

СОХРАНИТЬ
[конкретные функции и маршруты]

UX-ПРАВИЛА
- один главный смысл экрана;
- один primary CTA;
- сначала вывод простым языком, затем детали;
- advanced content скрыт по умолчанию;
- видимая тапаемость;
- ошибки и ограничения честно показаны;
- действия обратимы.

MOBILE
Проверить iPhone compact, standard, Pro Max и iPad; dark/light; safe areas; увеличенный текст; keyboard/focus.

ACCEPTANCE
[проверяемый список]

EVIDENCE
- before/after screenshots;
- route coverage;
- focused tests;
- полный существующий test suite;
- console errors = 0;
- rollback.

WORKFLOW
Создай одну ветку `claude/task-...` и один Draft PR. Не merge и не auto-merge. После push и зелёного CI остановись и верни SHA, PR, changed files, test results, screenshots и известные ограничения.
```

## 6. Первый рекомендованный prompt — UX evidence foundation

```text
Работай от текущего MAIN. Это audit/test-infrastructure task; production UI не менять.

Создай baseline визуального и accessibility evidence для текущего Архитектора.

Нужно покрыть минимум:
- onboarding;
- Today пустой и заполненный;
- unified add overlays/существующие capture forms;
- Дневник/Разум;
- Итоги;
- Здоровье;
- Астрология landing, natal, periods, relationship, research;
- Настройки;
- Мои записи;
- backup UI.

Матрица:
- iPhone compact;
- iPhone standard;
- iPhone Pro Max;
- iPad portrait;
- dark/light;
- empty/populated;
- один long-text case.

Добавь:
- deterministic synthetic fixtures;
- screenshot artifacts в CI;
- accessibility smoke (labels, focus, tap targets, obvious contrast checks);
- navigation route inventory;
- baseline app.js/bundle/launch measurements.

Не меняй UI, тексты, storage, schema, calculations, sync, crypto или domain behavior.

Открой один Draft PR. Не merge. Верни точный baseline, найденные дефекты и рекомендации только как отдельный audit report.
```

## 7. Второй prompt — Navigation shell

Запускается только после принятия UX evidence PR.

```text
Реализуй адаптивный navigation shell без удаления функций и без изменения domain logic.

На iPhone: 4 постоянные вкладки — Сегодня, Дневник, Обзор, Ещё — плюс глобальное действие «Записать».
На iPad/desktop: сгруппированный sidebar.

Сохрани все текущие destination IDs, overlays, deep routes и функции. Старые экраны должны быть достижимы не более чем за два понятных перехода.

Не меняй содержимое экранов, расчёты, storage, sync, crypto или тексты интерпретаций.

[далее стандартные acceptance/evidence/workflow требования]
```

## 8. Правила взаимодействия владельца, ChatGPT и Claude

- Владелец определяет цель, приоритет и ощущение продукта.
- ChatGPT проводит независимый продуктовый/архитектурный аудит и формирует task contract.
- Claude анализирует репозиторий, реализует контракт и предоставляет evidence.
- Зеленый CI доказывает отсутствие известных тестовых регрессий, но не доказывает качество UX или корректность научной/медицинской модели.
- Быстрый merge не является показателем эффективности.

## 9. Запреты

Claude не должен самостоятельно:
- расширять scope после начала;
- добавлять новую технику «раз уж рядом»;
- менять медицинский intended purpose;
- превращать символическую аналитику в прогноз;
- проводить destructive migration;
- менять криптографическую границу;
- отправлять sensitive data внешнему AI;
- закрывать independent-review замечания собственной декларацией;
- merge high-risk PR без отдельного принятия.

## 10. Порядок ближайших задач

1. UX evidence foundation.
2. Navigation shell.
3. Today v2.
4. Unified Capture.
5. Diary/Open Loops.
6. Review & analytics.
7. Health UX.
8. Astrology information architecture.
9. Search with citations.
10. Design system and modular extraction.

Новые большие функции ставятся на паузу до завершения первых четырёх пунктов.