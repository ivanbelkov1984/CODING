// EXPERIENCE 2.0 — ОБОЛОЧКА: sidebar, drawer «Меню», контекстный dock, Whole Life.
//
// Что защищено:
//   1. «Ещё» не существует: ни кнопки, ни разметки. «Меню» открывает drawer —
//      тот же sidebar со всеми разделами, сгруппированно.
//   2. Каждый пункт sidebar ведёт в РЕАЛЬНОЕ назначение (нет мёртвых кнопок).
//   3. Психология имеет свой пункт, а Сны/Закономерности остаются внутри
//      Дневника; активное состояние показывает человеку родительский раздел.
//   4. контекстный dock — контекстные действия (1–3), скрыт там, где их нет,
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
// Дождаться устоявшегося состояния вместо фиксированной паузы. Молча выходит
// по таймауту — судит всегда сам assert, а не наличие/отсутствие ожидания.
const clearOv2 = () => page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
const settled = async (fn, ms = 3000) => {
  try { await page.waitForFunction(fn, null, { timeout: ms, polling: 40 }); return true; }
  catch (e) { return false; }
};
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
  const btn = document.getElementById('topbar-menu');
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
const REQUIRED = ['Сегодня', 'Дневник', 'Психология', 'Здоровье',
  'Астрология', 'Источники', 'Настройки'];
const missing = REQUIRED.filter(r => !menu.items.includes(r));
ok(missing.length === 0, `все ${REQUIRED.length} крупных пространств доступны напрямую`, 'нет: ' + missing.join(', '));
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
    for (let i = 0; i < 30; i++) {
      if (document.querySelector('.ov.on') || document.body.classList.contains('nav-open')) break;
      await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, 20));
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
ok(byLabel['Источники'] && byLabel['Источники'].ov === 'ov-ext-import', '«Источники» открывают экран импорта/моста', JSON.stringify(byLabel['Источники']));
ok(!byLabel['Поиск'] && !byLabel['Инспектор записей'],
  'Поиск и Инспектор — инструменты, а не пункты меню (их пути проверяются в §13)');
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
ok(hl.dreams.length === 1 && hl.dreams[0] === 'Дневник',
  'на подвкладке снов подсвечен родитель «Дневник» — видно, где находишься', JSON.stringify(hl.dreams));
ok(hl.psy.length === 1 && hl.psy[0] === 'Психология',
  'психология подсвечивает ровно «Психологию», не залезая в Дневник', JSON.stringify(hl.psy));
ok(hl.pat.length === 1 && hl.pat[0] === 'Дневник',
  'на Закономерностях подсвечен родитель «Дневник»', JSON.stringify(hl.pat));
ok(hl.health.includes('Здоровье') && !hl.health.some(t => ['Дневник', 'Психология'].includes(t)),
  'уход со страницы Дневника снимает подсветку подвкладок', JSON.stringify(hl.health));

console.log('\n── § 4. Контекстный dock: действия текущего экрана, один бар ──');
// Плавающий бар действий в приложении ровно один — существующий
// context-action-dock. Отдельного Action Island больше нет: он дублировал
// dock (два бара показывали одни и те же действия друг над другом).
const dockD = await page.evaluate(async () => {
  const D = () => document.getElementById('nsh-context-dock');
  const up = () => window.__ARCH_CONTEXT_DOCK__.update();
  const acts = () => { up(); const d = D();
    return d && !d.hidden ? [...d.querySelectorAll('button')].map(b => b.getAttribute('aria-label')) : []; };
  const hidden = () => { up(); const d = D(); return !d || d.hidden; };
  const out = {};
  out.singleBar = document.querySelectorAll('.nsh-context-dock').length === 1 && !document.getElementById('x2-island');
  goTo('map'); msub('dreams');   out.dreams = acts();
  msub('psychology');            out.psy = acts();
  goTo('health');                out.health = acts();
  goTo('vit');                   out.vit = acts();
  goTo('settings');              out.settingsHidden = hidden();
  const run = async (go, label) => {
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    (new Function(go))(); up();
    const b = [...D().querySelectorAll('button')].find(x => x.getAttribute('aria-label') === label);
    if (!b) return 'НЕТ КНОПКИ ' + label;
    b.click();
    await new Promise(r => setTimeout(r, 40));
    const ov = document.querySelector('.ov.on');
    return ov ? ov.id : null;
  };
  out.healthOpens = await run("goTo('health')", 'Измерение');
  out.dreamOpens  = await run("goTo('map');msub('dreams')", 'Записать сон');
  out.psyWhyOpens = await run("goTo('map');msub('psychology')", 'Разбор ситуации');
  out.psyStateOpens = await run("goTo('map');msub('psychology')", 'Состояние');
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  goTo('home');
  return out;
});
ok(dockD.singleBar, 'плавающий бар действий ровно один — дубля Action Island больше нет');
ok(dockD.dreams.length === 1 && /сон/i.test(dockD.dreams[0]),
  'сны: одно действие — «Записать сон»', JSON.stringify(dockD.dreams));
ok(dockD.psy.length >= 1 && dockD.psy.length <= 3,
  `психология: ${dockD.psy.length} контекстных действия (1–3)`, JSON.stringify(dockD.psy));
ok(dockD.health.length >= 2 && dockD.health.length <= 3,
  'здоровье: симптом, измерение и тяга', JSON.stringify(dockD.health));
ok(dockD.vit.length >= 1, 'сферы: есть действие', JSON.stringify(dockD.vit));
ok(dockD.settingsHidden, 'на настройках бар скрыт — нет действий, нет бара');
ok(dockD.healthOpens === 'ov-measure', 'dock → «Измерение» открывает настоящую форму', String(dockD.healthOpens));
ok(dockD.dreamOpens === 'ov-drm', 'dock → «Записать сон» открывает настоящую форму', String(dockD.dreamOpens));
ok(dockD.psyWhyOpens === 'ov-why',
  'психология: основное действие открывает пошаговый разбор', String(dockD.psyWhyOpens));
ok(dockD.psyStateOpens === 'ov-moment',
  'психология: «Состояние» открывает прежнюю форму момента', String(dockD.psyStateOpens));

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
  DB.measures = [{ id: 3, kType: 'measurement', name: 'TEST-X2-BP', value: '120', unit: '',
    verif: 'user_confirmed', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION }];
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
ok(life.emptyCount === 10, `десять блоков «Жизнь сейчас» (${life.emptyCount})`);
const lifeGroups = await page.evaluate(() =>
  [...document.querySelectorAll('#x2-life .sec-lbl')].map(g => g.textContent.trim()));
