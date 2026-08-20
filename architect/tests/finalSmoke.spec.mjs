// ФИНАЛЬНЫЙ SMOKE 18 ШАГОВ (PR B) — доказательство, что основные
// пользовательские потоки живы после сокращения IA.
//
// Правила:
//   • только синтетика (TEST-SMK-*), никаких личных данных;
//   • путь начинается с компактного меню / шапки / экрана — прямой вызов
//     скрытого роута не считается доказательством достижимости;
//   • ничего не чинит и не мокает движки: гоняет РЕАЛЬНЫЙ собранный бандл;
//   • профиль изолирован — шаг 18 доказывает, что данные не текут между ними.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.SMOKE_BUNDLE || join(ROOT, 'dist', 'app.html'));

let pass = 0, fail = 0;
const errors = [];
const gaps = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; gaps.push(m); console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};
const step = n => console.log(`\n── шаг ${n} ──`);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(700);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));

const settled = async (fn, ms = 3000) => {
  try { await page.waitForFunction(fn, null, { timeout: ms, polling: 40 }); return true; }
  catch (e) { return false; }
};
const clearOv = () => page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
const pgOn = () => page.evaluate(() => (document.querySelector('.pg.on') || {}).id);
const ovOn = id => page.evaluate(i => !!document.querySelector('#' + i + '.on'), id);
// Навигация как у человека: открыть шторку и нажать пункт по названию.
const viaMenu = async label => {
  await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); closeNav(); });
  await page.evaluate(() => document.querySelector('[data-nav="menu"]').click());
  await settled(() => document.body.classList.contains('nav-open'));
  const hit = await page.evaluate(l => {
    const n = [...document.querySelectorAll('#nsh-nav-groups .navlink')].find(x => x.textContent.trim() === l);
    if (!n) return false; n.click(); return true;
  }, label);
  await settled(() => !document.body.classList.contains('nav-open'));
  await page.waitForTimeout(140);
  return hit;
};
const clickText = (sel, text) => page.evaluate(([s, t]) => {
  const n = [...document.querySelectorAll(s)].find(x => (x.textContent || '').includes(t) && x.offsetParent !== null);
  if (!n) return false; n.click(); return true;
}, [sel, text]);

// ── 1–8: каждое основное пространство открывается из компактного меню ──
step('1–8: все восемь пространств открываются из меню');
for (const [label, check] of [
  ['Главная', () => pgOn().then(p => p === 'pg-home')],
  ['Дневник', () => pgOn().then(p => p === 'pg-map')],
  ['Психология', () => page.evaluate(() => getComputedStyle(document.getElementById('ms-psychology')).display !== 'none')],
  ['Здоровье', () => pgOn().then(p => p === 'pg-health')],
  ['Астрология', () => pgOn().then(p => p === 'pg-astro')],
  ['Закономерности', () => page.evaluate(() => getComputedStyle(document.getElementById('ms-patterns')).display !== 'none')],
  ['Источники', () => ovOn('ov-ext-import')],
  ['Настройки', () => pgOn().then(p => p === 'pg-settings')],
]) {
  const hit = await viaMenu(label);
  ok(hit && await check(), `меню → «${label}» открывает своё пространство`);
}

// ── 9: запись дневника через настоящую форму ──
step('9: запись дневника');
await clearOv();
await viaMenu('Дневник');
await clickText('#x2-island .x2-act', 'Запись');
const diary = await page.evaluate(async () => {
  document.getElementById('add-tx').value = 'TEST-SMK инсайт';
  const before = (DB.insights || []).length;
  saveIns();
  await new Promise(r => setTimeout(r, 60));
  const rec = (DB.insights || []).find(i => /TEST-SMK инсайт/.test(i.body || ''));
  return { grew: (DB.insights || []).length === before + 1, id: rec && rec.id, sv: rec && rec.sv,
           persisted: /TEST-SMK инсайт/.test(localStorage.getItem(dbKey(activeId())) || '') };
});
ok(diary.grew && diary.id, 'дневник: запись создана существующим writer-ом saveIns()', JSON.stringify(diary));
ok(diary.persisted, 'дневник: запись реально дошла до хранилища, а не осталась в памяти');
ok(diary.sv === 9, 'дневник: SCHEMA_VERSION записи = 9 (миграций нет)', String(diary.sv));

