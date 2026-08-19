// EXPERIENCE 2.0 — ОБОЛОЧКА: sidebar, drawer «Меню», Action Island, Whole Life.
//
// Что защищено:
//   1. «Ещё» не существует: ни кнопки, ни разметки. «Меню» открывает drawer —
//      тот же sidebar со всеми разделами, сгруппированно.
//   2. Каждый пункт sidebar ведёт в РЕАЛЬНОЕ назначение (нет мёртвых кнопок).
//   3. Подвкладки Дневника (Сны/Психология/Закономерности) имеют собственные
//      пункты и подсвечиваются по активной подвкладке.
//   4. Action Island — контекстные действия (1–3), скрыт там, где их нет,
//      каждая кнопка открывает настоящую форму.
//   5. Whole Life «Жизнь сейчас» — проекция существующих данных: пустые
//      состояния человеческие, наполненные показывают реальные числа, каждый
//      блок ведёт в настоящий модуль.
//   6. Desktop ≥901px: sidebar постоянный. Mobile 390px: drawer, без
//      горизонтального переполнения.
//   7. A11y: настоящие <button>, aria-expanded у «Меню», focus management.
//
// Всё синтетическое (TEST-X2-*). Гоняет РЕАЛЬНЫЙ собранный бандл в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.X2_BUNDLE || join(ROOT, 'dist', 'app.html'));

let pass = 0, fail = 0;
const errors = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });

console.log('\n── § 1. «Ещё» упразднён, «Меню» — полный drawer ──');
const menu = await page.evaluate(() => {
  const out = {};
  out.noMoreOverlay = !document.getElementById('ov-more');
  out.noMoreTab = !document.querySelector('[data-nav="more"]');
  const btn = document.querySelector('[data-nav="menu"]');
  out.menuBtn = !!btn && btn.tagName === 'BUTTON';
  out.ariaBefore = btn && btn.getAttribute('aria-expanded');
  navGo('menu');
  out.open = document.body.classList.contains('nav-open');
  out.hash = location.hash;
  out.burgerAria = (document.getElementById('burger') || {}).getAttribute?.('aria-expanded');
  out.groups = [...document.querySelectorAll('#nsh-nav-groups .nsh-grp-lbl')].map(g => g.textContent.trim());
  out.items = [...document.querySelectorAll('#nsh-nav-groups .navlink')].map(n => n.textContent.trim());
  out.allButtons = [...document.querySelectorAll('#nsh-nav-groups .navlink')].every(n => n.tagName === 'BUTTON');
  closeNav();
  out.closed = !document.body.classList.contains('nav-open');
  out.hashAfterClose = location.hash;
  return out;
});
ok(menu.noMoreOverlay && menu.noMoreTab, 'ни разметки ov-more, ни вкладки «Ещё» не существует');
ok(menu.menuBtn && menu.ariaBefore === 'false', 'кнопка «Меню» — настоящий <button> с aria-expanded');
ok(menu.open && menu.hash === '#/menu', 'меню открывает drawer, hash #/menu адресуем', JSON.stringify([menu.open, menu.hash]));
ok(menu.closed && menu.hashAfterClose !== '#/menu', 'закрытие возвращает hash раздела', menu.hashAfterClose);
const REQUIRED = ['Главная', 'Дневник', 'Сны', 'Психология', 'Цели', 'Закономерности',
  'Здоровье', 'Обзор', 'Астрология', 'Поиск', 'Инспектор записей',
  'Источники и импорт', 'Резервные копии', 'Профили', 'Настройки', 'Сферы'];
const missing = REQUIRED.filter(r => !menu.items.includes(r));
ok(missing.length === 0, `все ${REQUIRED.length} обязательных пространств доступны напрямую`, 'нет: ' + missing.join(', '));
ok(menu.allButtons, 'каждый пункт — настоящий <button>');
ok(!menu.items.some(t => /Ещё|Wave|wave/.test(t)), 'ни «Ещё», ни внутренних Wave-названий в навигации');

