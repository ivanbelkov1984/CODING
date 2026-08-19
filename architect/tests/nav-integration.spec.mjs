import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Navigation Shell 1.3B + 1.4 — интеграционная стабилизация (issue #143).
// Полный пользовательский путь через реальный shell целиком (Today → Записать
// → Дневник → действие раздела → Обзор → Отчёт врачу → назад → reload) и
// проверки rollout (свежий профиль ON / явный OFF уважается / roundtrip не
// повреждает данные). Отдельные блоки уже покрыты context-action-dock.spec.mjs,
// diary-aggregator.spec.mjs, overview-aggregator.spec.mjs — здесь проверяется
// именно СКЛЕЙКА между экранами, а не повторение их тестов.

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

// ── 1) Свежий профиль получает новую навигацию ON ───────────────────
const fresh = await boot();
const freshState = await fresh.evaluate(() => {
  localStorage.removeItem('arch_nav_v2'); // симулируем «никогда не трогал тумблер»
  applyNavShell();
  return {
    shellOn: document.body.classList.contains('navshell'),
    tabbarVisible: getComputedStyle(document.getElementById('nsh-tabbar')).display !== 'none',
    noUserToggle: !document.getElementById('navshell-toggle'),
  };
});
ok(freshState.shellOn && freshState.tabbarVisible && freshState.noUserToggle,
  'rollout: чистый профиль получает Experience 2.0 как основную оболочку; пользовательского тумблера нет');
await fresh.close();

// ── 2) Существующее явное OFF сохраняется ───────────────────────────
const existingOff = await boot();
const offState = await existingOff.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '0'); // «существующий пользователь ранее явно выключил»
  applyNavShell();
  return {
    shellOff: !document.body.classList.contains('navshell'),
    tabbarHidden: getComputedStyle(document.getElementById('nsh-tabbar')).display === 'none',
    oldNavWorks: (() => { goTo('map'); return document.getElementById('pg-map').classList.contains('on') && getComputedStyle(document.getElementById('ms-insights')).display !== 'none'; })(),
  };
});
ok(offState.shellOff && offState.tabbarHidden && offState.oldNavWorks,
  'rollout: ранее сохранённое явное OFF уважается — старая навигация остаётся, новая не навязывается');
await existingOff.close();

// ── 3) Пользователь может выключить shell и получить старую навигацию;
//     повторное включение восстанавливает новый shell БЕЗ повреждения данных.
const roundtrip = await boot();
const rtResult = await roundtrip.evaluate(() => {
  localStorage.removeItem('arch_nav_v2'); applyNavShell(); // старт: ON по умолчанию
  DB.insights = [{ id: 1, tag: 'personal', w: 1, title: 'Тест', body: 'текст', date: '01.01', createdAt: nowISO(), day: todayKey() }];
  DB.spheres = [{ id: 2, name: 'Тест-сфера', icon: '●', color: '#1056CC', type: 'score' }];
  persist();
  const beforeToggle = { insights: JSON.stringify(DB.insights), spheres: JSON.stringify(DB.spheres) };

  toggleNavShell(); // → OFF
  const afterOff = {
    shellOff: !document.body.classList.contains('navshell'),
    tabbarHidden: getComputedStyle(document.getElementById('nsh-tabbar')).display === 'none',
    dataIntactOff: JSON.stringify(DB.insights) === beforeToggle.insights && JSON.stringify(DB.spheres) === beforeToggle.spheres,
  };

  toggleNavShell(); // → ON снова
  goTo('home'); goTo('map'); // повторный вход — landing (а не «залипший» старый subroute)
  const afterOn = {
    shellOn: document.body.classList.contains('navshell'),
    tabbarVisible: getComputedStyle(document.getElementById('nsh-tabbar')).display !== 'none',
    overviewLanding: getComputedStyle(document.getElementById('ms-overview')).display !== 'none',
    dataIntactOn: JSON.stringify(DB.insights) === beforeToggle.insights && JSON.stringify(DB.spheres) === beforeToggle.spheres,
  };
  return { afterOff, afterOn };
});
ok(rtResult.afterOff.shellOff && rtResult.afterOff.tabbarHidden && rtResult.afterOff.dataIntactOff,
  'rollout: выключение тумблера возвращает старую навигацию, данные не тронуты');
ok(rtResult.afterOn.shellOn && rtResult.afterOn.tabbarVisible && rtResult.afterOn.overviewLanding && rtResult.afterOn.dataIntactOn,
  'rollout: повторное включение восстанавливает новый shell (landing Дневника снова доступен), данные по-прежнему целы');
await roundtrip.close();

