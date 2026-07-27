import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Navigation Shell 1.3B + 1.4 — «Обзор» как агрегатор + rollout (issue #143).
// Гоняет собранное приложение (dist/app.html) в реальном браузере, тем же
// стилем, что tests/context-action-dock.spec.mjs и tests/diary-aggregator.spec.mjs.

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');
let pass = 0;
let fail = 0;
const errors = [];
const ok = (condition, message) => {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.log('  ✗ ' + message); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', error => errors.push(error.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  // checkOnboard() schedules openOv('ov-onboard') 500ms after load whenever
  // CFG.userName is empty (always true on a fresh page) — same pre-existing
  // race already fixed in the other two spec files. Wait it out once here.
  await p.waitForTimeout(650);
  await p.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  return p;
}

async function setShell(p, value) {
  await p.evaluate(v => {
    if (v === null) localStorage.removeItem('arch_nav_v2'); else localStorage.setItem('arch_nav_v2', v);
    applyNavShell();
  }, value);
}

const page = await boot();

// 1) OFF-флаг: старый goTo('sys') не изменён.
await setShell(page, '0');
const off1 = await page.evaluate(() => {
  goTo('sys');
  return {
    detailDisplay: getComputedStyle(document.getElementById('sys-detail')).display,
    overviewDisplay: getComputedStyle(document.getElementById('sys-overview')).display,
    livingMapPresent: !!document.getElementById('livingmap-out').innerHTML,
  };
});
ok(off1.detailDisplay !== 'none' && off1.overviewDisplay === 'none' && off1.livingMapPresent,
  'OFF-флаг: goTo(\'sys\') по-прежнему открывает старый экран напрямую, landing недостижим');

// 2) ON-флаг: #/overview открывает landing.
await setShell(page, '1');
const on2 = await page.evaluate(() => {
  goTo('home');
  goTo('sys'); // вход как через таб/сайдбар
  const overviewOn = getComputedStyle(document.getElementById('sys-overview')).display !== 'none';
  const detailOff = getComputedStyle(document.getElementById('sys-detail')).display === 'none';
  return { overviewOn, detailOff };
});
ok(on2.overviewOn && on2.detailOff, 'ON-флаг: вход в Обзор открывает landing, не старый экран напрямую');

const on2b = await page.evaluate(() => {
  goTo('home');
  location.hash = '#/overview';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  return { overviewOn: getComputedStyle(document.getElementById('sys-overview')).display !== 'none', hash: location.hash };
});
ok(on2b.overviewOn && on2b.hash === '#/overview', 'ON-флаг: канонический hash #/overview восстанавливает landing');

// 3) Старые 30/365 и существующие функции доступны через «Подробный обзор».
const old3 = await page.evaluate(() => {
  goTo('sys'); // landing
  sysGo('detail'); // «Подробный обзор» — существующий 30/365-экран
  const detailOn = getComputedStyle(document.getElementById('sys-detail')).display !== 'none';
  rReview(365);
  const yearOn = document.querySelector('#review-btns .rv-b[data-d="365"]').classList.contains('on');
  const reviewHasContent = document.getElementById('review-out').innerHTML.length > 0;
  return { detailOn, yearOn, reviewHasContent };
});
ok(old3.detailOn && old3.yearOn && old3.reviewHasContent, '«Подробный обзор» открывает старый экран, rReview(365) по-прежнему работает');

// 4) Неделя: данных нет / мало данных / достаточно данных.
const week4 = await page.evaluate(() => {
  const saved = DB.checkins;
  const r = {};
  DB.checkins = [];
  sysGo('overview');
  r.noData = document.getElementById('ov-week').textContent.includes('Мало данных');
  DB.checkins = [
    { id: 1, date: dayAgo(1), cl: 6, mv: 6, st: 4 },
    { id: 2, date: dayAgo(2), cl: 6, mv: 6, st: 4 },
  ];
  sysGo('overview');
  r.littleData = document.getElementById('ov-week').textContent.includes('Мало данных') && document.getElementById('ov-week').textContent.includes('2 чек-ина');
  DB.checkins = [
    { id: 1, date: dayAgo(1), cl: 8, mv: 7, st: 2 },
    { id: 2, date: dayAgo(2), cl: 7, mv: 7, st: 3 },
    { id: 3, date: dayAgo(3), cl: 8, mv: 8, st: 2 },
    { id: 4, date: dayAgo(4), cl: 7, mv: 6, st: 3 },
  ];
  sysGo('overview');
  const txt = document.getElementById('ov-week').textContent;
  r.enoughData = /Среднее состояние/.test(txt) && !/Мало данных/.test(txt);
  DB.checkins = saved;
  return r;
});
ok(week4.noData, 'неделя: 0 чек-инов — честное «мало данных»');
ok(week4.littleData, 'неделя: 2 чек-ина (< 3) — честное «мало данных» с правильным числом');
ok(week4.enoughData, 'неделя: ≥3 чек-инов — показан вывод «Среднее состояние»');

// 5) Сравнение последних 7 дней с предыдущими 7 без мутации исходных объектов.
const compare5 = await page.evaluate(() => {
  const saved = DB.checkins;
  // Текущая неделя — высокое состояние; предыдущая — низкое → ожидаем ↑.
  DB.checkins = [
    { id: 1, date: dayAgo(1), cl: 9, mv: 9, st: 1 },
    { id: 2, date: dayAgo(2), cl: 9, mv: 9, st: 1 },
    { id: 3, date: dayAgo(3), cl: 9, mv: 9, st: 1 },
    { id: 11, date: dayAgo(9), cl: 3, mv: 3, st: 8 },
    { id: 12, date: dayAgo(10), cl: 3, mv: 3, st: 8 },
    { id: 13, date: dayAgo(11), cl: 3, mv: 3, st: 8 },
  ];
  const before = JSON.stringify(DB.checkins);
  sysGo('overview');
  const txt = document.getElementById('ov-week').textContent;
  const unchanged = JSON.stringify(DB.checkins) === before;
  DB.checkins = saved;
  return { showsUp: /↑/.test(txt), unchanged };
});
ok(compare5.showsUp, 'неделя vs предыдущая: явно лучшая текущая неделя показывает ↑');
ok(compare5.unchanged, 'сравнение недель не мутирует исходный массив DB.checkins');

// 6) Сферы: 0 / 1 / N и корректные существующие метрики.
const spheres6 = await page.evaluate(() => {
  const saved = DB.spheres, savedLogs = DB.sphereLogs;
  const r = {};
  DB.spheres = []; DB.sphereLogs = [];
  sysGo('overview');
  r.zero = document.getElementById('ov-spheres').innerHTML.trim() === '';
  DB.spheres = [{ id: 9401, name: 'Медитация', icon: '🧘', color: '#0E7490', type: 'habit' }];
  DB.sphereLogs = [{ id: 1, sphereId: 9401, date: dayAgo(1), value: true }];
  sysGo('overview');
  const oneTxt = document.getElementById('ov-spheres').innerHTML;
  r.one = oneTxt.includes('Медитация') && /постоянство/.test(oneTxt);
  DB.spheres = [
    { id: 9401, name: 'Медитация', icon: '🧘', color: '#0E7490', type: 'habit' },
    { id: 9402, name: 'Чтение', icon: '📖', color: '#B45309', type: 'counter', unit: 'страниц' },
  ];
  DB.sphereLogs = [
    { id: 1, sphereId: 9401, date: dayAgo(1), value: true },
    { id: 2, sphereId: 9402, date: dayAgo(1), value: 20 },
  ];
  sysGo('overview');
  const nTxt = document.getElementById('ov-spheres').innerHTML;
  r.n = nTxt.includes('Медитация') && nTxt.includes('Чтение') && /страниц/.test(nTxt);
  const btn = document.querySelector('#ov-spheres button');
  btn.click();
  r.goesToVit = document.getElementById('pg-vit').classList.contains('on');
  DB.spheres = saved; DB.sphereLogs = savedLogs;
  return r;
});
ok(spheres6.zero, 'сферы: 0 сфер — секция пуста (не декоративная карточка)');
ok(spheres6.one, 'сферы: 1 сфера — показана с существующей метрикой (habit → % постоянство)');
ok(spheres6.n, 'сферы: N сфер — все показаны с правильными существующими метриками по типу');
ok(spheres6.goesToVit, 'сферы: тап по карточке ведёт в существующий раздел Сферы');

// 7) Здоровье: empty / симптомы / измерения / тяга.
const health7 = await page.evaluate(() => {
  const savedSym = DB.symptoms, savedMea = DB.measures, savedCrav = DB.cravings, savedMeds = DB.meds, savedIntakes = DB.medIntakes;
  const r = {};
  DB.symptoms = []; DB.measures = []; DB.cravings = []; DB.meds = []; DB.medIntakes = [];
  sysGo('overview');
  const emptyTxt = document.getElementById('ov-health').textContent;
  r.empty = /Симптомов пока нет/.test(emptyTxt) && /Измерений пока нет/.test(emptyTxt);
  DB.symptoms = [{ id: 1, day: dayAgo(1), createdAt: new Date(Date.now() - 86400000).toISOString(), name: 'Головная боль', severity: 5 }];
  sysGo('overview');
  r.symptom = document.getElementById('ov-health').textContent.includes('Головная боль');
  DB.measures = [{ id: 2, day: dayAgo(1), createdAt: new Date(Date.now() - 86400000).toISOString(), name: 'Вес', value: '80', unit: 'кг' }];
  sysGo('overview');
  r.measure = document.getElementById('ov-health').textContent.includes('Вес: 80 кг');
  DB.cravings = [{ id: 3, day: dayAgo(1), createdAt: new Date(Date.now() - 86400000).toISOString(), outcome: 'held' }, { id: 4, day: dayAgo(2), createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), outcome: 'gave_in' }];
  sysGo('overview');
  r.craving = /Тяга/.test(document.getElementById('ov-health').textContent);
  DB.symptoms = savedSym; DB.measures = savedMea; DB.cravings = savedCrav; DB.meds = savedMeds; DB.medIntakes = savedIntakes;
  return r;
});
ok(health7.empty, 'здоровье: empty state честный (симптомов/измерений нет)');
ok(health7.symptom, 'здоровье: последний симптом показан');
ok(health7.measure, 'здоровье: последнее измерение показано');
ok(health7.craving, 'здоровье: тяга — фактическая история показана');

