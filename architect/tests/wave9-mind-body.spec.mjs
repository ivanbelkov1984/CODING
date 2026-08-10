// Wave 9 (issue #164) — Mind–Body Context Layer.
//
// ВСЕ фикстуры синтетические (TEST-W9-*). Реальные данные владельца в
// репозиторий не попадают ни в каком виде.
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.WAVE9_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const netRequests = [];
async function boot() {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith('file://')) { netRequests.push(u); return r.abort(); }
    return r.continue();
  });
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  });
  await p.waitForTimeout(120);
  return p;
}
const page = await boot();

const reset = () => page.evaluate(() => {
  ['psyObservations', 'psyInterventionEpisodes', 'psyFormulations', 'psyGoals', 'psyReviews',
    'psyAdaptivePlans', 'psyExperiments', 'moments', 'symptoms', 'measures', 'medIntakes',
    'insights', 'whys', 'checkins'].forEach(c => { DB[c] = []; });
  DB._del = {};
  DB.mindBodySettings = JSON.parse(JSON.stringify(DEFAULT_DB.mindBodySettings));
  try { resolveRecovery('discarded'); } catch (_) {}
});

// Синтетические источники: психологическое событие темы «неопределённость»
// в конкретный день + симптом в нужный день.
const addPsy = (day, text) => page.evaluate(({ d, t }) => {
  const r = psySaveRecord('psyObservation', {
    metricId: 'ema_episode', source: 'user', entryMode: 'event_based',
    timestamp: d + 'T10:00:00.000Z', valueText: t,
  });
  if (!r.ok) throw new Error(r.errors.join());
  return r.rec.id;
}, { d: day, t: text });
const addSym = (day, name, sev) => page.evaluate(({ d, n, s }) => {
  const id = 'sym-' + d + '-' + n.replace(/\s+/g, '_') + '-' + DB.symptoms.length;
  DB.symptoms.push({ id, kType: 'symptom_observation', privacyClass: 'sensitive',
    name: n, severity: s ?? 5, note: '', verif: 'user_confirmed', life: 'current',
    createdAt: d + 'T12:00:00.000Z', day: d, sv: SCHEMA_VERSION, _u: Date.now() });
  return id;
}, { d: day, n: name, s: sev });
const assoc = () => page.evaluate(() => JSON.parse(JSON.stringify(mindBodyAssociations(DB))));
const T = 'TEST-W9 высокая неопределённость в планах';

console.log('\n── Wave 9: Mind–Body Context Layer ──');

// ═══ 1. Повторяющаяся ассоциация → repeated_association + точные IDs ═
{
  await reset();
  const pids = [], sids = [];
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09', '2026-03-11']) {
    pids.push(await addPsy(day, T));
  }
  // Симптом в 4 из 6 дней (тот же день).
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) {
    sids.push(await addSym(day, 'головная боль', 6));
  }
  const r = await assoc();
  const a = r.associations.find(x => x.theme === 'uncertainty' && x.symptomKey === 'головная боль');
  ok(!!a && a.evidenceState === 'repeated_association',
    `4/6 совпадений → repeated_association (${a && a.evidenceState})`);
  ok(a && a.nEligibleEpisodes === 6 && a.nCooccurrences === 4 && a.bestWindow === 'same_day',
    `счётчики точны: ${a && a.nCooccurrences}/${a && a.nEligibleEpisodes}, окно ${a && a.bestWindow}`);
  ok(a && a.psychologicalSourceIds.length === 6 &&
     pids.every(id => a.psychologicalSourceIds.some(x => x.id === id)),
    'contributing psychological IDs раскрыты полностью (1)');
  ok(a && sids.every(id => a.healthSourceIds.includes(id)),
    'contributing health IDs раскрыты полностью');
  ok(a && a.engineVersion === 'mind-body-engine-v1' && a.associationId === 'mb:uncertainty|головная боль',
    'детерминированный associationId + engineVersion');

  // Язык — только совпадение, без причинности; без числового confidence.
  ok(a && /причинность не установлена/.test(a.safeReflectionText) &&
     !/вызван|причин[аоы]\s|объясняется|из-за/.test(a.safeReflectionText),
    'safeReflectionText — язык совпадения, не причинности');
  ok(a && !('confidence' in a) && !('score' in a) && !('probability' in a),
    'никакого произвольного confidence 0..1 (концепт issue #164)');
  ok(a && a.limitations.length >= 3 && a.windows.length === 3,
    'limitations и sensitivity по всем окнам присутствуют');

  // Детерминизм.
  const twice = await page.evaluate(() =>
    JSON.stringify(mindBodyAssociations(DB)) === JSON.stringify(mindBodyAssociations(DB)));
  ok(twice, 'движок детерминирован: два вызова идентичны');
}

