import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Психология (navigation-restructure): новая вкладка нижнего таб-бара.
// «Открытые петли» и «Моменты» — тот же аггрегатор, что раньше рендерился
// в Дневнике (rDiaryLoops/rPsyMoments, issue #142) — просто на новом
// destination id pg-psy/#psy-loops/#psy-moments. Гоняет собранное
// приложение (dist/app.html) в реальном браузере, тем же стилем, что
// tests/diary-aggregator.spec.mjs.

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
  await p.waitForTimeout(650); // clear the 500ms onboarding timer
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

const page = await boot();
await setShell(page, true);

// 1) Вкладка «Психология» открывает pg-psy, подсвечена в таб-баре.
const on1 = await page.evaluate(() => {
  goTo('home');
  navGo('psychology');
  return {
    onPsy: document.getElementById('pg-psy').classList.contains('on'),
    tabActive: document.querySelector('.nsh-tab[data-nav="psychology"]').classList.contains('on'),
    hash: location.hash,
  };
});
ok(on1.onPsy && on1.tabActive && on1.hash === '#/psychology', 'вкладка «Психология» открывает pg-psy, hash #/psychology, вкладка подсвечена');

// 2) Открытые петли: только whys с однозначным незавершённым статусом
// (тот же класс дефекта, что чинился в PR #142 для Дневника).
const loops2 = await page.evaluate(() => {
  const savedWhys = DB.whys, savedOq = DB.oq;
  const r = {};
  DB.whys = []; DB.oq = [];
  goTo('psy');
  r.empty = document.getElementById('psy-loops').innerHTML.trim() === '';
  DB.oq = ['Что мне сейчас важно понять?', 'Второй стартовый вопрос'];
  goTo('psy');
  r.oqAloneNoSection = document.getElementById('psy-loops').innerHTML.trim() === '';
  DB.oq = [];
  DB.whys = [{ id: 9301, day: '2026-01-05', action: 'Сделать паузу', actionDone: false, symptom: 'усталость' }];
  goTo('psy');
  r.openWhyShown = document.getElementById('psy-loops').innerHTML.includes('«Зачем?»');
  r.noOqMentionInLoops = !document.getElementById('psy-loops').innerHTML.includes('Открытый вопрос');
  DB.whys = [{ id: 9302, day: '2026-01-05', action: 'Сделать паузу', actionDone: true, symptom: 'усталость' }];
  goTo('psy');
  r.doneWhyHidden = document.getElementById('psy-loops').innerHTML.trim() === '';
  DB.whys = savedWhys; DB.oq = savedOq;
  return r;
});
ok(loops2.empty, 'открытые петли: 0 whys — секция пуста (не декоративная карточка)');
ok(loops2.oqAloneNoSection, 'открытые петли: непустые DB.oq сами по себе НЕ создают секцию (вопросы рефлексии, не незавершённые петли)');
ok(loops2.openWhyShown && loops2.noOqMentionInLoops, 'открытые петли: незавершённый разбор «Зачем?» показан, DB.oq не упоминается');
ok(loops2.doneWhyHidden, 'открытые петли: завершённый (actionDone=true) разбор «Зачем?» не показывается');

// 3) Моменты: последний выбирается по РЕАЛЬНОЙ свежести (createdAt), а не
// по позиции в массиве; чтение без мутации исходного массива.
const moments3 = await page.evaluate(() => {
  const saved = DB.moments;
  DB.moments = [
    { id: 9311, day: '2026-01-10', createdAt: '2026-01-10T09:00:00.000Z', valence: 20, activation: 20 }, // новее, но ПЕРВЫЙ
    { id: 9310, day: '2026-01-01', createdAt: '2026-01-01T09:00:00.000Z', valence: 80, activation: 80 }, // старше, ВТОРОЙ
  ];
  const before = JSON.stringify(DB.moments);
  goTo('psy');
  const text = document.getElementById('psy-moments').textContent;
  const unchanged = JSON.stringify(DB.moments) === before;
  DB.moments = saved;
  return { showsNewer: text.includes('01-10'), notOlder: !text.includes('01-01'), unchanged };
});
ok(moments3.showsNewer && moments3.notOlder, 'моменты: показан последний по РЕАЛЬНОЙ свежести (createdAt), а не по индексу массива');
ok(moments3.unchanged, 'моменты: выбор самого свежего не мутирует исходный массив');

