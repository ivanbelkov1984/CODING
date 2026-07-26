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
await page.waitForSelector('#nsh-context-dock');
await page.evaluate(() => {
  const splash = document.getElementById('splash');
  if (splash) splash.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
  localStorage.setItem('arch_nav_v2', '0');
  applyNavShell();
  window.__ARCH_CONTEXT_DOCK__.update();
});

const dock = page.locator('#nsh-context-dock');
ok(await dock.isHidden(), 'OFF-флаг: context dock скрыт');

await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '1');
  applyNavShell();
  goTo('home');
  window.__ARCH_CONTEXT_DOCK__.update();
});
ok(await dock.isHidden(), 'Сегодня: dock не меняет дизайн Today');

async function openDiary(sub) {
  await page.evaluate(section => {
    goTo('map');
    msub(section);
    window.__ARCH_CONTEXT_DOCK__.update();
  }, sub);
}

await openDiary('insights');
let buttons = dock.getByRole('button');
ok(await buttons.count() === 1 && await buttons.first().getAttribute('aria-label') === 'Новый инсайт', 'Дневник/Инсайты: правильное действие');
await buttons.first().click();
ok(await page.locator('#ov-add').evaluate(element => element.classList.contains('on')), 'Новый инсайт открывает существующую ov-add');
await page.evaluate(() => closeOv('ov-add'));

await openDiary('dreams');
const dreamButton = dock.getByRole('button', { name: 'Записать сон' });
await dreamButton.focus();
await page.keyboard.press('Enter');
ok(await page.locator('#ov-drm').evaluate(element => element.classList.contains('on')), 'Записать сон работает с клавиатуры и открывает ov-drm');
ok(await dock.isHidden(), 'При открытой форме dock скрыт и не перехватывает фокус');
await page.evaluate(() => closeOv('ov-drm'));
await page.waitForFunction(() => !document.getElementById('nsh-context-dock').hidden);

for (const [sub, label, overlay] of [
  ['patterns', 'Новый паттерн', 'ov-pat-add'],
  ['spiritual', 'Новая запись', 'ov-spi-add'],
  ['evolution', 'Новая запись', 'ov-evo-add'],
]) {
  await openDiary(sub);
  const action = dock.getByRole('button', { name: label });
  ok(await action.count() === 1, `Дневник/${sub}: действие доступно`);
  await action.click();
  ok(await page.locator('#' + overlay).evaluate(element => element.classList.contains('on')), `Дневник/${sub}: открывается ${overlay}`);
  await page.evaluate(id => closeOv(id), overlay);
}

await page.evaluate(() => {
  DB.spheres = [
    { id: 8101, name: 'Отношения', icon: '❤', type: 'score' },
    { id: 8102, name: 'Здоровье', icon: '●', type: 'score' },
  ];
  goTo('vit');
  window.__ARCH_CONTEXT_DOCK__.update();
});
buttons = dock.getByRole('button');
ok(await buttons.count() === 2, 'Сферы: Отметить сферу + Новая сфера');
await dock.getByRole('button', { name: 'Отметить сферу' }).click();
ok(await page.locator('#ov-sphere-pick').evaluate(element => element.classList.contains('on')), 'Несколько сфер: открывается явный выбор, первая не выбирается автоматически');
ok(await page.locator('#sphere-pick-list button').count() === 2, 'Выбор показывает обе сферы');
await page.evaluate(() => closeOv('ov-sphere-pick'));

await page.evaluate(() => {
  goTo('health');
  window.__ARCH_CONTEXT_DOCK__.update();
});
const healthLabels = await dock.getByRole('button').evaluateAll(items => items.map(item => item.getAttribute('aria-label')));
ok(healthLabels.join('|') === 'Симптом|Измерение|Тяга', 'Здоровье: три существующих действия в правильном порядке');
for (const [label, overlay] of [['Симптом', 'ov-symptom'], ['Измерение', 'ov-measure'], ['Тяга', 'ov-craving']]) {
  await dock.getByRole('button', { name: label }).click();
  ok(await page.locator('#' + overlay).evaluate(element => element.classList.contains('on')), `Здоровье/${label}: открывается ${overlay}`);
  await page.evaluate(id => closeOv(id), overlay);
  await page.waitForFunction(() => !document.getElementById('nsh-context-dock').hidden);
}

await page.evaluate(() => {
  DB.digests = [];
  goTo('sys');
  window.__ARCH_CONTEXT_DOCK__.update();
});
const overviewLabels = await dock.getByRole('button').evaluateAll(items => items.map(item => item.getAttribute('aria-label')));
ok(overviewLabels.join('|') === 'Обзор недели|Отчёт врачу', 'Обзор: обзор недели + отчёт врачу');
await dock.getByRole('button', { name: 'Обзор недели' }).click();
ok(await page.evaluate(() => DB.digests.length === 1), 'Обзор недели вызывает существующий mkDig');
await dock.getByRole('button', { name: 'Отчёт врачу' }).click();
ok(await page.locator('#ov-doc-report').evaluate(element => element.classList.contains('on')), 'Отчёт врачу вызывает существующий генератор отчёта');
await page.evaluate(() => closeOv('ov-doc-report'));

await page.evaluate(() => {
  goTo('settings');
  window.__ARCH_CONTEXT_DOCK__.update();
});
ok(await dock.isHidden(), 'Настройки: без придуманного действия dock скрыт');

await openDiary('dreams');
const a11y = await dock.getByRole('button').evaluateAll(items => items.every(button => {
  const rect = button.getBoundingClientRect();
  return button.tagName === 'BUTTON' && button.type === 'button' && Boolean(button.getAttribute('aria-label')) && rect.width >= 44 && rect.height >= 44;
}));
ok(a11y, 'A11y: semantic button, доступное имя, tap target ≥44×44');

for (const [width, height, name] of [[375, 667, 'iPhone SE'], [430, 932, 'iPhone Pro Max']]) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => {
    goTo('health');
    window.__ARCH_CONTEXT_DOCK__.update();
  });
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
ok(await dock.isHidden(), 'iPad: первый этап dock скрыт, используется sidebar');

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => {
  goTo('health');
  window.__ARCH_CONTEXT_DOCK__.update();
});
await page.reload();
await page.waitForSelector('#nsh-context-dock');
await page.evaluate(() => {
  const splash = document.getElementById('splash');
  if (splash) splash.style.display = 'none';
  window.__ARCH_CONTEXT_DOCK__.update();
});
const reloadLabels = await dock.getByRole('button').evaluateAll(items => items.map(item => item.getAttribute('aria-label')));
ok(location.hash !== '#/health' || reloadLabels.join('|') === 'Симптом|Измерение|Тяга', 'Перезагрузка не оставляет dock от предыдущего раздела');

ok(errors.length === 0, `JS-ошибок нет (${errors.length})`);
await browser.close();
console.log(`\nContext action dock: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