// ═══ 2. Один эпизод → insufficient, два → candidate, не causal ══════
{
  await reset();
  await addPsy('2026-03-01', T);
  await addSym('2026-03-01', 'головная боль');
  let r = await assoc();
  let a = r.associations.find(x => x.symptomKey === 'головная боль');
  ok(a && a.evidenceState === 'insufficient', `один эпизод → insufficient (${a && a.evidenceState}) (2)`);
  await addPsy('2026-03-03', T);
  await addSym('2026-03-03', 'головная боль');
  r = await assoc();
  a = r.associations.find(x => x.symptomKey === 'головная боль');
  ok(a && a.evidenceState === 'candidate', `два совпадения → candidate, не выше (${a && a.evidenceState})`);
  // Карточкой candidate не показывается (минимум повторяемости до показа).
  const ui = await page.evaluate(() => {
    goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace();
    const el = document.querySelector('.mb-block');
    return { cards: el ? el.querySelectorAll('.mb-assoc').length : -1, gathering: el ? el.textContent.includes('Накапливается') : false };
  });
  ok(ui.cards === 0 && ui.gathering, 'candidate не показывается карточкой — только счётчик «накапливается»');
}

// ═══ 3. Направление лага различается ════════════════════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-04', '2026-03-07', '2026-03-10']) await addPsy(day, T);
  // Симптом всегда на СЛЕДУЮЩИЙ день.
  for (const day of ['2026-03-02', '2026-03-05', '2026-03-08', '2026-03-11']) await addSym(day, 'изжога');
  let r = await assoc();
  let a = r.associations.find(x => x.symptomKey === 'изжога');
  ok(a && a.bestWindow === 'psych_before_body' && a.lagDirection === 'psych_before_body',
    `психика → тело различается (${a && a.lagDirection}) (3)`);

  await reset();
  for (const day of ['2026-03-02', '2026-03-05', '2026-03-08', '2026-03-11']) await addPsy(day, T);
  for (const day of ['2026-03-01', '2026-03-04', '2026-03-07', '2026-03-10']) await addSym(day, 'изжога');
  r = await assoc();
  a = r.associations.find(x => x.symptomKey === 'изжога');
  ok(a && a.lagDirection === 'body_before_psych', `тело → психика различается (${a && a.lagDirection})`);
}

// ═══ 4. Missing ≠ zero ══════════════════════════════════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addPsy(day, T);
  await addSym('2026-03-01', 'головная боль');
  await addSym('2026-03-03', 'головная боль');
  const r = await assoc();
  const a = r.associations.find(x => x.symptomKey === 'головная боль');
  // Дни без записи здоровья не считаются «симптома не было»: они просто не
  // совпадения, а ограничение прямо сохранено.
  ok(a && a.nCooccurrences === 2 && a.limitations.some(l => l.includes('не означает отсутствие')),
    'дни без записи не трактуются как ноль; ограничение видно (4)');
}