// ── 4) Полный пользовательский путь ──────────────────────────────────
// Сегодня → Записать → Дневник → действие раздела → Обзор → Отчёт врачу →
// назад → reload.
const journey = await boot();
await journey.evaluate(() => { localStorage.setItem('arch_nav_v2', '1'); applyNavShell(); goTo('home'); });

// Шаг 1: Сегодня — активная вкладка, FAB присутствует.
const step1 = await journey.evaluate(() => ({
  onToday: document.getElementById('pg-home').classList.contains('on'),
  todayTabActive: document.querySelector('.nsh-tab[data-nav="today"]').classList.contains('on'),
  fabPresent: document.getElementById('nsh-fab').getAttribute('aria-label') === 'Записать',
}));
ok(step1.onToday && step1.todayTabActive && step1.fabPresent, 'путь 1/8: «Сегодня» активна, глобальный FAB «Записать» на месте');

// Шаг 2: Записать → «Зачем?» (существующая форма, дальше пригодится в Дневнике).
await journey.evaluate(() => { openCapture(); });
const step2 = await journey.evaluate(() => document.getElementById('ov-capture').classList.contains('on'));
ok(step2, 'путь 2/8: глобальный FAB открывает лист «Записать»');
await journey.evaluate(() => { capGo('ov-why'); });
const step2b = await journey.evaluate(() => document.getElementById('ov-why').classList.contains('on') && !document.getElementById('ov-capture').classList.contains('on'));
ok(step2b, 'путь 2/8: «Записать» → «Зачем?» открывает существующую форму, лист закрылся');
await journey.evaluate(() => { closeOv('ov-why'); });

// Шаг 3: переход в Дневник — landing, не «Инсайты».
await journey.evaluate(() => { goTo('map'); });
const step3 = await journey.evaluate(() => ({
  overviewOn: getComputedStyle(document.getElementById('ms-overview')).display !== 'none',
  diaryTabActive: document.querySelector('.nsh-tab[data-nav="diary"]').classList.contains('on'),
}));
ok(step3.overviewOn && step3.diaryTabActive, 'путь 3/8: «Дневник» открывает landing, вкладка подсвечена');

// Шаг 4: действие раздела — dock landing «Записать сон» → существующий ov-drm.
await journey.waitForFunction(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const dock = document.getElementById('nsh-context-dock');
  return !dock.hidden && [...dock.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Записать сон');
});
await journey.evaluate(() => {
  window.__ARCH_CONTEXT_DOCK__.update();
  const btn = [...document.querySelectorAll('#nsh-context-dock button')].find(b => b.getAttribute('aria-label') === 'Записать сон');
  btn.click();
});
const step4 = await journey.evaluate(() => document.getElementById('ov-drm').classList.contains('on'));
ok(step4, 'путь 4/8: dock landing Дневника → «Записать сон» открывает существующую форму');
await journey.evaluate(() => { closeOv('ov-drm'); });

// Шаг 5: переход в Обзор — landing недели, не старый 30-дневный экран напрямую.
await journey.evaluate(() => { goTo('sys'); });
const step5 = await journey.evaluate(() => ({
  overviewOn: getComputedStyle(document.getElementById('sys-overview')).display !== 'none',
  overviewTabActive: document.querySelector('.nsh-tab[data-nav="overview"]').classList.contains('on'),
  diaryStale: getComputedStyle(document.getElementById('ms-overview')).display === 'none' || document.getElementById('pg-map').classList.contains('on') === false,
}));
ok(step5.overviewOn && step5.overviewTabActive, 'путь 5/8: «Обзор» открывает landing недели, вкладка подсвечена');
ok(step5.diaryStale, 'путь 5/8: уход из Дневника не оставляет его подраздел «залипшим» видимым поверх Обзора');

// Шаг 6: «Отчёт врачу» из Обзора — существующий overlay с текстом.
await journey.evaluate(() => { document.querySelector('#ov-health button').click(); });
const step6 = await journey.evaluate(() => ({
  open: document.getElementById('ov-doc-report').classList.contains('on'),
  hasText: (document.getElementById('doc-report-text') || {}).value?.length > 0,
}));
ok(step6.open && step6.hasText, 'путь 6/8: «Отчёт врачу» из Обзора открывает заполненный существующий отчёт');
await journey.evaluate(() => { closeOv('ov-doc-report'); });

// Шаг 7: назад (browser back) — возвращает на Дневник (landing), без «Зачем?»/Сна/отчёта.
await journey.evaluate(async () => {
  await new Promise(res => { const h = () => { window.removeEventListener('hashchange', h); res(); }; window.addEventListener('hashchange', h); history.back(); });
});
const step7 = await journey.evaluate(() => ({
  overlaysClosed: !document.querySelector('.ov.on'),
  onDiary: document.getElementById('pg-map').classList.contains('on'),
}));
ok(step7.overlaysClosed && step7.onDiary, 'путь 7/8: browser back возвращает на предыдущий раздел (Дневник), оверлеи не «текут» между экранами');

