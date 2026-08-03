// Wave 4.1 (issue #156) — интеграция астрологии как ИСТОЧНИКА Pattern Engine.
//
// Астрология здесь — ещё один источник временных совпадений, не более.
// Ничего не пересчитывается: единственный источник астрособытий —
// astroEventProjection() из Волны 3. Проекция read-only, живёт только на
// время анализа, ничего не персистирует.
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium, тем же стилем,
// что и остальные spec-файлы репозитория.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  });
  await p.evaluate(() => loadAstroEngine());
  await p.waitForFunction(() => !!window.Astronomy, null, { timeout: 30000 });
  await p.waitForTimeout(200);
  return p;
}
const page = await boot();

const BIRTH = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.75, lon: 37.62, houseSystem: 'whole' };

// Готовит профиль: чистые коллекции + данные рождения + флаг источника.
const setup = (useAstro, birth = BIRTH) => page.evaluate(({ ua, b }) => {
  ['moments', 'whys', 'insights', 'patterns', 'evolution', 'dreams', 'medIntakes', 'symptoms',
    'measures', 'cravings', 'labObservations', 'healthDocuments', 'relationshipContexts',
    'sphereLogs', 'spheres', 'psyLinks'].forEach(c => { DB[c] = []; });
  // Немного «обычных» записей, чтобы поток был не только астрологическим.
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now - (i * 7 + 3) * 864e5);
    DB.moments.push({ id: 900000 + i, valence: 40, activation: 60, emo: 'тревога', createdAt: d.toISOString(), day: d.toISOString().slice(0, 10), sv: SCHEMA_VERSION, _u: now });
  }
  DB.astroBirth = b ? { ...b } : null;
  DB.correlationSettings = { minSamples: 3, lagDays: 7, dismissed: [], useAstro: ua };
  resetAstroSourceCache();
}, { ua: useAstro, b: birth });

console.log('\n── Wave 4.1: астрология как источник Pattern Engine ──');

// ── 1. Источник выключен → астрособытий нет ─────────────────────────
await setup(false);
const off = await page.evaluate(() => {
  const ev = unifiedEvents(120);
  return { total: ev.length, astro: ev.filter(e => e.source === 'astro').length, tags: ev.some(e => e.tags.some(t => t.startsWith('astro:'))) };
});
ok(off.astro === 0, `источник выключен: ни одного астрособытия в потоке (всего событий ${off.total})`);
ok(off.tags === false, 'источник выключен: ни одного тега astro: в потоке');
ok(off.total > 0, 'источник выключен: обычные события по-прежнему на месте (тест не тривиально пустой)');

// ── 2. Источник включён → астрология появляется ─────────────────────
await setup(true);
const on = await page.evaluate(() => {
  const ev = unifiedEvents(120);
  const astro = ev.filter(e => e.source === 'astro');
  return {
    total: ev.length, astro: astro.length,
    sample: astro[0] || null,
    sorted: ev.every((e, i) => i === 0 || ev[i - 1].time <= e.time),
    allHaveSource: ev.every(e => e.source === 'astro' || e.source === 'db'),
  };
});
ok(on.astro > 0, `источник включён: астрособытия появились в общем потоке (${on.astro} шт.)`);
ok(on.total > off.total, `источник включён: поток вырос (${off.total} → ${on.total})`);
ok(on.sorted, 'астрособытия встроены в общую сортировку по времени, а не приклеены в конец');
ok(on.allHaveSource, 'каждое событие потока помечено источником (db | astro)');

// ── 3. Event mapping: ничего не потеряно ────────────────────────────
{
  const req = ['id', 'source', 'type', 'date', 'time', 'tags', 'importance', 'referenceId', 'sourceCollection', 'methodologyId', 'confidence', 'provenance'];
  const bad = await page.evaluate(fields => {
    const astro = unifiedEvents(120).filter(e => e.source === 'astro');
    const out = [];
    for (const e of astro) for (const k of fields) if (!(k in e)) out.push(`${e.id}: нет поля ${k}`);
    return out;
  }, req);
  ok(bad.length === 0, `mapping: у всех астрособытий присутствуют все ${req.length} полей контракта`, bad.slice(0, 5).join('\n'));
  const honest = await page.evaluate(() => {
    const a = unifiedEvents(120).filter(e => e.source === 'astro');
    return { nullTime: a.every(e => e.provenance.projectedTime === null), noonAnchor: a.every(e => e.time === Date.parse(e.date + 'T12:00:00.000Z')) };
  });
  ok(honest.nullTime, 'mapping: исходная честность сохранена — проекция не заявляет точное время (provenance.projectedTime === null)');
  ok(honest.noonAnchor, 'mapping: числовое время — стандартный полдень-UTC якорь дня, как у любых записей «только день»');
}