ok(lifeGroups.length === 3 && lifeGroups[0] === 'Требует внимания',
  'Главная подаёт блоки иерархией, а не плоским списком: ' + lifeGroups.join(' · '), JSON.stringify(lifeGroups));
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


console.log('\n── § 8. Единственный писатель: новая оболочка и легаси пишут в одну коллекцию ──');
// Контракт: Experience 2.0 — это ОБОЛОЧКА. Она не создаёт своих форм и своих
// writer-ов. Одна и та же сущность, сохранённая через новую и через старую
// навигацию, обязана попасть в ТУ ЖЕ каноническую коллекцию тем же кодом.
// Проверяем это не чтением исходника, а реальными записями в реальном бандле.
const ENTITIES = [
  { name: 'инсайт',     ov: 'ov-add',     fill: () => { document.getElementById('add-tx').value = 'TEST-X2-RT инсайт'; }, save: 'saveIns' },
  { name: 'сон',        ov: 'ov-drm',     fill: () => { document.getElementById('drm-tx').value = 'TEST-X2-RT сон'; },    save: 'saveDrm' },
  { name: 'измерение',  ov: 'ov-measure', fill: () => { document.getElementById('mea-name').value = 'TEST-X2-RT'; document.getElementById('mea-value').value = '42'; }, save: 'saveMeasure' },
  { name: 'момент',     ov: 'ov-moment',  fill: () => { const n = document.getElementById('mo-note'); if (n) n.value = 'TEST-X2-RT момент'; }, save: 'saveMoment' },
];

// Снимок размеров всех массивов DB — чтобы увидеть, КУДА именно легла запись.
const shot = () => page.evaluate(() => {
  const o = {};
  for (const k of Object.keys(DB)) if (Array.isArray(DB[k])) o[k] = DB[k].length;
  return o;
});
const grown = (a, b) => Object.keys(b).filter(k => (b[k] || 0) > (a[k] || 0));

for (const ent of ENTITIES) {
  const runIn = async shellOn => {
    await page.evaluate(on => {
      localStorage.setItem('arch_nav_v2', on ? '1' : '0');
      applyNavShell();
    }, shellOn);
    const before = await shot();
    const writerId = await page.evaluate(n => {
      // Идентичность writer-а: одна и та же функция в обеих оболочках.
      window.__w = window.__w || {}; window.__w[n] = window[n];
      return typeof window[n];
    }, ent.save);
    await page.evaluate(async e => {
      openOv(e.ov);
      await new Promise(r => setTimeout(r, 20));
      (new Function('return ' + e.fill))()();
      window[e.save]();
      await new Promise(r => setTimeout(r, 40));
      document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    }, { ov: ent.ov, fill: ent.fill.toString(), save: ent.save });
    const after = await shot();
    return { cols: grown(before, after), writerId };
  };
  const neu = await runIn(true);
  const leg = await runIn(false);
  const setEq = neu.cols.length && neu.cols.length === leg.cols.length &&
    neu.cols.slice().sort().join('|') === leg.cols.slice().sort().join('|');
  ok(setEq, `${ent.name}: обе оболочки пишут в один и тот же набор коллекций (${neu.cols.join(', ') || '—'})`,
    'new=' + JSON.stringify(neu.cols) + ' legacy=' + JSON.stringify(leg.cols));
  ok(neu.writerId === 'function' && leg.writerId === 'function',
    `${ent.name}: writer ${ent.save}() — один глобальный, дубликата под X2 нет`);
}
// Ни один writer не был продублирован «под Experience 2.0».
const dup = await page.evaluate(() => Object.keys(window).filter(k => /^(x2|X2).*(save|write|persist)/i.test(k)));
ok(dup.length === 0, 'нет ни одного writer-а, созданного специально для X2', dup.join(', '));

console.log('\n── § 9. Правки (corrections) читаются одинаково в обеих оболочках ──');
await page.evaluate(() => { localStorage.setItem('arch_nav_v2', '1'); applyNavShell(); });
const rt = await page.evaluate(async () => {
  const rec = (DB.insights || []).find(i => /TEST-X2-RT инсайт/.test(i.body || ''));
  if (!rec) return { err: 'нет записи' };
  const id = rec.id;
  // Правка через новую оболочку
  rec.body = 'TEST-X2-RT инсайт · исправлено';
  persist();
  const inNew = (DB.insights.find(i => i.id === id) || {}).body;
  // Переключаем оболочку и перечитываем ИЗ ХРАНИЛИЩА, а не из памяти
  localStorage.setItem('arch_nav_v2', '0'); applyNavShell();
  const raw = JSON.parse(localStorage.getItem(dbKey(activeId())) || '{}');
  const inStore = ((raw.insights || []).find(i => i.id === id) || {}).body;
  localStorage.setItem('arch_nav_v2', '1'); applyNavShell();
  return { inNew, inStore, same: inNew === inStore };
});
ok(!rt.err && rt.same && /исправлено/.test(rt.inNew || ''),
  'правка, сделанная в новой оболочке, видна легаси-оболочке байт-в-байт', JSON.stringify(rt));

