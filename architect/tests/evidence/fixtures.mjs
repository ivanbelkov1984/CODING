// ═══════════════════════════════════════════════════════════════
//  Архитектор — детерминированные синтетические fixtures для
//  UX-evidence baseline (audit/test-infrastructure, PR: evidence).
//
//  Задача: воспроизводимые скриншоты, не зависящие от сети, реального
//  времени и личных данных. Поэтому здесь:
//   • замороженные часы (фиксированный момент) — одинаковый рендер
//     в любой день/машине;
//   • синтетические данные по всем доменам (никаких реальных записей);
//   • пустое / заполненное / длиннотекстовое состояния.
//
//  Данные вводятся ЧЕРЕЗ собственные функции приложения (createSphere,
//  saveMed, runNatalChart …) и прямое присваивание DB-массивов теми же
//  формами, что использует регрессионный E2E (tests/e2e.mjs). Это НЕ
//  меняет production-код — только наполняет runtime-состояние в песочнице.
// ═══════════════════════════════════════════════════════════════

// Замороженный момент: 2026-03-15 08:00 UTC (утро → приветствие «Доброе утро»).
// Инъекция до загрузки app.js, чтобы Date.now()/new Date()/nowISO()/todayKey()
// давали один и тот же результат при каждом прогоне.
export const FROZEN_CLOCK_SCRIPT = `(() => {
  const _Date = Date;
  const FIXED = _Date.UTC(2026, 2, 15, 8, 0, 0);
  function FakeDate(...a) { return a.length === 0 ? new _Date(FIXED) : new _Date(...a); }
  FakeDate.prototype = _Date.prototype;
  FakeDate.now = () => FIXED;
  FakeDate.parse = _Date.parse;
  FakeDate.UTC = _Date.UTC;
  Object.setPrototypeOf(FakeDate, _Date);
  try { window.Date = FakeDate; } catch (_) {}
})();`;

// Golden-фикстура рождения (J2000, синтетика) — та же, что в E2E golden-тесте.
// Детерминированная натальная карта без реальных персональных данных.
const ASTRO_BIRTH = {
  kType: 'birth_evidence', privacyClass: 'sensitive',
  date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0,
  place: 'синтетика', lat: 55.75, lon: 37.62,
  verif: 'user_confirmed', life: 'current', sv: 2,
};

const LONG_RU = 'Сегодня был необычайно насыщенный и многослойный день, ' +
  'в котором переплелись усталость и тихая радость, тревога о будущем и ' +
  'внезапное чувство ясности; я заметил, что возвращаюсь к одной и той же ' +
  'мысли снова и снова, будто она хочет быть услышанной, и решил не отгонять ' +
  'её, а записать целиком, со всеми оговорками, сомнениями и надеждами, ' +
  'чтобы позже увидеть, куда именно она меня вела и что на самом деле стояло ' +
  'за этим повторяющимся внутренним движением к переменам.';

// Нейтрализация service worker: под HTTP приложение регистрирует SW, который
// начал бы кэшировать и перехватывать запросы между прогонами — источник
// недетерминизма. Заглушаем регистрацию до загрузки кода приложения.
export const NEUTRALIZE_SW_SCRIPT = `(() => {
  try {
    const stub = { register: () => Promise.resolve({ scope: '/' }), ready: new Promise(() => {}), controller: null, addEventListener() {}, getRegistrations: () => Promise.resolve([]) };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get() { return stub; } });
  } catch (_) {}
})();`;

// Единый набор init-скриптов (часы + SW) — ставится до любого goto.
export const INIT_SCRIPT = FROZEN_CLOCK_SCRIPT + '\n' + NEUTRALIZE_SW_SCRIPT;

// ── Загрузка приложения в песочнице (офлайн, без автосинка) ──
export async function bootApp(page, fileUrl) {
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(fileUrl);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    try { document.getElementById('splash').style.display = 'none'; } catch (_) {}
    // Глушим внешний синк на весь прогон (как в E2E) — иначе отложенный
    // persist() стреляет сетевой ошибкой в случайной точке.
    try { window.ARCHITECT_API = ''; } catch (_) {}
    try { if (typeof resetSyncState === 'function') resetSyncState(); } catch (_) {}
  });
  await page.waitForTimeout(150);
}

// ── Тема ──
export async function applyTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('arch_t', t); } catch (_) {}
    const tv = document.getElementById('thv');
    if (tv) tv.textContent = t === 'dark' ? 'Ночная' : 'Дневная';
  }, theme);
}

