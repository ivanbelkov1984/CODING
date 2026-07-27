import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Navigation Shell 1.3A — «Дневник» как агрегатор (issue #141).
// Гоняет собранное приложение (dist/app.html) в реальном браузере, тем же
// стилем, что tests/context-action-dock.spec.mjs.

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
  // race as in context-action-dock.spec.mjs. Wait it out once here.
  await p.waitForTimeout(650);
  await p.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  return p;
}

async function setShell(p, on) {
  await p.evaluate(enabled => {
    localStorage.setItem('arch_nav_v2', enabled ? '1' : '0');
    applyNavShell();
  }, on);
}

function displayOf(p, id) {
  return p.evaluate(elId => getComputedStyle(document.getElementById(elId)).display, id);
}

const page = await boot();

// 1) OFF-флаг: старый goTo('map')/insights-путь не изменён.
await setShell(page, false);
const off1 = await page.evaluate(() => {
  goTo('map');
  return {
    insightsDisplay: getComputedStyle(document.getElementById('ms-insights')).display,
    overviewDisplay: getComputedStyle(document.getElementById('ms-overview')).display,
    insightsPillOn: document.querySelector('#subnav .snpill[data-sub="insights"]').classList.contains('on'),
  };
});
ok(off1.insightsDisplay !== 'none' && off1.overviewDisplay === 'none' && off1.insightsPillOn,
  'OFF-флаг: goTo(\'map\') по-прежнему открывает Инсайты напрямую, landing недостижим');

// 2) ON-флаг: #/diary открывает landing Дневника (и вход через таб).
await setShell(page, true);
const on2 = await page.evaluate(() => {
  goTo('home');
  goTo('map'); // вход как через таб/сайдбар — не msub напрямую
  const overviewOn = getComputedStyle(document.getElementById('ms-overview')).display !== 'none';
  const insightsOff = getComputedStyle(document.getElementById('ms-insights')).display === 'none';
  const pillOn = document.querySelector('#subnav .snpill[data-sub="overview"]').classList.contains('on');
  return { overviewOn, insightsOff, pillOn };
});
ok(on2.overviewOn && on2.insightsOff && on2.pillOn, 'ON-флаг: вход в Дневник открывает landing, не «Инсайты»');

const on2b = await page.evaluate(() => {
  goTo('home');
  location.hash = '#/diary';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  return { overviewOn: getComputedStyle(document.getElementById('ms-overview')).display !== 'none', hash: location.hash };
});
ok(on2b.overviewOn && on2b.hash === '#/diary', 'ON-флаг: канонический hash #/diary восстанавливает landing');

// 3) Старые прямые hashes/subroutes продолжают открывать соответствующие экраны.
const old3 = await page.evaluate(() => {
  msub('dreams'); // прямой вызов подраздела, минуя landing
  const dreamsOn = getComputedStyle(document.getElementById('ms-dreams')).display !== 'none';
  goTo('map'); msub('patterns'); // существующий паттерн вызова (см. app.js: goTo('map');msub('patterns'))
  const patternsOn = getComputedStyle(document.getElementById('ms-patterns')).display !== 'none';
  return { dreamsOn, patternsOn };
});
ok(old3.dreamsOn && old3.patternsOn, 'старые прямые переходы msub(...) продолжают открывать соответствующие подразделы');