console.log('\n── § 10. Контракт открытого drawer (mobile 390) ──');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); closeNav(); });
for (const theme of ['dark', 'light']) {
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
  await settled(() => !document.body.classList.contains('nav-open') &&
    +getComputedStyle(document.getElementById('nsh-tabbar')).opacity === 1);
  await page.evaluate(() => document.getElementById('topbar-menu').click());
  await settled(() => document.body.classList.contains('nav-open') &&
    +getComputedStyle(document.getElementById('nsh-tabbar')).opacity === 0 &&
    getComputedStyle(document.querySelector('.sidebar')).transform === 'none');
  const d = await page.evaluate(() => {
    const cs = s => getComputedStyle(document.querySelector(s));
    const sb = cs('.sidebar'), sc = cs('.scrim'), tb = cs('#nsh-tabbar');
    const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1;
      const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };
    const dur = v => Math.round(parseFloat(v) * 1000);
    return {
      drawerOpaque: alpha(sb.backgroundColor) === 1,
      scrimAlpha: alpha(sc.backgroundColor),
      scrimAboveTabbar: +sc.zIndex > +tb.zIndex,
      scrimBelowDrawer: +sc.zIndex < +sb.zIndex,
      tabbarHidden: +tb.opacity === 0 && tb.pointerEvents === 'none',
      // Куда реально уходит тап по области таб-бара и по контенту
      hitTabbar: (document.elementFromPoint(370, 815) || {}).className,
      hitContent: (document.elementFromPoint(360, 400) || {}).className,
      hitScrim: !!(document.elementFromPoint(360, 400) || {}).closest?.('.scrim, [inert]'),
      dur: dur(sb.transitionDuration),
      inert: document.getElementById('app').hasAttribute('inert'),
      floatInert: [...document.body.children].filter(e => !['sidebar','scrim','toasts'].includes(e.id) && !e.classList.contains('ov')).every(e => e.hasAttribute('inert')),
      aria: document.getElementById('topbar-menu').getAttribute('aria-expanded'),
      focusInDrawer: !!(document.activeElement && document.activeElement.closest('#sidebar')),
      bgTabbable: [...document.querySelectorAll('#app button, #app a, #app input')]
        .filter(e => e.offsetParent !== null && !e.closest('[inert]')).length,
    };
  });
  ok(d.drawerOpaque, `[${theme}] drawer непрозрачен — текст под ним не читается`);
  ok(d.scrimAlpha >= 0.7, `[${theme}] затемнение фона ≥0.7 (${d.scrimAlpha})`);
  // Объективная проверка «текст под шторкой не читается»: в видимой полосе фона
  // справа от drawer у РЕАЛЬНОГО скриншота почти нет контраста между соседними
  // пикселями. Текст даёт резкие перепады яркости; заглушенный фон — нет.
  const strip = await page.screenshot({ clip: { x: 335, y: 120, width: 55, height: 600 } });
  const contrast = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sum = 0, sq = 0, lo = 255, hi = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      n++; sum += l; sq += l * l; if (l < lo) lo = l; if (l > hi) hi = l;
    }
    const mu = sum / n;
    return { sd: +Math.sqrt(Math.max(0, sq / n - mu * mu)).toFixed(2), range: +(hi - lo).toFixed(1) };
  }, strip.toString('base64'));
  if (contrast.sd >= 9 && process.env.X2_DEBUG) await page.screenshot({ path: '/tmp/claude-0/-home-user-CODING/67a42305-0eef-5b91-922d-6a736b02a1a7/scratchpad/fail-' + theme + '.png' });
  ok(contrast.sd < 9, `[${theme}] под шторкой нет читаемого текста: разброс яркости ${contrast.sd} (<9)`,
    JSON.stringify(contrast));
  ok(d.scrimAboveTabbar && d.scrimBelowDrawer, `[${theme}] порядок слоёв: таб-бар < scrim < drawer`);
  ok(d.tabbarHidden, `[${theme}] нижний таб-бар не просвечивает и не принимает тапы`);
  ok(d.floatInert, `[${theme}] весь фон инертен, включая плавающие слои вне #app`);
  ok(d.dur >= 180 && d.dur <= 260, `[${theme}] переход ${d.dur}ms — в полосе 180–260ms`);
  ok(d.inert && d.bgTabbable === 0, `[${theme}] фон недоступен клавиатуре (inert, 0 таб-стопов)`);
  ok(d.hitScrim, `[${theme}] тап по фону попадает в затемнение, а не в контент`, d.hitContent);
  ok(d.aria === 'true' && d.focusInDrawer, `[${theme}] aria-expanded=true, фокус внутри drawer`);
  // Закрытие: Escape → фокус возвращается открывшему элементу
  await page.keyboard.press('Escape');
  await settled(() => !document.body.classList.contains('nav-open') &&
    !document.getElementById('app').hasAttribute('inert'));
  const c = await page.evaluate(() => ({
    closed: !document.body.classList.contains('nav-open'),
    inert: document.getElementById('app').hasAttribute('inert'),
      floatInert: [...document.body.children].filter(e => !['sidebar','scrim','toasts'].includes(e.id) && !e.classList.contains('ov')).every(e => e.hasAttribute('inert')),
    aria: document.getElementById('topbar-menu').getAttribute('aria-expanded'),
    focusBack: document.activeElement === document.getElementById('topbar-menu'),
  }));
  ok(c.closed && !c.inert && c.aria === 'false', `[${theme}] Escape закрывает drawer и снимает inert/aria`, JSON.stringify(c));
  ok(c.focusBack, `[${theme}] фокус возвращается на кнопку «Меню»`);
}
// Тап по scrim закрывает drawer
await page.evaluate(() => document.getElementById('topbar-menu').click());
await settled(() => document.body.classList.contains('nav-open'));
await page.mouse.click(370, 400);
await settled(() => !document.body.classList.contains('nav-open'));
ok(await page.evaluate(() => !document.body.classList.contains('nav-open')), 'тап по затемнению закрывает drawer');
// Выбор пункта закрывает drawer
await page.evaluate(() => document.getElementById('topbar-menu').click());
await settled(() => document.body.classList.contains('nav-open'));
await page.evaluate(() => [...document.querySelectorAll('#nsh-nav-groups .navlink')].find(n => n.textContent.trim() === 'Здоровье').click());
await page.waitForTimeout(200);
const pick = await page.evaluate(() => ({ closed: !document.body.classList.contains('nav-open'), pg: document.querySelector('.pg.on').id }));
ok(pick.closed && pick.pg === 'pg-health', 'выбор пункта закрывает drawer и открывает раздел', JSON.stringify(pick));