// 8) CTA «Отчёт врачу» открывает существующий overlay (с заполненным текстом).
const doctor8 = await page.evaluate(() => {
  sysGo('overview');
  document.querySelector('#ov-health button').click();
  return {
    open: document.getElementById('ov-doc-report').classList.contains('on'),
    hasText: (document.getElementById('doc-report-text') || {}).value?.length > 0,
  };
});
ok(doctor8.open && doctor8.hasText, '«Отчёт врачу» открывает существующий overlay с заполненным отчётом (openDoctorReport)');
await page.evaluate(() => closeOv('ov-doc-report'));

// 9) Dock содержит заявленные действия и скрывается при overlay.
await page.evaluate(() => goTo('sys'));
await page.waitForFunction(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const dock = document.getElementById('nsh-context-dock');
  return !dock.hidden && dock.querySelectorAll('button').length === 2;
});
const dock9 = await page.evaluate(() => [...document.querySelectorAll('#nsh-context-dock button')].map(b => b.getAttribute('aria-label')));
ok(JSON.stringify(dock9) === JSON.stringify(['Обзор недели', 'Отчёт врачу']), `dock Обзора: заявленные два действия (${JSON.stringify(dock9)})`);
await page.evaluate(() => openOv('ov-search'));
await page.waitForFunction(() => { window.__ARCH_CONTEXT_DOCK__.update(); return document.getElementById('nsh-context-dock').hidden; });
ok(true, 'dock Обзора скрывается при открытом overlay');
await page.evaluate(() => closeOv('ov-search'));