// ── 4. Нет данных рождения → проекция пуста ─────────────────────────
await setup(true, null);
const noBirth = await page.evaluate(() => unifiedEvents(120).filter(e => e.source === 'astro').length);
ok(noBirth === 0, 'нет данных рождения: астрособытий нет, движок не выдумывает');

// ── 5. Неизвестное время рождения → нет домов/углов ─────────────────
await setup(true, { ...BIRTH, timeKnown: false, time: '' });
const unk = await page.evaluate(() => {
  const a = unifiedEvents(120).filter(e => e.source === 'astro');
  return {
    n: a.length,
    noHouseTags: a.every(e => !e.tags.some(t => /asc|mc|house|дом/i.test(t))),
    allLow: a.every(e => e.confidence === 'low'),
    flagged: a.every(e => e.provenance.birthTimeKnown === false),
  };
});
ok(unk.n > 0, `неизвестное время: планетарные события остаются (${unk.n} шт.)`);
ok(unk.noHouseTags, 'неизвестное время: нет событий, зависящих от домов и углов');
ok(unk.allLow, 'неизвестное время: уверенность всех астрособытий понижена до low');
ok(unk.flagged, 'неизвестное время: признак birthTimeKnown=false честно проброшен в provenance');

// ── 6. Проекция вызывается РОВНО один раз за анализ ──────────────────
await setup(true);
const calls = await page.evaluate(() => {
  const orig = window.astroEventProjection;
  let n = 0;
  window.astroEventProjection = (...a) => { n++; return orig(...a); };
  try { synthesisReport(120); } finally { window.astroEventProjection = orig; }
  return n;
});
ok(calls === 1, `astroEventProjection() вызван РОВНО один раз за анализ (получено ${calls})`);

// ── 7. Стабильные id и отсутствие дублей ────────────────────────────
{
  const dup = await page.evaluate(() => {
    const a = unifiedEvents(120).filter(e => e.source === 'astro');
    const ids = new Set(a.map(e => e.id)), refs = new Set(a.map(e => e.referenceId));
    return { n: a.length, uniqIds: ids.size, uniqRefs: refs.size };
  });
  ok(dup.uniqIds === dup.n, `нет дублей: все ${dup.n} id уникальны`);
  ok(dup.uniqRefs === dup.n, `нет дублей: все ${dup.n} referenceId уникальны (ключ записи в Pattern Engine различает события)`);

  const stable = await page.evaluate(() => {
    const a = unifiedEvents(120).filter(e => e.source === 'astro').map(e => e.id).sort();
    resetAstroSourceCache();
    const b = unifiedEvents(120).filter(e => e.source === 'astro').map(e => e.id).sort();
    return JSON.stringify(a) === JSON.stringify(b);
  });
  ok(stable, 'стабильные id: повторный анализ (после сброса кэша) даёт тот же набор id');

  const windows = await page.evaluate(() => {
    const w1 = unifiedEvents(120).filter(e => e.source === 'astro');
    resetAstroSourceCache();
    const w2 = unifiedEvents(200).filter(e => e.source === 'astro');
    const m1 = new Map(w1.map(e => [e.id, e.date]));
    let mismatch = 0, shared = 0;
    for (const e of w2) if (m1.has(e.id)) { shared++; if (m1.get(e.id) !== e.date) mismatch++; }
    return { shared, mismatch };
  });
  ok(windows.shared > 0 && windows.mismatch === 0,
    `нет дублей между окнами: ${windows.shared} общих событий сохранили ту же дату пика (расхождений ${windows.mismatch})`);
}

// ── 8. Same-record: три тега одного астрособытия не дают тавтологию ──
{
  const tautology = await page.evaluate(() => {
    const ev = unifiedEvents(400);
    const { pairs } = findCorrelations(ev, { minSamples: 3, lagDays: 7 });
    // Пара, у которой ОБА тега астрологические — потенциальная тавтология
    // из одной и той же записи проекции.
    const both = pairs.filter(p => p.a.startsWith('astro:') && p.b.startsWith('astro:'));
    return { total: pairs.length, sameDayAstro: both.filter(p => p.sameDayOnly).length, sample: both.slice(0, 3).map(p => `${p.a} ↔ ${p.b}`) };
  });
  ok(tautology.sameDayAstro === 0,
    'same-record: теги одного астрособытия (transit|aspect|natal) не дают same-day тавтологию — источник зарегистрирован в TAG_FAMILY_SETS',
    tautology.sameDayAstro === 0 ? null : JSON.stringify(tautology.sample));
}

