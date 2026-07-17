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
const EXT = /ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|net::|Failed to load resource|CORS policy|Access-Control-Allow-Origin|fonts\.googleapis|gstatic|unpkg\.com|railway\.app|anthropic\.com|openai\.com|googleapis\.com/i;

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

// ── AI: маршрутизация по классам задач + леджер расходов + бюджет ──
const ai = await page.evaluate(async () => {
  localStorage.removeItem('arch5_ai_ledger');
  setAiKey('sk-test'); CFG.aiRoutes = null; CFG.aiBudgetUSD = 0;
  const bodies = [];
  window.fetch = (u, o) => {
    if (String(u).includes('anthropic')) {
      bodies.push(JSON.parse(o.body));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        content: [{ type: 'text', text: 'ок' }], usage: { input_tokens: 1000, output_tokens: 200 } }) });
    }
    return Promise.reject(new Error('offline'));
  };
  await callClaude({ user: 'тест', task: 'react' });
  await callClaude({ user: 'тест', task: 'digest' });
  const led = JSON.parse(localStorage.getItem('arch5_ai_ledger') || '[]');
  rAiSpend();
  const spendHtml = (document.getElementById('ai-spend') || {}).textContent || '';
  CFG.aiBudgetUSD = 0.000001;
  let blocked = false;
  try { await callClaude({ user: 'тест', task: 'react' }); } catch (e) { blocked = !!e.budget; }
  CFG.aiBudgetUSD = 0;
  return { m0: bodies[0].model, m1: bodies[1].model, n: led.length, ti: led[0] && led[0].ti, spendHtml, blocked };
});
ok(ai.m0 === 'claude-haiku-4-5', `лёгкая задача → дешёвая модель (${ai.m0})`);
ok(ai.m1 === 'claude-opus-4-8', `глубокая задача → сильная модель (${ai.m1})`);
ok(ai.n === 2 && ai.ti === 1000, 'каждый AI-вызов записан в леджер с токенами');
ok(/Отклик наставника/.test(ai.spendHtml) && /\$/.test(ai.spendHtml), 'экран «Расходы AI»: разбивка по задачам и стоимость');
ok(ai.blocked, 'исчерпанный месячный бюджет блокирует AI-вызовы');

// ── Диалог вглубь: чат → накопление → вывод в инсайты ──
await page.evaluate(() => {
  DB.chats = []; CFG.aiProvider = 'anthropic'; CFG.chatModel = null; CFG.aiRoutes = null; setAiKey('sk-test');
  window.__aiBodies = [];
  window.fetch = (u, o) => String(u).includes('anthropic')
    ? (window.__aiBodies.push(JSON.parse(o.body)), Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: 'Слышу тебя. Что за этим страхом?' }], usage: { input_tokens: 90, output_tokens: 40 } }) }))
    : Promise.reject(new Error('offline'));
  openChatFor(null, 'Боюсь начать большой проект — откладываю неделями');
});
await page.waitForTimeout(350);
ok(await page.evaluate(() => document.querySelectorAll('#chat-msgs .cm').length >= 2), 'чат: моя запись + мгновенный ответ наставника');
ok(await page.evaluate(() => window.__aiBodies[0].model === 'claude-sonnet-5'), 'диалог идёт на дешёвой модели (sonnet 5 по умолчанию)');
await page.evaluate(() => { $('chat-in').value = 'Кажется, страх провала на глазах у всех'; chatSendMsg(); });
await page.waitForTimeout(300);
const chatN = await page.evaluate(() => DB.chats[DB.chats.length - 1].msgs.length);
ok(chatN >= 4, `диалог накапливается и сохраняется в базе (${chatN} сообщений)`);
const fin = await page.evaluate(async () => {
  const n = DB.insights.length; await chatFinish();
  return { grew: DB.insights.length === n + 1, src: (DB.insights[0] || {}).src,
           finModel: window.__aiBodies[window.__aiBodies.length - 1].model };
});
ok(fin.grew && fin.src === 'Диалог', 'завершение: вывод диалога сохранён как инсайт (src «Диалог»)');
ok(fin.finModel === 'claude-opus-4-8', `заключение — на сильной модели (${fin.finModel})`);
// пикер моделей (стиль Perplexity)
const pick = await page.evaluate(() => {
  rModels(); openOv('ov-models');
  const rows = document.querySelectorAll('#models-list .mdl-row').length;
  const selBefore = document.querySelector('#models-list .mdl-row.sel .mdl-main b').textContent;
  const gptIdx = 4;                                   // GPT-4o mini
  chatModelPick(gptIdx);
  const selAfter = document.querySelector('#models-list .mdl-row.sel .mdl-main b').textContent;
  const chip = document.getElementById('chat-model-chip').textContent;
  closeOv('ov-models');
  CFG.chatModel = null; persist();
  return { rows, selBefore, selAfter, chip };
});
ok(pick.rows === 7 && /Sonnet 5/.test(pick.selBefore), `пикер: 7 моделей трёх провайдеров, выбран Sonnet (${pick.selBefore})`);
ok(/GPT-4o mini/.test(pick.selAfter) && /GPT-4o mini/.test(pick.chip), 'пикер: смена модели работает, чип в чате обновился');
ok(await page.evaluate(() => { goTo('map'); msub('chats'); return document.querySelectorAll('#chats-list .chat-row').length >= 1; }), 'история диалогов: Разум → Записи → Диалоги');
await page.evaluate(() => goTo('home'));