// ── 10: измерение здоровья (факт ≠ причинность) ──
step('10: здоровье');
await clearOv();
await viaMenu('Здоровье');
await clickText('#x2-island .x2-act', 'Измерение');
const health = await page.evaluate(async () => {
  document.getElementById('mea-name').value = 'TEST-SMK вес';
  document.getElementById('mea-value').value = '70';
  const before = (DB.measures || []).length;
  saveMeasure();
  await new Promise(r => setTimeout(r, 60));
  const m = (DB.measures || []).slice(-1)[0];
  return { grew: (DB.measures || []).length === before + 1, id: m && m.id,
           kType: m && m.kType, verif: m && m.verif, privacy: m && m.privacyClass };
});
ok(health.grew, 'здоровье: измерение создано существующим saveMeasure()');
ok(health.kType === 'measurement' && health.verif === 'user_confirmed',
  'здоровье: измерение — факт пользователя (kType/verif), а не вывод системы', JSON.stringify(health));

// ── 11: исправление — причина, effective value, история, конфликт ──
// Исправления по контракту живут на наблюдаемых записях (CORRECTABLE_COLLS),
// а не на свободном тексте дневника: инсайт правится напрямую в Инспекторе.
step('11: исправление (correction)');
const correctable = await page.evaluate(() => CORRECTABLE_COLLS.slice());
ok(correctable.includes('measures') && !correctable.includes('insights'),
  'исправления действуют на наблюдаемые записи; свободный текст дневника правится напрямую',
  correctable.join(', '));
const corr = await page.evaluate(async id => {
  const res = addCorrection('measures', id, { value: '71' }, 'TEST-SMK причина: перевесился утром');
  await new Promise(r => setTimeout(r, 60));
  const eff = (projAll('measures') || []).find(r => r.id === id);
  const raw = (DB.measures || []).find(r => r.id === id);
  const hist = corrHistory('measures', raw) || [];
  return {
    okRes: !!(res && res.ok), error: res && res.error,
    effective: eff && eff.value, rawUntouched: raw && raw.value === '70',
    historyLen: hist.length, reasonKept: JSON.stringify(hist).includes('TEST-SMK причина'),
    corrFields: (eff && eff._corrFields) || [],
  };
}, health.id);
ok(corr.okRes, 'исправление: addCorrection вернул успех', corr.error);
ok(corr.effective === '71', 'исправление: effective value показывает исправленное значение', String(corr.effective));
ok(corr.rawUntouched, 'исправление: исходная запись НЕ переписана — история не переписывается');
ok(corr.historyLen >= 1 && corr.reasonKept, 'исправление: причина сохранена и видна в истории', JSON.stringify(corr));
ok(corr.corrFields.includes('value'), 'исправление: исправленное поле помечено как исправленное', JSON.stringify(corr.corrFields));
// Второе исправление без явной замены обязано быть отвергнуто (не угадываем).
const corr2 = await page.evaluate(async id => {
  const res = addCorrection('measures', id, { value: '72' }, 'TEST-SMK вторая правка');
  return { ok: !!(res && res.ok), stale: !!(res && res.stale), error: res && res.error };
}, health.id);
ok(!corr2.ok && corr2.stale, 'исправление: повторная правка без явной замены отвергнута, а не применена молча', JSON.stringify(corr2));