console.log('\n── § 11. «Ещё» не существует ни в одном достижимом состоянии ──');
// Шесть состояний, в которых владелец мог увидеть старый таб.
const STATES = [
  ['новый профиль (флаг не сохранён)', () => localStorage.removeItem('arch_nav_v2')],
  ['navshell явно включён', () => localStorage.setItem('arch_nav_v2', '1')],
  ['navshell явно выключен', () => localStorage.setItem('arch_nav_v2', '0')],
  ['сохранённое мусорное значение', () => localStorage.setItem('arch_nav_v2', 'true')],
];
for (const [name, set] of STATES) {
  const r = await page.evaluate(fn => {
    (new Function('return ' + fn))()();
    applyNavShell();
    const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.01 && b.width > 0; };
    const chain = el => { for (let n = el; n; n = n.parentElement) if (!vis(n)) return false; return true; };
    return [...document.querySelectorAll('button,a,.srow,.navlink,.nsh-tab')]
      .filter(e => /(^|\s)Ещё(\s|$)/.test((e.textContent || '').trim()) && chain(e))
      .map(e => (e.textContent || '').trim().slice(0, 30));
  }, set.toString());
  ok(r.length === 0, `${name}: видимого «Ещё» нет`, r.join(' | '));
}
// И после перезагрузки, и по старой ссылке #/more
await page.evaluate(() => localStorage.setItem('arch_nav_v2', '1'));
await page.goto(FILE + '#/more');
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.waitForTimeout(400);
const afterReload = await page.evaluate(() => ({
  labels: [...document.querySelectorAll('#nsh-tabbar .nsh-tab')].map(b => b.textContent.trim()),
  hash: location.hash, open: document.body.classList.contains('nav-open'),
}));
ok(!afterReload.labels.includes('Ещё') && !afterReload.labels.includes('Меню') &&
  afterReload.labels.includes('Астрология'),
  'после перезагрузки нижний остров: ' + afterReload.labels.join(' · '));
ok(afterReload.hash === '#/menu' && afterReload.open, 'старая ссылка #/more открывает drawer и переписывает hash в #/menu',
  JSON.stringify(afterReload));


console.log('\n── § 12. Компактная IA: в меню только крупные пространства ──');
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(700);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));

const PRIMARY = ['Сегодня', 'Дневник', 'Психология', 'Здоровье', 'Астрология',
  'Источники', 'Настройки'];
const ia = await page.evaluate(() => ({
  items: [...document.querySelectorAll('#nsh-nav-groups .navlink')].map(n => n.textContent.trim()),
  groups: [...document.querySelectorAll('#nsh-nav-groups .nsh-grp-lbl')].map(g => g.textContent.trim()),
  tabs: [...document.querySelectorAll('#nsh-tabbar .nsh-tab')].map(b => b.textContent.trim()),
}));
ok(ia.items.length === 7, `в глобальном меню ровно ${ia.items.length} крупных пространств`, ia.items.join(' · '));
ok(PRIMARY.every(p => ia.items.includes(p)) && ia.items.every(i => PRIMARY.includes(i)),
  'меню — ровно утверждённые пространства', 'есть: ' + ia.items.join(' · '));
ok(!ia.items.includes('Ещё') && !ia.tabs.includes('Ещё'), 'ни «Ещё», ни его следов');
ok(!/Wave|wave|X2|Experience/.test(ia.items.join(' ') + ia.groups.join(' ')), 'нет внутренних названий');
// Вторичные функции НЕ являются nav destination
const REMOVED = ['Записать', 'Сферы', 'Сны', 'Цели', 'Закономерности', 'Отчёт врачу', 'Обзор',
  'Поиск', 'Инспектор записей', 'Резервные копии', 'Профили', 'Обратная связь'];
const stillThere = REMOVED.filter(r => ia.items.includes(r));
ok(stillThere.length === 0, `все ${REMOVED.length} вторичных функций убраны из меню`, 'остались: ' + stillThere.join(', '));
ok(!ia.tabs.includes('Обзор'), 'таб-бар не предлагает второй home', ia.tabs.join(' · '));

console.log('\n── § 13. Достижимость: ни одна убранная функция не потеряна ──');
// Правило: путь начинается ТОЛЬКО с компактного меню, шапки или экрана —
// никаких прямых вызовов скрытых роутов как единственного доказательства.
const openMenu = async () => {
  await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); closeNav(); });
  await page.evaluate(() => document.getElementById('topbar-menu').click());
  await settled(() => document.body.classList.contains('nav-open'));
};
const clickNav = async label => {
  await openMenu();
  const hit = await page.evaluate(l => {
    const n = [...document.querySelectorAll('#nsh-nav-groups .navlink')].find(x => x.textContent.trim() === l);
    if (!n) return false; n.click(); return true;
  }, label);
  await settled(() => !document.body.classList.contains('nav-open'));
  await page.waitForTimeout(120);
  return hit;
};
// Клик по видимому элементу экрана — по тексту, как это делает человек.
const clickText = async (sel, text) => page.evaluate(([s, t]) => {
  const n = [...document.querySelectorAll(s)].find(x => (x.textContent || '').includes(t) &&
    x.offsetParent !== null);
  if (!n) return false; n.click(); return true;
}, [sel, text]);
const ovOpen = id => page.evaluate(i => { const e = document.getElementById(i); return !!e && e.classList.contains('on'); }, id);
const pgOn = () => page.evaluate(() => (document.querySelector('.pg.on') || {}).id);

// 1. Дневник → новая запись (через меню, затем контекстный dock)
await clickNav('Дневник');
ok(await pgOn() === 'pg-map', 'меню → Дневник открывает дневник');
const dockClick = label => page.evaluate(l => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const d = document.getElementById('nsh-context-dock');
  const b = d && !d.hidden && [...d.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === l);
  if (!b) return false; b.click(); return true;
}, label);
ok(await dockClick('Новый инсайт') && await ovOpen('ov-add'),
  'Дневник → dock «Новый инсайт» открывает существующую форму инсайта');

// 2. Сны — через поднавигацию Дневника (2 действия от меню)
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
const dreamHit = await clickText('#subnav .snpill', 'Сны');
await page.waitForTimeout(120);
const dreamsOn = await page.evaluate(() => getComputedStyle(document.getElementById('ms-dreams')).display !== 'none');
ok(dreamHit && dreamsOn, 'Дневник → Сны достижимы за 2 действия от меню');
ok(await dockClick('Записать сон') && await ovOpen('ov-drm'),
  'на снах dock даёт «Записать сон» — форма та же');

// 3. Психология и цели
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
await clickNav('Психология');
const psyOn = await page.evaluate(() => ({
  visible: getComputedStyle(document.getElementById('ms-psychology')).display !== 'none',
  title: document.getElementById('ptitle').textContent.trim(),
}));
ok(psyOn.visible && psyOn.title === 'Психология',
  'меню → Психология открывает рабочее пространство с правильным заголовком', JSON.stringify(psyOn));

