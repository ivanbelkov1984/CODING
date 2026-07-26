import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');
let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.log('  ✗ ' + message); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.goto(FILE);
await page.waitForSelector('#nsh-context-dock', { state: 'attached' });

const dock = page.locator('#nsh-context-dock');
const labelsNow = () => page.evaluate(() => [...document.querySelectorAll('#nsh-context-dock button')]
  .map(button => button.getAttribute('aria-label')));

async function resetUi() {
  await page.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
}

async function waitHidden() {
  await page.waitForFunction(() => {
    window.__ARCH_CONTEXT_DOCK__.update();
    return document.getElementById('nsh-context-dock').hidden;
  });
}

async function waitLabels(expected) {
  await page.waitForFunction(labels => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const element = document.getElementById('nsh-context-dock');
    const actual = [...element.querySelectorAll('button')].map(button => button.getAttribute('aria-label'));
    return !element.hidden && JSON.stringify(actual) === JSON.stringify(labels);
  }, expected);
}

async function go(tab, sub = null) {
  await page.evaluate(({ tabName, subName }) => {
    goTo(tabName);
    if (subName) {
      if (tabName === 'map') msub(subName);
      if (tabName === 'astro') asub(subName);
    }
  }, { tabName: tab, subName: sub });
}

async function activate(label) {
  await page.evaluate(actionLabel => {
    window.__ARCH_CONTEXT_DOCK__.update();
    const button = [...document.querySelectorAll('#nsh-context-dock button')]
      .find(item => item.getAttribute('aria-label') === actionLabel);
    if (!button) throw new Error(`context action not found: ${actionLabel}`);
    button.click();
  }, label);
}

await resetUi();
await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '0');
  applyNavShell();
});
await waitHidden();
ok(await dock.isHidden(), 'OFF-флаг: context dock скрыт');

await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '1');
  applyNavShell();
});
await go('home');
await waitHidden();
ok(await dock.isHidden(), 'Сегодня: dock не меняет дизайн Today');
ok(await page.locator('#nsh-fab').getAttribute('aria-label') === 'Записать', 'Глобальный FAB остаётся «Записать»');

await go('map', 'insights');
await waitLabels(['Новый инсайт']);
ok((await labelsNow()).join('|') === 'Новый инсайт', 'Дневник/Инсайты: правильное действие');
await activate('Новый инсайт');
await page.waitForFunction(() => document.getElementById('ov-add').classList.contains('on'));
ok(true, 'Новый инсайт открывает существующую ov-add');
await waitHidden();
await page.evaluate(() => closeOv('ov-add'));

await go('map', 'dreams');
await waitLabels(['Записать сон']);
const dreamButton = dock.getByRole('button', { name: 'Записать сон' });
await dreamButton.focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('ov-drm').classList.contains('on'));
ok(true, 'Записать сон работает с клавиатуры и открывает ov-drm');
await waitHidden();
ok(await dock.isHidden(), 'При открытой форме dock скрыт и не перехватывает фокус');
await page.evaluate(() => closeOv('ov-drm'));

for (const [sub, label, overlay] of [
  ['patterns', 'Новый паттерн', 'ov-pat-add'],
  ['spiritual', 'Новая запись', 'ov-spi-add'],
  ['evolution', 'Новая запись', 'ov-evo-add'],
]) {
  await go('map', sub);
  await waitLabels([label]);
  ok(true, `Дневник/${sub}: действие доступно`);
  await activate(label);
  await page.waitForFunction(id => document.getElementById(id).classList.contains('on'), overlay);
  ok(true, `Дневник/${sub}: открывается ${overlay}`);
  await page.evaluate(id => closeOv(id), overlay);
}

await go('map', 'graph');
await waitHidden();
ok(await dock.isHidden(), 'Дневник/Карта: без придуманного действия dock скрыт');

await go('vit');
await page.evaluate(() => { DB.spheres = []; });
await waitLabels(['Отметить сферу', 'Новая сфера']);
await activate('Отметить сферу');
await page.waitForFunction(() => !document.getElementById('ov-sphere-pick').classList.contains('on'));
ok(await page.locator('#pg-vit').evaluate(element => element.classList.contains('on')), '0 сфер: остаёмся в «Сферах» и не создаём ложную запись');

await page.evaluate(() => {
  DB.spheres = [{ id: 8101, name: 'Отношения', icon: '❤', type: 'score' }];
  window.__sphereDockCall = null;
  window.__sphereDockOriginal = window.openSphereLog;
  window.openSphereLog = id => { window.__sphereDockCall = id; };
});
await waitLabels(['Отметить сферу', 'Новая сфера']);
await activate('Отметить сферу');
ok(await page.evaluate(() => window.__sphereDockCall === 8101), '1 сфера: сразу вызывается существующий openSphereLog с её id');
await page.evaluate(() => {
  window.openSphereLog = window.__sphereDockOriginal;
  delete window.__sphereDockOriginal;
  delete window.__sphereDockCall;
  DB.spheres = [
    { id: 8101, name: 'Отношения', icon: '❤', type: 'score' },
    { id: 8102, name: 'Здоровье', icon: '●', type: 'score' },
  ];
});
await waitLabels(['Отметить сферу', 'Новая сфера']);
await activate('Отметить сферу');
await page.waitForFunction(() => document.getElementById('ov-sphere-pick').classList.contains('on'));
ok(await page.locator('#sphere-pick-list button').count() === 2, 'N сфер: открывается явный выбор, первая не выбирается автоматически');
await page.evaluate(() => closeOv('ov-sphere-pick'));