// 4) Open loops: только whys с однозначным незавершённым статусом.
// DB.oq — вопросы для рефлексии (reflectOn открывает НОВЫЙ инсайт), у них
// нет признака незавершённости, и свежий профиль несёт стартовые вопросы —
// непустые DB.oq сами по себе НЕ должны создавать секцию (владелец, PR #142).
const loops4 = await page.evaluate(() => {
  const savedWhys = DB.whys, savedOq = DB.oq;
  const r = {};
  DB.whys = []; DB.oq = [];
  goTo('map');
  r.empty = document.getElementById('diary-loops').innerHTML.trim() === '';
  DB.oq = ['Что мне сейчас важно понять?', 'Второй стартовый вопрос'];
  goTo('map');
  r.oqAloneNoSection = document.getElementById('diary-loops').innerHTML.trim() === '';
  DB.oq = [];
  DB.whys = [{ id: 9001, day: '2026-01-05', action: 'Сделать паузу', actionDone: false, symptom: 'усталость' }];
  goTo('map');
  r.openWhyShown = document.getElementById('diary-loops').innerHTML.includes('«Зачем?»');
  r.noOqMentionInLoops = !document.getElementById('diary-loops').innerHTML.includes('Открытый вопрос');
  DB.whys = [{ id: 9002, day: '2026-01-05', action: 'Сделать паузу', actionDone: true, symptom: 'усталость' }];
  goTo('map');
  r.doneWhyHidden = document.getElementById('diary-loops').innerHTML.trim() === '';
  // DB.oq непустой ОДНОВРЕМЕННО с завершённым why — секция всё равно пуста.
  DB.oq = ['Стартовый вопрос'];
  goTo('map');
  r.doneWhyHiddenEvenWithOq = document.getElementById('diary-loops').innerHTML.trim() === '';
  DB.whys = savedWhys; DB.oq = savedOq;
  return r;
});
ok(loops4.empty, 'open loops: 0 whys — секция пуста (не декоративная карточка)');
ok(loops4.oqAloneNoSection, 'open loops: непустые DB.oq сами по себе НЕ создают секцию (это вопросы рефлексии, не незавершённые петли)');
ok(loops4.openWhyShown && loops4.noOqMentionInLoops, 'open loops: незавершённый разбор «Зачем?» показан, DB.oq landing не упоминает');
ok(loops4.doneWhyHidden && loops4.doneWhyHiddenEvenWithOq, 'open loops: завершённый (actionDone=true) разбор «Зачем?» НЕ показывается, даже если DB.oq непуст');

// 5) Моменты и check-ins читаются без изменения исходных объектов.
const noMutate5 = await page.evaluate(() => {
  DB.moments = [{ id: 9101, day: '2026-01-05', createdAt: '2026-01-05T10:00:00.000Z', valence: 60, activation: 40 }];
  DB.checkins = [{ id: 9102, date: '2026-01-05', cl: 6, mv: 7, st: 4 }];
  const beforeM = JSON.stringify(DB.moments);
  const beforeC = JSON.stringify(DB.checkins);
  goTo('map');
  return { unchangedMoments: JSON.stringify(DB.moments) === beforeM, unchangedCheckins: JSON.stringify(DB.checkins) === beforeC };
});
ok(noMutate5.unchangedMoments && noMutate5.unchangedCheckins, 'landing читает Моменты/Check-ins без изменения исходных объектов');

// 5b) «Последний Момент» выбирается по реальной свежести (createdAt), а не
// по позиции в массиве — два Момента в НЕхронологическом порядке (владелец, PR #142).
const recency5b = await page.evaluate(() => {
  const savedMoments = DB.moments;
  DB.moments = [
    { id: 9111, day: '2026-01-10', createdAt: '2026-01-10T09:00:00.000Z', valence: 20, activation: 20 }, // новее, но ПЕРВЫЙ в массиве
    { id: 9110, day: '2026-01-01', createdAt: '2026-01-01T09:00:00.000Z', valence: 80, activation: 80 }, // старше, но ВТОРОЙ (последний по индексу)
  ];
  const before = JSON.stringify(DB.moments);
  goTo('map');
  const text = document.getElementById('diary-state').textContent;
  const unchanged = JSON.stringify(DB.moments) === before;
  DB.moments = savedMoments;
  return { showsNewer: text.includes('01-10'), notOlder: !text.includes('01-01'), unchanged };
});
ok(recency5b.showsNewer && recency5b.notOlder,
  'landing показывает Момент по РЕАЛЬНОЙ свежести (createdAt), а не последний по индексу массива');