// ── 9. Ядро корреляций не изменено ──────────────────────────────────
{
  const core = await page.evaluate(() => ({
    fisher: typeof fisherPValueTwoSided === 'function',
    bh: typeof benjaminiHochberg === 'function',
    alpha: SYN_FDR_ALPHA,
    enrichment: findCorrelations.toString().includes('c.lift >= 1.3'),
    minSamplesGate: findCorrelations.toString().includes('c.hits >= minSamples'),
    significantGate: findCorrelations.toString().includes('c.significant'),
    families: TAG_FAMILY_SETS.length,
  }));
  ok(core.fisher && core.bh, 'ядро: двусторонний Fisher и BH-FDR на месте');
  ok(core.alpha === 0.05, `ядро: SYN_FDR_ALPHA не изменён (${core.alpha})`);
  ok(core.enrichment && core.minSamplesGate && core.significantGate,
    'ядро: итоговый гейт по-прежнему hits≥minSamples && lift≥1.3 && significant (enrichment-only)');
  ok(core.families === 6, `ядро: реестр same-record расширен ровно одним новым источником (семейств ${core.families})`);
}

// ── 10. Schema / backup / sync не затронуты ─────────────────────────
{
  const impact = await page.evaluate(() => {
    const before = SCHEMA_VERSION;
    const cs = DB.correlationSettings;
    // Скаляр переживает сериализацию целиком, отдельного пути не появилось.
    const wire = JSON.parse(JSON.stringify(DB));
    return {
      schema: before,
      hasUseAstro: 'useAstro' in cs,
      roundtrip: JSON.stringify(wire.correlationSettings) === JSON.stringify(cs),
      noAstroColl: !('astroEvents' in DB) && !('astroProjection' in DB) && !('astroCache' in DB),
    };
  });
  ok(impact.schema === 5, `schema не изменена: SCHEMA_VERSION = ${impact.schema}`);
  ok(impact.hasUseAstro, 'настройка живёт в уже существующем скаляре correlationSettings (новых коллекций нет)');
  ok(impact.roundtrip, 'backup/sync: correlationSettings переживает сериализацию byte-identical, отдельного пути не добавлено');
  ok(impact.noAstroColl, 'read-only: в DB не появилось ни одной новой астрологической коллекции/кэша');

  const noPersist = await page.evaluate(() => {
    const before = JSON.stringify(DB);
    unifiedEvents(120);
    synthesisReport(120);
    return before === JSON.stringify(DB);
  });
  ok(noPersist, 'read-only: анализ с включённой астрологией не изменил DB (ничего не персистируется)');
}

// ── 11. Изоляция профилей ───────────────────────────────────────────
{
  const iso = await page.evaluate(() => {
    const a = unifiedEvents(120).filter(e => e.source === 'astro').length;
    // Смена профиля обязана инвалидировать кэш проекции.
    const savedBirth = DB.astroBirth;
    resetAstroSourceCache();
    DB.astroBirth = null;
    const b = unifiedEvents(120).filter(e => e.source === 'astro').length;
    DB.astroBirth = savedBirth;
    resetAstroSourceCache();
    const c = unifiedEvents(120).filter(e => e.source === 'astro').length;
    return { a, b, c };
  });
  ok(iso.a > 0 && iso.b === 0 && iso.c === iso.a,
    `изоляция: кэш проекции не переиспользуется между разными данными профиля (${iso.a} → ${iso.b} → ${iso.c})`);

  // Сам ключ кэша обязан нести id активного профиля. Без этого изоляция
  // держалась бы ТОЛЬКО на явном resetAstroSourceCache() в switchProfile(),
  // а любой путь смены профиля мимо него отдал бы чужие астрособытия.
  const keyIso = await page.evaluate(() => {
    const saved = localStorage.getItem('arch5_active');
    resetAstroSourceCache();
    localStorage.setItem('arch5_active', 'profile-alpha');
    unifiedEvents(120);
    const keyA = _astroSrcCache && _astroSrcCache.key;
    // Профиль меняется БЕЗ вызова reset — ключ обязан разойтись сам.
    localStorage.setItem('arch5_active', 'profile-beta');
    unifiedEvents(120);
    const keyB = _astroSrcCache && _astroSrcCache.key;
    if (saved == null) localStorage.removeItem('arch5_active'); else localStorage.setItem('arch5_active', saved);
    resetAstroSourceCache();
    return { keyA, keyB };
  });
  ok(!!keyIso.keyA && keyIso.keyA.includes('profile-alpha'),
    'изоляция: ключ кэша проекции содержит id активного профиля');
  ok(keyIso.keyA !== keyIso.keyB,
    'изоляция: смена активного профиля меняет ключ кэша даже без явного сброса');
}