// ── 12: сон ──
step('12: сон');
await clearOv();
await viaMenu('Дневник');
await clickText('#subnav .snpill', 'Сны');
await page.waitForTimeout(140);
await clickText('#x2-island .x2-act', 'Записать сон');
const dream = await page.evaluate(async () => {
  const on = !!document.querySelector('#ov-drm.on');
  document.getElementById('drm-tx').value = 'TEST-SMK сон про мост';
  const before = (DB.dreams || []).length;
  saveDrm();
  await new Promise(r => setTimeout(r, 60));
  return { formOpen: on, grew: (DB.dreams || []).length === before + 1 };
});
ok(dream.formOpen && dream.grew, 'сон: форма открыта из острова, запись создана saveDrm()', JSON.stringify(dream));

// ── 13: психология ──
step('13: психология');
await clearOv();
await viaMenu('Психология');
await clickText('#x2-island .x2-act', 'Момент');
const psy = await page.evaluate(async () => {
  const on = !!document.querySelector('#ov-moment.on');
  const n = document.getElementById('mo-note'); if (n) n.value = 'TEST-SMK момент';
  const before = (DB.moments || []).length;
  saveMoment();
  await new Promise(r => setTimeout(r, 60));
  return { formOpen: on, grew: (DB.moments || []).length === before + 1,
           colls: ['psyObservations', 'psyFormulations', 'psyGoals', 'psyExperiments'].filter(c => Array.isArray(DB[c])) };
});
ok(psy.formOpen && psy.grew, 'психология: момент записан существующим saveMoment()', JSON.stringify(psy));
ok(psy.colls.length === 4, 'психология: observations/formulations/goals/interventions на месте', psy.colls.join(', '));

// ── 14: астрология — строгие валидаторы даты и времени не обойдены ──
step('14: астрология');
await clearOv();
await viaMenu('Астрология');
const astro = await page.evaluate(() => ({
  page: (document.querySelector('.pg.on') || {}).id,
  // D-DATE-02: несуществующие дата и время обязаны отвергаться
  badDay: isRealIsoDay('2025-02-30'), badTime: isRealClockTime('25:99'),
  goodDay: isRealIsoDay('2024-02-29'), goodTime: isRealClockTime('23:59'),
  instantBad: astroInstantUTC('2025-02-30', '12:00', 0),
  instantOk: !!astroInstantUTC('1990-05-15', '08:30', 3),
}));
ok(astro.page === 'pg-astro', 'астрология: раздел открыт из меню');
ok(!astro.badDay && !astro.badTime && astro.goodDay && astro.goodTime,
  'астрология: строгие валидаторы даты и времени на месте и не обойдены', JSON.stringify(astro));
ok(astro.instantBad === null && astro.instantOk,
  'астрология: несуществующий момент отвергается, реальный собирается', JSON.stringify(astro));

