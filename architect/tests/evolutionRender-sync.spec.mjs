// РЕГРЕССИЯ: крах отрисовки эволюции ломал синхронизацию.
//
// Продакшн-симптом на устройстве владельца после успешного ZIP-импорта:
//   GET /api/space → 200, PUT /api/space → 200,
//   затем «sync fail — undefined is not an object (evaluating 'lv.d')».
//
// Корень (подтверждён на сборке): рендереры брали EVO_LV[Math.min(e.lv,3)]
// напрямую. Внешний адаптер писал в `lv` СТРОКУ (формулировку источника или
// запасное «этап»), поэтому Math.min('этап',3) → NaN → EVO_LV[NaN] →
// undefined → чтение lv.d бросало. Исключение возникало ПОСЛЕ успешного
// обмена данными, но классифицировалось как провал синхронизации.
//
// Что защищено здесь:
//   1. Веха с уровнем вне шкалы 0..3 рендерится и в «Эволюции», и в /ретро.
//   2. Собственная формулировка источника сохраняется; неизвестный уровень
//      НЕ выдаётся за «Наблюдение».
//   3. Пользовательские уровни 0..3 (включая falsy 0) не изменились.
//   4. Числовой уровень источника (включая 0) больше не теряется адаптером.
//   5. Обмен удался → синк успешен, даже если отрисовка бросила; ошибка
//      отрисовки видна отдельно и не проглатывается.
//   6. Реальный сбой транспорта по-прежнему = провал синхронизации.
//
// ВСЕ фикстуры синтетические (TEST-EVO-*). Реальные данные владельца в
// репозиторий не попадают ни в каком виде (privacy canary внизу).
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { encryptPayload, decryptEnvelope, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.EVOSYNC_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

// Синтетический v2-пакет с вехами эволюции.
const evoPkg = (ref, entities) => JSON.stringify({
  format: 'architect-external-work-v2',
  source: { kind: 'google_drive', label: 'TEST-EVO источник', module: 'TEST-EVO-MODULE' },
  session: { clientRef: ref, summary: 'синтетическая сессия', date: '2026-07-01' },
  entities,
});
const evoEnt = (sid, data) => ({
  clientRef: 'c-' + sid, type: 'evolution', sourceId: sid,
  claimClass: 'user_experience', textOrigin: 'structured_summary', sourceDate: '2026-07-01',
  sourceVersion: { sequence: 1 }, data,
});

const COLLS = ['insights', 'dreams', 'spiritual', 'whys', 'patterns', 'evolution',
  'psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations', 'psyReviews',
  'relationshipContexts', 'externalConnections', 'externalWorkSessions'];
const reset = () => page.evaluate((colls) => {
  colls.forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) { }
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  _extConnActive = null;
}, COLLS);
const importPkg = (text) => page.evaluate(async (t) => {
  const c = extConnCreate('TEST-EVO приём', 'external_connector');
  const r = await extBridgeRefresh(c.rec.id, t);
  if (!r.ok) return { ok: false, errors: r.errors };
  const a = extBridgeApply(c.rec.id);
  return { ok: a.ok, created: a.created || 0, errors: a.errors || [] };
}, text);

console.log('\nЭВОЛЮЦИЯ · ОТРИСОВКА И КЛАССИФИКАЦИЯ СИНКА\n');