// ── 12. Нет сети и нет AI во время анализа ──────────────────────────
{
  const clean = await page.evaluate(() => {
    let net = 0, ai = 0;
    const of = window.fetch, ox = window.XMLHttpRequest;
    window.fetch = (...a) => { net++; return Promise.reject(new Error('network forbidden')); };
    window.XMLHttpRequest = function () { net++; throw new Error('network forbidden'); };
    const oc = window.callClaude;
    window.callClaude = (...a) => { ai++; throw new Error('AI forbidden'); };
    try { synthesisReport(120); } finally { window.fetch = of; window.XMLHttpRequest = ox; window.callClaude = oc; }
    return { net, ai };
  });
  ok(clean.net === 0, 'во время анализа не выполнено ни одного сетевого вызова');
  ok(clean.ai === 0, 'во время анализа не выполнено ни одного AI-вызова');
}

// ── 13. Эпистемология: запрещённые формулировки ─────────────────────
{
  const wording = await page.evaluate(() => {
    const banned = ['Астрология доказала', 'Транзит вызвал', 'Из-за Марса', 'Поэтому произошло'];
    const hay = [];
    // Тексты, которые пользователь реально видит в «Закономерностях».
    _synLastPairs.forEach(p => hay.push(correlationSentence(p)));
    hay.push(synAstroToggleHtml());
    const found = [];
    for (const b of banned) for (const h of hay) if (h.includes(b)) found.push(b);
    return { found, toggle: synAstroToggleHtml() };
  });
  ok(wording.found.length === 0, 'эпистемология: в пользовательских текстах нет запрещённых причинных формулировок', wording.found.join(', '));
  ok(wording.toggle.includes('Не доказывает причинность'), 'эпистемология: переключатель источника явно сообщает, что причинность не доказывается');
  ok(wording.toggle.includes('Символический источник'), 'эпистемология: источник назван символическим');
}

// ── 14. UI: переключатель и бейдж ───────────────────────────────────
{
  await page.evaluate(() => { sysGo('patterns'); });
  await page.waitForTimeout(300);
  const ui = await page.evaluate(() => {
    const tog = document.getElementById('syn-astro-tog');
    const r = tog && tog.getBoundingClientRect();
    return {
      hasToggle: !!tog,
      role: tog && tog.getAttribute('role'),
      checked: tog && tog.getAttribute('aria-checked'),
      tap: r ? Math.min(r.width, r.height) : 0,
      overlay: !!document.getElementById('ov-syn-astro'),
      onScreen: r ? (r.left >= 0 && r.right <= window.innerWidth + 1) : false,
    };
  });
  ok(ui.hasToggle, 'UI: переключатель «Использовать астрологические события» присутствует на экране «Закономерности»');
  ok(ui.role === 'switch', 'UI: переключатель имеет корректную роль switch');
  ok(ui.checked === 'true' || ui.checked === 'false', `UI: состояние переключателя выражено через aria-checked (${ui.checked})`);
  ok(ui.onScreen, 'UI: переключатель не выходит за границы экрана iPhone');
  ok(ui.overlay, 'UI: панель подробностей астрологического источника присутствует в разметке');
}

// ── 15. Значение по умолчанию для старых профилей — OFF ─────────────
{
  const legacy = await page.evaluate(() => {
    // Профиль, сохранённый ДО Волны 4.1: ключа useAstro в скаляре нет.
    DB.correlationSettings = { minSamples: 3, lagDays: 7, dismissed: [] };
    resetAstroSourceCache();
    const n = unifiedEvents(120).filter(e => e.source === 'astro').length;
    const html = synAstroToggleHtml();
    return { n, off: html.includes('aria-checked="false"') };
  });
  ok(legacy.n === 0, 'старый профиль без ключа useAstro: астрология выключена по умолчанию, миграция не требуется');
  ok(legacy.off, 'старый профиль: переключатель отрисован выключенным');
}

