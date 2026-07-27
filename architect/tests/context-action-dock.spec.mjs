import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  await p.waitForSelector('#nsh-context-dock', { state: 'attached' });
  await p.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
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

async function go(p, tab, sub = null) {
  await p.evaluate(({ tabName, subName }) => {
    goTo(tabName);
    if (subName && tabName === 'map') msub(subName);
    if (subName && tabName === 'astro') asub(subName);
  }, { tabName: tab, subName: sub });
}

async function waitLabels(p, expected) {
  await p.waitForFunction(labels => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const dock = document.getElementById('nsh-context-dock');
    const actual = [...dock.querySelectorAll('button')].map(button => button.getAttribute('aria-label'));
    return !dock.hidden && JSON.stringify(actual) === JSON.stringify(labels);
  }, expected);
}

async function waitHidden(p) {
  await p.waitForFunction(() => {
    window.__ARCH_CONTEXT_DOCK__.update();
    return document.getElementById('nsh-context-dock').hidden;
  });
}

async function activate(p, label) {
  await p.evaluate(actionLabel => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const button = [...document.querySelectorAll('#nsh-context-dock button')]
      .find(item => item.getAttribute('aria-label') === actionLabel);
    if (!button) throw new Error(`context action not found: ${actionLabel}`);
    button.click();
  }, label);
}

async function closeOverlay(p, id) {
  await p.evaluate(overlayId => closeOv(overlayId), id);
}

const page = await boot();
const dock = page.locator('#nsh-context-dock');

await setShell(page, false);
await waitHidden(page);
ok(await dock.isHidden(), 'OFF-флаг: context dock скрыт');

await setShell(page, true);
await go(page, 'home');
await waitHidden(page);
ok(await dock.isHidden(), 'Сегодня: dock не меняет дизайн Today');
ok(await page.locator('#nsh-fab').getAttribute('aria-label') === 'Записать', 'Глобальный FAB остаётся «Записать»');

await go(page, 'map', 'insights');
await waitLabels(page, ['Новый инсайт']);
await activate(page, 'Новый инсайт');
await page.waitForFunction(() => document.getElementById('ov-add').classList.contains('on'));
ok(true, 'Дневник/Инсайты открывает существующую ov-add');
await closeOverlay(page, 'ov-add');

await go(page, 'map', 'dreams');
await waitLabels(page, ['Записать сон']);
const dream = dock.getByRole('button', { name: 'Записать сон' });
await dream.focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('ov-drm').classList.contains('on'));
await waitHidden(page);
ok(true, 'Дневник/Сны работает с клавиатуры и скрывает dock при форме');
await closeOverlay(page, 'ov-drm');

for (const [sub, label, overlay] of [
  ['patterns', 'Новый паттерн', 'ov-pat-add'],
  ['spiritual', 'Новая запись', 'ov-spi-add'],
  ['evolution', 'Новая запись', 'ov-evo-add'],
]) {
  await go(page, 'map', sub);
  await waitLabels(page, [label]);
  await activate(page, label);
  await page.waitForFunction(id => document.getElementById(id).classList.contains('on'), overlay);
  ok(true, `Дневник/${sub} открывает ${overlay}`);
  await closeOverlay(page, overlay);
}

await go(page, 'map', 'graph');
await waitHidden(page);
ok(true, 'Дневник/Карта не получает выдуманного действия');

await go(page, 'vit');
await page.evaluate(() => { DB.spheres = []; });
await waitLabels(page, ['Отметить сферу', 'Новая сфера']);
await activate(page, 'Отметить сферу');
ok(await page.locator('#pg-vit').evaluate(element => element.classList.contains('on')), '0 сфер: переход к созданию без ложной записи');

await page.evaluate(() => {
  DB.spheres = [{ id: 8101, name: 'Отношения', icon: '❤', type: 'score' }];
  window.__sphereOriginal = window.openSphereLog;
  window.__sphereCall = null;
  window.openSphereLog = id => { window.__sphereCall = id; };
});
await waitLabels(page, ['Отметить сферу', 'Новая сфера']);
await activate(page, 'Отметить сферу');
ok(await page.evaluate(() => window.__sphereCall === 8101), '1 сфера: вызывается openSphereLog с правильным id');
await page.evaluate(() => {
  window.openSphereLog = window.__sphereOriginal;
  delete window.__sphereOriginal;
  delete window.__sphereCall;
  DB.spheres = [
    { id: 8101, name: 'Отношения', icon: '❤', type: 'score' },
    { id: 8102, name: 'Здоровье', icon: '●', type: 'score' },
  ];
});
await waitLabels(page, ['Отметить сферу', 'Новая сфера']);
await activate(page, 'Отметить сферу');
await page.waitForFunction(() => document.getElementById('ov-sphere-pick').classList.contains('on'));
ok(await page.locator('#sphere-pick-list button').count() === 2, 'N сфер: явный выбор, без автозаписи в первую');
await closeOverlay(page, 'ov-sphere-pick');