// 10) Reload/back/forward не оставляют чужой subroute или dock.
await page.evaluate(() => { sysGo('detail'); location.hash = '#/overview'; });
await page.reload();
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(650);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')));
const reload10 = await page.evaluate(() => ({
  overviewOn: getComputedStyle(document.getElementById('sys-overview')).display !== 'none',
  detailOff: getComputedStyle(document.getElementById('sys-detail')).display === 'none',
  shellOn: document.body.classList.contains('navshell'),
}));
ok(reload10.shellOn && reload10.overviewOn && reload10.detailOff, 'reload на #/overview восстанавливает landing, а не detail-подэкран');

const backfwd10 = await page.evaluate(async () => {
  goTo('home'); goTo('sys'); // landing
  sysGo('detail');
  goTo('home');
  await new Promise(res => { const h = () => { window.removeEventListener('hashchange', h); res(); }; window.addEventListener('hashchange', h); history.back(); });
  const backOnOverview = document.getElementById('pg-sys').classList.contains('on');
  const backLanding = getComputedStyle(document.getElementById('sys-overview')).display !== 'none';
  return { backOnOverview, backLanding };
});
ok(backfwd10.backOnOverview && backfwd10.backLanding, 'повторный вход через goTo(\'sys\') всегда сбрасывает на landing (не оставляет detail)');