// ── 1. Импорт вех с проблемными уровнями + отрисовка «Эволюции» ──────
{
  await reset();
  const r = await importPkg(evoPkg('TEST-EVO-S1', [
    evoEnt('TEST-EVO-MISSING', { text: 'веха без уровня' }),                       // level отсутствует
    evoEnt('TEST-EVO-PHRASE', { text: 'веха с формулировкой', lv: 'профессиональный этап' }),
    evoEnt('TEST-EVO-ZERO', { text: 'веха с уровнем 0', lv: 0 }),                  // валидный falsy 0
    evoEnt('TEST-EVO-THREE', { text: 'веха с уровнем 3', lv: 3 }),
  ]));
  ok(r.ok && r.created === 4, `4 вехи импортированы (${r.created})`, (r.errors || []).join('; '));
  const st = await page.evaluate(() => ({
    lvs: DB.evolution.map(e => ({ t: typeof e.lv, v: e.lv })),
  }));
  ok(st.lvs.some(x => x.t === 'number' && x.v === 0),
    'числовой уровень 0 сохранён числом, а не потерян как falsy', JSON.stringify(st.lvs));
  ok(st.lvs.some(x => x.t === 'number' && x.v === 3), 'числовой уровень 3 сохранён числом');
  ok(st.lvs.some(x => x.t === 'string' && x.v === 'профессиональный этап'),
    'формулировка источника сохранена как есть');

  const render = await page.evaluate(() => {
    const el = document.createElement('div');
    try { rEvoList(el); return { ok: true, text: (el.textContent || '').replace(/\s+/g, ' ').trim() }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ok(render.ok, 'отрисовка «Эволюции» не бросает исключение', render.error);
  ok(/профессиональный этап/.test(render.text), 'формулировка источника показана человеку');
  ok(/Наблюдение/.test(render.text) && /Трансформировало/.test(render.text),
    'пользовательские уровни 0 и 3 названы прежними именами шкалы');
  ok(!/undefined/.test(render.text), 'в разметке нет undefined', render.text.slice(0, 120));
}

// ── 1b. ШКАЛА СТРОГАЯ: только целые 0..3, ничего не подтягивается ────
// Прежний Math.min(n, 3) молча объявлял 4/5/100 «Трансформировало», то есть
// выдумывал смысл приложения за источник. Шкала — РОВНО четыре ступени.
{
  const idx = await page.evaluate(() => {
    const probe = [0, 1, 2, 3, 4, 5, 100, -1, -0.5, 2.5, 0.1, NaN, Infinity, -Infinity,
      '0', '3', '4', '-1', '2.5', '', '   ', 'этап', 'уровень 3', null, undefined, true, false, [], {}];
    return probe.map(v => {
      let key;
      if (typeof v === 'number') key = Object.is(v, -0) ? '-0' : String(v);
      else if (typeof v === 'string') key = JSON.stringify(v);
      else key = String(v);
      return [key, evoLevelIndex(v)];
    });
  });
  const got = new Map(idx);
  const valid = [['0', 0], ['1', 1], ['2', 2], ['3', 3], ['"0"', 0], ['"3"', 3]];
  const badValid = valid.filter(([k, want]) => got.get(k) !== want);
  ok(badValid.length === 0,
    'валидны РОВНО целые 0,1,2,3 (и их строковая запись) — 0 остаётся валидным',
    badValid.map(([k, w]) => `${k}: ожидали ${w}, получили ${got.get(k)}`).join('\n'));

  const offscale = ['4', '5', '100', '"4"', '-1', '"-1"', '-0.5', '2.5', '0.1', '"2.5"',
    'NaN', 'Infinity', '-Infinity', '""', '"   "', '"этап"', '"уровень 3"',
    'null', 'undefined', 'true', 'false', '', '[object Object]'];
  const leaked = offscale.filter(k => got.has(k) && got.get(k) !== null);
  ok(leaked.length === 0,
    'вне шкалы: 4, 100, −1, 2.5, NaN, пусто, произвольная строка → индекса нет',
    leaked.map(k => `${k} → ${got.get(k)}`).join('\n'));
  // Явно по требованию владельца: 4 и 100 НЕ третий уровень, −1 НЕ нулевой.
  ok(got.get('4') === null && got.get('100') === null,
    '4 и 100 НЕ становятся уровнем 3 «Трансформировало»');
  ok(got.get('-1') === null, '−1 НЕ становится уровнем 0 «Наблюдение»');
  ok(got.get('2.5') === null, 'дробное 2.5 вне шкалы');

  // Представление: вне шкалы человеку показывают источник, а не ступень.
  const views = await page.evaluate(() => {
    const mk = lv => { const v = evoView({ lv }); return { lb: v.lb, c: v.c, d: v.d }; };
    return { four: mk(4), hundred: mk(100), neg: mk(-1), frac: mk(2.5),
      str: mk('произвольная формулировка'), empty: mk(''), miss: mk(undefined),
      zero: mk(0), three: mk(3) };
  });
  ok(views.zero.lb === 'Наблюдение' && views.zero.c === 'el0' &&
    views.three.lb === 'Трансформировало' && views.three.c === 'el3',
    'уровни 0 и 3 по-прежнему называются именами шкалы', JSON.stringify(views.zero));
  const off = [views.four, views.hundred, views.neg, views.frac, views.str, views.empty, views.miss];
  ok(off.every(v => v.c === 'elx' && v.d === 'edx'),
    'всё вне шкалы рисуется нейтральным стилем', JSON.stringify(off.map(v => v.c)));
  ok(off.every(v => !/Наблюдение|Понято|Прочувствовано|Трансформировало/.test(v.lb)),
    'вне шкалы НЕ подписывается ни одним именем шкалы', JSON.stringify(off.map(v => v.lb)));
  ok(/4/.test(views.four.lb) && /100/.test(views.hundred.lb) && /2\.5/.test(views.frac.lb),
    'числовой уровень вне шкалы остаётся видимым как значение источника',
    JSON.stringify([views.four.lb, views.hundred.lb, views.frac.lb]));
  ok(views.str.lb === 'произвольная формулировка',
    'строковая формулировка источника показана как есть', views.str.lb);

  // Отрисовка: ни один рендерер не падает и не печатает undefined.
  const render = await page.evaluate(() => {
    DB.evolution = [4, 100, -1, 2.5, NaN, 'этап', '', 0, 3, null, undefined]
      .map((lv, i) => ({ id: 990100 + i, lv, text: 'веха ' + i, dt: '01.01.2026', sv: SCHEMA_VERSION }));
    const el = document.createElement('div');
    let list, retro;
    try { rEvoList(el); list = { ok: true, text: el.textContent || '' }; }
    catch (e) { list = { ok: false, error: e.message }; }
    try { retro = { ok: true, text: String(CMDS['/ретро']()).replace(/<[^>]*>/g, ' ') }; }
    catch (e) { retro = { ok: false, error: e.message }; }
    return { list, retro, levels: el.querySelectorAll('.elv').length };
  });
  ok(render.list.ok && render.retro.ok,
    'весь набор внешкальных значений рендерится без исключения',
    (render.list.error || '') + ' ' + (render.retro.error || ''));
  ok(!/undefined/.test(render.list.text) && !/undefined/.test(render.retro.text),
    'в разметке нет undefined ни в списке, ни в /ретро');
  ok(render.levels === 11, `отрисованы все 11 вех (${render.levels})`);

  // Внешний числовой уровень вне диапазона доходит до записи КАК ЕСТЬ.
  await reset();
  const imp = await importPkg(evoPkg('TEST-EVO-S1B', [
    evoEnt('TEST-EVO-FOUR', { text: 'веха с уровнем 4', lv: 4 }),
    evoEnt('TEST-EVO-HUNDRED', { text: 'веха с уровнем 100', lv: 100 }),
    evoEnt('TEST-EVO-FRAC', { text: 'веха с уровнем 2.5', lv: 2.5 }),
    evoEnt('TEST-EVO-NEG', { text: 'веха с уровнем -1', lv: -1 }),
  ]));
  const stored = await page.evaluate(() => DB.evolution.map(e => ({ t: typeof e.lv, v: e.lv })));
  ok(imp.ok && stored.length === 4, `4 внешкальные вехи импортированы (${stored.length})`,
    (imp.errors || []).join('; '));
  ok(stored.every(x => x.t === 'number'),
    'внешний числовой уровень вне диапазона сохранён числом, а не потерян как «этап»',
    JSON.stringify(stored));
  ok(stored.some(x => x.v === 4) && stored.some(x => x.v === 100) &&
     stored.some(x => x.v === 2.5) && stored.some(x => x.v === -1),
    'значения 4 / 100 / 2.5 / −1 сохранены как есть, без подтягивания в шкалу',
    JSON.stringify(stored));
  const impRender = await page.evaluate(() => {
    const el = document.createElement('div');
    rEvoList(el);
    return (el.textContent || '').replace(/\s+/g, ' ');
  });
  ok(!/Трансформировало/.test(impRender) && !/Наблюдение/.test(impRender),
    'ни одна внешкальная веха не подписана ступенью шкалы', impRender.slice(0, 160));

  // Миграции данных нет: строгая шкала ничего не переписывает в базе.
  const nonDestructive = await page.evaluate(() => {
    const before = JSON.stringify(DB.evolution);
    const el = document.createElement('div');
    rEvoList(el); evoView(DB.evolution[0]); evoLevelIndex(DB.evolution[0].lv);
    try { CMDS['/ретро'](); } catch (_) { }
    return before === JSON.stringify(DB.evolution);
  });
  ok(nonDestructive, 'строгая шкала не мигрирует и не переписывает записи');
}

// ── 2. Легаси-запись lv='этап' читаема БЕЗ переписывания базы ────────
{
  const render = await page.evaluate(() => {
    // Ровно то, что уже лежит на устройстве после прошлых импортов.
    DB.evolution.push({ id: 999001, lv: 'этап', text: 'легаси-веха', dt: '01.01.2026', sv: SCHEMA_VERSION });
    const before = JSON.parse(JSON.stringify(DB.evolution));
    const el = document.createElement('div');
    let res;
    try { res = { ok: true, text: (rEvoList(el), (el.textContent || '')) }; }
    catch (e) { res = { ok: false, error: e.message }; }
    return { ...res, unchanged: JSON.stringify(before) === JSON.stringify(DB.evolution) };
  });
  ok(render.ok, 'легаси lv=«этап» рендерится без исключения', render.error);
  ok(/этап/.test(render.text || ''), 'легаси-формулировка показана');
  ok(render.unchanged, 'отрисовка НЕ переписала записи в базе (не деструктивна)');
}

// ── 3. /ретро — тот же небезопасный доступ был и там ─────────────────
{
  const retro = await page.evaluate(() => {
    try {
      const html = CMDS['/ретро']();
      return { ok: true, text: String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ok(retro.ok, '/ретро не бросает исключение', retro.error);
  ok(!/undefined/.test(retro.text || ''), '/ретро не печатает undefined', (retro.text || '').slice(0, 120));
}

// ── 4. Экранирование: формулировка источника — не сырой HTML ─────────
{
  const esc = await page.evaluate(() => {
    DB.evolution = [{ id: 999002, lv: '<img src=x onerror=alert(1)>', text: 'проверка', dt: '01.01.2026' }];
    const el = document.createElement('div');
    rEvoList(el);
    return { html: el.innerHTML, imgs: el.querySelectorAll('img').length };
  });
  ok(esc.imgs === 0 && !/<img/i.test(esc.html), 'формулировка уровня экранируется, разметка не инъецируется');
}

// ── 5. Синк: обмен удался, отрисовка бросила → синк УСПЕШЕН ──────────
{
  await reset();
  await importPkg(evoPkg('TEST-EVO-S2', [evoEnt('TEST-EVO-SYNC1', { text: 'веха для синка', lv: 'смысловой этап' })]));
  const res = await page.evaluate(async () => {
    const calls = [];
    const origApi = api, origRender = renderAfterSync, origToast = toast, origLog = log;
    const toasts = [], logs = [];
    api = async (path, opt = {}) => {
      calls.push((opt.method || 'GET') + ' ' + path);
      if ((opt.method || 'GET') === 'GET') return { name: 'x', updated_at: '2026-07-01T00:00:00Z', data: null };
      return { updated_at: '2026-07-02T00:00:00Z' };
    };
    // Отрисовка честно ломается — как ломалась на устройстве владельца.
    renderAfterSync = () => { throw new TypeError("undefined is not an object (evaluating 'lv.d')"); };
    toast = (m, k) => toasts.push(k + ':' + m);
    log = (lvl, m, d) => logs.push(lvl + ':' + m);
    CFG.apiUrl = 'https://example.invalid'; CFG.spaceKey = 'TEST-EVO-SPACE';
    setPass('test-evo-passphrase');   // privacy-гейт синка требует E2EE-фразу
    _syncing = false;
    await runSync({ manual: true });
    const badge = ($('sync-lbl') || {}).textContent || '';
    api = origApi; renderAfterSync = origRender; toast = origToast; log = origLog;
    return { calls, badge, toasts, logs, lastSync: CFG.lastSync };
  });
  ok(res.calls.some(c => c.startsWith('GET')) && res.calls.some(c => c.startsWith('PUT')),
    'обмен выполнен: GET и PUT прошли', res.calls.join(' | '));
  ok(res.lastSync === '2026-07-02T00:00:00Z', 'отметка последней синхронизации сохранена');
  ok(!res.toasts.some(t => /^warn:.*(не удалось синхрон|sync fail)/i.test(t)) &&
     res.toasts.some(t => /^ok:Синхронизировано/.test(t)),
    'синхронизация отчитывается УСПЕХОМ, а не провалом', res.toasts.join(' | '));
  ok(res.logs.some(l => /^error:ошибка отрисовки/.test(l)),
    'ошибка отрисовки записана в журнал отдельно (не проглочена)', res.logs.join(' | '));
  ok(res.toasts.some(t => /обновить экран не удалось/.test(t)),
    'человеку сказано про экран, а не про потерю синхронизации');
}

// ── 6. Реальный сбой транспорта по-прежнему = провал синка ───────────
{
  const res = await page.evaluate(async () => {
    const origApi = api, origToast = toast, origLog = log;
    const toasts = [], logs = [];
    api = async () => { throw new Error('сеть недоступна'); };
    toast = (m, k) => toasts.push(k + ':' + m);
    log = (lvl, m) => logs.push(lvl + ':' + m);
    CFG.apiUrl = 'https://example.invalid'; CFG.spaceKey = 'TEST-EVO-SPACE';
    setPass('test-evo-passphrase');
    _syncing = false;
    await runSync({ manual: true });
    api = origApi; toast = origToast; log = origLog;
    return { toasts, logs };
  });
  ok(res.logs.some(l => /^error:sync fail/.test(l)), 'сбой транспорта по-прежнему = провал синхронизации',
    res.logs.join(' | '));
}

// ── 7. Успешный синк с рабочей отрисовкой: данные не тронуты ─────────
{
  await reset();
  await importPkg(evoPkg('TEST-EVO-S3', [
    evoEnt('TEST-EVO-K1', { text: 'веха один', lv: 'этап расширения' }),
    evoEnt('TEST-EVO-K2', { text: 'веха два', lv: 2 }),
  ]));
  const before = await page.evaluate((cs) => ({
    canonical: cs.reduce((n, c) => n + (DB[c] || []).length, 0),
    evolution: DB.evolution.length,
    refs: cs.reduce((n, c) => n + (DB[c] || []).reduce((m, r) => m + ((r.ext && r.ext.sourceRefs) ? r.ext.sourceRefs.length : 0), 0), 0),
    journal: DB.externalWorkSessions.length,
    checkpoint: DB.externalConnections[0].checkpoint.committedPackageHashes.length,
    snap: JSON.stringify(DB.evolution),
  }), COLLS);
  const res = await page.evaluate(async () => {
    const origApi = api, origToast = toast;
    const toasts = [];
    api = async (path, opt = {}) => ((opt.method || 'GET') === 'GET'
      ? { name: 'x', updated_at: '2026-07-01T00:00:00Z', data: null }
      : { updated_at: '2026-07-03T00:00:00Z' });
    toast = (m, k) => toasts.push(k + ':' + m);
    CFG.apiUrl = 'https://example.invalid'; CFG.spaceKey = 'TEST-EVO-SPACE';
    setPass('test-evo-passphrase');   // privacy-гейт синка требует E2EE-фразу
    _syncing = false;
    await runSync({ manual: true });
    // повтор — идемпотентность
    _syncing = false;
    await runSync({ manual: true });
    api = origApi; toast = origToast;
    return { toasts };
  });
  const after = await page.evaluate((cs) => ({
    canonical: cs.reduce((n, c) => n + (DB[c] || []).length, 0),
    evolution: DB.evolution.length,
    refs: cs.reduce((n, c) => n + (DB[c] || []).reduce((m, r) => m + ((r.ext && r.ext.sourceRefs) ? r.ext.sourceRefs.length : 0), 0), 0),
    journal: DB.externalWorkSessions.length,
    checkpoint: DB.externalConnections[0].checkpoint.committedPackageHashes.length,
    snap: JSON.stringify(DB.evolution),
  }), COLLS);
  ok(res.toasts.filter(t => /^ok:Синхронизировано/.test(t)).length === 2,
    'два подряд синка отчитались успехом (идемпотентно)', res.toasts.join(' | '));
  ok(before.canonical === after.canonical && before.evolution === after.evolution,
    `канонические счётчики не изменились (${before.canonical}→${after.canonical})`);
  ok(before.refs === after.refs, `sourceRefs не изменились (${before.refs}→${after.refs})`);
  ok(before.journal === after.journal && before.checkpoint === after.checkpoint,
    `журнал и чекпойнт не изменились (${before.journal}/${before.checkpoint})`);
  ok(before.snap === after.snap, 'вехи byte-identical: ни дублей, ни удалений');
}

// ── 8. Восстановление устройства владельца: сервер уже принял PUT ────
{
  // Сценарий ровно как на устройстве: PUT прошёл, клиент упал на отрисовке.
  // Повторный синк на исправленной сборке обязан быть зелёным и ничего не менять.
  const res = await page.evaluate(async () => {
    const origApi = api, origToast = toast;
    const toasts = [];
    const snapBefore = JSON.stringify(DB.evolution);
    api = async (path, opt = {}) => ((opt.method || 'GET') === 'GET'
      ? { name: 'x', updated_at: '2026-07-03T00:00:00Z', data: null }   // сервер уже с нашим состоянием
      : { updated_at: '2026-07-04T00:00:00Z' });
    toast = (m, k) => toasts.push(k + ':' + m);
    setPass('test-evo-passphrase');
    _syncing = false;
    await runSync({ manual: true });
    api = origApi; toast = origToast;
    return { toasts, unchanged: snapBefore === JSON.stringify(DB.evolution) };
  });
  ok(res.toasts.some(t => /^ok:Синхронизировано/.test(t)),
    'после «сервер принял, клиент упал» повторный синк зелёный', res.toasts.join(' | '));
  ok(res.unchanged, 'восстановление не потребовало правки данных');
}

// ── 9. Копия/восстановление, затем синк — всё зелёное ────────────────
{
  const snap = await page.evaluate(() => JSON.parse(JSON.stringify(DB)));
  const mkStorage = (init = {}) => { const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] }; };
  const mkMedia = () => { const m = new Map(); return { get: async i => m.get(i), put: async (i, v) => { m.set(i, v); }, del: async i => { m.delete(i); }, keys: async () => [...m.keys()] }; };
  const NOW = '2026-12-31T00:00:00.000Z';
  const st = mkStorage({ [KEYS.PKEY]: JSON.stringify([{ id: 'pE', name: 'E', color: '#1056CC' }]), [KEYS.AKEY]: 'pE',
    [KEYS.db('pE')]: JSON.stringify(snap), [KEYS.cfg('pE')]: JSON.stringify({ userName: 'E' }) });
  const adapter = createBackupAdapter({ storage: st, media: mkMedia(), now: () => NOW });
  const { payload } = await adapter.buildBundle({ id: 'pE', mode: 'data-only' });
  const env = await encryptPayload(payload, 'test-evo-backup');
  const ser = serializeEnvelope(env);
  await decryptEnvelope(env, 'test-evo-backup');
  const dest = { storage: mkStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: mkMedia() };
  const ad2 = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
  const r = await restoreBackup({ adapter: ad2, file: { size: ser.length, text: async () => ser }, password: 'test-evo-backup', mode: 'new', genProfileId: () => 'pR', now: () => NOW });
  const rdb = JSON.parse(dest.storage.getItem(KEYS.db('pR')));
  ok(r.ok && (rdb.evolution || []).length === snap.evolution.length,
    `восстановление сохранило вехи (${(rdb.evolution || []).length})`);
  const post = await page.evaluate(async ({ snapStr }) => {
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(snapStr)); persist();
    const origApi = api, origToast = toast;
    const toasts = [];
    api = async (path, opt = {}) => ((opt.method || 'GET') === 'GET'
      ? { name: 'x', updated_at: '2026-07-04T00:00:00Z', data: null }
      : { updated_at: '2026-07-05T00:00:00Z' });
    toast = (m, k) => toasts.push(k + ':' + m);
    CFG.apiUrl = 'https://example.invalid'; CFG.spaceKey = 'TEST-EVO-SPACE';
    setPass('test-evo-passphrase');   // privacy-гейт синка требует E2EE-фразу
    _syncing = false;
    await runSync({ manual: true });
    api = origApi; toast = origToast;
    const el = document.createElement('div');
    let renderOk = true;
    try { rEvoList(el); } catch (e) { renderOk = false; }
    return { toasts, renderOk, evolution: DB.evolution.length };
  }, { snapStr: JSON.stringify(rdb) });
  ok(post.toasts.some(t => /^ok:Синхронизировано/.test(t)) && post.renderOk,
    'после восстановления синк зелёный и «Эволюция» рендерится', post.toasts.join(' | '));
}

// ── 10. Мобильная отрисовка и a11y списка вех ────────────────────────
{
  const ui = await page.evaluate(() => {
    DB.evolution = [
      { id: 1, lv: 'очень длинная формулировка уровня из внешнего источника', text: 'веха', dt: '01.01.2026' },
      { id: 2, lv: 1, text: 'веха два', dt: '02.01.2026' },
    ];
    const host = document.createElement('div');
    host.style.width = '390px';
    document.body.appendChild(host);
    rEvoList(host);
    const overflow = [...host.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).length;
    const res = { overflow, dots: host.querySelectorAll('.edot').length, labels: host.querySelectorAll('.elv').length };
    host.remove();
    return res;
  });
  ok(ui.overflow === 0, 'длинная формулировка не выходит за границы экрана iPhone');
  ok(ui.dots === 2 && ui.labels === 2, 'структура списка сохранена для обоих типов уровня');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'evolutionRender-sync.spec.mjs'), 'utf8');
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  const marks = [['GDRI', 'VE:'], ['LIFE-2', '02'], ['DREAM-2', '02'], ['PARA-2', '02'], ['INT-2', '02']]
    .map(p => new RegExp(p.join('')));
  const inSpec = marks.filter(r => r.test(src)).length;
  const inBundle = marks.filter(r => r.test(bundle)).length;
  ok(inSpec === 0 && inBundle === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в бандле (${inSpec}/${inBundle})`);
  ok(/TEST-EVO-/.test(src), 'все фикстуры несут синтетический префикс TEST-EVO-*');
}

await browser.close();
console.log(`\nЭВОЛЮЦИЯ · СИНК: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