await go(page, 'health');
await waitLabels(page, ['Симптом', 'Измерение', 'Тяга']);
ok(true, 'Здоровье показывает Симптом / Измерение / Тяга');
for (const [label, overlay] of [['Симптом', 'ov-symptom'], ['Измерение', 'ov-measure'], ['Тяга', 'ov-craving']]) {
  await waitLabels(page, ['Симптом', 'Измерение', 'Тяга']);
  await activate(page, label);
  await page.waitForFunction(id => document.getElementById(id).classList.contains('on'), overlay);
  ok(true, `Здоровье/${label} открывает ${overlay}`);
  await closeOverlay(page, overlay);
}

await page.evaluate(() => {
  window.__digOriginal = window.mkDig;
  window.__digCalls = 0;
  window.mkDig = () => { window.__digCalls += 1; };
});
await go(page, 'sys');
await waitLabels(page, ['Обзор недели', 'Отчёт врачу']);
await activate(page, 'Обзор недели');
ok(await page.evaluate(() => window.__digCalls === 1), 'Обзор недели вызывает существующий mkDig');
await page.evaluate(() => {
  window.mkDig = window.__digOriginal;
  delete window.__digOriginal;
  delete window.__digCalls;
});
await waitLabels(page, ['Обзор недели', 'Отчёт врачу']);
await activate(page, 'Отчёт врачу');
await page.waitForFunction(() => document.getElementById('ov-doc-report').classList.contains('on'));
ok(true, 'Отчёт врачу открывает существующую форму');
await closeOverlay(page, 'ov-doc-report');

await go(page, 'astro', 'natal');
await waitLabels(page, ['Колесо карты']);
await page.evaluate(() => {
  window.__wheelOriginal = window.openFullWheel;
  window.__wheelCalls = 0;
  window.openFullWheel = () => { window.__wheelCalls += 1; };
});
await activate(page, 'Колесо карты');
ok(await page.evaluate(() => window.__wheelCalls === 1), 'Натальная карта вызывает существующий openFullWheel');
await page.evaluate(() => {
  window.openFullWheel = window.__wheelOriginal;
  delete window.__wheelOriginal;
  delete window.__wheelCalls;
});

await go(page, 'settings');
await waitHidden(page);
ok(true, 'Настройки не получают выдуманного действия');

await go(page, 'map', 'dreams');
await waitLabels(page, ['Записать сон']);
const a11y = await dock.getByRole('button').evaluateAll(items => items.every(button => {
  const rect = button.getBoundingClientRect();
  return button.tagName === 'BUTTON' && button.type === 'button' && Boolean(button.getAttribute('aria-label')) && rect.width >= 44 && rect.height >= 44;
}));
ok(a11y, 'A11y: button, имя, tap target ≥44×44');
await page.evaluate(() => openOv('ov-search'));
await waitHidden(page);
ok(true, 'Открытый overlay скрывает context dock');
await closeOverlay(page, 'ov-search');

await go(page, 'health');
await waitLabels(page, ['Симптом', 'Измерение', 'Тяга']);
await page.reload();
await page.waitForSelector('#nsh-context-dock', { state: 'attached' });
await page.evaluate(() => {
  const splash = document.getElementById('splash');
  if (splash) splash.style.display = 'none';
});
await waitLabels(page, ['Симптом', 'Измерение', 'Тяга']);
ok(true, 'Reload восстанавливает правильный dock для #/health');
await page.close();

for (const [width, height, name] of [[375, 667, 'iPhone SE'], [430, 932, 'iPhone Pro Max']]) {
  const device = await boot(width, height);
  await setShell(device, true);
  await go(device, 'health');
  await waitLabels(device, ['Симптом', 'Измерение', 'Тяга']);
  const geometry = await device.evaluate(() => {
    const d = document.getElementById('nsh-context-dock').getBoundingClientRect();
    const t = document.getElementById('nsh-tabbar').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.content')).paddingBottom);
    return { inViewport: d.left >= 0 && d.right <= innerWidth + 1, aboveTabbar: d.bottom <= t.top + 2, pad };
  });
  ok(geometry.inViewport && geometry.aboveTabbar && geometry.pad >= 120, `${name}: dock не перекрывает tab bar/контент`);
  await device.close();
}

const ipad = await boot(820, 1180);
await setShell(ipad, true);
await go(ipad, 'health');
await waitHidden(ipad);
ok(true, 'iPad: dock скрыт, используется sidebar');
await ipad.close();

ok(errors.length === 0, `JS-ошибок нет (${errors.length})`);
await browser.close();
console.log(`\nContext action dock: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