await go('health');
await waitLabels(['Симптом', 'Измерение', 'Тяга']);
ok((await labelsNow()).join('|') === 'Симптом|Измерение|Тяга', 'Здоровье: три существующих действия в правильном порядке');
for (const [label, overlay] of [['Симптом', 'ov-symptom'], ['Измерение', 'ov-measure'], ['Тяга', 'ov-craving']]) {
  await waitLabels(['Симптом', 'Измерение', 'Тяга']);
  await activate(label);
  await page.waitForFunction(id => document.getElementById(id).classList.contains('on'), overlay);
  ok(true, `Здоровье/${label}: открывается ${overlay}`);
  await page.evaluate(id => closeOv(id), overlay);
}

await page.evaluate(() => {
  window.__dockMkDigCalls = 0;
  window.__dockMkDigOriginal = window.mkDig;
  window.mkDig = () => { window.__dockMkDigCalls += 1; };
});
await go('sys');
await waitLabels(['Обзор недели', 'Отчёт врачу']);
ok(true, 'Обзор: обзор недели + отчёт врачу');
await activate('Обзор недели');
ok(await page.evaluate(() => window.__dockMkDigCalls === 1), 'Обзор недели вызывает существующий mkDig');
await page.evaluate(() => {
  window.mkDig = window.__dockMkDigOriginal;
  delete window.__dockMkDigOriginal;
  delete window.__dockMkDigCalls;
});
await waitLabels(['Обзор недели', 'Отчёт врачу']);
await activate('Отчёт врачу');
await page.waitForFunction(() => document.getElementById('ov-doc-report').classList.contains('on'));
ok(true, 'Отчёт врачу вызывает существующий генератор отчёта');
await page.evaluate(() => closeOv('ov-doc-report'));

await go('astro', 'natal');
await waitLabels(['Колесо карты']);
await page.evaluate(() => {
  window.__dockWheelCalls = 0;
  window.__dockWheelOriginal = window.openFullWheel;
  window.openFullWheel = () => { window.__dockWheelCalls += 1; };
});
await activate('Колесо карты');
ok(await page.evaluate(() => window.__dockWheelCalls === 1), 'Натальная карта: dock вызывает существующий openFullWheel');
await page.evaluate(() => {
  window.openFullWheel = window.__dockWheelOriginal;
  delete window.__dockWheelOriginal;
  delete window.__dockWheelCalls;
});

await go('settings');
await waitHidden();
ok(await dock.isHidden(), 'Настройки: без придуманного действия dock скрыт');

await go('map', 'dreams');
await waitLabels(['Записать сон']);
const a11y = await dock.getByRole('button').evaluateAll(items => items.every(button => {
  const rect = button.getBoundingClientRect();
  return button.tagName === 'BUTTON' && button.type === 'button' && Boolean(button.getAttribute('aria-label')) && rect.width >= 44 && rect.height >= 44;
}));
ok(a11y, 'A11y: semantic button, доступное имя, tap target ≥44×44');

await page.evaluate(() => openOv('ov-search'));
await waitHidden();
ok(await dock.isHidden(), 'Любой открытый overlay скрывает context dock');
await page.evaluate(() => closeOv('ov-search'));

for (const [width, height, name] of [[375, 667, 'iPhone SE'], [430, 932, 'iPhone Pro Max']]) {
  await page.setViewportSize({ width, height });
  await go('health');
  await waitLabels(['Симптом', 'Измерение', 'Тяга']);
  const geometry = await page.evaluate(() => {
    const d = document.getElementById('nsh-context-dock').getBoundingClientRect();
    const t = document.getElementById('nsh-tabbar').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.content')).paddingBottom);
    return { inViewport: d.left >= 0 && d.right <= innerWidth + 1, aboveTabbar: d.bottom <= t.top + 2, pad };
  });
  ok(geometry.inViewport && geometry.aboveTabbar && geometry.pad >= 120, `${name}: dock не перекрывает tab bar/контент`);
}

await page.setViewportSize({ width: 820, height: 1180 });
await page.evaluate(() => window.__ARCH_CONTEXT_DOCK__.update());
await waitHidden();
ok(await dock.isHidden(), 'iPad: первый этап dock скрыт, используется sidebar');

await page.setViewportSize({ width: 390, height: 844 });
await go('health');
await waitLabels(['Симптом', 'Измерение', 'Тяга']);
await page.reload();
await page.waitForSelector('#nsh-context-dock', { state: 'attached' });
await page.evaluate(() => {
  const splash = document.getElementById('splash');
  if (splash) splash.style.display = 'none';
});
await waitLabels(['Симптом', 'Измерение', 'Тяга']);
ok(true, 'Перезагрузка восстанавливает правильный dock для #/health');

ok(errors.length === 0, `JS-ошибок нет (${errors.length})`);
await browser.close();
console.log(`\nContext action dock: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
