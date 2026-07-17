// ═══════════════════════════════════════════════════════════════
//  Архитектор — регрессионные E2E-тесты (Playwright + Chromium).
//  Гоняют собранное приложение (dist/app.html) в реальном браузере:
//  навигация, умные движки, сферы, AI «копни глубже», RULER и —
//  важнейшее после инцидента — roundtrip снапшот→восстановление.
//
//  Локально:  PW_CHROMIUM=/path/to/chrome node tests/e2e.mjs
//  В CI:      npx playwright install chromium  →  node tests/e2e.mjs
//  Сборка перед запуском:  node build.mjs --combined dist/app.html
// ═══════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// Сетевые ошибки к ВНЕШНИМ хостам (CDN-шрифт/иконки, бэкенд-health, Anthropic)
// зависят от окружения (file://-origin, офлайн-CI) и не являются багами
// приложения. Валим только на настоящих JS-ошибках самого кода.
const EXT = /ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|net::|Failed to load resource|CORS policy|Access-Control-Allow-Origin|fonts\.googleapis|gstatic|unpkg\.com|railway\.app|anthropic\.com/i;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('dialog', d => d.accept());   // подтверждаем confirm() (напр. восстановление)
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !EXT.test(m.text())) errors.push('console: ' + m.text()); });

await page.goto(FILE);
await page.waitForTimeout(500);
await page.evaluate(() => {
  try { document.getElementById('splash').style.display = 'none'; } catch (_) {}
  CFG.userName = 'Тест';
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  const DAY = 864e5, iso = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  DB.checkins = [];
  for (let i = 0; i < 20; i++) { const g = i % 2 === 0; DB.checkins.push({ id: 100 + i, date: iso(i), sl: g ? 8 : 6, sq: g ? 8 : 5, cl: g ? 9 : 5, mv: g ? 8 : 4, st: g ? 2 : 6, ci: true }); }
  DB.vit = { ...DB.checkins[0], ci: true };
  DB.spheres = []; DB.sphereLogs = [];
  const sp = createSphere({ name: 'Спорт', type: 'habit', color: '#1A7F3C' });
  for (let i = 0; i < 21; i++) if (i % 3) logSphere(sp.id, true, '', iso(i));
  const rd = createSphere({ name: 'Чтение', type: 'counter', unit: 'стр' });
  for (let i = 0; i < 12; i++) logSphere(rd.id, i % 2 ? 12 : 26, '', iso(i));
  DB.insights = [{ id: 1, title: 'Выгорание', tag: 'personal', body: 'корень', links: [], createdAt: new Date().toISOString(), date: '6 июля' },
                 { id: 2, title: 'Отдых', tag: 'vitality', body: '[[выгорание]]', links: ['выгорание'], createdAt: new Date().toISOString(), date: '6 июля' }];
  rHome();
});
await page.waitForTimeout(300);

// ── Навигация: сайдбар/drawer (нижнего таббара нет по спеку) ──
ok(await page.locator('#sidebar .navlink').count() >= 5, 'сайдбар: пункты навигации (4 раздела + настройки)');
ok(await page.locator('.tabbar').count() === 0, 'нижний таббар снят');
await page.evaluate(() => openNav());
ok(await page.evaluate(() => document.body.classList.contains('nav-open')), 'drawer открывается (openNav)');
await page.evaluate(() => closeNav());
ok(await page.evaluate(() => !document.body.classList.contains('nav-open')), 'drawer закрывается (closeNav)');
for (const t of ['home', 'vit', 'map', 'sys']) {
  await page.evaluate(x => goTo(x), t);
  ok(await page.locator('#pg-' + t + '.on').count() === 1, `вкладка ${t} открывается`);
}
// Разум subnav (3 смысловые группы, программный msub подсвечивает пилюлю)
await page.evaluate(() => goTo('map'));
ok(await page.locator('#subnav .sn-grp').count() === 3, 'подменю «Разума» сгруппировано: Записи / Связи / Развитие');
for (const s of ['insights', 'graph', 'book', 'patterns', 'dreams', 'spiritual', 'evolution']) {
  await page.evaluate(x => msub(x), s);
  ok(await page.locator('#ms-' + s).isVisible(), `подраздел «Разум» → ${s}`);
}
ok(await page.evaluate(() => document.querySelector('#subnav .snpill[data-sub="evolution"]').classList.contains('on')), 'активная пилюля подсвечена и при программном переходе');
// Сферы на вкладке vit
await page.evaluate(() => goTo('vit'));
ok(await page.locator('#pg-vit #spheres-list .sph-card').count() === 2, 'вкладка «Сферы» показывает карточки сфер');