// ═══ 5. Confounder-флаги сохраняются ════════════════════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addPsy(day, T);
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05']) {
    await addSym(day, 'головная боль');
    await addSym(day, 'усталость');   // другой симптом в те же дни
  }
  await page.evaluate(() => {
    DB.medIntakes = [{ id: 901, medId: 1, status: 'taken', at: '2026-03-01T09:00:00.000Z', createdAt: '2026-03-01T09:00:00.000Z', day: '2026-03-01', sv: SCHEMA_VERSION, _u: Date.now() }];
  });
  const r = await assoc();
  const a = r.associations.find(x => x.symptomKey === 'головная боль');
  ok(a && a.confounders.some(c => c.includes('другие симптомы')) &&
     a.confounders.some(c => c.includes('приём препаратов')) &&
     a.confounders.some(c => c.includes('не контролировались')),
    'confounder-флаги (другие симптомы, препараты, неконтролируемые факторы) сохранены (5)');
}

// ═══ 6. Разные симптомы не сливаются ════════════════════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addPsy(day, T);
  for (const day of ['2026-03-01', '2026-03-03']) await addSym(day, 'головная боль');
  for (const day of ['2026-03-05', '2026-03-07']) await addSym(day, 'головокружение');   // похожий текст
  const r = await assoc();
  const a1 = r.associations.find(x => x.symptomKey === 'головная боль');
  const a2 = r.associations.find(x => x.symptomKey === 'головокружение');
  ok(a1 && a2 && a1.nCooccurrences === 2 && a2.nCooccurrences === 2,
    'похожие по тексту симптомы считаются РАЗДЕЛЬНО, не объединяются (6)');
}

// ═══ 7. Edit/delete/tombstone → детерминированный пересчёт ══════════
{
  await reset();
  const pids = [];
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09', '2026-03-11']) {
    pids.push(await addPsy(day, T));
  }
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addSym(day, 'головная боль');
  const before = await assoc();
  const aB = before.associations.find(x => x.symptomKey === 'головная боль');
  ok(aB.evidenceState === 'repeated_association', 'до удаления — repeated_association');
  // Удаляем два психологических источника через production path (tombstone).
  const after = await page.evaluate((ids) => {
    ids.forEach(id => { const r = psyDeleteRecord('psyObservations', id); if (!r.ok) throw new Error(r.errors.join()); });
    return JSON.parse(JSON.stringify(mindBodyAssociations(DB)));
  }, [pids[0], pids[2]]);
  const aA = after.associations.find(x => x.symptomKey === 'головная боль');
  ok(aA && aA.nEligibleEpisodes === 4 && aA.nCooccurrences === 2 && aA.evidenceState === 'candidate',
    `после удаления источников пересчёт детерминирован: ${aA && aA.nCooccurrences}/${aA && aA.nEligibleEpisodes} → ${aA && aA.evidenceState} (7)`);
  ok(aA && !aA.psychologicalSourceIds.some(x => x.id === pids[0] || x.id === pids[2]),
    'удалённые источники исчезли из contributing IDs');
}

// ═══ 8. Никакого дублирования evidence в Unified Intelligence ═══════
{
  await reset();
  const uni = await page.evaluate(async () => {
    const before = unifiedEvents(60).length;
    const r = psySaveRecord('psyObservation', { metricId: 'ema_episode', source: 'user', valueText: 'TEST-W9 неопределённость', timestamp: nowISO() });
    mindBodyAssociations(DB);   // вычисление слоя ничего не пишет
    const after = unifiedEvents(60).length;
    return { before, after,
      noNewColl: !('mindBodyAssociations' in DB) && !('mbAssociations' in DB),
      notEventSource: !('mindBodySettings' in EVENT_SOURCES) };
  });
  ok(uni.before === uni.after && uni.noNewColl && uni.notEventSource,
    'derived-слой не создаёт коллекций/событий — двойного счёта нет (8)');
}