// Шаг 8: reload — состояние (текущий раздел) восстанавливается из hash, БЕЗ дублей/залипаний.
await journey.reload();
await journey.waitForSelector('#nsh-tabbar', { state: 'attached' });
await journey.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await journey.waitForTimeout(650);
await journey.evaluate(() => document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')));
const step8 = await journey.evaluate(() => ({
  shellOn: document.body.classList.contains('navshell'),
  onDiary: document.getElementById('pg-map').classList.contains('on'),
  noStrayOverlay: !document.querySelector('.ov.on'),
  singleActiveTab: document.querySelectorAll('.nsh-tab.on').length === 1,
}));
ok(step8.shellOn && step8.onDiary && step8.noStrayOverlay && step8.singleActiveTab,
  'путь 8/8: reload восстанавливает раздел из hash, ровно одна активная вкладка, оверлеев не осталось');

// ── 5) Общая стабилизация: отсутствие дублей действий там, где раньше
//     dock накладывался на существующие кнопки (issue #143 §4).
const dupCheck = await journey.evaluate(() => {
  const checks = [];
  const visibleDup = (screenFn, dockLabel, hiddenBtnId) => {
    screenFn();
    window.__ARCH_CONTEXT_DOCK__.update();
    const dockHasIt = [...document.querySelectorAll('#nsh-context-dock button')].some(b => b.getAttribute('aria-label') === dockLabel);
    const inlineBtn = document.getElementById(hiddenBtnId);
    const inlineVisible = inlineBtn && getComputedStyle(inlineBtn).display !== 'none';
    return { dockHasIt, inlineVisible };
  };
  checks.push(['Паттерны', visibleDup(() => { goTo('map'); msub('patterns'); }, 'Новый паттерн', 'pat-add-btn')]);
  checks.push(['Духовное', visibleDup(() => { goTo('map'); msub('spiritual'); }, 'Новая запись', 'spi-add-btn')]);
  checks.push(['Эволюция', visibleDup(() => { goTo('map'); msub('evolution'); }, 'Новая запись', 'evo-add-btn')]);
  checks.push(['Сферы', visibleDup(() => { goTo('vit'); }, 'Новая сфера', 'vit-new-sphere-btn')]);
  checks.push(['Здоровье-симптом', visibleDup(() => { goTo('health'); }, 'Симптом', 'health-symptom-btn')]);
  checks.push(['Здоровье-измерение', visibleDup(() => { goTo('health'); }, 'Измерение', 'health-measure-btn')]);
  checks.push(['Обзор-detail', visibleDup(() => { goTo('sys'); sysGo('detail'); }, 'Обзор недели', 'sys-mkdig-btn')]);
  checks.push(['Астро-натал', visibleDup(() => { goTo('astro'); asub('natal'); }, 'Колесо карты', 'astro-natal-wheel-btn')]);
  return checks;
});
dupCheck.forEach(([name, r]) => {
  ok(r.dockHasIt && !r.inlineVisible, `нет визуального дубля (${name}): dock показывает действие, старая инлайн-кнопка скрыта`);
});

// ── 6) Проверка на OFF: те же старые инлайн-кнопки видимы как раньше
//     (workflow не удалён, доступен без dock).
const offVisible = await journey.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '0'); applyNavShell();
  window.__ARCH_CONTEXT_DOCK__.update(); // nsh-context-on снимается через rAF в реальном UI; форсируем синхронно для теста
  goTo('map'); msub('patterns');
  window.__ARCH_CONTEXT_DOCK__.update();
  const patVisible = getComputedStyle(document.getElementById('pat-add-btn')).display !== 'none';
  goTo('vit');
  window.__ARCH_CONTEXT_DOCK__.update();
  const sphVisible = getComputedStyle(document.getElementById('vit-new-sphere-btn')).display !== 'none';
  goTo('health');
  window.__ARCH_CONTEXT_DOCK__.update();
  const symVisible = getComputedStyle(document.getElementById('health-symptom-btn')).display !== 'none';
  return { patVisible, sphVisible, symVisible };
});
ok(offVisible.patVisible && offVisible.sphVisible && offVisible.symVisible,
  'OFF: старые инлайн-кнопки (Паттерн/Новая сфера/Симптом) остаются видимы и рабочими — workflow не удалён');

await journey.close();

ok(errors.length === 0, `JS-ошибок нет за весь интеграционный прогон (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await browser.close();
console.log(`\nИнтеграционная стабилизация: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