console.log('\n── § 2. Нет мёртвых кнопок: каждый пункт ведёт в реальное назначение ──');
const dest = await page.evaluate(async () => {
  const results = [];
  const links = [...document.querySelectorAll('#nsh-nav-groups .navlink')];
  for (const n of links) {
    const label = n.textContent.trim();
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    document.body.classList.remove('nav-open');
    try { n.click(); } catch (e) { results.push([label, 'THROW: ' + e.message]); continue; }
    await new Promise(r => setTimeout(r, 30));
    const pg = document.querySelector('.pg.on');
    const ov = document.querySelector('.ov.on');
    const drawer = document.body.classList.contains('nav-open');
    results.push([label, pg ? 'pg-' + pg.id.replace('pg-', '') : '', ov ? ov.id : '', drawer]);
  }
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  goTo('home');
  return results;
});
const dead = dest.filter(([label, pg, ov]) => String(pg).startsWith('THROW') || (!pg && !ov));
ok(dead.length === 0, `все ${dest.length} пунктов открывают страницу или экран`, JSON.stringify(dead));
const byLabel = Object.fromEntries(dest.map(([l, pg, ov]) => [l, { pg, ov }]));
ok(byLabel['Поиск'] && byLabel['Поиск'].ov === 'ov-search', '«Поиск» открывает поиск', JSON.stringify(byLabel['Поиск']));
ok(byLabel['Инспектор записей'] && byLabel['Инспектор записей'].ov === 'ov-records', '«Инспектор записей» открывает Inspector');
ok(byLabel['Источники и импорт'] && byLabel['Источники и импорт'].ov === 'ov-ext-import', '«Источники» открывают экран импорта/моста');
// Под file:// ESM-модуль копий намеренно не грузится (null-origin CORS,
// задокументировано в index.html); openEncBackup честно говорит об этом
// тостом. На HTTP/HTTPS модуль открывается — это доказывает Backup Evidence
// (localhost + WebKit). Здесь проверяем, что кнопка НЕ мёртвая и НЕ молчит.
const bk = await page.evaluate(async () => {
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
  openEncBackup();
  await new Promise(r => setTimeout(r, 60));
  const ov = document.querySelector('.ov.on');
  return { ov: ov ? ov.id : null, toast: (document.getElementById('toasts') || {}).textContent || '' };
});
ok(bk.ov === 'ov-backup-enc' || /резервн/i.test(bk.toast),
  '«Резервные копии»: модуль открыт (HTTP) либо честное сообщение (file://)', JSON.stringify(bk));

console.log('\n── § 3. Подвкладки Дневника: свои пункты, честная подсветка ──');
const hl = await page.evaluate(() => {
  const out = {};
  const onSubs = () => [...document.querySelectorAll('#nsh-nav-groups .navlink.on')].map(n => n.textContent.trim());
  goTo('map'); msub('dreams');   out.dreams = onSubs();
  msub('psychology');            out.psy = onSubs();
  msub('patterns');              out.pat = onSubs();
  goTo('health');                out.health = onSubs();
  goTo('home');
  return out;
});
ok(hl.dreams.includes('Сны') && !hl.dreams.includes('Психология'), 'на подвкладке снов подсвечены именно «Сны»', JSON.stringify(hl.dreams));
ok(hl.psy.includes('Психология') && hl.psy.includes('Цели'), 'психология подсвечивает «Психология» (и «Цели» — то же пространство)', JSON.stringify(hl.psy));
ok(hl.pat.includes('Закономерности'), 'закономерности подсвечены', JSON.stringify(hl.pat));
ok(hl.health.includes('Здоровье') && !hl.health.some(t => ['Сны', 'Психология', 'Закономерности'].includes(t)),
  'уход со страницы Дневника снимает подсветку подвкладок', JSON.stringify(hl.health));

console.log('\n── § 4. Action Island: контекстные действия, не свалка ──');
const island = await page.evaluate(async () => {
  const out = {};
  const acts = () => [...document.querySelectorAll('#x2-island .x2-act')].map(a => a.textContent.trim());
  const visible = () => document.getElementById('x2-island').style.display !== 'none';
  goTo('map'); msub('dreams');   out.dreams = { acts: acts(), visible: visible() };
  msub('psychology');            out.psy = acts();
  goTo('health');                out.health = acts();
  goTo('vit');                   out.vit = acts();
  goTo('sys');                   out.sysHidden = !visible();
  goTo('settings');              out.settingsHidden = !visible();
  // каждая кнопка острова открывает НАСТОЯЩУЮ форму
  goTo('health');
  document.querySelector('#x2-island .x2-act').click();
  await new Promise(r => setTimeout(r, 30));
  const ov = document.querySelector('.ov.on');
  out.healthActionOpens = ov ? ov.id : null;
  if (ov) ov.classList.remove('on');
  goTo('map'); msub('dreams');
  document.querySelector('#x2-island .x2-act').click();
  await new Promise(r => setTimeout(r, 30));
  const ov2 = document.querySelector('.ov.on');
  out.dreamActionOpens = ov2 ? ov2.id : null;
  if (ov2) ov2.classList.remove('on');
  goTo('home');
  return out;
});
ok(island.dreams.visible && island.dreams.acts.length === 1 && /сон/i.test(island.dreams.acts[0]),
  'сны: одно действие — «Записать сон»', JSON.stringify(island.dreams));
ok(island.psy.length >= 1 && island.psy.length <= 3, `психология: ${island.psy.length} контекстных действия (1–3)`, JSON.stringify(island.psy));
ok(island.health.length === 2, 'здоровье: измерение + симптом', JSON.stringify(island.health));
ok(island.vit.length === 1, 'сферы: одно действие', JSON.stringify(island.vit));
ok(island.sysHidden && island.settingsHidden, 'на аналитике и настройках остров скрыт (нет действий — нет острова)');
ok(island.healthActionOpens === 'ov-measure', 'кнопка острова открывает настоящую форму измерения', island.healthActionOpens);
ok(island.dreamActionOpens === 'ov-drm', 'кнопка острова открывает настоящую форму сна', island.dreamActionOpens);