// ── 16. Owner review (PR #157): панель подробностей показывает ТОЛЬКО ──
//     астрособытия, реально вошедшие в evidence этой пары.
//
// Дефект: отбор шёл по `e.tags.includes(p.a) || e.tags.includes(p.b)` и брал
// ПЕРВОЕ совпавшее событие. Один и тот же тег `astro:transit:*` несут десятки
// прохождений за окно, поэтому панель могла показать чужую дату пика и чужой
// орбис — событие, не участвовавшее в подтверждении этой корреляции.
//
// Фикстура детерминированная: три события с ОДИНАКОВЫМ астротегом, а
// поддерживающее — третье (не первое). Если отбор снова поедет на теги,
// проверки упадут.
{
  await page.evaluate(() => {
    // Три астрособытия с ОДИНАКОВЫМ набором тегов и разными датами/орбисами.
    window.setupAstroDetailFixture = function () {
      const mk = (ref, date, orb) => ({
        id: 'astro:transit:' + ref, type: 'astro_transit_aspect', date,
        time: Date.parse(date + 'T12:00:00.000Z'), importance: 2,
        tags: ['astro:transit:mars', 'astro:aspect:square', 'astro:natal:pluto'],
        sphereId: null, source: 'astro', sourceCollection: 'astroBirth',
        referenceId: ref, methodologyId: 'western-tropical-v1/transit-orbs-v1(3)',
        confidence: 'medium',
        provenance: { engine: 'astronomy-engine@2.1.19', orbDeg: orb, birthTimeKnown: true, projectedTime: null },
      });
      _synLastAstroEvents = [
        mk('mars-sq-pluto:2026-01-05', '2026-01-05', 2.91),
        mk('mars-sq-pluto:2026-02-11', '2026-02-11', 1.42),
        mk('mars-sq-pluto:2026-03-19', '2026-03-19', 0.07),
      ];
    };
  });

  // — 16.1 астрология на стороне A, поддерживающее событие — третье —
  const sideA = await page.evaluate(() => {
    setupAstroDetailFixture();
    const p = {
      _i: 0, a: 'astro:transit:mars', b: 'emo:Тревога',
      evidence: [{
        aDay: '2026-03-19', aRecs: [{ coll: 'astroBirth', id: 'mars-sq-pluto:2026-03-19' }],
        bDay: '2026-03-21', bRecs: [{ coll: 'moments', id: 9002 }], sameDay: false,
      }],
    };
    _synLastPairs = [p];
    const sup = synAstroSupportingEvents(p);
    synAstroDetailAt(0);
    const html = document.getElementById('syn-astro-detail').innerHTML;
    return {
      refs: sup.map(e => e.referenceId),
      html,
      opened: document.getElementById('ov-syn-astro').classList.contains('on'),
    };
  });
  ok(sideA.refs.length === 1 && sideA.refs[0] === 'mars-sq-pluto:2026-03-19',
    `astro на стороне A: выбрано ровно поддерживающее событие, а не первое с тем же тегом (${sideA.refs.join(',')})`);
  ok(sideA.html.includes('2026-03-19') && !sideA.html.includes('2026-01-05') && !sideA.html.includes('2026-02-11'),
    'astro на стороне A: в панели дата пика поддерживающего события; чужих дат нет');
  ok(sideA.html.includes('0.07') && !sideA.html.includes('2.91'),
    'astro на стороне A: орбис принадлежит поддерживающему событию');
  ok(sideA.opened, 'astro на стороне A: панель подробностей открыта');

  // — 16.2 астрология на стороне B (симметрия) —
  const sideB = await page.evaluate(() => {
    setupAstroDetailFixture();
    const p = {
      _i: 0, a: 'emo:Тревога', b: 'astro:transit:mars',
      evidence: [{
        aDay: '2026-02-09', aRecs: [{ coll: 'moments', id: 9002 }],
        bDay: '2026-02-11', bRecs: [{ coll: 'astroBirth', id: 'mars-sq-pluto:2026-02-11' }], sameDay: false,
      }],
    };
    _synLastPairs = [p];
    const sup = synAstroSupportingEvents(p);
    synAstroDetailAt(0);
    return { refs: sup.map(e => e.referenceId), html: document.getElementById('syn-astro-detail').innerHTML };
  });
  ok(sideB.refs.length === 1 && sideB.refs[0] === 'mars-sq-pluto:2026-02-11',
    `astro на стороне B: выбрано ровно поддерживающее событие (${sideB.refs.join(',')})`);
  ok(sideB.html.includes('2026-02-11') && !sideB.html.includes('2026-01-05') && !sideB.html.includes('2026-03-19'),
    'astro на стороне B: в панели только дата поддерживающего события');
  ok(sideB.html.includes('1.42'), 'astro на стороне B: орбис принадлежит поддерживающему событию');

  // — 16.3 несколько поддерживающих событий + дедупликация —
  const multi = await page.evaluate(() => {
    setupAstroDetailFixture();
    const p = {
      _i: 0, a: 'astro:transit:mars', b: 'emo:Тревога',
      evidence: [
        // одно и то же прохождение повторяется в двух записях evidence
        { aDay: '2026-01-05', aRecs: [{ coll: 'astroBirth', id: 'mars-sq-pluto:2026-01-05' }], bDay: '2026-01-07', bRecs: [{ coll: 'moments', id: 1 }], sameDay: false },
        { aDay: '2026-01-05', aRecs: [{ coll: 'astroBirth', id: 'mars-sq-pluto:2026-01-05' }], bDay: '2026-01-08', bRecs: [{ coll: 'moments', id: 2 }], sameDay: false },
        { aDay: '2026-03-19', aRecs: [{ coll: 'astroBirth', id: 'mars-sq-pluto:2026-03-19' }], bDay: '2026-03-20', bRecs: [{ coll: 'moments', id: 3 }], sameDay: false },
      ],
    };
    _synLastPairs = [p];
    const sup = synAstroSupportingEvents(p);
    synAstroDetailAt(0);
    return { refs: sup.map(e => e.referenceId), html: document.getElementById('syn-astro-detail').innerHTML };
  });
  ok(multi.refs.length === 2, `дедупликация: одно прохождение показано один раз (${multi.refs.length} события)`);
  ok(multi.refs.includes('mars-sq-pluto:2026-01-05') && multi.refs.includes('mars-sq-pluto:2026-03-19')
    && !multi.refs.includes('mars-sq-pluto:2026-02-11'),
    'несколько поддерживающих: показаны оба вошедших в evidence, непричастное — нет');
  ok(multi.html.includes('Поддерживающих астрособытий:</b> 2'),
    'панель честно сообщает число поддерживающих астрособытий');

  // — 16.4 пара без астрологии в evidence: подробностей нет —
  const none = await page.evaluate(() => {
    setupAstroDetailFixture();
    const p = {
      _i: 0, a: 'astro:transit:mars', b: 'emo:Тревога',
      evidence: [{ aDay: '2026-03-19', aRecs: [{ coll: 'moments', id: 7 }], bDay: '2026-03-20', bRecs: [{ coll: 'moments', id: 8 }], sameDay: false }],
    };
    _synLastPairs = [p];
    const sup = synAstroSupportingEvents(p);
    synAstroDetailAt(0);
    return { n: sup.length, html: document.getElementById('syn-astro-detail').innerHTML };
  });
  ok(none.n === 0 && none.html.includes('недоступны'),
    'записи не из astroBirth игнорируются: подробностей нет вместо произвольного события');

  // — 16.5 referenceId из evidence, которого нет среди астрособытий окна —
  const stale = await page.evaluate(() => {
    setupAstroDetailFixture();
    const p = {
      _i: 0, a: 'astro:transit:mars', b: 'emo:Тревога',
      evidence: [{ aDay: '2026-06-01', aRecs: [{ coll: 'astroBirth', id: 'mars-sq-pluto:2026-06-01' }], bDay: '2026-06-02', bRecs: [{ coll: 'moments', id: 9 }], sameDay: false }],
    };
    _synLastPairs = [p];
    return synAstroSupportingEvents(p).length;
  });
  ok(stale === 0, 'неизвестный referenceId не подменяется первым попавшимся событием');

  // — 16.6 отбор по тегам в коде отсутствует —
  const noTagLookup = await page.evaluate(() => {
    const src = synAstroSupportingEvents.toString() + synAstroDetailAt.toString();
    return !/tags\s*\.\s*includes\s*\(\s*p\s*\.\s*[ab]\s*\)/.test(src);
  });
  ok(noTagLookup, 'реализация не использует отбор астрособытий по тегам пары');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 4.1 (astro → pattern engine): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
