# Архитектор — Route Inventory (Этап 0)

Полная карта маршрутов и оверлеев текущего интерфейса. Источник правды — `architect/tests/evidence/routes.mjs`; этот файл — его человекочитаемый снимок. Всего маршрутов: **47** (ключевых, снимаемых по всей матрице устройств×тем: **15**).

Легенда состояний: `empty` — пусто, `populated` — заполнено синтетикой, `longtext` — длинный текст. ★ — ключевой экран.

## Онбординг

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Онбординг (первый запуск) | `onboarding` | openOv(`ov-onboard`) | empty |
| Тур — шаг 1 «Отмечай день» | `tour-1` | openOv(`ov-tour`) → rTour(0) | empty |
| Тур — шаг 2 «Заведи сферы» | `tour-2` | openOv(`ov-tour`) → rTour(1) | empty |
| Тур — шаг 3 «Смотри, что помогает» | `tour-3` | openOv(`ov-tour`) → rTour(2) | empty |

## Сегодня

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Сегодня — пустое состояние | `today-empty` | goTo(`home`) | empty |
| ★ Сегодня — заполнено | `today` | goTo(`home`) | populated, longtext |

## Быстрый ввод

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Быстрый ввод — «Записать» | `capture-add` | openOv(`ov-add`) | populated |
| ★ Чек-ин состояния | `capture-checkin` | openOv(`ov-ci`) | populated |
| Момент | `capture-moment` | openOv(`ov-moment`) | populated |
| «Зачем?» (разбор) | `capture-why` | openOv(`ov-why`) | populated |
| Отметка сферы | `capture-sphere-log` | openSphereLog(DB.spheres[0].id) | populated |
| Тяга / срыв | `capture-craving` | openOv(`ov-craving`) | populated |

## Психология

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Психология — рабочее пространство | `psychology` | goTo(`map`) → msub(`psychology`) | empty, populated, longtext |

## Дневник

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Дневник — Записи | `mind-insights` | goTo(`map`) → msub(`insights`) | empty, populated, longtext |
| Дневник — Связи | `mind-graph` | goTo(`map`) → msub(`graph`) | populated |
| Дневник — Книга | `mind-book` | goTo(`map`) → msub(`book`) | populated |
| Дневник — Закономерности | `mind-patterns` | goTo(`map`) → msub(`patterns`) | populated |
| Дневник — Сны | `mind-dreams` | goTo(`map`) → msub(`dreams`) | populated, longtext |
| Дневник — Практики и смыслы | `mind-spiritual` | goTo(`map`) → msub(`spiritual`) | populated |
| Дневник — Мой путь | `mind-evolution` | goTo(`map`) → msub(`evolution`) | populated |

## Сферы

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Сферы | `spheres` | goTo(`vit`) | empty, populated |

## Итоги

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Итоги (период) | `review` | goTo(`sys`) | empty, populated |

## Здоровье

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Здоровье | `health` | goTo(`health`) | empty, populated |
| Здоровье — добавить лекарство | `health-med-add` | openOv(`ov-med-add`) | populated |
| Здоровье — симптом | `health-symptom` | openOv(`ov-symptom`) | populated |
| Здоровье — измерение | `health-measure` | openOv(`ov-measure`) | populated |
| Здоровье — отчёт врачу | `health-doc-report` | goTo(`health`) → openOv(`ov-doc-report`) | populated |

## Астрология

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Астрология — лендинг | `astro-landing` | goTo(`astro`) → asub(`menu`) | populated |
| ★ Астрология — натальная карта | `astro-natal` | goTo(`astro`) → asub(`natal`) | populated |
| Астрология — периоды/транзиты | `astro-transits` | goTo(`astro`) → asub(`transits`) | populated |
| Астрология — прогрессии | `astro-prog` | goTo(`astro`) → asub(`prog`) | populated |
| Астрология — возвращения | `astro-returns` | goTo(`astro`) → asub(`ret`) | populated |
| Астрология — отношения (синастрия) | `astro-synastry` | goTo(`astro`) → asub(`syn`) | populated |
| Астрология — Джйотиш | `astro-jyotish` | goTo(`astro`) → asub(`jyo`) | populated |
| Астрология — исслед.: средние точки | `astro-midpoints` | goTo(`astro`) → asub(`mid`) | populated |
| Астрология — исслед.: точки | `astro-points` | goTo(`astro`) → asub(`points`) | populated |
| Астрология — исслед.: жребии/звёзды | `astro-parts` | goTo(`astro`) → asub(`parts`) | populated |
| Астрология — ректификация | `astro-rectify` | goTo(`astro`) → asub(`rectify`) | populated |

## Настройки

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Настройки | `settings` | goTo(`settings`) | populated |
| Настройки — модели AI | `settings-models` | openOv(`ov-models`) | populated |
| Настройки — ключи API | `settings-keys` | openOv(`ov-keys`) | populated |
| Настройки — приватность | `settings-privacy` | openOv(`ov-privacy`) | populated |

## Поиск

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| Поиск по памяти | `search` | openOv(`ov-search`) | populated |

## Мои записи

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Мои записи | `records` | openRecords() | populated |

## Backup

| Экран | id | Навигация | Состояния |
| --- | --- | --- | --- |
| ★ Резервная копия — список | `backup` | openBackups() | populated |
| Резервная копия — зашифрованная | `backup-enc` | openEncBackup() | populated |
| Восстановление / импорт | `restore` | openOv(`ov-import`) | populated |

## Матрица устройств

| Устройство | id | Размер (portrait) | DSF |
| --- | --- | --- | --- |
| iPhone SE (compact) | `iphone-se` | 375×667 | @2 |
| iPhone 13/14 (standard) | `iphone-std` | 390×844 | @2 |
| iPhone Pro Max | `iphone-promax` | 430×932 | @2 |
| iPad (portrait) | `ipad-portrait` | 820×1180 | @2 |

Темы: dark, light. Полный каталог экранов снимается на референсе (iphone-std · dark); ключевые экраны — по всей матрице.