// ═══ 9. Prefs: изоляция профилей + sync + сокрытие ══════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09', '2026-03-11']) await addPsy(day, T);
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addSym(day, 'головная боль');
  const prefs = await page.evaluate(() => {
    goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace();
    const el = document.querySelector('#psy-ws .mb-block');
    const cardsBefore = el.querySelectorAll('.mb-assoc').length;
    mbHideAssociation(0);   // первая карточка
    const el2 = document.querySelector('#psy-ws .mb-block');
    const cardsAfter = el2 ? el2.querySelectorAll('.mb-assoc').length : -1;
    const hidden = DB.mindBodySettings.hiddenAssociations.slice();
    // LWW-merge скаляра.
    const local = JSON.parse(JSON.stringify(DB));
    const remote = JSON.parse(JSON.stringify(DB));
    remote.mindBodySettings = { hiddenAssociations: [], mutedThemes: ['uncertainty'], _u: Date.now() + 5000 };
    remote.__ts = Date.now() + 5000;
    const merged = mergeDB(local, remote);
    // Изоляция: другой профиль не видит настроек и ассоциаций.
    const origin = activeId();
    const list = loadProfiles();
    const nid = 'pTESTW9' + Date.now();
    list.push({ id: nid, name: 'TEST-W9-B', color: '#1056CC' });
    saveProfiles(list); setActiveId(nid); hydrate();
    const other = { hidden: (DB.mindBodySettings || {}).hiddenAssociations || [], assoc: mindBodyAssociations(DB).associations.length };
    setActiveId(origin); hydrate();
    saveProfiles(loadProfiles().filter(p2 => p2.id !== nid));
    try { localStorage.removeItem('arch5_db_' + nid); localStorage.removeItem('arch5_cfg_' + nid); } catch (_) {}
    return { cardsBefore, cardsAfter, hidden, lww: merged.mindBodySettings.mutedThemes,
      backHidden: DB.mindBodySettings.hiddenAssociations.length, other };
  });
  ok(prefs.cardsBefore === 1 && prefs.cardsAfter === 0 && prefs.hidden.length === 1,
    'пользователь может скрыть конкретную ассоциацию');
  ok(JSON.stringify(prefs.lww) === JSON.stringify(['uncertainty']),
    'mindBodySettings сливается как LWW-документ (sync)');
  ok(prefs.other.hidden.length === 0 && prefs.other.assoc === 0 && prefs.backHidden === 1,
    'изоляция профилей: настройки и ассоциации не пересекают границу (9)');

  // Mute темы отключает вычисление.
  const muted = await page.evaluate(() => {
    DB.mindBodySettings = { hiddenAssociations: [], mutedThemes: ['uncertainty'] };
    return mindBodyAssociations(DB).associations.filter(a => a.theme === 'uncertainty').length;
  });
  ok(muted === 0, 'запрещённая тема не отслеживается вовсе');
}

// ═══ 10. XSS / приватность ══════════════════════════════════════════
{
  await reset();
  const xss = await page.evaluate(() => {
    window.__w9xss = false;
    for (let i = 0; i < 6; i++) {
      const day = '2026-03-0' + (i + 1);
      psySaveRecord('psyObservation', { metricId: 'ema_episode', source: 'user',
        valueText: 'неопределённость <img src=x onerror="window.__w9xss=true">', timestamp: day + 'T10:00:00.000Z' });
      DB.symptoms.push({ id: 'x' + i, name: '<img src=x onerror="window.__w9xss=true"> боль', severity: 5,
        day, createdAt: day + 'T12:00:00.000Z', sv: SCHEMA_VERSION, _u: Date.now() });
    }
    goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace();
    const el = document.querySelector('#psy-ws .mb-block');
    el.querySelectorAll('details').forEach(d => { d.open = true; });
    const badInline = [...el.querySelectorAll('[onclick]')].some(x => (x.getAttribute('onclick') || '').includes('__w9xss'));
    return { fired: window.__w9xss, img: !!el.querySelector('img[src="x"]'), badInline };
  });
  await page.waitForTimeout(150);
  const fired = await page.evaluate(() => window.__w9xss);
  ok(!fired && !xss.img && !xss.badInline, 'инъекция в тексте симптома/эпизода не исполняется (10)');
  const led = await page.evaluate(() => (JSON.parse(localStorage.getItem('arch5_ai_ledger') || '[]') || []).length);
  ok(led === 0, 'AI-леджер пуст — слой работает без AI и без сети');
}