// ── Увеличенный системный текст (эмуляция Dynamic Type в PWA) ──
// iOS Dynamic Type напрямую в headless Chromium недоступен; ближайшее —
// поднять корневой font-size, чтобы увидеть устойчивость вёрстки к крупному
// шрифту. Ограничение честно задокументировано в отчёте.
export async function applyLargeText(page, on) {
  await page.evaluate((flag) => {
    document.documentElement.style.fontSize = flag ? '20px' : '';
  }, on);
}

// Закрыть все оверлеи и drawer перед скриншотом экрана.
async function closeAllOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    document.body.classList.remove('nav-open');
  });
}

// ── Пустое состояние: профиль есть (онбординг не всплывает), данных нет ──
export async function seedEmpty(page) {
  await page.evaluate(() => {
    try { localStorage.setItem('arch5_tour_done', '1'); } catch (_) {}
    CFG.userName = 'Иван';
    CFG.astroDaily = false;
    for (const k of ['checkins', 'spheres', 'sphereLogs', 'insights', 'dreams',
      'patterns', 'moments', 'whys', 'cravings', 'meds', 'medIntakes',
      'symptoms', 'measures', 'spiritual', 'evolution', 'digests', 'chapters',
      'astroCharts', 'astroPartners', 'chats', 'corrections', 'livingMap',
      'psyFormulations', 'psyGoals', 'psyInterventionEpisodes',
      'psyObservations', 'psyReviews', 'psyAdaptivePlans', 'psyExperiments']) {
      DB[k] = [];
    }
    DB.vit = null; DB.astroBirth = null;
    try { if (typeof persist === 'function') persist(); } catch (_) {}
    try { rHome(); } catch (_) {}
  });
  await closeAllOverlays(page);
  await page.waitForTimeout(150);
}

// ── Настройка астрологии (натальная карта + партнёр для синастрии) ──
async function setupAstro(page) {
  await page.evaluate(async (birth) => {
    DB.astroBirth = { ...birth, createdAt: new Date().toISOString(), _u: Date.now() };
    DB.astroCharts = [];
    CFG.astroDaily = true;
    try {
      openAstro();
      asub('setup');
      if (typeof runNatalChart === 'function') await runNatalChart();
    } catch (_) {}
  }, ASTRO_BIRTH);
  await page.waitForTimeout(400);
  // Партнёр для синастрии — теми же полями формы, что и E2E.
  await page.evaluate(async () => {
    try {
      goTo('astro'); asub('syn');
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      set('sp-label', 'Синтетика-партнёр');
      set('sp-date', '1992-11-03');
      const tk = document.getElementById('sp-time-known'); if (tk) tk.classList.remove('on');
      set('sp-utc', '0');
      if (typeof saveAstroPartner === 'function') saveAstroPartner();
    } catch (_) {}
  });
  await page.waitForTimeout(400);
}

