// ═══════════════════════════════════════════════════════════════
//  Архитектор — карта маршрутов, устройств и тем для UX-evidence.
//
//  Единый источник правды: что за экран, как до него дойти, в каком
//  состоянии снимать. Из этого файла харнесс строит route-inventory.json,
//  скриншоты и accessibility-прогон.
//
//  Навигация описана декларативно (nav-объект), чтобы её можно было
//  и выполнить в браузере, и выгрузить в инвентарь. Поля nav (в порядке
//  применения):
//    tab      — goTo('<tab>')
//    msub     — msub('<sub>')            (подменю «Разума»)
//    asub     — asub('<sub>')            (подменю астрологии)
//    open     — вызвать функцию открытия без аргументов, напр. 'openRecords'
//    overlay  — openOv('<ov-id>')
//    call     — вызвать глобальную функцию window[call](...args)
//    args     — литеральные аргументы для call
//    sphereIdx— подставить DB.spheres[idx].id первым аргументом call
// ═══════════════════════════════════════════════════════════════

// Матрица устройств (portrait). deviceScaleFactor=2 держит вес артефактов
// умеренным; реальный Pro Max — @3, что отмечено в отчёте как ограничение.
export const DEVICES = [
  { id: 'iphone-se',       label: 'iPhone SE (compact)',  width: 375, height: 667,  dsf: 2 },
  { id: 'iphone-std',      label: 'iPhone 13/14 (standard)', width: 390, height: 844,  dsf: 2 },
  { id: 'iphone-promax',   label: 'iPhone Pro Max',       width: 430, height: 932,  dsf: 2 },
  { id: 'ipad-portrait',   label: 'iPad (portrait)',      width: 820, height: 1180, dsf: 2 },
];

export const THEMES = ['dark', 'light'];

// Референс-конфигурация для полного каталога маршрутов (по одному снимку
// на маршрут — чтобы покрыть ВСЕ экраны без комбинаторного взрыва).
export const REFERENCE_DEVICE = 'iphone-std';
export const REFERENCE_THEME = 'dark';