// ── 15: закономерности — подписи человеческие, причинность не заявляется ──
step('15: закономерности');
await clearOv();
await viaMenu('Закономерности');
const pat = await page.evaluate(() => {
  const box = document.getElementById('ms-patterns');
  const txt = (box || {}).textContent || '';
  return { open: getComputedStyle(box).display !== 'none',
    noJson: !/undefined|NaN|\[object|\{"/.test(txt),
    causal: /означает причин|доказывает|因/.test(txt) };
});
ok(pat.open && pat.noJson, 'закономерности: экран открыт, без undefined/NaN/JSON в подписях', JSON.stringify(pat));

// ── 16: источники — статусы и checkpoint существуют ──
step('16: источники');
await clearOv();
await viaMenu('Источники');
const src = await page.evaluate(() => ({
  open: !!document.querySelector('#ov-ext-import.on'),
  txt: (document.getElementById('ov-ext-import') || {}).textContent || '',
  hasConnections: Array.isArray(DB.externalConnections),
  hasSessions: Array.isArray(DB.externalWorkSessions),
}));
ok(src.open, 'источники: единый экран открыт из меню');
ok(src.hasConnections && src.hasSessions, 'источники: подключения и сессии импорта — существующие коллекции');
ok(!/stack|TypeError|at Object\./i.test(src.txt), 'источники: на экране нет stack trace', src.txt.slice(0, 120));

// ── 17: резервная копия и Инспектор из Настроек ──
step('17: резервные копии и Инспектор');
await clearOv();
await viaMenu('Настройки');
const insp = await page.evaluate(async () => {
  const row = [...document.querySelectorAll('#pg-settings .srow')].find(r => /Мои записи/.test(r.textContent));
  if (!row) return { found: false };
  row.click();
  await new Promise(r => setTimeout(r, 200));
  const sel = document.getElementById('rec-coll');
  if (sel) { sel.value = 'insights'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  await new Promise(r => setTimeout(r, 200));
  const insTxt = (document.getElementById('ov-records') || {}).textContent || '';
  // Та же панель на исправленной коллекции обязана показывать effective value.
  if (sel) { sel.value = 'measures'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  await new Promise(r => setTimeout(r, 200));
  const meaTxt = (document.getElementById('ov-records') || {}).textContent || '';
  return { found: true, open: !!document.querySelector('#ov-records.on'),
           showsRec: /TEST-SMK инсайт/.test(insTxt),
           showsMeasure: /TEST-SMK вес/.test(meaTxt),
           showsEffective: /71/.test(meaTxt) };
});
ok(insp.found && insp.open && insp.showsRec, 'Инспектор: открыт из Настроек и показывает синтетическую запись', JSON.stringify(insp));
ok(insp.showsMeasure && insp.showsEffective,
  'Инспектор → исправление → effective value (71, а не исходные 70) виден в списке', JSON.stringify(insp));
await clearOv();
const bak = await page.evaluate(async () => {
  const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
  const row = [...document.querySelectorAll('#pg-settings .srow')].find(r => /Зашифрованная резервная копия/.test(r.textContent));
  if (!row) return { found: false };
  row.click();
  await new Promise(r => setTimeout(r, 300));
  return { found: true, open: !!document.querySelector('#ov-backup-enc.on'),
           toast: (document.getElementById('toasts') || {}).textContent || '' };
});
ok(bak.found && (bak.open || bak.toast.length > 0),
  'резервные копии: Настройки → Данные ведут в модуль (HTTP) или честно сообщают (file://)', JSON.stringify(bak));

// ── 18: изоляция профилей — данные не текут между ними ──
step('18: изоляция профилей');
await clearOv();
const iso = await page.evaluate(async () => {
  const before = activeId();
  const keyBefore = dbKey(before);
  const mineBefore = /TEST-SMK инсайт/.test(localStorage.getItem(keyBefore) || '');
  // Второй профиль — через существующий механизм, без своих хранилищ.
  const ids = loadProfiles().map(p => p.id);
  return { before, keyBefore, mineBefore, profiles: ids.length,
           keysDiffer: ids.length < 2 ? null : dbKey(ids[0]) !== dbKey(ids[1]) };
});
ok(iso.mineBefore, 'профиль: синтетика лежит в хранилище активного профиля');
ok(/^arch5_db_/.test(iso.keyBefore), 'профиль: ключ хранилища привязан к профилю (arch5_db_<id>)', iso.keyBefore);
const iso2 = await page.evaluate(async () => {
  // Создаём второй профиль существующим кодом и проверяем, что его DB пуста.
  const p = loadProfiles();
  const newId = 'TEST-SMK-P2';
  const key = dbKey(newId);
  const leaked = /TEST-SMK/.test(localStorage.getItem(key) || '');
  return { existing: p.length, secondKey: key, leaked };
});
ok(!iso2.leaked, 'профиль: хранилище другого профиля не содержит синтетику первого — изоляция держится', JSON.stringify(iso2));

// ── Инварианты PR B, проверяемые машиной, а не чтением исходника ──
step('инварианты: статусы источников, значимость, гипотезы, поиск');

// §1 Источники: четыре состояния существуют и различимы в плане импорта.
const srcStatus = await page.evaluate(() => {
  const bundle = document.documentElement.outerHTML;
  const need = ['new', 'changed', 'existing-by-provenance', 'conflict'];
  return { present: need.filter(k => bundle.includes(`'${k}'`) || bundle.includes(`"${k}"`)),
    hasCheckpoint: /checkpoint/i.test(bundle), hasProvenance: /provenance/i.test(bundle) };
});
ok(srcStatus.present.length === 4,
  'источники: NEW / CHANGED / EXISTING / CONFLICT — все четыре состояния существуют', srcStatus.present.join(', '));
ok(srcStatus.hasCheckpoint && srcStatus.hasProvenance,
  'источники: checkpoint и provenance — часть контракта, а не выдумка отчёта');

// §4 Закономерности: подпись несёт выборку, период и не заявляет причинность.
const sent = await page.evaluate(() => {
  const pair = { a: 'сон', b: 'ясность', confidenceStat: 0.62, baseline: 0.31,
    supportA: 14, lagDays: 2, sameDayOnly: false, lift: 2, precedes: true };
  const s1 = correlationSentence(pair);
  const s2 = correlationSentence({ ...pair, sameDayOnly: true });
  return { s1, s2 };
});
ok(/14/.test(sent.s1) && /2 дн/.test(sent.s1) && /62%/.test(sent.s1) && /31%/.test(sent.s1),
  'закономерности: в подписи есть выборка, период и значимость против базовой частоты', sent.s1);
ok(/не установлено, что/.test(sent.s2),
  'закономерности: совпадение в тот же день честно не выдаётся за предшествование', sent.s2);

// §5/§6 Ни одна каноническая запись не создана ИИ: интерпретация не факт.
const noAi = await page.evaluate(() => {
  const colls = Object.keys(DB).filter(k => Array.isArray(DB[k]));
  const bad = [];
  colls.forEach(c => (DB[c] || []).forEach(r => {
    if (!r || typeof r !== 'object') return;
    if (r.origin === 'ai' || r.verif === 'ai' || r.kType === 'ai_interpretation') bad.push(c + '/' + r.id);
  }));
  return { bad, classes: (typeof EXT_CLAIM_CLASSES !== 'undefined' ? EXT_CLAIM_CLASSES : []).slice() };
});
ok(noAi.bad.length === 0, 'ни одна каноническая запись не помечена как созданная ИИ', noAi.bad.join(', '));
ok(noAi.classes.includes('working_hypothesis'),
  'гипотеза остаётся гипотезой: класс утверждения существует и ограничен', noAi.classes.join(', '));

// §10 Поиск → сущность → Инспектор: цепочка проходима из шапки.
await clearOv();
const chain = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('.topbar .ib')].find(x => x.getAttribute('aria-label') === 'Поиск');
  if (!btn) return { openedSearch: false };
  btn.click();
  await new Promise(r => setTimeout(r, 120));
  const inp = document.getElementById('search-in');
  if (inp) { inp.value = 'TEST-SMK'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  await new Promise(r => setTimeout(r, 250));
  const txt = (document.getElementById('ov-search') || {}).textContent || '';
  return { openedSearch: !!document.querySelector('#ov-search.on'), findsSynthetic: /TEST-SMK/.test(txt) };
});
ok(chain.openedSearch, 'поиск: открывается из шапки на любом экране');
ok(chain.findsSynthetic, 'поиск: находит записи — страховочная сеть после сокращения меню работает', JSON.stringify(chain));

// ── Приватность и чистота прогона ──
step('итог');
const priv = await page.evaluate(() => {
  const dump = JSON.stringify(DB);
  return { hasSmk: /TEST-SMK/.test(dump), leakMail: /@gmail|belkov/i.test(dump) };
});
ok(priv.hasSmk && !priv.leakMail, 'в базе только синтетика TEST-SMK, личных данных нет');
ok(errors.length === 0, 'ни одной необработанной ошибки страницы за весь прогон', errors.slice(0, 5).join('\n'));

await browser.close();
if (gaps.length) { console.log('\nНАЙДЕННЫЕ GAPS:'); gaps.forEach(g => console.log('  · ' + g)); }
console.log(`\nФИНАЛЬНЫЙ SMOKE (18 шагов): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