// ═══ 11. Медицинский red-flag gate ══════════════════════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09', '2026-03-11']) await addPsy(day, T);
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addSym(day, 'боль в груди', 7);
  const r = await assoc();
  ok(!r.associations.some(a => a.symptomKey.includes('груд')),
    'red-flag симптом НЕ участвует в психологических ассоциациях (11)');
  ok(r.redFlagSymptoms.length === 1,
    'red-flag симптом виден отдельным списком медицинского маршрута');
  const ui = await page.evaluate(() => {
    goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace();
    const el = document.querySelector('#psy-ws .mb-block');
    return el.textContent.includes('медицинскому маршруту') && el.textContent.includes('обратись к врачу');
  });
  ok(ui, 'карточки честно направляют red-flag в медицинский маршрут');
}

// ═══ 12. A11y + обе поверхности + производительность ════════════════
{
  await reset();
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07', '2026-03-09', '2026-03-11']) await addPsy(day, T);
  for (const day of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07']) await addSym(day, 'головная боль');
  const surf = await page.evaluate(() => {
    goTo('map'); if (typeof openPsyWorkspace === 'function') openPsyWorkspace(); else rPsyWorkspace();
    const psy = document.querySelector('#psy-ws .mb-block');
    rHealth();
    const health = document.querySelector('#health-out .mb-block');
    const btns = psy ? [...psy.querySelectorAll('button')] : [];
    psy.querySelectorAll('details').forEach(d => { d.open = true; });
    const small = btns.filter(b => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 44; });
    return { psy: !!psy && psy.textContent.includes('Тело и контекст'),
      health: !!health && health.textContent.includes('Совпадения с контекстом'),
      why: psy.textContent.includes('Почему система это заметила'),
      badType: btns.filter(b => b.getAttribute('type') !== 'button').length, small: small.length,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  ok(surf.psy && surf.health, 'карточки присутствуют в Психологии И в Здоровье (не отдельный экран)');
  ok(surf.why, 'у карточки есть «Почему система это заметила?» с раскрытием источников');
  ok(surf.badType === 0 && surf.small === 0 && !surf.overflow, 'кнопки — настоящие button ≥44px, без переполнения (390px)');

  const perf = await page.evaluate(() => {
    for (let i = 0; i < 300; i++) {
      const day = new Date(Date.UTC(2025, 0, 1 + (i % 200))).toISOString().slice(0, 10);
      DB.psyObservations.push({ id: 'perf-p' + i, timestamp: day + 'T09:00:00.000Z', metricId: 'm', valueText: 'тревога и неопределённость', valueNumber: null, entryMode: 'event_based', source: 'user', naturalistic: false, sourceRefs: [], createdAt: day + 'T09:00:00.000Z', day, sv: SCHEMA_VERSION, _u: 1, privacyClass: 'sensitive' });
      DB.symptoms.push({ id: 'perf-s' + i, name: 'симптом ' + (i % 5), severity: 5, day, createdAt: day + 'T10:00:00.000Z', sv: SCHEMA_VERSION, _u: 1 });
    }
    const t0 = performance.now();
    mindBodyAssociations(DB);
    return Math.round(performance.now() - t0);
  });
  ok(perf < 400, `движок на 600 записях за ${perf} мс (< 400)`);
}

const nonBoot = netRequests.filter(u => !u.includes('/health'));
ok(nonBoot.length === 0, `ни одного сетевого вызова в mind-body пути (${nonBoot.length})`, nonBoot.slice(0, 3).join('\n'));
ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 9 (mind-body context): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