ok(recency5b.unchanged, 'выбор самого свежего Момента не переупорядочивает и не мутирует исходный массив');

// 6) Переход «История» открывает существующий ov-history.
const hist6 = await page.evaluate(() => {
  goTo('map');
  document.querySelector('#diary-state button').click();
  return document.getElementById('ov-history').classList.contains('on');
});
ok(hist6, '«Посмотреть историю» открывает существующий ov-history');
await page.evaluate(() => closeOv('ov-history'));

// 7) Карточки коллекций ведут в правильные msub.
const cards7 = await page.evaluate(() => {
  const results = {};
  const checks = [
    ['insights', 'ms-insights'], ['dreams', 'ms-dreams'], ['patterns', 'ms-patterns'],
    ['spiritual', 'ms-spiritual'], ['evolution', 'ms-evolution'],
    ['chats', 'ms-chats'], ['graph', 'ms-graph'], ['book', 'ms-book'],
  ];
  checks.forEach(([coll, msId]) => {
    goTo('map');
    const btn = [...document.querySelectorAll('#ms-overview button')].find(b => b.getAttribute('onclick') === `msub('${coll}')`);
    if (!btn) { results[coll] = false; return; }
    btn.click();
    results[coll] = getComputedStyle(document.getElementById(msId)).display !== 'none';
  });
  return results;
});
ok(Object.values(cards7).every(Boolean), `все карточки landing ведут в правильный msub (${JSON.stringify(cards7)})`);

// 8) Dock landing содержит ровно три заявленных действия и открывает правильные формы.
await page.evaluate(() => goTo('map'));
await page.waitForFunction(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const dock = document.getElementById('nsh-context-dock');
  return !dock.hidden && dock.querySelectorAll('button').length === 3;
});
const dock8 = await page.evaluate(() => {
  const dock = document.getElementById('nsh-context-dock');
  return [...dock.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
});
ok(JSON.stringify(dock8) === JSON.stringify(['Новый инсайт', 'Записать сон', 'Разбор «Зачем?»']),
  `dock landing: ровно три действия в заявленном порядке (${JSON.stringify(dock8)})`);

async function clickDockAction(p, label) {
  await p.evaluate(actionLabel => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const button = [...document.querySelectorAll('#nsh-context-dock button')].find(item => item.getAttribute('aria-label') === actionLabel);
    if (!button) throw new Error('context action not found: ' + actionLabel);
    button.click();
  }, label);
}
await page.evaluate(() => goTo('map'));
await clickDockAction(page, 'Новый инсайт');
ok(await page.evaluate(() => document.getElementById('ov-add').classList.contains('on')), 'dock landing: «Новый инсайт» открывает ov-add');
await page.evaluate(() => closeOv('ov-add'));
await page.evaluate(() => goTo('map'));
await clickDockAction(page, 'Записать сон');
ok(await page.evaluate(() => document.getElementById('ov-drm').classList.contains('on')), 'dock landing: «Записать сон» открывает ov-drm');
await page.evaluate(() => closeOv('ov-drm'));
await page.evaluate(() => goTo('map'));
await clickDockAction(page, 'Разбор «Зачем?»');
ok(await page.evaluate(() => document.getElementById('ov-why').classList.contains('on')), 'dock landing: «Разбор «Зачем?»» открывает ov-why');
await page.evaluate(() => closeOv('ov-why'));

// 9) Открытый overlay скрывает dock, после закрытия он восстанавливается.
await page.evaluate(() => goTo('map'));
await page.waitForFunction(() => { window.__ARCH_CONTEXT_DOCK__.update(); return !document.getElementById('nsh-context-dock').hidden; });
await page.evaluate(() => openOv('ov-search'));
await page.waitForFunction(() => { window.__ARCH_CONTEXT_DOCK__.update(); return document.getElementById('nsh-context-dock').hidden; });
ok(true, 'открытый overlay скрывает dock landing');
await page.evaluate(() => closeOv('ov-search'));
await page.waitForFunction(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const dock = document.getElementById('nsh-context-dock');
  return !dock.hidden && dock.querySelectorAll('button').length === 3;
});
ok(true, 'после закрытия overlay dock landing восстанавливается (три действия)');

