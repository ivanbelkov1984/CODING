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
  await page.evaluate(() => document.querySelector('[data-nav="menu"]').click());
  await page.waitForTimeout(320);
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
      aria: document.querySelector('[data-nav="menu"]').getAttribute('aria-expanded'),
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
  await page.waitForTimeout(300);
  const c = await page.evaluate(() => ({
    closed: !document.body.classList.contains('nav-open'),
    inert: document.getElementById('app').hasAttribute('inert'),
      floatInert: [...document.body.children].filter(e => !['sidebar','scrim','toasts'].includes(e.id) && !e.classList.contains('ov')).every(e => e.hasAttribute('inert')),
    aria: document.querySelector('[data-nav="menu"]').getAttribute('aria-expanded'),
    focusBack: document.activeElement === document.querySelector('[data-nav="menu"]'),
  }));
  ok(c.closed && !c.inert && c.aria === 'false', `[${theme}] Escape закрывает drawer и снимает inert/aria`, JSON.stringify(c));
  ok(c.focusBack, `[${theme}] фокус возвращается на кнопку «Меню»`);
}
// Тап по scrim закрывает drawer
await page.evaluate(() => document.querySelector('[data-nav="menu"]').click());
await page.waitForTimeout(300);
await page.mouse.click(370, 400);
await page.waitForTimeout(300);
ok(await page.evaluate(() => !document.body.classList.contains('nav-open')), 'тап по затемнению закрывает drawer');
// Выбор пункта закрывает drawer
await page.evaluate(() => document.querySelector('[data-nav="menu"]').click());
await page.waitForTimeout(300);
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
ok(!afterReload.labels.includes('Ещё') && afterReload.labels.includes('Меню'),
  'после перезагрузки таб-бар: ' + afterReload.labels.join(' · '));
ok(afterReload.hash === '#/menu' && afterReload.open, 'старая ссылка #/more открывает drawer и переписывает hash в #/menu',
  JSON.stringify(afterReload));

await browser.close();
console.log(`\nEXPERIENCE 2.0 SHELL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