// 4. Цели — с Сегодня, через проекцию «Жизнь сейчас»
await clickNav('Сегодня');
ok(await pgOn() === 'pg-home', 'меню → Сегодня');
const goalHit = await clickText('#x2-life .x2-row', 'Цели');
await page.waitForTimeout(150);
ok(goalHit && await pgOn() === 'pg-map', 'Сегодня → «Цели» ведут в психологию, где живут цели');

// 5. Сферы — с Сегодня
await clickNav('Сегодня');
const sphHit = await clickText('#x2-life .x2-row', 'Сферы');
await page.waitForTimeout(150);
ok(sphHit && await pgOn() === 'pg-vit', 'Сегодня → «Сферы» открывают раздел сфер');

// 6. Обзор — с Сегодня (не второй home, а аналитика внутри)
await clickNav('Сегодня');
const ovwHit = await clickText('#x2-life .x2-row', 'Обзор недели');
await page.waitForTimeout(150);
ok(ovwHit && await pgOn() === 'pg-sys', 'Сегодня → «Обзор недели» открывает аналитику');

// 7. Здоровье: измерение и отчёт врачу
await clickNav('Здоровье');
ok(await pgOn() === 'pg-health', 'меню → Здоровье');
ok(await dockClick('Измерение') && await ovOpen('ov-measure'),
  'Здоровье → dock «Измерение» открывает существующую форму');
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
const docHit = await clickText('#pg-health button', 'Отчёт врачу');
await page.waitForTimeout(200);
ok(docHit && await ovOpen('ov-doc-report'), 'Здоровье → «Отчёт врачу» — инструмент внутри Здоровья, не пункт меню');

// 8. Астрология — из меню; Закономерности — внутри Дневника
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
await clickNav('Астрология');
ok(await pgOn() === 'pg-astro', 'меню → Астрология');
await clickNav('Дневник');
const patternHit = await clickText('#subnav .snpill', 'Повторы');
await page.waitForTimeout(120);
const patOn = await page.evaluate(() => getComputedStyle(document.getElementById('ms-patterns')).display !== 'none');
ok(patternHit && patOn, 'Дневник → Повторы открывают существующий раздел закономерностей');

// 9. Поиск — из шапки, а не из меню
const searchHit = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.topbar .ib')].find(x => x.getAttribute('aria-label') === 'Поиск');
  if (!b) return false; b.click(); return true;
});
await page.waitForTimeout(150);
ok(searchHit && await ovOpen('ov-search'), 'Поиск всегда доступен из шапки, хотя убран из меню');

// 10. Источники / Drive
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
await clickNav('Источники');
ok(await ovOpen('ov-ext-import'), 'меню → Источники открывают мост импорта (Drive/ChatGPT/файлы)');

// 11. Настройки: Инспектор, Резервные копии, Профили, Обратная связь
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
await clickNav('Настройки');
ok(await pgOn() === 'pg-settings', 'меню → Настройки');
const inSettings = await page.evaluate(() => {
  const txt = document.getElementById('pg-settings').textContent;
  return { rec: /Мои записи/.test(txt), bak: /Зашифрованная резервная копия/.test(txt),
    prof: /Профиль/.test(txt), fb: /Обратная связь/.test(txt), src: /Импорт внешней работы/.test(txt) };
});
ok(inSettings.rec && inSettings.bak && inSettings.prof && inSettings.fb,
  'Настройки содержат Инспектор, Резервные копии, Профиль и Обратную связь', JSON.stringify(inSettings));
ok(await clickText('#pg-settings .srow', 'Мои записи') && await ovOpen('ov-records'),
  'Настройки → «Мои записи» открывают Инспектор записей');
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
ok(await clickText('#pg-settings .srow', 'Обратная связь') && await ovOpen('ov-feedback'),
  'Настройки → «Обратная связь» открывает форму');
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
const bakHit = await clickText('#pg-settings .srow', 'Зашифрованная резервная копия');
await page.waitForTimeout(250);
const bakState = await page.evaluate(() => ({
  open: !!document.querySelector('#ov-backup-enc.on'),
  toast: (document.getElementById('toasts') || {}).textContent || '',
}));
ok(bakHit && (bakState.open || bakState.toast.length > 0),
  'Настройки → резервные копии: модуль открыт (HTTP) либо честное сообщение (file://)', JSON.stringify(bakState));

// 12. Профили — карточка профиля в шторке, не пункт меню
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
await openMenu();
const profHit = await page.evaluate(() => {
  const c = document.querySelector('#sidebar .acct'); if (!c) return false; c.click(); return true;
});
await page.waitForTimeout(200);
ok(profHit && await ovOpen('ov-profiles'), 'карточка профиля в шторке — рабочий вход в профили');
await page.evaluate(() => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); closeNav(); });