// 4) «Посмотреть историю» открывает существующий ov-history.
const hist4 = await page.evaluate(() => {
  goTo('psy');
  document.querySelector('#psy-moments button').click();
  return document.getElementById('ov-history').classList.contains('on');
});
ok(hist4, '«Посмотреть историю» из Психологии открывает существующий ov-history');
await page.evaluate(() => closeOv('ov-history'));

// 5) «Инструменты самопознания»: статичный список ведёт в существующие
// экраны (ov-why, msub patterns/graph/spiritual/evolution в Дневнике —
// destination id не менялись).
const tools5 = await page.evaluate(() => {
  const r = {};
  goTo('psy');
  const whyBtn = [...document.querySelectorAll('#pg-psy button')].find(b => b.getAttribute('onclick') === "openOv('ov-why')");
  whyBtn.click();
  r.why = document.getElementById('ov-why').classList.contains('on');
  closeOv('ov-why');
  goTo('psy');
  const patBtn = [...document.querySelectorAll('#pg-psy button')].find(b => (b.getAttribute('onclick') || '').includes("msub('patterns')"));
  patBtn.click();
  r.patterns = getComputedStyle(document.getElementById('ms-patterns')).display !== 'none';
  goTo('psy');
  const graphBtn = [...document.querySelectorAll('#pg-psy button')].find(b => (b.getAttribute('onclick') || '').includes("msub('graph')"));
  graphBtn.click();
  r.graph = getComputedStyle(document.getElementById('ms-graph')).display !== 'none';
  goTo('psy');
  const spiBtn = [...document.querySelectorAll('#pg-psy button')].find(b => (b.getAttribute('onclick') || '').includes("msub('spiritual')"));
  spiBtn.click();
  r.spiritual = getComputedStyle(document.getElementById('ms-spiritual')).display !== 'none';
  goTo('psy');
  const evoBtn = [...document.querySelectorAll('#pg-psy button')].find(b => (b.getAttribute('onclick') || '').includes("msub('evolution')"));
  evoBtn.click();
  r.evolution = getComputedStyle(document.getElementById('ms-evolution')).display !== 'none';
  return r;
});
ok(tools5.why, '«Зачем?» из «Инструментов самопознания» открывает существующую форму ov-why');
ok(tools5.patterns && tools5.graph && tools5.spiritual && tools5.evolution,
  'Паттерны/Граф связей/Духовное/Эволюция из Психологии открывают существующие экраны Дневника');

// 6) Dock контекста Психологии: «Разбор «Зачем?»» (primary) + «Момент».
await page.evaluate(() => goTo('psy'));
await page.waitForFunction(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const dock = document.getElementById('nsh-context-dock');
  return !dock.hidden && dock.querySelectorAll('button').length === 2;
});
const dock6 = await page.evaluate(() => [...document.querySelectorAll('#nsh-context-dock button')].map(b => b.getAttribute('aria-label')));
ok(JSON.stringify(dock6) === JSON.stringify(['Разбор «Зачем?»', 'Момент']), `dock Психологии: заявленные два действия (${JSON.stringify(dock6)})`);
await page.evaluate(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const btn = [...document.querySelectorAll('#nsh-context-dock button')].find(b => b.getAttribute('aria-label') === 'Разбор «Зачем?»');
  btn.click();
});
ok(await page.evaluate(() => document.getElementById('ov-why').classList.contains('on')), 'dock Психологии: «Разбор «Зачем?»» открывает ov-why');
await page.evaluate(() => closeOv('ov-why'));
await page.evaluate(() => goTo('psy'));
await page.evaluate(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const btn = [...document.querySelectorAll('#nsh-context-dock button')].find(b => b.getAttribute('aria-label') === 'Момент');
  btn.click();
});
ok(await page.evaluate(() => document.getElementById('ov-moment').classList.contains('on')), 'dock Психологии: «Момент» открывает ov-moment');
await page.evaluate(() => closeOv('ov-moment'));