// states: какие состояния данных имеют смысл для этого экрана.
//   'empty'     — пустое состояние (без данных)
//   'populated' — заполненное синтетикой
//   'longtext'  — длиннотекстовый стресс-кейс
//
// key: входит в ключевой набор (>=12 экранов), снимаемый по всей
//      матрице устройств × тем.
export const ROUTES = [
  // ── Онбординг и короткий тур ──
  { id: 'onboarding', label: 'Онбординг (первый запуск)', category: 'Онбординг', nav: { overlay: 'ov-onboard' }, states: ['empty'], key: true },
  { id: 'tour-1', label: 'Тур — шаг 1 «Отмечай день»', category: 'Онбординг', nav: { overlay: 'ov-tour', call: 'rTour', args: [0] }, states: ['empty'] },
  { id: 'tour-2', label: 'Тур — шаг 2 «Заведи сферы»', category: 'Онбординг', nav: { overlay: 'ov-tour', call: 'rTour', args: [1] }, states: ['empty'] },
  { id: 'tour-3', label: 'Тур — шаг 3 «Смотри, что помогает»', category: 'Онбординг', nav: { overlay: 'ov-tour', call: 'rTour', args: [2] }, states: ['empty'] },

  // ── Сегодня (Today) ──
  { id: 'today-empty', label: 'Сегодня — пустое состояние', category: 'Сегодня', nav: { tab: 'home' }, states: ['empty'], key: true },
  { id: 'today', label: 'Сегодня — заполнено', category: 'Сегодня', nav: { tab: 'home' }, states: ['populated', 'longtext'], key: true },

  // ── Быстрый ввод (capture forms) ──
  { id: 'capture-add', label: 'Быстрый ввод — «Записать»', category: 'Быстрый ввод', nav: { overlay: 'ov-add' }, states: ['populated'], key: true },
  { id: 'capture-checkin', label: 'Чек-ин состояния', category: 'Быстрый ввод', nav: { overlay: 'ov-ci' }, states: ['populated'], key: true },
  { id: 'capture-moment', label: 'Момент', category: 'Быстрый ввод', nav: { overlay: 'ov-moment' }, states: ['populated'] },
  { id: 'capture-why', label: '«Зачем?» (разбор)', category: 'Быстрый ввод', nav: { overlay: 'ov-why' }, states: ['populated'] },
  { id: 'capture-sphere-log', label: 'Отметка сферы', category: 'Быстрый ввод', nav: { call: 'openSphereLog', sphereIdx: 0 }, states: ['populated'] },
  { id: 'capture-craving', label: 'Тяга / срыв', category: 'Быстрый ввод', nav: { overlay: 'ov-craving' }, states: ['populated'] },

  // ── Дневник / Разум ──
  { id: 'mind-insights', label: 'Разум — Инсайты/знания', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'insights' }, states: ['empty', 'populated', 'longtext'], key: true },
  { id: 'mind-graph', label: 'Разум — Граф связей', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'graph' }, states: ['populated'] },
  { id: 'mind-book', label: 'Разум — Книга/главы', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'book' }, states: ['populated'] },
  { id: 'mind-patterns', label: 'Разум — Паттерны', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'patterns' }, states: ['populated'] },
  { id: 'mind-dreams', label: 'Разум — Сны', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'dreams' }, states: ['populated', 'longtext'] },
  { id: 'mind-spiritual', label: 'Разум — Практики/сознание', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'spiritual' }, states: ['populated'] },
  { id: 'mind-evolution', label: 'Разум — Эволюция', category: 'Дневник/Разум', nav: { tab: 'map', msub: 'evolution' }, states: ['populated'] },

  // ── Сферы ──
  { id: 'spheres', label: 'Сферы', category: 'Сферы', nav: { tab: 'vit' }, states: ['empty', 'populated'], key: true },

  // ── Итоги / Обзор ──
  { id: 'review', label: 'Итоги (период)', category: 'Итоги', nav: { tab: 'sys' }, states: ['empty', 'populated'], key: true },

  // ── Здоровье ──
  { id: 'health', label: 'Здоровье', category: 'Здоровье', nav: { tab: 'health' }, states: ['empty', 'populated'], key: true },
  { id: 'health-med-add', label: 'Здоровье — добавить лекарство', category: 'Здоровье', nav: { overlay: 'ov-med-add' }, states: ['populated'] },
  { id: 'health-symptom', label: 'Здоровье — симптом', category: 'Здоровье', nav: { overlay: 'ov-symptom' }, states: ['populated'] },
  { id: 'health-measure', label: 'Здоровье — измерение', category: 'Здоровье', nav: { overlay: 'ov-measure' }, states: ['populated'] },
  { id: 'health-doc-report', label: 'Здоровье — отчёт врачу', category: 'Здоровье', nav: { tab: 'health', overlay: 'ov-doc-report' }, states: ['populated'] },

  // ── Астрология ──
  { id: 'astro-landing', label: 'Астрология — лендинг', category: 'Астрология', nav: { tab: 'astro', asub: 'menu' }, states: ['populated'], key: true },
  { id: 'astro-natal', label: 'Астрология — натальная карта', category: 'Астрология', nav: { tab: 'astro', asub: 'natal' }, states: ['populated'], key: true },
  { id: 'astro-transits', label: 'Астрология — периоды/транзиты', category: 'Астрология', nav: { tab: 'astro', asub: 'transits' }, states: ['populated'] },
  { id: 'astro-prog', label: 'Астрология — прогрессии', category: 'Астрология', nav: { tab: 'astro', asub: 'prog' }, states: ['populated'] },
  { id: 'astro-returns', label: 'Астрология — возвращения', category: 'Астрология', nav: { tab: 'astro', asub: 'ret' }, states: ['populated'] },
  { id: 'astro-synastry', label: 'Астрология — отношения (синастрия)', category: 'Астрология', nav: { tab: 'astro', asub: 'syn' }, states: ['populated'] },
  { id: 'astro-jyotish', label: 'Астрология — Джйотиш', category: 'Астрология', nav: { tab: 'astro', asub: 'jyo' }, states: ['populated'] },
  { id: 'astro-midpoints', label: 'Астрология — исслед.: средние точки', category: 'Астрология', nav: { tab: 'astro', asub: 'mid' }, states: ['populated'] },
  { id: 'astro-points', label: 'Астрология — исслед.: точки', category: 'Астрология', nav: { tab: 'astro', asub: 'points' }, states: ['populated'] },
  { id: 'astro-parts', label: 'Астрология — исслед.: жребии/звёзды', category: 'Астрология', nav: { tab: 'astro', asub: 'parts' }, states: ['populated'] },
  { id: 'astro-rectify', label: 'Астрология — ректификация', category: 'Астрология', nav: { tab: 'astro', asub: 'rectify' }, states: ['populated'] },

  // ── Настройки ──
  { id: 'settings', label: 'Настройки', category: 'Настройки', nav: { tab: 'settings' }, states: ['populated'], key: true },
  { id: 'settings-models', label: 'Настройки — модели AI', category: 'Настройки', nav: { overlay: 'ov-models' }, states: ['populated'] },
  { id: 'settings-keys', label: 'Настройки — ключи API', category: 'Настройки', nav: { overlay: 'ov-keys' }, states: ['populated'] },
  { id: 'settings-privacy', label: 'Настройки — приватность', category: 'Настройки', nav: { overlay: 'ov-privacy' }, states: ['populated'] },

  // ── Поиск ──
  { id: 'search', label: 'Поиск по памяти', category: 'Поиск', nav: { overlay: 'ov-search' }, states: ['populated'] },

  // ── Мои записи ──
  { id: 'records', label: 'Мои записи', category: 'Мои записи', nav: { open: 'openRecords' }, states: ['populated'], key: true },

  // ── Backup / Restore ──
  { id: 'backup', label: 'Резервная копия — список', category: 'Backup', nav: { open: 'openBackups' }, states: ['populated'], key: true },
  { id: 'backup-enc', label: 'Резервная копия — зашифрованная', category: 'Backup', nav: { open: 'openEncBackup' }, states: ['populated'] },
  { id: 'restore', label: 'Восстановление / импорт', category: 'Backup', nav: { overlay: 'ov-import' }, states: ['populated'] },
];

// Ключевые экраны для полной матрицы устройств × тем (>= 12 по acceptance).
export const KEY_ROUTES = ROUTES.filter(r => r.key);