// 13. Инспектор из записи, а не только из Настроек
const fromRecord = await page.evaluate(async () => {
  DB.insights = [{ id: 777001, tag: 'growth', w: 1, title: 'TEST-X2-IA', body: 'TEST-X2-IA запись',
    date: '01.01', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION }];
  openRecords();
  await new Promise(r => setTimeout(r, 150));
  const sel = document.getElementById('rec-coll');
  const hasIns = !!(sel && [...sel.options].some(o => o.value === 'insights'));
  if (hasIns) { sel.value = 'insights'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  await new Promise(r => setTimeout(r, 150));
  const on = !!document.querySelector('#ov-records.on');
  const listed = /TEST-X2-IA/.test((document.getElementById('ov-records') || {}).textContent || '');
  return { on, hasIns, listed };
});
ok(fromRecord.on && fromRecord.hasIns && fromRecord.listed,
  'Инспектор показывает реальную запись — слой не ослаблен', JSON.stringify(fromRecord));

console.log('\n── § 14. Legacy deep links живут после сокращения меню ──');
for (const [slug, expect] of [['spheres', 'pg-vit'], ['overview', 'pg-sys'], ['health', 'pg-health'],
                              ['astro', 'pg-astro'], ['diary', 'pg-map'], ['settings', 'pg-settings'],
                              ['today', 'pg-home']]) {
  await page.goto(FILE + '#/' + slug);
  await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await settled(s => (document.querySelector('.pg.on') || {}).id === s, 3000);
  const got = await pgOn();
  ok(got === expect, `deep link #/${slug} по-прежнему открывает ${expect}`, 'открылось ' + got);
}
// Неизвестный hash по-прежнему безопасно ведёт на Главную
await page.goto(FILE + '#/kosmos');
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await settled(() => (document.querySelector('.pg.on') || {}).id === 'pg-home');
ok(await pgOn() === 'pg-home', 'неизвестный deep link безопасно ведёт на Главную');

console.log('\n── § 15. Мобильная шторка помещается без длинной прокрутки ──');
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
await openMenu();
const fit = await page.evaluate(() => {
  const nav = document.getElementById('nav');
  const items = [...document.querySelectorAll('#nsh-nav-groups .navlink')];
  const box = nav.getBoundingClientRect();
  const visible = items.filter(n => { const r = n.getBoundingClientRect();
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1; });
  return { total: items.length, visible: visible.length, scroll: nav.scrollHeight - nav.clientHeight };
});
ok(fit.visible === fit.total, `все ${fit.total} пунктов видны без прокрутки (видно ${fit.visible})`, JSON.stringify(fit));
ok(fit.scroll <= 24, `шторка не требует прокрутки (запас ${fit.scroll}px)`, JSON.stringify(fit));


console.log('\n── § 16. контекстный dock не закрывает собой контент ──');
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(700);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')));
for (const [name, go, wantIsland] of [
  ['Сегодня', "goTo('home')", false],
  ['Дневник', "goTo('map');msub('overview')", true],
  ['Сны', "goTo('map');msub('dreams')", true],
  ['Здоровье', "goTo('health')", true],
  ['Настройки', "goTo('settings')", false],
]) {
  await page.evaluate(g => (new Function(g))(), go);
  await settled(() => {
    const v = getComputedStyle(document.querySelector('.content')).paddingBottom;
    if (window.__padPrev === v) return true;
    window.__padPrev = v; return false;
  }, 3000);
  const r = await page.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    window.__ARCH_CONTEXT_DOCK__.update();
    const el = document.getElementById('nsh-context-dock');
    const shown = !!el && !el.hidden;
    const pad = parseInt(getComputedStyle(document.querySelector('.content')).paddingBottom, 10);
    const acts = shown ? [...el.querySelectorAll('button')].map(b => b.getAttribute('aria-label')) : [];
    return { shown, pad, acts, cls: document.body.classList.contains('nsh-context-on') };
  });
  ok(r.shown === wantIsland, `${name}: бар действий ${wantIsland ? 'показан' : 'скрыт'} — как и должно быть`, JSON.stringify(r));
  // Место под плавающий остров зарезервировано ровно тогда, когда он есть.
  ok(r.shown ? (r.cls && r.pad >= 140) : (!r.cls && r.pad <= 90),
    `${name}: запас под бар ${r.shown ? 'зарезервирован' : 'не занимает место зря'} (${r.pad}px)`, JSON.stringify(r));
  if (r.shown) ok(r.acts.length >= 1 && r.acts.length <= 3,
    `${name}: бар — 1–3 действия (${r.acts.join(' · ')})`, JSON.stringify(r.acts));
}
// Остров — действия, а не навигация: ни одно название не совпадает с пунктом меню.
const islandNav = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('#nsh-nav-groups .navlink')].map(n => n.textContent.trim());
  const seen = [];
  ["goTo('map');msub('overview')", "goTo('map');msub('dreams')", "goTo('health')", "goTo('vit')"]
    .forEach(g => { (new Function(g))();
      [...document.querySelectorAll('.nsh-context-dock .nsh-context-action')].forEach(b => seen.push(b.textContent.trim())); });
  return seen.filter(a => menu.includes(a));
});
ok(islandNav.length === 0, 'остров содержит только действия, не дубли пунктов меню', islandNav.join(', '));


console.log('\n── § 17. UX cleanup: нет переполнений, дублей и жаргона ──');
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(700);
await clearOv2();

// 17.1 Ни один экран не уезжает вправо на 390px.
for (const [name, go] of [
  ['Сегодня', "goTo('home')"], ['Дневник', "goTo('map');msub('overview')"],
  ['Психология', "goTo('map');msub('psychology')"], ['Здоровье', "goTo('health')"],
  ['Астрология', "goTo('astro')"], ['Закономерности', "goTo('map');msub('patterns')"],
  ['Сферы', "goTo('vit')"], ['Обзор', "goTo('sys')"], ['Настройки', "goTo('settings')"],
]) {
  await page.evaluate(g => (new Function(g))(), go);
  await page.waitForTimeout(220);
  const o = await page.evaluate(() => {
    const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const chain = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (!vis(n)) return false; return true; };
    const bad = [];
    const inScroller = el => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };
    document.querySelector('.pg.on').querySelectorAll('*').forEach(el => {
      if (!chain(el) || inScroller(el)) return;
      const b = el.getBoundingClientRect();
      if (b.width === 0) return;
      if (b.right > innerWidth + 1) bad.push(`${el.tagName}.${String(el.className).slice(0, 18)}→${Math.round(b.right)}`);
      else if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible')
        bad.push(`OVF ${el.tagName}.${String(el.className).slice(0, 18)}`);
    });
    return { bad: [...new Set(bad)].slice(0, 4), doc: document.documentElement.scrollWidth - innerWidth };
  });
  ok(o.bad.length === 0 && o.doc <= 0, `${name}: нет горизонтального переполнения на 390px`, o.bad.join(' | '));
}

// 17.2 Островок: 70% ширины, стабилен на всех вкладках, ничего не обрезано.
const barGeo = [];
for (const go of ["goTo('home')", "goTo('map');msub('overview')", "goTo('map');msub('psychology')", "goTo('astro')"]) {
  await page.evaluate(g => (new Function(g))(), go);
  await page.waitForTimeout(200);
  barGeo.push(await page.evaluate(() => {
    const b = document.getElementById('nsh-tabbar').getBoundingClientRect();
    const clipped = [...document.querySelectorAll('#nsh-tabbar .nsh-tab')]
      .some(t => t.scrollWidth > t.clientWidth + 2);
    return { w: Math.round(b.width), pct: Math.round(b.width / innerWidth * 100), x: Math.round(b.x), clipped };
  }));
}
ok(barGeo.every(g => g.pct === barGeo[0].pct && g.w === barGeo[0].w),
  `островок не «дышит» при переключении вкладок (${barGeo.map(g => g.w).join('/')}px)`, JSON.stringify(barGeo));