// ── Мультипровайдер: GPT и Gemini через ту же абстракцию ──
const prov = await page.evaluate(async () => {
  const urls = [], bodies = [];
  CFG.aiProvider = 'openai'; setAiKey('sk-oai');
  window.fetch = (u, o) => { urls.push(String(u)); bodies.push(JSON.parse(o.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'ок' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }); };
  const t1 = await callClaude({ user: 'тест', task: 'react' });
  CFG.aiProvider = 'gemini'; setAiKey('g-key');
  window.fetch = (u) => { urls.push(String(u));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ок' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }) }); };
  const t2 = await callClaude({ user: 'тест', task: 'digest' });
  CFG.aiProvider = 'anthropic';
  return { u0: urls[0], m0: bodies[0].model, u1: urls[1], both: t1 === 'ок' && t2 === 'ок' };
});
ok(/api\.openai\.com/.test(prov.u0) && prov.m0 === 'gpt-4o-mini', `провайдер GPT: свой endpoint и модель (${prov.m0})`);
ok(/generativelanguage\.googleapis\.com/.test(prov.u1) && /gemini-2\.5-pro/.test(prov.u1) && prov.both, 'провайдер Gemini: работает и берёт свою deep-модель');

// ── Психологический контур: метод «Зачем?» владельца ──
const psy = await page.evaluate(async () => {
  setAiKey('sk-test'); CFG.aiProvider = 'anthropic';
  DB.insights.unshift({ id: 501, tag: 'personal', title: 'Опять жду её сообщения весь вечер', body: 'Опять жду её сообщения весь вечер и не могу заняться делом, тревога накрывает.', links: [], createdAt: nowISO(), day: todayKey(), date: '' });
  window.fetch = (u) => String(u).includes('anthropic')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 501, symptom: 'жду сообщения, тревога', func: 'сохранить связь', gain: 'не оставаться с пустотой', need: 'близость', ego: 'Ребёнок', emotion: 'тревога', game: null, conf: 80 }] }) }], usage: { input_tokens: 200, output_tokens: 100 } }) })
    : Promise.reject(new Error('offline'));
  await psyAutoRun();
  const i = DB.insights.find(x => x.id === 501);
  STATE.mapView = 'psy'; goTo('map'); msub('graph');
  const view = (document.getElementById('graph-canvas') || {}).textContent || '';
  showDet(501);
  const det = (document.getElementById('det-links') || {}).textContent || '';
  closeOv('ov-det'); goTo('home'); STATE.mapView = 'themes';
  return { need: i.psy && i.psy.need, ego: i.psy && i.psy.ego, view, det, sys: /Зачем/.test(CHAT_SYSTEM) && /вторичную выгоду/.test(CHAT_SYSTEM) };
});
ok(psy.need === 'близость' && psy.ego === 'Ребёнок', 'ИИ осознанно размечает записи по методу «Зачем?» (потребность, состояние Я)');
ok(/близость/.test(psy.view) && /Ребёнок/.test(psy.view), 'вью «Психика»: потребности и состояния Я — системная структура');
ok(/Функция/.test(psy.det) && /Вторичная выгода/.test(psy.det), 'в деталях записи — разбор: симптом → функция → вторичная выгода');
ok(psy.sys, 'диалог-наставник ведёт по алгоритму метода «Зачем?»');

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
const sphR = await page.evaluate(() => { reactToSphere(DB.spheres[0]); const t = (document.getElementById('react-card') || {}).textContent || ''; rcClose(); return t; });
ok(/Спорт/.test(sphR), 'живой отклик и на отметку сферы');

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
const dedup = await page.evaluate(async () => { await mkDig(); await mkDig(); return { n: DB.digests.length, tomb: Object.keys(DB._del || {}).length > 0 }; });
ok(dedup.n === 1, 'повторный «Собрать обзор» обновляет карточку недели, а не дублирует');
ok(dedup.tomb, 'замещённый обзор получает надгробие (синк не воскресит дубль)');

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
await page.evaluate(() => { goTo('map'); STATE.mapView = 'notes'; msub('graph'); gSelect('i11', 'graph-canvas', 380); });
ok(await page.evaluate(() => !!document.querySelector('#graph-canvas .ginfo')), 'тап по узлу: инфопанель с полным заголовком и «Открыть»');
ok(await page.evaluate(() => document.querySelectorAll('#graph-canvas .gnode.gdim').length >= 1), 'тап по узлу гасит несвязанное (фокус на окружении)');
await page.evaluate(() => { gSelect(null, 'graph-canvas', 380); });