// ── Умные движки возвращают адекватные значения ──
const eng = await page.evaluate(() => ({
  si: (smartInsights().items || []).length,
  corr: (correlations().items || []).length,
  state: stateScore().score,
  review30: !!periodReview(30),
  review365: !!periodReview(365),
  nudge: !!(smartNudge() && smartNudge().text),
  sphere: sphereStats(DB.spheres[0].id).type,
}));
ok(eng.si >= 1, `smartInsights даёт выводы (${eng.si})`);
ok(eng.corr >= 1, `correlations считает связи (${eng.corr})`);
ok(typeof eng.state === 'number' && eng.state >= 0 && eng.state <= 100, `stateScore в [0..100] (${eng.state})`);
ok(eng.review30 && eng.review365, 'periodReview месяц/год строятся');
ok(eng.nudge, 'smartNudge формирует напоминание');
ok(eng.sphere === 'habit', 'sphereStats читает тип сферы');

// ── Сферы: лог + habit-toggle + goal ──
await page.evaluate(() => {
  const c = createSphere({ name: 'Книги', type: 'goal', target: 12 });
  logSphere(c.id, 6);
  const g = sphereStats(c.id);
  window.__goal = g.progress;
});
ok(await page.evaluate(() => window.__goal) === 50, 'goal-сфера: прогресс 6/12 = 50%');

// ── AI «копни глубже» (мок API) ──
await page.evaluate(() => {
  setAiKey('sk-test');
  const orig = window.fetch;
  window.fetch = (u, o) => String(u).includes('anthropic')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: 'Чего именно ты боишься?' }], usage: { output_tokens: 8 } }) })
    : orig(u, o);
  openOv('ov-add'); $('add-tx').value = 'Я снова откладываю важный разговор из страха.'; goDeeper();
});
await page.waitForTimeout(300);
ok(await page.locator('#deeper-out .deeper-q').count() === 1, 'goDeeper рендерит вопрос');
await page.evaluate(() => closeOv('ov-add'));

// ── RULER ──
await page.evaluate(() => openOv('ov-ci'));
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.querySelectorAll('#ov-ci .emo, #ci-emotions > *, #ov-ci [onclick*="Emo"]').length) > 0, 'чек-ин: есть RULER-палитра эмоций');
await page.evaluate(() => closeOv('ov-ci'));

// ── Живой отклик: приложение отвечает на запись, а не молчит ──
await page.evaluate(() => {
  setAiKey('');                                    // локальный отклик, без AI-вызова
  openOv('ov-add'); $('add-tx').value = 'Снова выгорание мешает начать важный проект — корень в страхе.';
  saveIns();
});
await page.waitForTimeout(250);
ok(await page.evaluate(() => document.querySelectorAll('#react-card.on .rc-row').length >= 1), 'после сохранения инсайта появляется карточка-отклик');
ok(await page.evaluate(() => /Перекликается|мысль|записей|запись/.test(document.getElementById('react-card').textContent)), 'отклик содержательный (эхо/темп/тема)');
ok(await page.evaluate(() => !!document.querySelector('#h-vector .vec-card')), 'виджет «Вектор недели» построен');
ok(await page.evaluate(() => /запис/.test(document.querySelector('#h-vector .vec-sub').textContent)), 'вектор показывает движение за неделю');
await page.evaluate(() => rcClose());

// ── Обзор недели: плотность смысла, результат не исчезает ──
const dig = await page.evaluate(async () => {
  DB.digests = [];
  await mkDig();
  const d = DB.digests[0] || {};
  return { n: DB.digests.length, cause: (d.cause || []).length,
           hasCe: !!document.querySelector('#dg-list .dg-ce'),
           marked: !!document.querySelector('#dg-list .dg-new') };
});
ok(dig.n === 1 && dig.cause >= 1, `обзор недели содержит «Причины → следствия» (${dig.cause})`);
ok(dig.hasCe, 'блок «Причины → следствия» отрендерен в карточке обзора');
ok(dig.marked, 'свежий обзор подсвечен (не мелькает тостом)');

