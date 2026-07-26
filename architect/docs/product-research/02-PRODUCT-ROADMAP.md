# Архитектор жизни — Product Roadmap после Market Benchmark

Статус: ROADMAP_PROPOSAL. Каждый runtime-этап требует отдельного task contract и Draft PR.

## 1. Правило последовательности

Сначала ясность и управляемость продукта, затем новые функции.

Запрещено:
- одновременно менять несколько доменов;
- добавлять новый большой модуль до завершения P0 UX foundation;
- объединять UI-редизайн с изменением расчётной логики;
- удалять существующие функции только ради упрощения;
- объявлять успех только по количеству тестов без visual/mobile evidence.

## 2. Метрики качества

До начала спринтов зафиксировать baseline:
- время до первой полезной записи;
- количество действий до check-in;
- количество top-level направлений;
- доля ключевых функций, доступных за ≤2 перехода;
- количество CTA на первом экране Today;
- высота первого экрана на iPhone;
- bundle/app.js size;
- количество глобальных render-функций;
- Core Web Vitals/launch time;
- accessibility violations;
- screenshot baselines ключевых экранов.

Продуктовые целевые показатели:
- новый пользователь делает первую полезную запись менее чем за 60 секунд;
- ежедневный быстрый ввод — менее 30 секунд;
- один главный CTA на смысловой экран;
- четыре top-level вкладки на iPhone;
- любой AI/аналитический вывод открывает источники;
- любое действие можно отменить или исправить;
- никакая специализированная техника не блокирует базовый пользовательский путь.

## 3. Этап 0 — UX evidence foundation

Результат:
- screenshot baseline iPhone SE/standard/Pro Max и iPad;
- dark/light;
- empty/populated/error/loading;
- accessibility smoke;
- performance baseline;
- карта всех маршрутов и overlays.

Не менять дизайн. Только измерение и тестовая инфраструктура.

Acceptance:
- артефакты доступны в CI;
- минимум 12 ключевых экранов;
- visual diff не зависит от сети и личных данных.

## 4. Этап 1 — Navigation shell

Цель: сделать карту приложения понятной, не удаляя функции.

### iPhone
Нижняя навигация:
- Сегодня;
- Дневник;
- Обзор;
- Ещё.

Глобальная кнопка «Записать».

### iPad/desktop
Адаптивный sidebar с группами.

Старые маршруты сохраняются как внутренние destination IDs.

Acceptance:
- все существующие экраны достижимы;
- current section всегда виден;
- back/close behavior единообразен;
- минимум tap depth не увеличен;
- deep links/restore state не сломаны.

## 5. Этап 2 — Today v2

Цель: ответить на три вопроса:
1. Как я сейчас?
2. Что сегодня главное?
3. Что сделать следующим?

Первый экран:
- дата/приветствие;
- краткое состояние;
- главный шаг;
- одна кнопка быстрого ввода.

Ниже:
- требующее внимания;
- краткий narrative изменений;
- последние события;
- раскрываемый подробный анализ.

Ручной sync уходит в системный статус.

Acceptance:
- первый viewport содержит не более одного primary CTA;
- никакой горизонтальной перегрузки quick actions;
- экран полезен и при пустых данных;
- важное напоминание не теряется;
- астрология появляется только при explicit Today opt-in.

## 6. Этап 3 — Unified Capture

Одна точка «Записать»:
- состояние;
- событие;
- свободная запись;
- сон;
- глубокий разбор;
- здоровье.

После выбора открывается короткая специализированная форма.

Acceptance:
- существующие entity types сохраняются;
- быстрый state capture ≤30 секунд;
- draft/undo;
- voice input подготовлен архитектурно, но не обязателен в первом PR;
- accessibility keyboard/focus корректны.

## 7. Этап 4 — Diary & open loops

Объединить:
- дневник;
- инсайты;
- сны;
- моменты;
- «Зачем?»;
- паттерны;
- действия и follow-up.

Представления:
- лента;
- календарь;
- поиск;
- открытые петли.

Open loop содержит:
- исходное событие;
- гипотезу;
- выбранное действие;
- срок проверки;
- результат.

Acceptance:
- любой вывод ведёт к источнику;
- незавершённые действия не теряются;
- AI-гипотезы визуально отличаются от фактов пользователя.

## 8. Этап 5 — Review & analytics

Пересобрать «Итоги» в четыре уровня:
- сегодня;
- неделя;
- месяц;
- долгий период.

Каждый вывод:
- простая формулировка;
- evidence drawer;
- uncertainty;
- один возможный эксперимент;
- дата проверки.

Не использовать причинные формулировки для корреляций.

## 9. Этап 6 — Health Organizer v2

Навигация:
- Сегодня;
- Timeline;
- Лекарства;
- Симптомы и измерения;
- Документы;
- Отчёт врачу.

Перед документами:
- privacy/security review;
- encrypted sensitive blob contract;
- context-specific AI consent.

HealthKit/Apple Health — отдельный будущий native-readiness contract, не имитация в PWA.

## 10. Этап 7 — Astrology information architecture

Не добавлять расчётные техники на этом этапе.

Верхние режимы:
- Моя карта;
- Периоды;
- Отношения;
- Исследовать.

Beginner/pro режим:
- beginner: narrative и главное;
- pro: правила, орбисы, таблицы, методы.

Технические методы живут внутри «Исследовать», а не конкурируют на первом экране.

Acceptance:
- все текущие функции сохранены;
- новичок видит не более 4 основных направлений;
- расчётные детали раскрываются;
- западная и ведическая системы визуально различимы;
- source/rule переход доступен из интерпретации.

## 11. Этап 8 — Search and personal memory

Универсальный поиск:
- точный текст;
- фильтры;
- люди/места/даты;
- semantic query;
- cited answer.

AI не получает больше данных, чем нужно для конкретного запроса.

Acceptance:
- каждый synthesized claim содержит source IDs;
- source tap открывает оригинал;
- локальный поиск работает offline;
- cloud AI требует explicit consent.

## 12. Этап 9 — Design system consolidation

Извлечь и унифицировать:
- tokens;
- typography;
- spacing;
- buttons;
- cards;
- rows;
- sheets;
- tabs;
- disclosures;
- status labels;
- chart containers;
- empty/error/loading.

Никакого framework rewrite.

## 13. Этап 10 — Modular extraction

Постепенно вынести из монолита:
- navigation;
- Today;
- capture;
- diary;
- health;
- astrology presentation;
- search;
- shared UI helpers.

Требования:
- behavior-preserving;
- маленькие PR;
- rollback одним revert;
- no schema changes без отдельного migration contract.

## 14. Приоритеты

### P0
- UX evidence;
- navigation;
- Today;
- unified capture;
- open loops;
- accessibility.

### P1
- analytics redesign;
- health UX;
- astrology IA;
- search with citations.

### P2
- design-system consolidation;
- modular extraction;
- native readiness;
- advanced integrations.

## 15. Definition of Done каждого UI PR

1. Один пользовательский результат.
2. Список затронутых маршрутов.
3. Before/after screenshots.
4. iPhone + iPad evidence.
5. Dark + light.
6. Empty + populated.
7. Keyboard/focus/accessibility.
8. Existing E2E green.
9. Focused tests добавлены.
10. Нет личных данных в fixture/log/screenshot.
11. Rollback описан.
12. PR остаётся Draft до независимого review.