// 10) Reload/back/forward не оставляют чужой subroute или dock.
await page.evaluate(() => { msub('dreams'); location.hash = '#/diary'; });
await page.reload();
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const splash = document.getElementById('splash'); if (splash) splash.style.display = 'none'; });
await page.waitForTimeout(650);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')));
const reload10 = await page.evaluate(() => ({
  overviewOn: getComputedStyle(document.getElementById('ms-overview')).display !== 'none',
  dreamsOff: getComputedStyle(document.getElementById('ms-dreams')).display === 'none',
  shellOn: document.body.classList.contains('navshell'),
}));
ok(reload10.shellOn && reload10.overviewOn && reload10.dreamsOff,
  'reload на #/diary восстанавливает landing, а не последний просмотренный subroute (Сны)');

const backfwd10 = await page.evaluate(async () => {
  goTo('home'); goTo('map'); // landing
  msub('dreams');
  goTo('home');
  await new Promise(res => { const h = () => { window.removeEventListener('hashchange', h); res(); }; window.addEventListener('hashchange', h); history.back(); });
  const backOnDiary = document.getElementById('pg-map').classList.contains('on');
  const backLanding = getComputedStyle(document.getElementById('ms-overview')).display !== 'none';
  return { backOnDiary, backLanding };
});
ok(backfwd10.backOnDiary && backfwd10.backLanding, 'повторный вход через goTo(\'map\') всегда сбрасывает на landing (не оставляет старый subroute)');