// ── Карта связей: смысл вместо каши (tf-idf + лимит связей на узел) ──
const graph = await page.evaluate(() => {
  const Q = 'Что самое важное прямо сейчас?';
  DB.insights = [
    { id: 11, tag: 'personal', title: '', body: Q + '\nСтрах провала на работе держит меня', links: [], createdAt: nowISO(), day: todayKey(), date: '' },
    { id: 12, tag: 'personal', title: '', body: Q + '\nРабота съедает вечера, страх подвести', links: [], createdAt: nowISO(), day: todayKey(), date: '' },
    { id: 13, tag: 'vitality', title: '', body: Q + '\nПробежка утром даёт энергию на день', links: [], createdAt: nowISO(), day: todayKey(), date: '' },
    { id: 14, tag: 'vitality', title: '', body: Q + '\nЭнергия после пробежки лучше кофе', links: [], createdAt: nowISO(), day: todayKey(), date: '' },
    { id: 15, tag: 'project', title: '', body: Q + '\nЧитаю книгу про архитектуру пайплайнов', links: [], createdAt: nowISO(), day: todayKey(), date: '' },
  ];
  DB.insights.forEach(i => { i.title = i.body.split('\n')[1].slice(0, 80); });
  DB.spheres = []; DB.sphereLogs = [];
  const g = buildGraph();
  return {
    edges: g.edges.length, full: g.nodes.length * (g.nodes.length - 1) / 2,
    pair1: g.edges.some(e => [e.a, e.b].sort().join() === 'i11,i12'),
    pair2: g.edges.some(e => [e.a, e.b].sort().join() === 'i13,i14'),
  };
});
ok(graph.edges > 0 && graph.edges < graph.full, `граф не «всё со всем»: ${graph.edges} связей из ${graph.full} возможных`);
ok(graph.pair1 && graph.pair2, 'связи только по общим редким темам (страх/работа, пробежка/энергия)');
const gTitle = await page.evaluate(() => {
  openOv('ov-add'); $('add-tx').value = 'Что мешает двигаться вперёд?\nБоюсь показать черновик наставнику';
  saveIns(); rcClose();
  return DB.insights[0].title;
});
ok(/^Боюсь показать/.test(gTitle), `заголовок — суть ответа, не вопрос-промпт («${gTitle}»)`);
await page.evaluate(() => { goTo('map'); msub('graph'); rGraph('graph-canvas', 380, false); gSelect('i11', 'graph-canvas', 380); });
ok(await page.evaluate(() => !!document.querySelector('#graph-canvas .ginfo')), 'тап по узлу: инфопанель с полным заголовком и «Открыть»');
ok(await page.evaluate(() => document.querySelectorAll('#graph-canvas .gnode.gdim').length >= 1), 'тап по узлу гасит несвязанное (фокус на окружении)');
await page.evaluate(() => { gSelect(null, 'graph-canvas', 380); goTo('home'); });

// ── Живое обновление PWA: баннер + «Что нового» + кликабельные тосты ──
await page.evaluate(() => showUpdateToast());
ok(await page.evaluate(() => {
  const b = document.querySelector('#upd-toast .toast-undo');
  return !!b && getComputedStyle(b.closest('.toast')).pointerEvents === 'auto';
}), 'баннер «Вышла новая версия» показан и кликабелен');
await page.evaluate(() => document.getElementById('upd-toast').remove());
await page.evaluate(async () => { localStorage.setItem('arch5_ver', 'arch-vOLD'); await maybeWhatsNew('arch-vNEW'); });
await page.waitForTimeout(150);
ok(await page.evaluate(() => {
  const c = document.getElementById('react-card');
  return !!c && /Что нового/.test(c.textContent) && document.querySelectorAll('#react-card .rc-row').length >= 3
    && localStorage.getItem('arch5_ver') === 'arch-vNEW';
}), 'после обновления показывается «Что нового» и версия запоминается');
await page.evaluate(() => rcClose());