// 7) Reload на #/psychology восстанавливает раздел.
await page.evaluate(() => { location.hash = '#/psychology'; });
await page.reload();
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await page.waitForTimeout(650);
await page.evaluate(() => document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')));
const reload7 = await page.evaluate(() => ({
  onPsy: document.getElementById('pg-psy').classList.contains('on'),
  shellOn: document.body.classList.contains('navshell'),
}));
ok(reload7.shellOn && reload7.onPsy, 'reload на #/psychology восстанавливает раздел Психологии');

// 8) a11y/клавиатура: открытая петля активируется Enter (openWhy → ov-why-det).
await setShell(page, true);
await page.evaluate(() => {
  DB.whys = [{ id: 9321, day: '2026-01-05', action: 'Позвонить другу', actionDone: false, symptom: 'тревога' }];
  goTo('home'); goTo('psy');
});
const a11y8 = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#pg-psy button')];
  const allButtons = els.every(e => e.tagName === 'BUTTON' && e.getAttribute('type') === 'button');
  const named = els.every(e => e.textContent.trim().length > 0);
  const tapOk = els.every(e => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; });
  return { n: els.length, allButtons, named, tapOk };
});
ok(a11y8.n >= 7 && a11y8.allButtons && a11y8.named && a11y8.tapOk,
  `Психология a11y: ${a11y8.n} интерактивных элементов — настоящие button, доступные имена, tap ≥44×44`);
const loopBtn = page.locator('#psy-loops button').first();
await loopBtn.focus();
await page.keyboard.press('Enter');
const kbOpened = await page.evaluate(() => document.getElementById('ov-why-det').classList.contains('on'));
ok(kbOpened, 'Психология: Enter с клавиатуры активирует открытую петлю «Зачем?» (openWhy)');
await page.evaluate(() => closeOv('ov-why-det'));

// 9) iPhone SE/standard/Pro Max: dock не перекрывает tab bar/контент.
await page.close();
for (const [width, height, name] of [[375, 667, 'iPhone SE'], [390, 844, 'iPhone standard'], [430, 932, 'iPhone Pro Max']]) {
  const device = await boot(width, height);
  await setShell(device, true);
  await device.evaluate(() => { goTo('home'); goTo('psy'); });
  await device.waitForFunction(() => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const dock = document.getElementById('nsh-context-dock');
    return !dock.hidden && dock.querySelectorAll('button').length === 2;
  });
  const geometry = await device.evaluate(() => {
    const dock = document.getElementById('nsh-context-dock').getBoundingClientRect();
    const tabbar = document.getElementById('nsh-tabbar').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.content')).paddingBottom);
    const psyVisible = document.getElementById('pg-psy').classList.contains('on');
    return {
      inViewport: dock.left >= 0 && dock.right <= innerWidth + 1,
      aboveTabbar: dock.bottom <= tabbar.top + 2,
      pad, psyVisible,
    };
  });
  ok(geometry.psyVisible && geometry.inViewport && geometry.aboveTabbar && geometry.pad >= 120,
    `${name}: Психология доступна, dock не перекрывает tab bar/контент`);
  await device.close();
}

// 10) iPad portrait: sidebar сохраняется, телефонный dock скрыт.
const ipad = await boot(820, 1180);
await setShell(ipad, true);
await ipad.evaluate(() => { goTo('home'); goTo('psy'); });
const ipad10 = await ipad.evaluate(() => ({
  psyVisible: document.getElementById('pg-psy').classList.contains('on'),
  sidebarStatic: getComputedStyle(document.getElementById('sidebar')).transform === 'none',
  dockHidden: (() => { window.__ARCH_CONTEXT_DOCK__.update(); return document.getElementById('nsh-context-dock').hidden; })(),
}));
ok(ipad10.psyVisible && ipad10.sidebarStatic && ipad10.dockHidden,
  'iPad portrait: sidebar статичен, Психология доступна, телефонный dock скрыт');
await ipad.close();

ok(errors.length === 0, `JS-ошибок нет (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await browser.close();
console.log(`\nПсихология-агрегатор: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