// 11) iPhone SE/standard/Pro Max: landing не перекрывается tab bar/dock/safe-area.
await page.close();
for (const [width, height, name] of [[375, 667, 'iPhone SE'], [390, 844, 'iPhone standard'], [430, 932, 'iPhone Pro Max']]) {
  const device = await boot(width, height);
  await setShell(device, '1');
  await device.evaluate(() => { goTo('home'); goTo('sys'); });
  await device.waitForFunction(() => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const dock = document.getElementById('nsh-context-dock');
    return !dock.hidden && dock.querySelectorAll('button').length === 2;
  });
  const geometry = await device.evaluate(() => {
    const dock = document.getElementById('nsh-context-dock').getBoundingClientRect();
    const tabbar = document.getElementById('nsh-tabbar').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.content')).paddingBottom);
    const overviewVisible = getComputedStyle(document.getElementById('sys-overview')).display !== 'none';
    return {
      inViewport: dock.left >= 0 && dock.right <= innerWidth + 1,
      aboveTabbar: dock.bottom <= tabbar.top + 2,
      pad, overviewVisible,
    };
  });
  ok(geometry.overviewVisible && geometry.inViewport && geometry.aboveTabbar && geometry.pad >= 120,
    `${name}: landing доступен, dock не перекрывает tab bar/контент`);
  await device.close();
}

// 12) iPad portrait: sidebar сохраняется, телефонный dock скрыт.
const ipad = await boot(820, 1180);
await setShell(ipad, '1');
await ipad.evaluate(() => { goTo('home'); goTo('sys'); });
const ipad12 = await ipad.evaluate(() => ({
  overviewVisible: getComputedStyle(document.getElementById('sys-overview')).display !== 'none',
  sidebarStatic: getComputedStyle(document.getElementById('sidebar')).transform === 'none',
  dockHidden: (() => { window.__ARCH_CONTEXT_DOCK__.update(); return document.getElementById('nsh-context-dock').hidden; })(),
}));
ok(ipad12.overviewVisible && ipad12.sidebarStatic && ipad12.dockHidden,
  'iPad portrait: sidebar статичен, landing Обзора доступен, телефонный dock скрыт');
await ipad.close();

// 13) Keyboard/a11y/tap targets.
const a11yPage = await boot();
await setShell(a11yPage, '1');
await a11yPage.evaluate(() => {
  DB.spheres = [{ id: 9501, name: 'Спорт', icon: '🏃', color: '#1A7F3C', type: 'habit' }];
  DB.sphereLogs = [{ id: 1, sphereId: 9501, date: dayAgo(1), value: true }];
  goTo('home'); goTo('sys');
});
const a11y13 = await a11yPage.evaluate(() => {
  const els = [...document.querySelectorAll('#sys-overview button')];
  const allButtons = els.every(e => e.tagName === 'BUTTON' && e.getAttribute('type') === 'button');
  const named = els.every(e => e.textContent.trim().length > 0);
  const tapOk = els.every(e => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; });
  return { n: els.length, allButtons, named, tapOk };
});
ok(a11y13.n >= 2 && a11y13.allButtons && a11y13.named && a11y13.tapOk,
  `landing Обзора a11y: ${a11y13.n} интерактивных элементов — настоящие button, доступные имена, tap ≥44×44`);
const sysBackBtn = a11yPage.locator('#sys-back');
await a11yPage.evaluate(() => sysGo('detail'));
const backGeom = await sysBackBtn.evaluate(e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, visible: getComputedStyle(e).display !== 'none' }; });
ok(backGeom.visible && backGeom.h >= 44, '«К обзору недели» — видима при ON, tap-высота ≥44px');
await sysBackBtn.focus();
await a11yPage.keyboard.press('Enter');
const backWorks = await a11yPage.evaluate(() => getComputedStyle(document.getElementById('sys-overview')).display !== 'none');
ok(backWorks, '«К обзору недели»: Enter с клавиатуры возвращает на landing');
await a11yPage.close();

await page.close();

// 14) Существующая маршрутная полнота/полный E2E/backup/evidence проверяются
// отдельными прогонами (tests/e2e.mjs, npm run test:backup, npm run evidence) —
// не дублируются здесь.

ok(errors.length === 0, `JS-ошибок нет (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await browser.close();
console.log(`\nОбзор-агрегатор: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