// ── Обратная связь: форма → отправка (мок API) → id сохранён ──
await page.evaluate(() => {
  window.fetch = (u) => String(u).includes('/api/feedback')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 7 }) })
    : Promise.reject(new Error('offline'));
  openOv('ov-feedback'); $('fb-text').value = 'Отличное приложение, спасибо!';
  return sendFeedback();
});
await page.waitForTimeout(250);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('arch5_fb_sent') || '[]').includes(7)), 'фидбэк отправлен, id сохранён для замыкания цикла');
ok(await page.evaluate(() => !document.querySelector('#ov-feedback.on')), 'форма фидбэка закрывается после отправки');

// ── Замыкание цикла: статус «fixed» чистит список ожидания ──
await page.evaluate(async () => {
  localStorage.setItem('arch5_fb_sent', JSON.stringify([7]));
  window.fetch = (u) => String(u).includes('/api/feedback/status')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 7, status: 'fixed', type: 'bug' }] }) })
    : Promise.reject(new Error('offline'));
  await checkFeedbackStatus();
});
ok(await page.evaluate(() => !JSON.parse(localStorage.getItem('arch5_fb_sent') || '[]').includes(7)), 'замыкание цикла: «fixed» убирает id из ожидания');

// ── Lagged-паттерн сферы: эффект «на следующий день» (Bearable) ──
const lagged = await page.evaluate(() => {
  const DAY = 864e5, iso = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  DB.spheres = []; DB.sphereLogs = []; DB.checkins = [];
  // спорт в день i (i%3==0) → состояние высокое НАЗАВТРА (день i-1); в сам день — нейтрально
  for (let i = 0; i < 21; i++) {
    const hi = i % 3 === 2;
    DB.checkins.push({ id: 900 + i, date: iso(i), sl: 7, sq: 7, cl: hi ? 9 : 5, mv: hi ? 8 : 5, st: hi ? 2 : 5, ci: true });
  }
  const sp = createSphere({ name: 'Спорт', type: 'habit' });
  for (let i = 0; i < 21; i++) if (i % 3 === 0) logSphere(sp.id, true, '', iso(i));
  const items = smartInsights().items || [];
  return items.map(x => x.text).join(' | ');
});
ok(/Спорт/.test(lagged) && /следующий день|назавтра/.test(lagged), `lagged-эффект сферы формулируется («${lagged.slice(0, 80)}…»)`);

// ── Защита данных: снапшот → потеря → восстановление ──
const restored = await page.evaluate(() => {
  const before = DB.insights.length + DB.spheres.length;
  snapshotDaily();
  const snaps = listSnapshots();
  if (!snaps.length) return { ok: false, why: 'снапшот не создан' };
  DB.insights = []; DB.spheres = []; DB.sphereLogs = []; persistLocal();
  restoreSnapshot(snaps[0].key);
  return { ok: (DB.insights.length + DB.spheres.length) === before, before, after: DB.insights.length + DB.spheres.length };
});
ok(restored.ok, `снапшот→восстановление возвращает данные (${restored.after}/${restored.before})`);

// ── Самохостинг иконок lucide (без внешнего CDN) ──
const lucide = await page.evaluate(() => ({
  lib: typeof window.lucide,
  icons: document.querySelectorAll('svg.lucide, svg[class*="lucide-"]').length,
}));
ok(lucide.lib === 'object' && lucide.icons > 10, `lucide загружен локально и рисует иконки (${lucide.icons})`);

// ── Самохостинг шрифта Inter (латиница + кириллица, без Google Fonts) ──
const font = await page.evaluate(async () => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return { avail: !!(document.fonts && document.fonts.check('16px Inter')),
           loaded: document.fonts ? [...document.fonts].filter(f => f.status === 'loaded').length : 0 };
});
ok(font.avail && font.loaded >= 1, `Inter загружен локально (faces: ${font.loaded})`);

// ── Никаких неожиданных ошибок ──
ok(errors.length === 0, `нет ошибок консоли/страницы (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);

console.log(`\nИтог: ${pass}/${pass + fail} passed`);
await browser.close();
process.exit(fail ? 1 : 0);