// ── Карта ТЕМ (паттерн InfraNodus): понятия, кластеры, выводы ──
const tmap = await page.evaluate(() => {
  const g = buildThemeGraph();
  const ins = themeMapInsights(g);
  STATE.mapView = 'themes'; rMap();
  return {
    n: g.nodes.length, e: g.edges.length,
    txt: ins.map(x => x.html).join(' '),
    rendered: !!document.querySelector('#theme-insights .tm-row'),
    svg: document.querySelectorAll('#graph-canvas svg circle').length,
  };
});
ok(tmap.n >= 4 && tmap.e >= 2, `карта тем: понятия + связи по совместной встречаемости (${tmap.n} тем, ${tmap.e} связей)`);
ok(/Ядро карты/.test(tmap.txt), 'вывод «ядро карты» — главная тема внимания');
ok(/Разрыв/.test(tmap.txt), 'структурный разрыв между группами тем найден (InfraNodus)');
ok(tmap.rendered && tmap.svg >= 4, 'блок «Что видно по карте» и граф тем отрендерены');
// служебные слова («которые», «нужно», «просто») не становятся темами
const clean = await page.evaluate(() => {
  const mk = (id, body) => ({ id, tag: 'personal', title: body.slice(0, 50), body, links: [], createdAt: nowISO(), day: todayKey(), date: '' });
  const keep = DB.insights;
  DB.insights = [
    mk(31, 'Мысли которые мешают просто нужно отпустить вместе со страхом'),
    mk(32, 'Слова которые я должен сказать просто вызывают страх'),
    mk(33, 'Планы которые нужно сделать просто висят из-за страха'),
  ];
  const stems = buildThemeGraph().nodes.map(n => n.stem);
  DB.insights = keep;
  return stems;
});
ok(!clean.some(s => ['котор', 'нужн', 'прост', 'должен', 'должн'].includes(s)) && clean.includes('страх'),
  `служебные слова отфильтрованы, смысловые остаются (темы: ${clean.join(', ') || '—'})`);
await page.evaluate(() => goTo('home'));

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