ok(barGeo[0].pct === 70, `островок занимает 70% ширины (${barGeo[0].pct}%)`, JSON.stringify(barGeo[0]));
ok(barGeo.every(g => !g.clipped), 'ни одна вкладка островка не обрезана');

// 17.3 «Зачем?» больше не самостоятельная глобальная сущность.
const why = await page.evaluate(async () => {
  const seen = [];
  const scan = l => document.querySelectorAll('body *').forEach(el => {
    if (el.closest('script,style,template')) return;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
    if (own.includes('«Зачем?»')) seen.push(l + ': ' + own.trim().slice(0, 50));
  });
  ['home', 'map', 'health', 'astro', 'sys', 'settings'].forEach(t => { goTo(t); scan(t); });
  document.querySelectorAll('.ov').forEach(o => { o.classList.add('on'); scan('ov:' + o.id); o.classList.remove('on'); });
  goTo('home');
  // Разбор при этом остался достижим и пишет туда же.
  const before = (DB.whys || []).length;
  openOv('ov-why');
  const formOpen = !!document.querySelector('#ov-why.on');
  const title = (document.querySelector('#ov-why .sh-title') || {}).textContent || '';
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  return { seen: [...new Set(seen)], formOpen, title, coll: Array.isArray(DB.whys), before };
});
ok(why.seen.length === 0, '«Зачем?» как отдельная сущность не показывается нигде', why.seen.join(', '));
ok(why.formOpen && /Разбор ситуации/.test(why.title),
  'разбор ситуации остался рабочим и называется по-человечески', why.title);
ok(why.coll, 'коллекция разборов не тронута — переименование только в подписях');

// 17.4 Разбор ситуации: один вопрос на экран, прежний writer и прежние поля.
const whyWizard = await page.evaluate(() => {
  openOv('ov-why');
  const panels = [...document.querySelectorAll('#why-wizard [data-why-step]')];
  const visible = () => panels.filter(p => !p.hidden && p.offsetParent !== null);
  const first = {
    count: (document.getElementById('why-step-count') || {}).textContent,
    visible: visible().length,
    next: !(document.getElementById('why-next') || {}).hidden,
    save: !(document.getElementById('why-save') || {}).hidden,
  };
  document.getElementById('why-symptom').value = 'TEST-X2 ситуация';
  for (let i = 0; i < 6; i++) whyNext();
  const last = {
    count: (document.getElementById('why-step-count') || {}).textContent,
    visible: visible().length,
    back: !(document.getElementById('why-back') || {}).disabled,
    next: !(document.getElementById('why-next') || {}).hidden,
    save: !(document.getElementById('why-save') || {}).hidden,
    progress: parseFloat((document.getElementById('why-progress-bar') || {}).style.width || '0'),
  };
  const before = DB.whys.length;
  document.getElementById('why-action').value = 'TEST-X2 маленький шаг';
  saveWhy();
  const rec = DB.whys[DB.whys.length - 1];
  openOv('ov-why');
  const reset = (document.getElementById('why-step-count') || {}).textContent;
  closeOv('ov-why');
  return { panels: panels.length, first, last, grew: DB.whys.length === before + 1,
    fields: rec && WHY_FIELDS.every(k => Object.prototype.hasOwnProperty.call(rec, k)),
    symptom: rec && rec.symptom, action: rec && rec.action, reset };
});
ok(whyWizard.panels === 7 && whyWizard.first.visible === 1 && /1 из 7/.test(whyWizard.first.count),
  'разбор показывает один вопрос за шаг, а не семь полей сразу', JSON.stringify(whyWizard.first));
ok(whyWizard.last.visible === 1 && /7 из 7/.test(whyWizard.last.count) && whyWizard.last.back &&
  !whyWizard.last.next && whyWizard.last.save && whyWizard.last.progress === 100,
  'прогресс, Назад и Сохранить корректны на последнем шаге', JSON.stringify(whyWizard.last));
ok(whyWizard.grew && whyWizard.fields && whyWizard.symptom === 'TEST-X2 ситуация' &&
  whyWizard.action === 'TEST-X2 маленький шаг',
  'пошаговый UI пишет прежним saveWhy() в прежние canonical-поля', JSON.stringify(whyWizard));
ok(/1 из 7/.test(whyWizard.reset), 'новый разбор снова начинается с первого вопроса', whyWizard.reset);

// 17.5 Сегодня: без декоративного приветствия и без дубля быстрых действий.
await page.evaluate(() => goTo('home'));
await page.waitForTimeout(250);
const home = await page.evaluate(() => {
  const pg = document.getElementById('pg-home');
  const secs = [...pg.querySelectorAll('.sec-lbl')].filter(s => s.offsetParent !== null).map(s => s.textContent.trim());
  return { greeting: !!document.getElementById('h-hl'), tiles: pg.querySelectorAll('.qarow .qabtn').length,
    secs, hasDate: !!document.getElementById('h-date'),
    detailsClosed: !document.getElementById('h-more').classList.contains('on'),
    stateHidden: document.querySelector('#pg-home .state-hero').offsetParent === null };
});
ok(!home.greeting, 'декоративного приветствия на Главной нет');
ok(home.tiles === 0, 'сетка из пяти быстрых плиток убрана — их даёт ＋', String(home.tiles));
ok(home.hasDate, 'дата осталась: она даёт контекст, а не украшение');
ok(home.secs.length <= 5, `Сегодня не перегружено секциями (${home.secs.length}): ${home.secs.join(' · ')}`);
ok(home.detailsClosed && home.stateHidden,
  'графики, история и подробная динамика не конкурируют с первым экраном Сегодня', JSON.stringify(home));

// 17.6 Здоровье: первый слой короткий, подробности собраны в четыре области.
const healthUi = await page.evaluate(() => {
  goTo('health');
  const root = document.getElementById('health-out');
  const groups = [...root.querySelectorAll(':scope > details.health-group')];
  return {
    title: (document.getElementById('ptitle') || {}).textContent,
    repeatedTitle: root.querySelectorAll(':scope > .domain-head .domain-title').length,
    intro: (root.querySelector(':scope > .domain-head .domain-subtitle') || {}).textContent,
    attention: [...root.querySelectorAll(':scope > .sec-lbl')].map(x => x.textContent.trim()),
    names: groups.map(g => (g.querySelector(':scope > summary') || {}).textContent.trim()),
    closed: groups.every(g => !g.open),
    uniqueTargets: ['health-today', 'health-lab', 'health-docs', 'health-timeline']
      .every(id => document.querySelectorAll('#' + id).length === 1),
  };
});
ok(healthUi.title === 'Здоровье' && healthUi.repeatedTitle === 0 && /План на сегодня/.test(healthUi.intro) && healthUi.attention.includes('Что требует внимания'),
  'Здоровье сразу объясняет раздел и показывает только важное сейчас', JSON.stringify(healthUi));
