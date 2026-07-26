# Архитектор — UX Evidence Foundation (Этап 0)

Статус: **AUDIT_ONLY / TEST-INFRASTRUCTURE**. Этот пакет реализует «Этап 0 — UX evidence foundation» из `architect/docs/product-research/02-PRODUCT-ROADMAP.md` и первый рекомендованный prompt из `03-CLAUDE-EXECUTION-PROTOCOL.md`.

Задача этапа — **измерение, а не изменение**. Здесь нет ни одной правки production UI, текстов, расчётов, storage, схемы, sync, crypto или доменного поведения (здоровье/астрология/AI). Только тестовая инфраструктура, которая строит воспроизводимый baseline текущего «Архитектора».

## Что это даёт

- **Скриншот-baseline** всех экранов по матрице устройств × тем × состояний — визуальная опора для будущих задач (navigation shell, Today v2, unified capture …), чтобы каждый следующий PR доказывал «поведение сохранено» диффом скриншотов.
- **Route inventory** — полная карта маршрутов и оверлеев (`01-ROUTE-INVENTORY.md`).
- **Performance baseline** — размеры, время запуска, метрики перегруженности Today (`02-PERFORMANCE-BASELINE.md`).
- **Accessibility smoke + UX-дефекты** — зафиксированные проблемы, которые в этом PR **не исправляются** (`03-FINDINGS.md`).

## Файлы

| Путь | Что это |
| --- | --- |
| `architect/tests/ux-evidence.mjs` | Оркестратор: сервер + браузер + скриншоты + отчёты. |
| `architect/tests/evidence/fixtures.mjs` | Детерминированные синтетические данные + заморозка часов. |
| `architect/tests/evidence/routes.mjs` | Единый источник правды: маршруты, устройства, темы. |
| `architect/tests/evidence/a11y.mjs` | Accessibility smoke (labels / tap targets / focus / контраст). |
| `.github/workflows/ux-evidence.yml` | CI: гоняет харнесс и выкладывает `evidence/` артефактом. |
| `architect/docs/ux-evidence/*` | Человекочитаемый снимок baseline (этот каталог). |

## Как запустить

```bash
cd architect
npm ci
npm run evidence          # = build combined + node tests/ux-evidence.mjs
# локально, если системный Chromium иной ревизии, чем ждёт Playwright:
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run evidence
```

Артефакты появляются в `architect/evidence/` (каталог в `.gitignore` — не коммитится):

```
evidence/
  screenshots/<device>/<theme>/<state>/<route>.png
  route-inventory.json
  perf-baseline.json
  a11y-report.json
  manifest.json
  REPORT.md
```

В CI (`ux-evidence.yml`) эти же артефакты доступны как загрузка `ux-evidence` у прогона Actions.

## Принципы, заложенные в baseline

- **Детерминизм.** Часы заморожены на `2026-03-15T08:00:00Z`; данные — синтетика (никаких реальных личных записей); service worker нейтрализован. Один и тот же код → один и тот же кадр в любой день и на любой машине.
- **Faithful runtime.** Приложение обслуживается локальным HTTP-сервером поверх `dist/` — как реальный PWA на GitHub Pages, чтобы работал динамический import lazy-модулей (в т.ч. зашифрованный backup).
- **Не блокирующий сбор.** Харнесс — не гейт качества: он не чинит дефекты и завершается успешно, даже если они найдены. Регрессионным гейтом остаётся `ci.yml` (lint + e2e).
- **Только additive.** Ни один production-файл не изменён (кроме `package.json` — добавлен скрипт `evidence`).

## Границы (не трогалось)

UI и тексты · расчёты · storage/schema · sync · crypto · health behavior · astrology behavior · AI · production data. См. `03-NONNEGOTIABLE-CONSTRAINTS.md`.