// ── Заполненное состояние: детерминированные данные по всем доменам ──
export async function seedPopulated(page, { longText = false } = {}) {
  await page.evaluate((LONG) => {
    try { localStorage.setItem('arch5_tour_done', '1'); } catch (_) {}
    CFG.userName = 'Иван';
    const DAY = 864e5;
    // Часы заморожены → Date.now() фиксирован → iso(n) детерминирован.
    const iso = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
    const nowIso = () => new Date().toISOString();
    const day = (typeof todayKey === 'function') ? todayKey() : iso(0);

    // — Чек-ины (20 дней, чередование хороший/средний) —
    // Полный набор полей реального чек-ина (см. saveCI): помимо числовых
    // осей — tone/act/emo и вещества, иначе снимок «сегодня» показал бы
    // «ТОНУС: undefined» (это была бы фикстура, а не реальный дефект).
    DB.checkins = [];
    for (let i = 0; i < 20; i++) {
      const g = i % 2 === 0;
      DB.checkins.push({
        id: 100 + i, date: iso(i), sl: g ? 8 : 6, sq: g ? 8 : 5,
        cl: g ? 9 : 5, mv: g ? 8 : 4, st: g ? 2 : 6,
        nic: false, caf: true, alc: false, sugar: i % 3 === 0,
        act: g ? 'спорт' : 'нет', tone: g ? 'заряжен' : 'нейтрально',
        emo: g ? 'Спокойствие' : 'Усталость', note: '', ci: true, day: iso(i),
      });
    }
    DB.vit = { ...DB.checkins[0], ci: true };

    // — Сферы (через собственные функции движка) —
    DB.spheres = []; DB.sphereLogs = [];
    const sport = createSphere({ name: 'Спорт', type: 'habit', color: '#1A7F3C', icon: '🏃' });
    for (let i = 0; i < 21; i++) if (i % 3) logSphere(sport.id, true, '', iso(i));
    const read = createSphere({ name: 'Чтение', type: 'counter', unit: 'стр', icon: '📖' });
    for (let i = 0; i < 14; i++) logSphere(read.id, i % 2 ? 12 : 26, '', iso(i));
    const mood = createSphere({ name: 'Настроение', type: 'score', color: '#5e6ad2', icon: '🙂' });
    for (let i = 0; i < 14; i++) logSphere(mood.id, i % 2 ? 8 : 6, '', iso(i));

    // — Инсайты / знания (со связями [[wiki]]) —
    DB.insights = [
      { id: 1, title: 'Выгорание', tag: 'personal', body: 'Корень усталости — в отсутствии пауз между задачами.', links: [], createdAt: nowIso(), date: '6 марта' },
      { id: 2, title: 'Отдых', tag: 'vitality', body: 'Связано с [[выгорание]]: короткие паузы восстанавливают ясность.', links: ['выгорание'], createdAt: nowIso(), date: '6 марта' },
      { id: 3, title: 'Ритм', tag: 'work', body: 'Утро — самый продуктивный слот, беречь его для главного.', links: [], createdAt: nowIso(), date: '7 марта' },
    ];

    // — Сны —
    DB.dreams = [
      { id: 1, date: iso(1), title: 'Дом у моря', text: 'Возвращение в дом, которого не существует, но он знаком.', symbols: ['дом', 'море'], mood: 'спокойный', createdAt: nowIso() },
      { id: 2, date: iso(4), title: 'Лестница', text: 'Бесконечная лестница вверх, ступени меняют цвет.', symbols: ['лестница', 'высота'], mood: 'тревожный', createdAt: nowIso() },
    ];

    // — Паттерны —
    DB.patterns = [
      { id: 1, title: 'Вечернее прокрастинирование', note: 'Откладываю важное на вечер, потом чувство вины.', tag: 'behavior', createdAt: nowIso() },
      { id: 2, title: 'Спорт → ясность', note: 'В дни тренировки состояние заметно выше.', tag: 'positive', createdAt: nowIso() },
    ];

    // — Психологический контур: моменты + «Зачем?» —
    DB.moments = [
      { id: 9001, valence: 70, activation: 45, emo: 'Спокойствие', note: 'Прогулка после работы', kType: 'self_report', verif: 'unverified', life: 'current', createdAt: nowIso(), day, sv: 2, _u: Date.now() },
      { id: 9002, valence: 30, activation: 65, emo: 'Тревога', note: 'Дедлайн приближается', kType: 'self_report', verif: 'unverified', life: 'current', createdAt: nowIso(), day, sv: 2, _u: Date.now() },
    ];
    DB.whys = [
      { id: 8881, symptom: 'Раздражение под вечер', need: 'Отдых и тишина', action: 'Лечь раньше на 30 минут', actionDone: false, kType: 'process_reflection', verif: 'user_confirmed', life: 'current', createdAt: nowIso(), day, sv: 2, _u: Date.now() },
    ];
    DB.spiritual = [{ id: 1, day, text: 'Медитация утром — 15 минут тишины', createdAt: nowIso() }];

    // — Психология: данные только через тот же canonical writer, что у UI —
    // это одновременно реалистичная фикстура и защита от скрытого второго
    // write-path. В longtext длинный фокус остаётся на первом видимом слое.
    DB.psyFormulations = []; DB.psyGoals = []; DB.psyInterventionEpisodes = [];
    DB.psyObservations = []; DB.psyReviews = []; DB.psyAdaptivePlans = []; DB.psyExperiments = [];
    const putPsy = (type, input) => {
      const result = psySaveRecord(type, input);
      if (!result.ok) throw new Error(`psychology fixture ${type}: ${result.errors.join('; ')}`);
      return result.rec;
    };
    const formulation = putPsy('psyFormulation', {
      id: 'psyFormulation-fixture-1',
      focus: LONG ? LONG.slice(0, 190) : 'Спокойнее завершать рабочий день',
      formulation: 'После плотного дня я продолжаю мысленно решать задачи, из-за чего не успеваю переключиться на отдых.',
      hypotheses: [{
        text: 'Уведомления после работы могут поддерживать напряжение.',
        claimClass: 'working_hypothesis', userStance: 'undecided',
        sourceRefs: [{ coll: 'moments', id: 9002 }],
      }],
      protectiveFactors: ['Короткая прогулка помогает переключиться.'],
      maintainingFactors: ['Рабочие уведомления остаются включёнными вечером.'],
      sourceRefs: [{ coll: 'moments', id: 9002 }], status: 'active', createdAt: nowIso(),
    });
    const goal = putPsy('psyGoal', {
      id: 'psyGoal-fixture-1', label: 'Завершать работу без вечернего напряжения',
      proximalOutcome: 'Три вечера за неделю выключить рабочие уведомления в 19:00.',
      distalOutcome: 'Легче переключаться на отдых и сон.',
      targetMechanism: 'мысленное продолжение работы', status: 'active',
      startedAt: nowIso(), reviewAt: '2026-03-22T08:00:00.000Z',
      sourceRefs: [{ coll: 'moments', id: 9002 }], createdAt: nowIso(),
    });
    const observation = putPsy('psyObservation', {
      id: 'psyObservation-fixture-1', timestamp: nowIso(),
      metricId: 'Напряжение после работы', valueNumber: 7, unit: 'из 10',
      contextTag: 'вечер после дедлайна', entryMode: 'event_based', source: 'user',
      episode: {
        event: 'Пришло рабочее сообщение после окончания дня.',
        firstThought: 'Нужно ответить прямо сейчас.', body: 'Напряглись плечи.',
        emotion: 'Тревога', impulse: 'Снова открыть ноутбук.',
        action: 'Сделал паузу и отложил ответ до утра.', result: 'Напряжение немного снизилось.',
      },
      sourceRefs: [{ coll: 'moments', id: 9002 }], createdAt: nowIso(),
    });
    const intervention = putPsy('psyInterventionEpisode', {
      id: 'psyIntervention-fixture-1', dateTime: nowIso(),
      targetProblem: 'Сложно закончить рабочий день', targetMechanism: 'мысленное продолжение работы',
      methodId: 'behavioral_activation', interventionSummary: 'Выключил уведомления и вышел на десятиминутную прогулку.',
      rationale: 'Нужен небольшой физический переход от работы к отдыху.',
      adherence: 'done', acceptability: 'helpful', outcomeClass: 'promising',
      adverseEffects: [], confounders: ['В этот день было меньше встреч.'],
      postObservationRefs: [{ coll: 'psyObservations', id: observation.id }],
      sourceRefs: [{ coll: 'whys', id: 8881 }], createdAt: nowIso(),
    });
    putPsy('psyReview', {
      id: 'psyReview-fixture-1', periodStart: '2026-03-09T08:00:00.000Z', periodEnd: nowIso(),
      formulationRef: formulation.id, goalRefs: [goal.id],
      interventionEpisodeRefs: [intervention.id], observationRefs: [observation.id],
      methodsAppliedSummary: 'Отключение уведомлений и короткая прогулка.',
      outcomeSummary: 'В один из вечеров переключиться получилось быстрее; данных пока мало.',
      decision: 'continue', limitations: ['Пока записан только один случай.'], createdAt: nowIso(),
    });

    // — Здоровье: план приёма + факт, симптом, измерение —
    DB.meds = [{ id: 501, kType: 'medication_plan', privacyClass: 'sensitive', name: 'Витамин D', dose: '2000 МЕ · утром', createdAt: nowIso(), sv: 2, _u: Date.now() }];
    DB.medIntakes = [{ id: 601, kType: 'medication_intake', medId: 501, status: 'taken', day, createdAt: nowIso(), sv: 2, _u: Date.now() }];
    DB.symptoms = [{ id: 701, kType: 'symptom_observation', privacyClass: 'sensitive', name: 'головная боль', severity: 5, note: 'после экрана', day, createdAt: nowIso(), sv: 2, _u: Date.now() }];
    DB.measures = [{ id: 801, kType: 'measurement', name: 'давление', value: '120/80', day, createdAt: nowIso(), sv: 2, _u: Date.now() }];

    // — Длиннотекстовый стресс-кейс —
    if (LONG) {
      DB.insights.unshift({ id: 99, title: 'Очень длинная запись о дне', tag: 'personal', body: LONG, links: [], createdAt: nowIso(), date: '15 марта' });
      if (DB.moments[0]) DB.moments[0].note = LONG;
      if (DB.dreams[0]) DB.dreams[0].text = LONG;
      if (DB.psyFormulations[0]) DB.psyFormulations[0].formulation += ' ' + LONG;
    }

    try { if (typeof persist === 'function') persist(); } catch (_) {}
    try { rHome(); } catch (_) {}
  }, longText ? LONG_RU : '');

  await setupAstro(page);
  await page.evaluate(() => { try { goTo('home'); } catch (_) {} });
  await closeAllOverlays(page);
  await page.waitForTimeout(200);
}