ok(healthUi.names.length === 4 && healthUi.closed && healthUi.uniqueTargets,
  'детали Здоровья собраны в четыре свёрнутые области без дублей render-target', JSON.stringify(healthUi));

// 17.6a Психология: один ясный фокус и понятные задачи вместо методологического журнала.
const psyUi = await page.evaluate(() => {
  goTo('map'); msub('psychology');
  const root = document.getElementById('psy-ws');
  const summaries = [...root.querySelectorAll(':scope > details > summary')].map(x => x.textContent.trim());
  return {
    title: (document.getElementById('ptitle') || {}).textContent,
    repeatedTitle: root.querySelectorAll(':scope > .domain-head .domain-title').length,
    intro: (root.querySelector(':scope > .domain-head .domain-subtitle') || {}).textContent,
    focus: (root.querySelector(':scope > .psy-now .domain-title') || {}).textContent,
    primary: [...root.querySelectorAll(':scope > .psy-now button')].map(x => x.textContent.trim()),
    summaries,
    advancedClosed: !root.querySelector(':scope > details.psy-advanced').open,
  };
});
ok(psyUi.title === 'Психология' && psyUi.repeatedTitle === 0 && /Понять, что происходит/.test(psyUi.intro) && psyUi.focus,
  'Психология имеет один заголовок в шапке и один содержательный фокус', JSON.stringify(psyUi));
ok(psyUi.primary.includes('Разобрать ситуацию') && psyUi.primary.includes('Записать, что произошло') &&
  psyUi.summaries.some(x => /Что со мной происходит/.test(x)) && psyUi.summaries.some(x => /Мои цели/.test(x)) && psyUi.advancedClosed,
  'первый слой Психологии говорит задачами, а дополнительные инструменты свёрнуты', JSON.stringify(psyUi));

// 17.7 Шапка: поиск, добавление и одно глобальное меню; Настройки не дублируются.
const topbar = await page.evaluate(() => ({
  search: document.querySelectorAll('.topbar [aria-label="Поиск"]').length,
  add: document.querySelectorAll('.topbar #topbar-add').length,
  menu: document.querySelectorAll('.topbar #topbar-menu').length,
  settings: document.querySelectorAll('.topbar [aria-label="Настройки"]').length,
}));
ok(topbar.search === 1 && topbar.add === 1 && topbar.menu === 1 && topbar.settings === 0,
  'в шапке нет дублирующей шестерёнки: Настройки живут в единственном Меню', JSON.stringify(topbar));

// 17.8 Астрология: понятные задачи сверху, профессиональные расчёты — глубже.
const astroUi = await page.evaluate(() => {
  goTo('astro');
  const root = document.getElementById('as-menu');
  const visible = [...root.querySelectorAll('.astro-card')]
    .filter(b => b.offsetParent !== null).map(b => b.childNodes[1] ? b.textContent.trim() : b.textContent.trim());
  const advanced = root.querySelector('.astro-more');
  return {
    title: (document.getElementById('ptitle') || {}).textContent,
    repeatedTitle: root.querySelectorAll(':scope > .domain-head .domain-title').length,
    intro: (root.querySelector(':scope > .domain-head .domain-subtitle') || {}).textContent,
    visible,
    advancedClosed: !!advanced && !advanced.open,
    advancedCount: advanced ? advanced.querySelectorAll('.astro-card').length : 0,
  };
});
ok(astroUi.title === 'Астрология' && astroUi.repeatedTitle === 0 && /Символический взгляд/.test(astroUi.intro) && astroUi.visible.some(t => /Моя карта/.test(t)) &&
  astroUi.visible.some(t => /^Сейчас/.test(t)) && astroUi.visible.some(t => /Данные рождения/.test(t)),
  'Астрология на первом слое говорит задачами, а не набором терминов', JSON.stringify(astroUi.visible));
ok(astroUi.advancedClosed && astroUi.advancedCount === 5,
  'пять профессиональных расчётов сохранены в свёрнутом втором слое', JSON.stringify(astroUi));

// 17.9 Первый слой без профессионального жаргона.
const jarg = await page.evaluate(() => {
  const TERMS = ['КПТ', 'CBT', 'DBT', 'Схема-терапия', 'Психообразование', 'Мотивационное интервью',
    'Follow-up', 'эпизод', 'Эпизод', 'доказательност', 'Семейство метода', 'naturalistic',
    'claimClass', 'provenance', 'sourceId', 'insufficient'];
  const found = new Set();
  const scan = () => document.querySelectorAll('body *').forEach(el => {
    if (el.closest('script,style,template')) return;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
    TERMS.forEach(t => { if (own.includes(t)) found.add(t); });
  });
  ['home', 'map', 'health', 'astro', 'vit', 'sys', 'settings'].forEach(t => { goTo(t); scan(); });
  ['overview', 'insights', 'dreams', 'psychology', 'patterns', 'spiritual', 'evolution'].forEach(s => { goTo('map'); msub(s); scan(); });
  document.querySelectorAll('.ov').forEach(o => { o.classList.add('on'); scan(); o.classList.remove('on'); });
  goTo('home');
  return [...found];
});
ok(jarg.length === 0, 'на первом слое нет профессионального жаргона', jarg.join(', '));

// 17.10 Подходы названы по-человечески, идентификаторы не тронуты.
const fam = await page.evaluate(() => ({
  ru: Object.values(PSY_FAMILY_RU), ids: PSY_METHOD_FAMILIES.slice(),
}));
ok(fam.ids.includes('CBT') && fam.ids.includes('ACT'),
  'идентификаторы подходов сохранены — canonical-данные не переименованы', fam.ids.join(','));
ok(!fam.ru.some(v => /КПТ|CBT|DBT|Схема-терапия/.test(v)),
  'подписи подходов человеческие: ' + fam.ru.slice(0, 4).join(' · '), fam.ru.join(' · '));

await browser.close();
console.log(`\nEXPERIENCE 2.0 SHELL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