// 11) iPhone SE/standard/Pro Max: landing и dock не перекрывают tab bar/safe-area.
await page.close();
for (const [width, height, name] of [[375, 667, 'iPhone SE'], [390, 844, 'iPhone standard'], [430, 932, 'iPhone Pro Max']]) {
  const device = await boot(width, height);
  await setShell(device, true);
  await device.evaluate(() => { goTo('home'); goTo('map'); });
  await device.waitForFunction(() => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const dock = document.getElementById('nsh-context-dock');
    return !dock.hidden && dock.querySelectorAll('button').length === 3;
  });
  const geometry = await device.evaluate(() => {
    const dock = document.getElementById('nsh-context-dock').getBoundingClientRect();
    const tabbar = document.getElementById('nsh-tabbar').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.content')).paddingBottom);
    const overviewVisible = getComputedStyle(document.getElementById('ms-overview')).display !== 'none';
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

// 12) iPad portrait: sidebar сохраняется, landing доступен, телефонный dock не появляется.
const ipad = await boot(820, 1180);
await setShell(ipad, true);
await ipad.evaluate(() => { goTo('home'); goTo('map'); });
await ipad.waitForFunction(() => { window.__ARCH_CONTEXT_DOCK__.update(); return true; });
const ipad12 = await ipad.evaluate(() => ({
  overviewVisible: getComputedStyle(document.getElementById('ms-overview')).display !== 'none',
  sidebarStatic: getComputedStyle(document.getElementById('sidebar')).transform === 'none',
  dockHidden: (() => { window.__ARCH_CONTEXT_DOCK__.update(); return document.getElementById('nsh-context-dock').hidden; })(),
}));
ok(ipad12.overviewVisible && ipad12.sidebarStatic && ipad12.dockHidden,
  'iPad portrait: sidebar статичен, landing Дневника доступен, телефонный dock скрыт');
await ipad.close();

// 13) Keyboard/a11y/tap target для новых интерактивных элементов landing.
const a11yPage = await boot();
await setShell(a11yPage, true);
await a11yPage.evaluate(() => {
  DB.whys = [{ id: 9201, day: '2026-01-05', action: 'Позвонить другу', actionDone: false, symptom: 'тревога' }];
  DB.oq = ['О чём я молчу?'];
  goTo('home'); goTo('map');
});
const a11y13 = await a11yPage.evaluate(() => {
  const els = [...document.querySelectorAll('#ms-overview button')];
  const allButtons = els.every(e => e.tagName === 'BUTTON' && e.getAttribute('type') === 'button');
  const named = els.every(e => e.textContent.trim().length > 0);
  const tapOk = els.every(e => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; });
  return { n: els.length, allButtons, named, tapOk };
});
ok(a11y13.n >= 10 && a11y13.allButtons && a11y13.named && a11y13.tapOk,
  `landing a11y: ${a11y13.n} интерактивных элементов — настоящие button, доступные имена, tap ≥44×44`);
const firstLoopBtn = a11yPage.locator('#diary-loops button').first();
await firstLoopBtn.focus();
await a11yPage.keyboard.press('Enter');
const kbOpened = await a11yPage.evaluate(() => document.getElementById('ov-why-det').classList.contains('on'));
ok(kbOpened, 'landing: Enter с клавиатуры активирует открытую петлю «Зачем?» (openWhy)');
await a11yPage.evaluate(() => closeOv('ov-why-det'));
await a11yPage.close();

// 14) Новый пункт subnav «Обзор» — семантика/клавиатура/доступное активное
// состояние (владелец, PR #142: тот же класс дефекта, что чинился в #137).
const pillPage = await boot();
await setShell(pillPage, true);
const pillBase = await pillPage.evaluate(() => {
  goTo('home'); goTo('map'); msub('insights'); // не landing — проверяем aria-current сброшен
  const btn = document.querySelector('#subnav .snpill[data-sub="overview"]');
  const r = btn.getBoundingClientRect();
  return {
    isButton: btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'button',
    named: btn.textContent.trim().length > 0,
    tapOk: r.width >= 44 && r.height >= 44,
    currentWhenInactive: btn.getAttribute('aria-current'),
  };
});
ok(pillBase.isButton && pillBase.named && pillBase.tapOk,
  '«Обзор» в subnav — настоящий <button type=button> с доступным именем, tap ≥44×44');
ok(pillBase.currentWhenInactive === null, '«Обзор»: aria-current отсутствует, пока landing не активен');

await pillPage.evaluate(() => { document.querySelector('#subnav .snpill[data-sub="overview"]').focus(); });
await pillPage.keyboard.press('Enter');
const pillEnter = await pillPage.evaluate(() => ({
  overviewOn: getComputedStyle(document.getElementById('ms-overview')).display !== 'none',
  current: document.querySelector('#subnav .snpill[data-sub="overview"]').getAttribute('aria-current'),
}));
ok(pillEnter.overviewOn && pillEnter.current === 'page',
  '«Обзор»: Enter с клавиатуры открывает landing и выставляет aria-current="page"');

await pillPage.evaluate(() => msub('dreams'));
const pillAfterLeave = await pillPage.evaluate(() => document.querySelector('#subnav .snpill[data-sub="overview"]').getAttribute('aria-current'));
ok(pillAfterLeave === null, '«Обзор»: aria-current снимается при переходе на другой подраздел');

await pillPage.evaluate(() => { document.querySelector('#subnav .snpill[data-sub="overview"]').focus(); });
await pillPage.keyboard.press('Space');
const pillSpace = await pillPage.evaluate(() => getComputedStyle(document.getElementById('ms-overview')).display !== 'none');
ok(pillSpace, '«Обзор»: Space с клавиатуры тоже активирует переход (нативная семантика button)');
await pillPage.close();

ok(errors.length === 0, `JS-ошибок нет (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await page.close();
await browser.close();
console.log(`\nДневник-агрегатор: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