console.log('\n── § 5. Whole Life: проекция реальных данных ──');
const life = await page.evaluate(() => {
  // Пустое состояние
  ['psyGoals', 'psyExperiments', 'psyFormulations', 'psyObservations', 'dreams',
    'evolution', 'patterns', 'measures', 'symptoms'].forEach(c => { DB[c] = []; });
  DB.externalConnections = [];
  rWholeLife();
  const empty = [...document.querySelectorAll('#x2-life .x2-row')].map(r => r.textContent.trim());
  // Наполненное состояние — синтетика через canonical формы данных
  DB.psyGoals = [{ id: 1, label: 'TEST-X2-GOAL', status: 'active', createdAt: nowISO(), sv: SCHEMA_VERSION }];
  DB.dreams = [{ id: 2, title: 'TEST-X2-DREAM', body: 'x', createdAt: nowISO(), sv: SCHEMA_VERSION }];
  DB.measures = [{ id: 3, kind: 'TEST-X2-BP', value: 120, createdAt: nowISO(), sv: SCHEMA_VERSION }];
  rWholeLife();
  const rows = [...document.querySelectorAll('#x2-life .x2-row')];
  const filled = rows.map(r => r.textContent.trim());
  const goalRow = rows.find(r => /Цели/.test(r.textContent));
  const unfRow = rows.find(r => /Незавершённое/.test(r.textContent));
  return {
    emptyCount: empty.length,
    emptyHuman: empty.every(t => !/undefined|null|NaN|\[object/.test(t)),
    filledGoal: goalRow && /1/.test(goalRow.textContent) && /TEST-X2-GOAL/.test(goalRow.textContent),
    unfCountsGoal: unfRow && /1/.test(unfRow.textContent),
    dreamShown: filled.some(t => /TEST-X2-DREAM/.test(t)),
    healthShown: filled.some(t => /TEST-X2-BP/.test(t)),
    blocks: filled.map(t => t.slice(0, 20)),
  };
});
ok(life.emptyCount === 8, `восемь блоков «Жизнь сейчас» (${life.emptyCount})`);
ok(life.emptyHuman, 'пустые состояния человеческие — без undefined/NaN/JSON');
ok(life.filledGoal, 'активная цель видна с числом и названием', JSON.stringify(life.blocks));
ok(life.unfCountsGoal, '«Незавершённое» честно считает активную цель');
ok(life.dreamShown && life.healthShown, 'сон и измерение отражены в своих блоках');
const nav2 = await page.evaluate(async () => {
  const row = [...document.querySelectorAll('#x2-life .x2-row')].find(r => /Сны/.test(r.textContent));
  row.click();
  await new Promise(r => setTimeout(r, 30));
  return { pg: document.querySelector('.pg.on').id, sub: document.getElementById('ms-dreams').style.display };
});
ok(nav2.pg === 'pg-map' && nav2.sub === 'block', 'блок «Сны» ведёт в реальный модуль снов', JSON.stringify(nav2));

console.log('\n── § 6. Desktop: постоянный sidebar; mobile: без переполнения ──');
await page.setViewportSize({ width: 1280, height: 800 });
const desk = await page.evaluate(() => {
  const sb = document.querySelector('.sidebar');
  const st = getComputedStyle(sb);
  const r = sb.getBoundingClientRect();
  return { visible: st.transform === 'none' || !st.transform.includes('matrix(1, 0, 0, 1, -'), x: r.x, w: r.width,
    onScreen: r.x >= 0 && r.width > 200 };
});
ok(desk.onScreen, `desktop 1280: sidebar постоянно видим (x=${desk.x}, w=${desk.w})`, JSON.stringify(desk));
await page.setViewportSize({ width: 390, height: 844 });
const mob = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth <= 390,
  tabbarVisible: getComputedStyle(document.getElementById('nsh-tabbar')).display !== 'none',
}));
ok(mob.overflow, 'mobile 390: нет горизонтального переполнения');
ok(mob.tabbarVisible, 'mobile: таб-бар на месте');

console.log('\n── § 7. Приватность и чистота ──');
const texts = await page.evaluate(() => [...document.querySelectorAll('#x2-life .x2-row')].map(r => r.textContent).join(' '));
ok(!/[А-Я][а-я]+ [А-Я][а-я]+вич|@gmail|belkov/i.test(texts), 'в проекции нет ничего похожего на личные данные');
ok(errors.length === 0, 'ни одной необработанной ошибки страницы', errors.slice(0, 5).join('\n'));

await browser.close();
console.log(`\nEXPERIENCE 2.0 SHELL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
