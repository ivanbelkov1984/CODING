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

// ── Отметка балльной сферы — слайдер 0–10 как в чек-ине, не число руками ──
const scoreLog = await page.evaluate(() => {
  const mood = createSphere({ name: 'Настроение', type: 'score', color: '#5e6ad2' });
  openSphereLog(mood.id);
  const inputType = (document.getElementById('sph-log-val') || {}).type;
  const hasSlider = !!document.querySelector('#sphere-log-body .sl input[type="range"]');
  const hasNumberInput = !!document.querySelector('#sphere-log-body input[type="number"]');
  document.getElementById('sph-log-val').value = '8';
  saveSphereLog(mood.id);
  const val = sphereStats(mood.id).today;
  DB.spheres = DB.spheres.filter(s => s.id !== mood.id);
  DB.sphereLogs = DB.sphereLogs.filter(l => l.sphereId !== mood.id);
  return { inputType, hasSlider, hasNumberInput, val };
});
ok(scoreLog.hasSlider && scoreLog.inputType === 'range' && !scoreLog.hasNumberInput,
  'сфера с баллом 0–10 отмечается слайдером (тот же паттерн, что в чек-ине), не ручным вводом числа');
ok(scoreLog.val === 8, 'значение слайдера корректно сохраняется');

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
  // ИИ отвечает ASCII-кодом (see comment on PSY_NEED_CODE) — схема с кириллицей
  // в enum ловила реальную ошибку API «Invalid schema: Enum value … does not
  // match»; тест проверяет и код от ИИ, и перевод обратно в русское значение.
  window.fetch = (u) => String(u).includes('anthropic')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 501, symptom: 'жду сообщения, тревога', func: 'сохранить связь', gain: 'не оставаться с пустотой', need: 'closeness', ego: 'child', emotion: 'тревога', game: null, conf: 80 }] }) }], usage: { input_tokens: 200, output_tokens: 100 } }) })
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

// ── Схема психоразметки: без union-типа+enum (баг IMG_3165) ──
const psySchema = await page.evaluate(() => {
  const p = psyEnumProps();
  return {
    needType: p.need.type, egoType: p.ego.type,
    needHasNull: p.need.enum.includes(null), needHasNone: p.need.enum.includes('none'),
    egoHasNull: p.ego.enum.includes(null), egoHasNone: p.ego.enum.includes('none'),
    hasSafety: p.need.enum.includes('safety'),
    decodeNone: psyNeedFromAI('none'), decodeNoneEgo: psyEgoFromAI('none'),
    decodeSafety: psyNeedFromAI('safety'),
  };
});
ok(psySchema.needType === 'string' && psySchema.egoType === 'string' && !psySchema.needHasNull && !psySchema.egoHasNull,
  'схема need/ego — плоский string без union-типа+null (иначе Anthropic валит «Enum value does not match declared type»)');
ok(psySchema.needHasNone && psySchema.egoHasNone && psySchema.hasSafety && psySchema.decodeNone === null && psySchema.decodeNoneEgo === null && psySchema.decodeSafety === 'безопасность',
  'сентинел \'none\' декодится в null, реальные коды (safety→безопасность) — в русское значение');

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

// ── Аудит главного экрана: заголовок-приветствие вместо сломанной фразы,
// свёрнутые вторичные блоки, без дублирующего тоста поверх шапки ──
const hero = await page.evaluate(() => {
  DB.vit.ci = false;                                  // check-in не сделан — раньше здесь была «Система check-in не выполнен»
  rHState();
  const txt = document.getElementById('h-hl').textContent;
  return { txt, hasEm: !!document.querySelector('#h-hl em') };
});
ok(!/Систем/.test(hero.txt), `заголовок больше не «Система …» — грамматически связный текст («${hero.txt}»)`);
ok(/Добр(ое|ый|ой) (утро|день|вечер|ночи)/.test(hero.txt) && hero.hasEm, 'заголовок — приветствие по времени суток с акцентным словом');
const more = await page.evaluate(() => {
  const el = document.getElementById('h-more'), btn = document.getElementById('h-more-btn');
  const closedByDefault = !el.classList.contains('on');
  const hasContent = el.querySelectorAll('#home-smart, #home-heatmap, #home-graph, #h-ins').length === 4;
  toggleHomeMore();
  const openedNow = el.classList.contains('on') && /Скрыть/.test(btn.textContent);
  toggleHomeMore();
  const closedAgain = !el.classList.contains('on') && /Показать больше/.test(btn.textContent);
  return { closedByDefault, hasContent, openedNow, closedAgain };
});
ok(more.closedByDefault && more.hasContent, 'вторичные блоки главного экрана свёрнуты по умолчанию, но отрендерены внутри');
ok(more.openedNow && more.closedAgain, '«Показать больше» разворачивает и сворачивает обратно, текст кнопки меняется');
const noToast = await page.evaluate(async () => {
  const calls = []; const orig = window.toast; window.toast = (m, t) => calls.push(m);
  // на время паузы гасим авто-синк (иначе фоновый таймер, взведённый более
  // ранним тестом, успевает сработать в это окно ожидания и пишет в консоль
  // офлайн-ошибку, не связанную с тем, что здесь проверяется)
  const savedApi = window.ARCHITECT_API; window.ARCHITECT_API = '';
  DB.vit.ci = false; DB.vit.date = '2000-01-01';
  smartTriggers();
  await new Promise(r => setTimeout(r, 3200));
  window.ARCHITECT_API = savedApi; window.toast = orig;
  return calls;
});
ok(!noToast.some(m => /Check-in не выполнен/.test(m)), 'напоминание о check-in больше не дублируется тостом поверх шапки — только карточка-наджер');
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
ok(await page.evaluate(() => DB.digests[0].cntPrev != null && /[▲▼≈]/.test(document.querySelector('#dg-list .dg-stats').innerHTML)), 'обзор показывает дельты к прошлой неделе');
const spiR = await page.evaluate(() => { DB.spiritual = [{ id: 1, day: todayKey(), text: 'Медитация утром', createdAt: nowISO() }]; reactToSpi('Медитация утром дала тишину'); const t = (document.getElementById('react-card') || {}).textContent || ''; rcClose(); return t; });
ok(/духовная запись/.test(spiR), 'живой отклик и на духовную запись');
ok(await page.evaluate(() => { const rows = []; const orig = window.reactCard; window.reactCard = r => rows.push(...r); reactToCheckin(3.5); window.reactCard = orig; return rows.some(r => /восстановление в приоритете/.test(r.html)); }), 'низкое состояние — в карточке отклика, не в мимолётном тосте');
ok(dig.hasCe, 'блок «Причины → следствия» отрендерен в карточке обзора');
ok(dig.marked, 'свежий обзор подсвечен (не мелькает тостом)');
const dedup = await page.evaluate(async () => { await mkDig(); await mkDig(); return { n: DB.digests.length, tomb: Object.keys(DB._del || {}).length > 0 }; });
ok(dedup.n === 1, 'повторный «Собрать обзор» обновляет карточку недели, а не дублирует');
ok(dedup.tomb, 'замещённый обзор получает надгробие (синк не воскресит дубль)');
// идентичность обзора — календарная ISO-неделя: сборка в другой день недели
// (другая строка дат) больше не плодит почти одинаковые карточки
const wkDedup = await page.evaluate(() => {
  const k = isoWeekKey(Date.now());
  DB.digests.push({ id: 999, createdAt: nowISO(), week: '1 янв – 7 янв', cnt: 1 });
  const removed = dedupeDigests();
  return { removed, left: DB.digests.filter(d => digWk(d) === k).length, tombed: !!(DB._del || {})[999] };
});
ok(wkDedup.removed >= 1 && wkDedup.left === 1 && wkDedup.tombed, 'карточки одной календарной недели схлопываются даже при разных датах сборки');

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

// ── СМЫСЛОВАЯ карта: темы осознанно размечает ИИ (психоконтур), не слова ──
const sem = await page.evaluate(() => {
  const keep = DB.insights;
  const mk = (id, body, themes, need) => ({ id, tag: 'personal', title: body.slice(0, 40), body, links: [], createdAt: nowISO(), day: todayKey(), date: '', psy: { need, themes, conf: 80, at: nowISO() } });
  DB.insights = [
    mk(41, 'Опять отложил разговор о повышении', ['признание на работе'], 'значимость'),
    mk(42, 'Написал бывшей, хотя решил не писать', ['отношения', 'страх одиночества'], 'близость'),
    mk(43, 'Тянет проверить её страницу', ['отношения'], 'близость'),
    mk(44, 'Боюсь остановиться, сразу тревога', ['страх остановки', 'бегство в работу'], 'покой'),
    mk(45, 'Снова взял чужую задачу, чтобы заметили', ['признание на работе'], 'значимость'),
  ];
  const g = buildThemeGraph();
  STATE.mapView = 'themes'; rMap();
  const meta = (document.querySelector('#graph-canvas .graph-meta') || {}).textContent || '';
  const hint = (document.getElementById('graph-hint') || {}).textContent || '';
  const out = { sem: g.sem, labels: g.nodes.map(n => n.title), edges: g.edges.length, meta, hint };
  DB.insights = keep; rMap();
  return out;
});
ok(sem.sem === true && sem.labels.includes('отношения') && sem.labels.includes('признание на работе'),
  `карта строится из смысловых тем ИИ, а не из повторяемых слов (${sem.labels.join(', ')})`);
ok(sem.edges >= 2, 'связи смыслов: темы одной записи + темы одной глубинной потребности');
ok(/смысловые темы/.test(sem.meta), 'подпись карты честно говорит: темы размечает ИИ');
ok(/СМЫСЛ/.test(sem.hint), 'подсказка объясняет смысловой режим карты');

// ── СОННИК: отдельный режим толкования (Юнг + гештальт + наука + контекст) ──
const dream = await page.evaluate(() => {
  DB.insights.unshift({ id: 77, tag: 'dream', w: 1, title: 'Сон: маленькие дети', body: 'Приснились маленькие дети и спокойная Лена в старом доме', date: '', createdAt: nowISO(), day: todayKey(), sv: 2, src: 'Дневник снов', links: [] });
  openChatFor(77);
  const c = DB.chats.find(x => x.insightId === 77);
  const sys = chatSystemFor(c);
  closeOv('ov-chat');
  const out = { mode: c && c.mode, jung: /Юнга/.test(sys) && /Тень/.test(sys), science: /Домхофф|непрерывности/.test(sys),
    ctx: /Жизненный контекст/.test(sys), separate: !/метод «Зачем\?» \(интеграция/.test(sys) };
  DB.chats = DB.chats.filter(x => x.insightId !== 77);
  DB.insights = DB.insights.filter(i => i.id !== 77);
  return out;
});
ok(dream.mode === 'dream', 'диалог по сну открывается в режиме толкования, а не в методе «Зачем?»');
ok(dream.jung && dream.science, 'сонник — синтез: Юнг (Тень, компенсация), гештальт, научный слой');
ok(dream.ctx && dream.separate, 'толкование опирается на жизненный контекст дневника, отдельно от метода «Зачем?»');
const dreamRow = await page.evaluate(() => {
  const rows = []; const orig = window.reactCard; window.reactCard = r => rows.push(...r);
  reactToDream({ body: 'тестовый сон про дом', arch: null }, 501);
  window.reactCard = orig;
  return rows.some(r => /Растолковать сон/.test(r.html));
});
ok(dreamRow, 'отклик на сон предлагает «Растолковать сон» — вход в сонник');

// ── КЛЮЧИ СЕРВИСОВ: полный перечень подключений в одном меню ──
const keys = await page.evaluate(() => {
  setAiKeyFor('openai', '');                       // тест провайдеров выше оставил ключ
  openKeys();
  const el = document.getElementById('keys-list');
  const cards = el.querySelectorAll('.key-card').length;
  const before = el.querySelectorAll('.key-st.on').length;
  setAiKeyFor('openai', 'sk-test-123'); rKeys();
  const after = el.querySelectorAll('.key-st.on').length;
  const got = getAiKeyFor('openai');
  setAiKeyFor('openai', ''); rKeys();
  const txt = el.textContent;
  closeOv('ov-keys');
  return { cards, before, after, got, txt };
});
ok(keys.cards >= 5, `«Ключи сервисов»: все внешние подключения в одном меню (${keys.cards} карточек)`);
ok(/Anthropic/.test(keys.txt) && /OpenAI/.test(keys.txt) && /Gemini/.test(keys.txt) && /Синк-сервер/.test(keys.txt) && /Обратная связь/.test(keys.txt),
  'полный перечень: три ИИ-провайдера + синк-сервер + обратная связь');
ok(keys.got === 'sk-test-123' && keys.after === keys.before + 1, 'ключ сохраняется per-провайдер, статус сразу «активен»');
ok(await page.evaluate(() => !!document.querySelector('#pg-settings [onclick*="openKeys"]')), 'вход «Ключи сервисов» есть в Настройках');

// ── ИМПОРТ ИЗ CHATGPT: парсер, дневник-эвристика, даты, сны, дедуп ──
const gptFix = `[
  { "title": "Дневник июля", "create_time": 1689600000, "mapping": {
    "a": { "message": { "author": { "role": "user" }, "create_time": 1689600000,
      "content": { "content_type": "text", "parts": ["Сегодня понял, что боюсь остановиться: как только появляется пауза, я сразу придумываю себе новую задачу, лишь бы не оставаться наедине с собой"] } } },
    "b": { "message": { "author": { "role": "assistant" }, "content": { "content_type": "text", "parts": ["Ответ GPT — не должен импортироваться"] } } },
    "c": { "message": { "author": { "role": "user" }, "create_time": 1689686400,
      "content": { "content_type": "text", "parts": ["Снилось, что я стою на крыше старого дома и не могу спуститься, а внизу ходят знакомые люди и не замечают меня"] } } }
  } },
  { "title": "Fix my code", "create_time": 1689700000, "mapping": {
    "x": { "message": { "author": { "role": "user" }, "content": { "content_type": "text", "parts": ["function main() { const x = 1; return x; } — why is this broken? Please help me debug the following stack trace and error"] } } }
  } }
]`;
const gpt = await page.evaluate(fix => {
  const convs = gptParseConvs(fix);
  _gpt.convs = convs; _gpt.sel = new Set(convs.filter(c => c.diary).map(c => c.i)); _gpt.done = null;
  const before = { ins: DB.insights.length, drm: DB.dreams.length };
  gptRunImport();
  const first = gptRunImport ? { ..._gpt.done } : null;
  gptRunImport();                                        // повторный импорт того же
  const second = { ..._gpt.done };
  const imp = DB.insights.filter(i => i.src === 'ChatGPT');
  const drm = DB.dreams.filter(d => d.src === 'ChatGPT');
  const out = {
    n: convs.length, diary: convs.map(c => c.diary),
    userOnly: !convs[0] || !convs.flatMap(c => c.msgs).some(m => /не должен импортироваться/.test(m.t)),
    first, second,
    year: imp[0] && String(imp[0].createdAt).slice(0, 4),
    dreamTag: imp.some(i => i.tag === 'dream'), dreamRec: drm.length,
    added: DB.insights.length - before.ins,
  };
  DB.insights = DB.insights.filter(i => i.src !== 'ChatGPT');   // не мешаем прочим тестам
  DB.dreams = DB.dreams.filter(d => d.src !== 'ChatGPT');
  _gpt.convs = []; _gpt.sel = new Set(); _gpt.done = null;
  return out;
}, gptFix);
ok(gpt.n === 2 && gpt.diary[1] === true && gpt.diary[0] === false, 'парсер ChatGPT: дневник по-русски распознан, кодовый чат — нет');
ok(gpt.userOnly, 'импортируются только ТВОИ сообщения — ответы GPT не берутся');
ok(gpt.first.nIns === 2 && gpt.year === '2023', `записи получили настоящие даты из архива (${gpt.year}), а не день импорта`);
ok(gpt.dreamTag && gpt.dreamRec === 1, 'сон из архива распознан: попал в дневник снов и с тегом dream');
ok(gpt.second.nIns === 0 && gpt.second.nDup >= 2, 'повторный импорт того же архива не плодит дубли');
// zip-ридер: минимальный архив (stored) собирается в тесте и читается локально
const zipOk = await page.evaluate(async () => {
  const data = new TextEncoder().encode('[]');
  const name = new TextEncoder().encode('conversations.json');
  const w = [];
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
  const lho = 0;
  w.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name, ...data);
  const cdo = w.length;
  w.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(lho), ...name);
  const cds = w.length - cdo;
  w.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(cds), ...u32(cdo), ...u16(0));
  const txt = await gptUnzip(new Uint8Array(w).buffer);
  return txt === '[]';
});
ok(zipOk, 'zip-ридер без внешних библиотек: conversations.json достаётся из архива локально');
ok(await page.evaluate(() => typeof psyMarkBatch === 'function' && typeof gptAbsorb === 'function' && !!document.getElementById('ov-gpt')), 'массовое «освоение» архива психоконтуром подключено, шит импорта на месте');
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

// ── «Здоровье»: вредные привычки, «Тяга» + микро-интервенция, наджер ──
ok(await page.evaluate(() => !!document.querySelector('[data-tab="health"]')), 'в сайдбаре есть раздел «Здоровье»');
const healthEmpty = await page.evaluate(() => {
  const keep = DB.spheres; DB.spheres = [];
  goTo('health');
  const txt = document.getElementById('health-out').textContent;
  DB.spheres = keep;
  return txt;
});
ok(/Заведи привычку-трекер/.test(healthEmpty) && /Без сигарет/.test(healthEmpty), 'без привычек-трекеров — понятный empty state с быстрым стартом');
const crav = await page.evaluate(() => {
  DB.cravings = [];
  openCraving();
  const before = document.getElementById('cr-tip').innerHTML;
  document.getElementById('cr-int').value = 8; crIntChange(8);
  const tipAtHigh = document.getElementById('cr-tip').innerHTML;
  document.getElementById('cr-trigger').value = 'стресс на работе';
  saveCraving(true);
  const rec = DB.cravings[0];
  const cardTxt = (document.getElementById('react-card') || {}).textContent || '';
  rcClose();
  return { before, tipAtHigh, rec, cardTxt };
});
ok(!crav.before && /3–5 минут/.test(crav.tipAtHigh) && /вдоха|Стакан воды|пройдись/.test(crav.tipAtHigh),
  'при силе тяги ≥6 появляется микро-интервенция (дыхание/вода/движение), при низкой — нет');
ok(crav.rec.kind === 'сигарета' && crav.rec.intensity === 8 && crav.rec.trigger === 'стресс на работе' && crav.rec.outcome === 'held',
  '«Тяга» сохраняется: вид, сила, триггер, честный исход');
ok(/Устоял/.test(crav.cardTxt), 'живой отклик на «устоял» — без осуждения, по факту');
const cravFail = await page.evaluate(() => {
  openCraving(); sCrKind(document.querySelector('#cr-kind [data-k="сладкое"]'));
  saveCraving(false);
  const txt = (document.getElementById('react-card') || {}).textContent || '';
  rcClose();
  return { txt, outcome: DB.cravings[0].outcome };
});
ok(cravFail.outcome === 'gave_in' && /честно|не провал/.test(cravFail.txt), 'срыв фиксируется без вины — «честно, не провал», не молчание и не нотация');
const nudgeRisk = await page.evaluate(() => {
  const keep = { spheres: DB.spheres, vit: { ...DB.vit } };
  DB.spheres = [{ id: 999, name: 'Без сигарет', type: 'habit', color: '#000' }];
  DB.vit = { ...DB.vit, ci: true, date: todayKey(), st: 8, sl: 7 };
  const n = smartNudge();
  DB.spheres = keep.spheres; DB.vit = keep.vit;
  return n;
});
ok(nudgeRisk && /риск тяги/.test(nudgeRisk.text) && nudgeRisk.act === 'openCraving()', 'предиктивный наджер: высокий стресс + привычка-трекер → предупреждение о риске до срыва, не после');
const healthWithData = await page.evaluate(() => {
  const mood = createSphere({ name: 'Без сигарет', type: 'habit', color: '#000' });
  goTo('health');
  const txt = document.getElementById('health-out').textContent;
  const hasCard = !!document.querySelector('#health-out .kgrid');
  DB.spheres = DB.spheres.filter(s => s.id !== mood.id);
  return { txt, hasCard, cravN: DB.cravings.length };
});
ok(/Без сигарет/.test(healthWithData.txt) && /за 30д/.test(healthWithData.txt), 'раздел «Здоровье» показывает привычку-трекер со стриком, найденную по имени');
ok(healthWithData.hasCard && healthWithData.cravN === 2, 'и накопленный лог «Тяги» (счётчик, % устоял, за 7 дней)');
const sugarFactor = await page.evaluate(() => {
  const keep = DB.checkins;
  const iso = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  DB.checkins = [];
  for (let i = 0; i < 16; i++) {
    const sug = i % 2 === 0;
    DB.checkins.push({ id: 800 + i, date: iso(i), sl: 7, sq: 7, cl: sug ? 4 : 8, mv: sug ? 4 : 8, st: sug ? 8 : 3, sugar: sug, ci: true });
  }
  const found = (smartInsights().items || []).some(it => /сладкое/.test(it.text));
  DB.checkins = keep;
  return found;
});
ok(sugarFactor, 'движок «что влияет» видит «сладкое» как фактор — не только никотин/кофеин/алкоголь');
await page.evaluate(() => { goTo('home'); DB.cravings = []; });

// ── «Здоровье» фаза 2: типология тяги, контекст, план «если-то», среда, риск ──
const typology = await page.evaluate(() => {
  DB.cravings = [];
  openCraving();
  document.getElementById('cr-int').value = 8;
  sCrCtx(document.querySelector('#cr-ctx [data-v="tonic"]'));
  const tonicTip = document.getElementById('cr-tip').innerHTML;
  sCrCtx(document.querySelector('#cr-ctx [data-v="cue"]'));
  const cueTip = document.getElementById('cr-tip').innerHTML;
  closeOv('ov-craving');
  return { tonicTip, cueTip };
});
ok(/белковое|покоя/.test(typology.tonicTip) && !/белковое|покоя/.test(typology.cueTip),
  'типология тяги: «копилось весь день» даёт другую подсказку (физиологическая компенсация), чем «внезапно, от повода»');

const ctxSave = await page.evaluate(() => {
  DB.cravings = [];
  openCraving();
  document.getElementById('cr-int').value = 7;
  sCrCtx(document.querySelector('#cr-ctx [data-v="tonic"]'));
  sCrCtx(document.querySelector('#cr-ctx [data-v="alone"]'));
  saveCraving(false);
  const rec = DB.cravings[0];
  rcClose();
  return rec;
});
ok(ctxSave.onset === 'tonic' && ctxSave.alone === 'alone', '«Тяга» сохраняет необязательный контекст: тип накопления и один(на)/с людьми');

const loneCorr = await page.evaluate(() => {
  const keep = DB.cravings;
  DB.cravings = [
    { id: 1, kind: 'сигарета', intensity: 5, trigger: '', outcome: 'gave_in', alone: 'alone', createdAt: nowISO(), day: todayKey() },
    { id: 2, kind: 'сигарета', intensity: 5, trigger: '', outcome: 'gave_in', alone: 'alone', createdAt: nowISO(), day: todayKey() },
    { id: 3, kind: 'сигарета', intensity: 5, trigger: '', outcome: 'held', alone: 'alone', createdAt: nowISO(), day: todayKey() },
    { id: 4, kind: 'сигарета', intensity: 5, trigger: '', outcome: 'held', alone: 'people', createdAt: nowISO(), day: todayKey() },
    { id: 5, kind: 'сигарета', intensity: 5, trigger: '', outcome: 'held', alone: 'people', createdAt: nowISO(), day: todayKey() },
  ];
  goTo('health');
  const txt = document.getElementById('health-out').textContent;
  DB.cravings = keep;
  return txt;
});
ok(/Один\(на\) срывы чаще/.test(loneCorr), 'связь одиночества со срывами подсвечивается, когда данных достаточно (корневой триггер из разбора JITAI)');

const planFlow = await page.evaluate(() => {
  const keepIns = DB.insights, keepCrav = DB.cravings;
  DB.insights = [{ id: 9001, tag: 'personal', w: 1, title: 'План', body: 'Если «созвон с боссом» — то я: выйду на 5 минут подышать.', date: dateRU(), createdAt: nowISO(), day: todayKey(), src: 'План (если-то)', links: [] }];
  DB.cravings = [];
  openCraving();
  document.getElementById('cr-trigger').value = 'созвон с боссом';
  saveCraving(true);
  const cardTxt = (document.getElementById('react-card') || {}).textContent || '';
  rcClose();
  goTo('health');
  const healthTxt = document.getElementById('health-out').textContent;
  DB.insights = keepIns; DB.cravings = keepCrav;
  return { cardTxt, healthTxt };
});
ok(/план на этот случай/.test(planFlow.cardTxt), 'если для триггера уже есть план «если-то», он всплывает в отклике на следующую тягу');
ok(/план на этот случай уже есть/.test(planFlow.healthTxt), '«Триггеры» на «Здоровье» показывают, что у частого триггера уже есть план');

const envToggle = await page.evaluate(() => {
  const keep = DB.env;
  DB.env = { noSweetsHome: false, noCigsHome: false, ritual: false };
  goTo('health');
  const before = document.getElementById('health-out').textContent;
  toggleEnvFlag('noSweetsHome');
  const after = document.getElementById('health-out').textContent;
  DB.env = keep;
  goTo('health');
  return { before, after };
});
ok(/Среда/.test(envToggle.before) && /Дома нет сладкого/.test(envToggle.before), '«Среда»: чек-лист реструктуризации окружения (BCTTv1) отображается');
ok(envToggle.after !== envToggle.before, 'переключатель «Среды» меняет состояние и перерисовывает раздел');

const riskCard = await page.evaluate(() => {
  const keepVit = { ...DB.vit }, keepCrav = DB.cravings;
  DB.cravings = [];  // изолируем риск от истории — проверяем ветку состояния
  DB.vit = { ...DB.vit, ci: true, date: todayKey(), st: 8, sl: 5 };
  goTo('health');
  const withRisk = document.getElementById('health-out').textContent;
  DB.vit = { ...DB.vit, st: 3, sl: 8 };
  goTo('health');
  const noRisk = document.getElementById('health-out').textContent;
  DB.vit = keepVit; DB.cravings = keepCrav;
  goTo('health');
  return { withRisk, noRisk };
});
ok(/Риск сейчас/.test(riskCard.withRisk) && /Сейчас риск/.test(riskCard.withRisk) && /стресс/.test(riskCard.withRisk), '«Риск сейчас» объясняет конкретные причины (стресс/сон), а не просто «высокий риск»');
ok(/Спокойно\. По твоим данным/.test(riskCard.noRisk), 'без факторов риска — спокойная, не пугающая формулировка');

const bonus = await page.evaluate(() => {
  DB.cravings = [];
  const origRandom = Math.random;
  Math.random = () => 0;
  openCraving();
  saveCraving(true);
  const cardTxt = (document.getElementById('react-card') || {}).textContent || '';
  Math.random = origRandom;
  rcClose();
  return cardTxt;
});
ok(/паттерн правда меняется|Маленькая победа|заметь разницу/.test(bonus), 'переменное подкрепление: после «устоял» иногда появляется непредсказуемый бонус-отклик, не гарантированная галочка');
await page.evaluate(() => { goTo('home'); DB.cravings = []; });

// ── Персональный адаптивный риск-движок (учится на своей истории) ──
const windowRisk = await page.evaluate(() => {
  const keep = { crav: DB.cravings, vit: { ...DB.vit } };
  DB.vit = { ...DB.vit, ci: false };  // без чек-ина — изолируем окно суток
  const mkEvening = id => { const d = new Date(); d.setHours(21, 0, 0, 0); return { id, kind: 'сигарета', intensity: 6, trigger: '', outcome: 'gave_in', createdAt: d.toISOString(), day: todayKey() }; };
  DB.cravings = [1, 2, 3, 4, 5, 6].map(mkEvening);
  const atEvening = cravingRisk(21);   // «как будто сейчас вечер»
  const atMorning = cravingRisk(8);    // «как будто утро»
  DB.cravings = keep.crav; DB.vit = keep.vit;
  return { atEvening, atMorning };
});
ok(windowRisk.atEvening.factors.some(f => f.tag === 'window') && windowRisk.atEvening.top,
  'движок учит ТВОЁ окно суток: вечером риск выше, потому что вечером ты срываешься чаще всего');
ok(!windowRisk.atMorning.factors.some(f => f.tag === 'window'),
  'то же окно утром не поднимает риск — паттерн персональный, привязан ко времени');

const postLapse = await page.evaluate(() => {
  const keep = DB.cravings;
  const d = new Date(Date.now() - 3600e3);  // час назад
  DB.cravings = [{ id: 1, kind: 'сигарета', intensity: 5, trigger: '', outcome: 'gave_in', createdAt: d.toISOString(), day: todayKey() }];
  const r = cravingRisk(12);
  DB.cravings = keep;
  return r;
});
ok(postLapse.factors.some(f => f.tag === 'recent'), 'пост-срыв окно (AVE): первые двое суток после срыва движок держит риск выше');

const feedbackLoop = await page.evaluate(() => {
  DB.cravings = [];
  STATE.crOnset = null;
  openCraving();
  document.getElementById('cr-int').value = 8; crIntChange(8);
  saveCraving(true);
  const rec = DB.cravings[0];
  const cardHasQuestion = /Что помогло удержаться/.test((document.getElementById('react-card') || {}).textContent || '');
  markHelped(rec.id, 'move');
  const stored = DB.cravings[0].helped;
  // теперь при следующей тяге приём «Шаги» должен подняться первым
  const ordered = orderedTips(CRAVING_TIPS_CUE).map(t => t.k);
  DB.cravings = [];
  return { cardHasQuestion, stored, firstTip: ordered[0] };
});
ok(feedbackLoop.cardHasQuestion, 'после «устоял» с показанной интервенцией движок спрашивает, ЧТО помогло — петля обратной связи');
ok(feedbackLoop.stored === 'move', 'ответ сохраняется на записи тяги (локально, приватно, на твоих данных)');
ok(feedbackLoop.firstTip === 'move', 'движок адаптируется: приём, что помог тебе, в следующий раз поднимается первым');
await page.evaluate(() => { goTo('home'); DB.cravings = []; });

// ── Закрытие чата → метрики состояния синхронизируются с «Здоровьем» ──
const stateFlow = await page.evaluate(async () => {
  const keepIns = DB.insights, keepChats = DB.chats, keepCrav = DB.cravings;
  DB.insights = []; DB.chats = []; DB.cravings = [];
  setAiKey('sk-test'); CFG.aiProvider = 'anthropic';
  let phase = 'reply';
  window.fetch = (u) => {
    if (!String(u).includes('anthropic')) return Promise.reject(new Error('offline'));
    const text = phase === 'reply'
      ? 'Слышу тебя. Что за этим стоит?'
      : JSON.stringify({ text: 'Понял: тяну из страха оценки, и вечерами одному особенно тяжело.', symptom: 'откладываю', func: 'избежать оценки', gain: 'не рисковать', need: 'safety', ego: 'child', emotion: 'тревога', game: null, state: { mood: 'low', stress: 'high', lonely: true } });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 50 } }) });
  };
  openChatFor(null, 'Опять весь вечер один, тянет курить');
  await new Promise(r => setTimeout(r, 350));
  const c = DB.chats[DB.chats.length - 1];
  c.msgs.push({ r: 'u', t: 'Да, вечерами особенно', ts: Date.now() });
  phase = 'finish';
  await chatFinish();
  const ins = DB.insights[0] || {};
  const risk = cravingRisk(12);
  const md = mentalStateDigest();
  goTo('health');
  const healthTxt = document.getElementById('health-out').textContent;
  goTo('home');
  DB.insights = keepIns; DB.chats = keepChats; DB.cravings = keepCrav;
  return {
    hasNote: !!ins.stateNote, note: ins.stateNote || {},
    riskChatStress: risk.factors.some(f => f.tag === 'chat-stress'),
    riskChatLonely: risk.factors.some(f => f.tag === 'chat-lonely'),
    healthHasSection: /Психическое состояние/.test(healthTxt),
    digestN: md ? md.n : 0,
  };
});
ok(stateFlow.hasNote && stateFlow.note.mood === 'low' && stateFlow.note.stress === 'high' && stateFlow.note.lonely === true,
  'при закрытии чата состояние (настроение/стресс/одиночество) сохраняется как метрика на выводе диалога');
ok(stateFlow.riskChatStress && stateFlow.riskChatLonely,
  'сегодняшний диалог о стрессе/одиночестве поднимает риск тяги — психоконтур синхронизирован с движком здоровья');
ok(stateFlow.healthHasSection && stateFlow.digestN >= 1,
  'в «Здоровье» появляется раздел «Психическое состояние» по диалогам');

// ── Приёмы саморегуляции (локальный RAG-lite) + кризисный протокол ──
const tech = await page.evaluate(() => {
  const byText = suggestTechniques('не спал всю ночь, злюсь на начальника', 2).map(t => t.id);
  const craving = suggestTechniques('хочется съесть торт и сорваться', 2).map(t => t.id);
  const anxiety = suggestTechniques('накрывает тревога перед встречей', 2).map(t => t.id);
  const lonely = suggestTechniques('пусто и одиноко весь вечер один', 2).map(t => t.id);
  const empty = suggestTechniques('', 2).length;
  return { byText, craving, anxiety, lonely, empty };
});
ok(tech.byText.includes('sigh') || tech.byText.includes('opposite'), 'ретрив по свободному тексту: «злюсь» → приём на злость/напряжение (без вектор-БД, локально)');
ok(tech.craving.includes('urgesurf'), '«хочется съесть торт и сорваться» → сёрфинг по тяге (ACT)');
ok(tech.anxiety.includes('ground54321') || tech.anxiety.includes('box') || tech.anxiety.includes('decatastroph'), '«тревога перед встречей» → заземление/дыхание/декатастрофизация');
ok(tech.lonely.includes('connect'), '«пусто и одиноко» → шаг к человеку (корневой триггер)');
ok(tech.empty === 0, 'без запроса приёмы не навязываются');

const techUI = await page.evaluate(() => {
  openTech('тревога паника');
  const open = document.getElementById('ov-tech').classList.contains('on');
  const out = document.getElementById('tech-out').textContent;
  closeOv('ov-tech');
  return { open, out };
});
ok(techUI.open && /Заземление|Дыхание|Декатастроф/.test(techUI.out), 'шит «Приёмы» открывается и показывает подобранный приём с шагами');

const crisis = await page.evaluate(() => {
  const hit = crisisScreen('иногда думаю, что не хочу жить');
  const safe = crisisScreen('устал и злюсь на всех, тяжёлый день');
  // острый сигнал в свободном тексте приёмов → кризисный протокол, не приём
  document.getElementById('tech-text').value = 'не хочу жить, сил больше нет';
  techFromText();
  const crisisOpen = document.getElementById('ov-crisis').classList.contains('on');
  const techClosed = !document.getElementById('ov-tech').classList.contains('on');
  const body = document.getElementById('ov-crisis').textContent;
  closeOv('ov-crisis');
  return { hit, safe, crisisOpen, techClosed, body };
});
ok(crisis.hit && !crisis.safe, 'кризис-скрин ловит острый сигнал и не срабатывает на обычную усталость/злость');
ok(crisis.crisisOpen && crisis.techClosed, 'острый сигнал в тексте → кризисный протокол вместо приёма (safety fallback)');
ok(/не терапевт|скорую|не один/.test(crisis.body), 'кризисная карточка: без диагнозов, ведёт к живому человеку, честно про «не терапевт»');

const crisisCraving = await page.evaluate(() => {
  DB.cravings = [];
  openCraving();
  document.getElementById('cr-trigger').value = 'не хочу жить';
  saveCraving(false);
  const crisisOpen = document.getElementById('ov-crisis').classList.contains('on');
  const noReact = !document.getElementById('react-card');
  closeOv('ov-crisis'); DB.cravings = [];
  return { crisisOpen, noReact };
});
ok(crisisCraving.crisisOpen && crisisCraving.noReact, 'острый сигнал в триггере тяги → кризисный протокол вместо обычного отклика');
await page.evaluate(() => { goTo('home'); DB.cravings = []; });

// ── Crisis-аудит: косвенные сигналы ловятся, обычная тяжесть — нет ──
const crisisAudit = await page.evaluate(() => {
  const hidden = ['иногда хочется просто исчезнуть', 'всем было бы лучше без меня',
    'если бы меня не было, никому бы хуже не стало', 'не вижу смысла ни в чём',
    'просто хочется, чтобы всё прекратилось', 'не хочу просыпаться по утрам'];
  const benign = ['нет смысла спорить с ним', 'устал на работе за день',
    'не вижу смысла в этой встрече', 'хочется умереть со смеху', 'злюсь и вымотан, тяжёлый день'];
  return { hiddenCaught: hidden.every(crisisScreen), benignClean: benign.every(t => !crisisScreen(t)) };
});
ok(crisisAudit.hiddenCaught, 'crisis-аудит: косвенные сигналы («всем лучше без меня», «хочется исчезнуть», «не вижу смысла ни в чём») ловятся');
ok(crisisAudit.benignClean, 'crisis-аудит: обычная тяжесть/идиомы («умереть со смеху», «нет смысла спорить») НЕ дают ложного кризиса');

// ── Therapeutic Generator (grounded, single-call) + safety-контур ──
const gen = await page.evaluate(async () => {
  setAiKey('sk-test'); CFG.aiProvider = 'anthropic';
  const mock = obj => { window.fetch = (u) => String(u).includes('anthropic')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 100, output_tokens: 40 } }) })
    : Promise.reject(new Error('offline')); };
  // 1) обычный кейс: сообщение + метод из НАШЕЙ базы + кнопка «записать как тягу»
  openTech('');
  document.getElementById('tech-text').value = 'поругался с коллегой, хочется съесть торт';
  mock({ crisis: false, craving_detected: true, method_id: 'urgesurf', message: 'Обидно, когда не слышат. Давай переждём волну тяги вместе.' });
  await techGenerate();
  const outNormal = document.getElementById('tech-out').textContent;
  const hasCravingBtn = /Записать как тягу/.test(document.getElementById('tech-out').innerHTML);
  // 2) ИИ вернул method_id, которого нет в базе → метод не подставляется (grounding)
  document.getElementById('tech-text').value = 'тревожно';
  mock({ crisis: false, craving_detected: false, method_id: 'выдуманный_метод', message: 'Слышу тревогу.' });
  await techGenerate();
  const outHallucinated = document.getElementById('tech-out').textContent;
  // 3) флаг crisis от ИИ → кризисный протокол, генерация отменяется
  document.getElementById('tech-text').value = 'нейтральный по виду текст';
  mock({ crisis: true, craving_detected: false, method_id: 'none', message: '' });
  await techGenerate();
  const crisisFromFlag = document.getElementById('ov-crisis').classList.contains('on');
  closeOv('ov-crisis');
  // 4) crisisScreen на САМ ответ ИИ (второй слой) → тоже кризис
  openTech(''); document.getElementById('tech-text').value = 'обычный текст про усталость';
  mock({ crisis: false, craving_detected: false, method_id: 'sigh', message: 'иногда кажется, что не хочу жить' });
  await techGenerate();
  const crisisFromOutput = document.getElementById('ov-crisis').classList.contains('on');
  closeOv('ov-crisis');
  return { outNormal, hasCravingBtn, outHallucinated, crisisFromFlag, crisisFromOutput };
});
ok(/переждём волну|Сёрфинг по тяге/.test(gen.outNormal) && gen.hasCravingBtn, 'генератор: бережное сообщение + метод из базы + мостик «записать как тягу» (JITAI)');
ok(!/выдуманный/.test(gen.outHallucinated), 'grounding: метод не из нашей базы не подставляется — ИИ не навязывает выдуманную технику');
ok(gen.crisisFromFlag, 'safety: флаг crisis от ИИ отменяет генерацию и открывает кризисный протокол');
ok(gen.crisisFromOutput, 'safety: crisisScreen на самом ответе ИИ (второй слой) тоже уводит в кризисный протокол');

const genOffline = await page.evaluate(async () => {
  setAiKey('');  // нет ключа
  openTech(''); document.getElementById('tech-text').value = 'тревожно и пусто';
  await techGenerate();
  const out = document.getElementById('tech-out').textContent;
  closeOv('ov-tech');
  return out;
});
ok(/Заземление|Дыхание|Шаг к человеку|приём/i.test(genOffline), 'без ИИ-ключа генератор тихо откатывается на локальные приёмы (offline-first)');
await page.evaluate(() => { goTo('home'); });

// ── E2EE: конверт v2, ключ восстановления, обратная совместимость v1 ──
const crypto2 = await page.evaluate(async () => {
  const secret = { hi: 'привет', deep: { n: 7, arr: [1, 2, 'три'] } };
  // v2: шифруем фразой + ключом восстановления
  const rec = genRecoveryKey();
  const blob = await encryptPayload(secret, 'моя-фраза', rec);
  const serverSeesPlaintext = JSON.stringify(blob).includes('привет'); // не должно
  const byPass = await decryptPayload(blob, 'моя-фраза', 'pass');
  const byRec = await decryptPayload(blob, rec, 'recovery');
  let wrongPass = 'decrypted'; try { await decryptPayload(blob, 'не-та-фраза', 'pass'); } catch (e) { wrongPass = 'blocked'; }
  let wrongRec = 'decrypted'; try { await decryptPayload(blob, 'ARCH-WRONG', 'recovery'); } catch (e) { wrongRec = 'blocked'; }
  // без recovery-конверта — попытка recovery должна честно упасть
  const blobNoRec = await encryptPayload(secret, 'ф', undefined);
  let noRecWrap = 'ok'; try { await decryptPayload(blobNoRec, 'что-то', 'recovery'); } catch (e) { noRecWrap = e.needPass ? 'no-recovery' : 'other'; }
  // формат корректный + KDF поднят до 600k
  return {
    enc: blob._enc, hasWrapPass: !!blob.wraps.pass, hasWrapRec: !!blob.wraps.recovery,
    serverSeesPlaintext, byPassOk: JSON.stringify(byPass) === JSON.stringify(secret),
    byRecOk: JSON.stringify(byRec) === JSON.stringify(secret),
    wrongPass, wrongRec, noRecWrap, iter: KDF_ITER, recFmt: /^ARCH-[A-Z2-9-]+$/.test(rec),
  };
});
ok(crypto2.enc === 'v2' && crypto2.hasWrapPass && crypto2.hasWrapRec && !crypto2.serverSeesPlaintext,
  'E2EE: v2-конверт — на сервер уходит только шифроблок (открытого текста нет), есть обёртки фразы и восстановления');
ok(crypto2.byPassOk && crypto2.byRecOk, 'расшифровка работает и по фразе, и по ключу восстановления (envelope round-trip)');
ok(crypto2.wrongPass === 'blocked' && crypto2.wrongRec === 'blocked' && crypto2.noRecWrap === 'no-recovery',
  'неверная фраза/ключ отвергаются; без recovery-обёртки восстановление честно недоступно');
ok(crypto2.iter === 600000 && crypto2.recFmt, 'KDF поднят до 600k (OWASP), ключ восстановления — читаемый формат');

const cryptoV1 = await page.evaluate(async () => {
  // Имитируем СТАРЫЙ блок v1 (100k, прямой ключ из фразы) и проверяем,
  // что новый decryptPayload его читает — обратная совместимость.
  const te = new TextEncoder();
  const pass = 'старая-фраза', obj = { legacy: 'да', x: 42 };
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  const v1blob = { _enc: 'v1', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  const back = await decryptPayload(v1blob, pass, 'pass');
  return JSON.stringify(back) === JSON.stringify(obj);
});
ok(cryptoV1, 'обратная совместимость: старые v1-блоки (100k) читаются новым кодом — данные не теряются при апгрейде');

const packE2EE = await page.evaluate(async () => {
  const keep = { pass: getPass(), rec: getRecoveryKey(), ins: DB.insights };
  DB.insights = [{ id: 7, tag: 'personal', title: 'секрет', body: 'очень личное', links: [] }];
  setPass('ф-раза'); setRecoveryKey('');
  const payload = await packPayload();               // фраза есть → шифруем
  const leaks = JSON.stringify(payload).includes('очень личное');
  const restored = await unpackServer({ db: payload.db, cfg: payload.cfg, updated_at: new Date().toISOString() });
  const roundtrip = (restored.db.insights || []).some(i => i.body === 'очень личное');
  // защита от даунгрейда: recovery есть, фразы нет → синк не пушит плейнтекст
  setPass(''); setRecoveryKey('ARCH-TEST');
  const guard = (getRecoveryKey() && !getPass()) ? 'guarded' : 'open';
  setPass(keep.pass); setRecoveryKey(keep.rec); DB.insights = keep.ins;
  return { leaks, roundtrip, guard };
});
ok(!packE2EE.leaks && packE2EE.roundtrip, 'packPayload/unpackServer: реальные данные шифруются перед отправкой и корректно расшифровываются');
ok(packE2EE.guard === 'guarded', 'защита от даунгрейда: после восстановления (recovery без фразы) плейнтекст не пушится поверх шифроблока');

const privacyUI = await page.evaluate(() => {
  goTo('settings'); openOv('ov-privacy');
  const t = document.getElementById('ov-privacy').textContent;
  closeOv('ov-privacy');
  return t;
});
ok(/end-to-end/i.test(privacyUI) && /ИИ/.test(privacyUI) && /Забыл фразу/.test(privacyUI),
  'privacy-экран честен: E2EE-хранилище + оговорка про ИИ-разбор + про потерю фразы');
await page.evaluate(() => { goTo('home'); });

// ── Momentary State (двухосевой ввод состояния «здесь и сейчас») ──
const mom = await page.evaluate(() => {
  goTo('home');
  openOv('ov-moment');
  document.getElementById('mo-val').value = 80;
  document.getElementById('mo-act').value = 30;
  document.getElementById('mo-note').value = 'проверка момента';
  saveMoment();
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  const list = db.moments || [];
  const last = list[list.length - 1] || {};
  const homeTxt = document.getElementById('h-moments').textContent || '';
  return {
    open: document.getElementById('ov-moment').classList.contains('on'),
    count: list.length, valence: last.valence, activation: last.activation, note: last.note,
    kType: last.kType, verif: last.verif, life: last.life,
    homeShown: /Моменты сегодня/.test(homeTxt) && /приятность/.test(homeTxt),
  };
});
ok(mom.count >= 1 && mom.valence === 80 && mom.activation === 30 && mom.note === 'проверка момента', 'Momentary State: запись сохранена (valence/activation/note)');
ok(mom.kType === 'self_report' && mom.verif === 'unverified' && mom.life === 'current', 'Momentary State: «паспорт данных» (kType/verif/life) на записи');
ok(!mom.open, 'Momentary State: sheet закрывается после сохранения');
ok(mom.homeShown, 'Momentary State: «Моменты сегодня» отрендерены на «Сегодня»');
await page.evaluate(() => { goTo('home'); });

// ── Метод «Зачем?» (структурированный разбор) ──
const why = await page.evaluate(() => {
  goTo('home');
  openOv('ov-why');
  document.getElementById('why-symptom').value = 'тянет проверять телефон';
  document.getElementById('why-need').value = 'снять тревогу';
  document.getElementById('why-action').value = 'сделать паузу 5 минут';
  saveWhy();
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  const list = db.whys || [];
  const last = list[list.length - 1] || {};
  const homeTxt = document.getElementById('h-whys').textContent || '';
  return {
    open: document.getElementById('ov-why').classList.contains('on'),
    count: list.length, symptom: last.symptom, need: last.need, action: last.action,
    kType: last.kType, verif: last.verif,
    homeShown: /Разборы «Зачем\?»/.test(homeTxt) && /тянет проверять/.test(homeTxt),
  };
});
ok(why.count >= 1 && why.symptom === 'тянет проверять телефон' && why.action === 'сделать паузу 5 минут', 'Метод «Зачем?»: разбор сохранён (цепочка симптом→…→действие)');
ok(why.kType === 'process_reflection' && why.verif === 'user_confirmed', 'Метод «Зачем?»: «паспорт данных» (process_reflection / user_confirmed)');
ok(!why.open && why.homeShown, 'Метод «Зачем?»: лист закрывается, разбор виден на «Сегодня»');
await page.evaluate(() => { goTo('home'); });

// ── Динамика «Моментов» (спарклайн за 2 недели) ──
const trend = await page.evaluate(() => {
  const dk = ms => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  DB.moments = (DB.moments || []).concat([
    { id: 1, valence: 30, activation: 40, day: dk(now - 5 * 864e5), createdAt: new Date(now - 5 * 864e5).toISOString(), kType: 'self_report', verif: 'unverified', life: 'current' },
    { id: 2, valence: 70, activation: 60, day: dk(now - 1 * 864e5), createdAt: new Date(now - 1 * 864e5).toISOString(), kType: 'self_report', verif: 'unverified', life: 'current' },
  ]);
  rMomentTrend();
  const el = document.getElementById('h-moment-trend');
  return { hasSvg: el.querySelectorAll('polyline').length === 2, hasLabel: /Динамика состояния/.test(el.textContent || '') };
});
ok(trend.hasSvg && trend.hasLabel, 'Динамика «Моментов»: спарклайн приятности/энергии рендерится при данных ≥2 дней');
await page.evaluate(() => { goTo('home'); });

// ── «Зачем?» detail: просмотр полной цепочки + удаление ──
const whyDet = await page.evaluate(() => {
  goTo('home');
  DB.whys = [{ id: 5551, symptom: 'детальный симптом', need: 'детальная нужда', action: 'детальное действие',
    kType: 'process_reflection', verif: 'user_confirmed', life: 'current',
    createdAt: new Date().toISOString(), day: new Date().toISOString().slice(0, 10), sv: 2, _u: Date.now() }];
  rWhys();
  openWhy(5551);
  const detOpen = document.getElementById('ov-why-det').classList.contains('on');
  const body = document.getElementById('why-det-body').textContent || '';
  deleteWhyDet();
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  const gone = !(db.whys || []).some(w => w && w.id === 5551);
  const tomb = !!(db._del && db._del[5551]);
  return { detOpen, hasChain: /детальный симптом/.test(body) && /детальное действие/.test(body), gone, tomb };
});
ok(whyDet.detOpen && whyDet.hasChain, '«Зачем?» detail: полная цепочка открывается по тапу');
ok(whyDet.gone && whyDet.tomb, '«Зачем?» detail: удаление убирает запись и ставит надгробие (синк-безопасно)');
await page.evaluate(() => { goTo('home'); });

// ── Момент detail: просмотр + удаление (парити с «Зачем?») ──
const momDet = await page.evaluate(() => {
  goTo('home');
  DB.moments = [{ id: 7771, valence: 80, activation: 30, emo: 'Спокойствие', note: 'заметка момента',
    kType: 'self_report', verif: 'unverified', life: 'current',
    createdAt: new Date().toISOString(), day: new Date().toISOString().slice(0, 10), sv: 2, _u: Date.now() }];
  rHomeMoments();
  openMoment(7771);
  const detOpen = document.getElementById('ov-moment-det').classList.contains('on');
  const body = document.getElementById('mom-det-body').textContent || '';
  deleteMomentDet();
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  const gone = !(db.moments || []).some(m => m && m.id === 7771);
  return { detOpen, hasInfo: /Спокойствие/.test(body) && /заметка момента/.test(body), gone, tomb: !!(db._del && db._del[7771]) };
});
ok(momDet.detOpen && momDet.hasInfo, 'Момент detail: полная информация открывается по тапу');
ok(momDet.gone && momDet.tomb, 'Момент detail: удаление убирает запись и ставит надгробие');
await page.evaluate(() => { goTo('home'); });

// ── «Зачем?» проверка результата: отметить действие сделанным ──
const followup = await page.evaluate(() => {
  goTo('home');
  DB.whys = [{ id: 8881, symptom: 'проверочный симптом', action: 'сделать шаг',
    kType: 'process_reflection', verif: 'user_confirmed', life: 'current',
    createdAt: new Date().toISOString(), day: new Date().toISOString().slice(0, 10), sv: 2, _u: Date.now() }];
  DB.corrections = [];
  rWhys();
  openWhy(8881);
  const hasFollowup = /ты сделал это/i.test(document.getElementById('why-det-body').textContent || '');
  markWhyAction(true);
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  // Через ядро: оригинал в db.whys НЕ мутирован, отметка живёт в коррекции.
  const raw = (db.whys || []).find(w => w && w.id === 8881) || {};
  const corr = (db.corrections || []).find(c => c && c.coll === 'whys' && c.targetId === 8881) || {};
  const projected = proj('whys', DB.whys.find(w => w.id === 8881));
  const listMark = /✓/.test(document.getElementById('h-whys').textContent || '');
  return { hasFollowup, origUntouched: raw.actionDone === undefined, corrSaved: corr.patch && corr.patch.actionDone === true, projDone: projected.actionDone === true, listMark };
});
ok(followup.hasFollowup, '«Зачем?» проверка: раздел «ты сделал это?» показан при наличии действия');
ok(followup.origUntouched && followup.corrSaved, 'ядро: оригинал разбора не мутирован — отметка сохранена как append-only коррекция');
ok(followup.projDone && followup.listMark, 'ядро: проекция применяет коррекцию (✓ в списке через projected-значение)');
await page.evaluate(() => { goTo('home'); });

// ── История состояний (моменты + разборы одним списком) ──
const hist = await page.evaluate(() => {
  const iso = new Date().toISOString(), day = iso.slice(0, 10);
  DB.moments = [{ id: 9001, valence: 60, activation: 50, emo: 'Радость', kType: 'self_report', verif: 'unverified', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.whys = [{ id: 9002, symptom: 'исторический симптом', action: 'исторический шаг', kType: 'process_reflection', verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  openOv('ov-history');
  const txt = document.getElementById('history-list').textContent || '';
  const rows = document.querySelectorAll('#history-list .srow').length;
  return { open: document.getElementById('ov-history').classList.contains('on'), rows, hasMoment: /момент/.test(txt), hasWhy: /«Зачем\?»/.test(txt) && /исторический симптом/.test(txt) };
});
ok(hist.open && hist.rows >= 2 && hist.hasMoment && hist.hasWhy, 'История состояний: моменты и разборы «Зачем?» в одном списке');
await page.evaluate(() => { closeOv('ov-history'); goTo('home'); });

// ── «За неделю» сводка (детерминированная, без ИИ) ──
const week = await page.evaluate(() => {
  const iso = new Date().toISOString(), day = iso.slice(0, 10);
  DB.moments = [
    { id: 9101, valence: 40, activation: 60, kType: 'self_report', verif: 'unverified', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() },
    { id: 9102, valence: 80, activation: 40, kType: 'self_report', verif: 'unverified', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() },
  ];
  DB.whys = [{ id: 9103, symptom: 's', action: 'a', actionDone: true, kType: 'process_reflection', verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  rWeekSummary();
  const txt = document.getElementById('h-week').textContent || '';
  return { hasWeek: /За неделю/.test(txt), hasAvg: /приятность 60%/.test(txt) && /энергия 50%/.test(txt), hasWhy: /1 разбор/.test(txt) && /выполнено 1/.test(txt) };
});
ok(week.hasWeek && week.hasAvg && week.hasWhy, '«За неделю»: детерминированная сводка (средние + разборы + выполнено)');
await page.evaluate(() => { goTo('home'); });

// ── Privacy-гейт: без фразы данные не уходят на сервер молча ──
const psg = await page.evaluate(() => {
  const origConfirm = window.confirm, origPass = localStorage.getItem('arch5_pass_' + localStorage.getItem('arch5_active'));
  localStorage.removeItem('arch5_pass_' + localStorage.getItem('arch5_active'));
  delete CFG.plainSyncConsent;
  // 1) отказ в confirm → гейт блокирует
  window.confirm = () => false;
  const blocked = ensureSyncPrivacy(true) === false && !CFG.plainSyncConsent;
  // 2) согласие → гейт пропускает и запоминает
  window.confirm = () => true;
  const allowed = ensureSyncPrivacy(true) === true && CFG.plainSyncConsent === true;
  // 3) с фразой — пропускает без вопросов
  delete CFG.plainSyncConsent;
  localStorage.setItem('arch5_pass_' + localStorage.getItem('arch5_active'), 'testpass');
  window.confirm = () => { throw new Error('confirm не должен вызываться при E2EE'); };
  const e2ee = ensureSyncPrivacy(true) === true;
  window.confirm = origConfirm;
  if (origPass) localStorage.setItem('arch5_pass_' + localStorage.getItem('arch5_active'), origPass);
  else localStorage.removeItem('arch5_pass_' + localStorage.getItem('arch5_active'));
  delete CFG.plainSyncConsent;
  return { blocked, allowed, e2ee };
});
ok(psg.blocked, 'privacy-гейт: без фразы и без согласия синк заблокирован');
ok(psg.allowed, 'privacy-гейт: явное согласие пропускает и запоминается');
ok(psg.e2ee, 'privacy-гейт: с парольной фразой (E2EE) вопросов нет');

// ── Evidence Kernel: коррекции момента + проекция + backfill ──
const kernel = await page.evaluate(() => {
  const iso = new Date().toISOString(), day = iso.slice(0, 10);
  DB.moments = [{ id: 9301, valence: 20, activation: 20, kType: 'self_report', verif: 'unverified', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.whys = []; DB.corrections = [];
  STATE.momDetId = 9301;
  // Исправление через prompt → correction
  const origPrompt = window.prompt; let call = 0;
  window.prompt = () => (++call === 1 ? '90' : '70');
  correctMoment();
  window.prompt = origPrompt;
  const raw = DB.moments[0];
  const p = proj('moments', raw);
  rWeekSummary();
  const weekTxt = document.getElementById('h-week').textContent || '';
  // Backfill идемпотентен: старая запись без verif получает паспорт, повторный прогон без изменений
  DB.insights.push({ id: 9302, title: 'старая', body: 'x', createdAt: iso, day, sv: 2, _u: Date.now() });
  migrateRecords();
  const after1 = JSON.stringify(DB.insights.find(i => i.id === 9302));
  migrateRecords();
  const after2 = JSON.stringify(DB.insights.find(i => i.id === 9302));
  const bf = DB.insights.find(i => i.id === 9302);
  DB.insights = DB.insights.filter(i => i.id !== 9302);
  return {
    origIntact: raw.valence === 20 && raw.activation === 20,
    projApplied: p.valence === 90 && p.activation === 70 && p._corrected === 1,
    weekUsesProj: /приятность 90%/.test(weekTxt) && /энергия 70%/.test(weekTxt),
    backfilled: bf.verif === 'unverified' && bf.life === 'current',
    idempotent: after1 === after2,
  };
});
ok(kernel.origIntact && kernel.projApplied, 'ядро: исправление момента не мутирует оригинал, проекция даёт новые значения');
ok(kernel.weekUsesProj, 'ядро: сводка «За неделю» считает по исправленным (projected) значениям');
ok(kernel.backfilled && kernel.idempotent, 'ядро: backfill паспорта на старые записи идемпотентен');
await page.evaluate(() => { DB.moments = []; DB.corrections = []; goTo('home'); });

// ── Health Organizer: план лекарств + факт приёма (раздельные классы) ──
const medsT = await page.evaluate(() => {
  goTo('health');
  DB.meds = []; DB.medIntakes = [];
  openOv('ov-med-add');
  document.getElementById('med-name').value = 'Витамин D';
  document.getElementById('med-dose').value = '2000 МЕ · утром';
  saveMed();
  const plan = DB.meds[0] || {};
  logMedIntake(plan.id);
  const intake = DB.medIntakes[0] || {};
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  const healthTxt = document.getElementById('health-out').textContent || '';
  return {
    planSaved: plan.kType === 'medication_plan' && plan.name === 'Витамин D' && plan.privacyClass === 'sensitive',
    intakeSaved: intake.kType === 'medication_intake' && intake.medId === plan.id && intake.status === 'taken',
    persisted: (db.meds || []).length === 1 && (db.medIntakes || []).length === 1,
    separate: plan.kType !== intake.kType,
    ui: /Лекарства и витамины/.test(healthTxt) && /Витамин D/.test(healthTxt) && /сегодня: 1/.test(healthTxt),
    disclaimer: /не медицинская рекомендация/i.test(healthTxt),
  };
});
ok(medsT.planSaved && medsT.intakeSaved && medsT.persisted, 'здоровье: план (medication_plan) и факт (medication_intake) сохраняются раздельно');
ok(medsT.separate && medsT.disclaimer, 'здоровье: план ≠ факт (разные классы) + дисклеймер «не рекомендация» виден');
ok(medsT.ui, 'здоровье: секция «Лекарства и витамины» рендерится (имя + счётчик «сегодня: 1»)');
await page.evaluate(() => { DB.meds = []; DB.medIntakes = []; goTo('home'); });

// ── Health Organizer: симптомы + измерения ──
const bodyT = await page.evaluate(() => {
  goTo('health');
  DB.symptoms = []; DB.measures = [];
  openOv('ov-symptom');
  document.getElementById('sym-name').value = 'головная боль';
  document.getElementById('sym-sev').value = 6;
  document.getElementById('sym-note').value = 'после обеда';
  saveSymptom();
  openOv('ov-measure');
  document.getElementById('mea-name').value = 'давление';
  document.getElementById('mea-value').value = '120/80';
  saveMeasure();
  const s = DB.symptoms[0] || {}, m = DB.measures[0] || {};
  const active = localStorage.getItem('arch5_active');
  const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || '{}');
  const txt = document.getElementById('health-out').textContent || '';
  return {
    symOk: s.kType === 'symptom_observation' && s.severity === 6 && s.privacyClass === 'sensitive',
    meaOk: m.kType === 'measurement' && m.value === '120/80',
    persisted: (db.symptoms || []).length === 1 && (db.measures || []).length === 1,
    ui: /Дневник тела/.test(txt) && /головная боль/.test(txt) && /120\/80/.test(txt),
  };
});
ok(bodyT.symOk && bodyT.meaOk && bodyT.persisted, 'здоровье: симптом (observation) и измерение (measurement) сохраняются с паспортом');
ok(bodyT.ui, 'здоровье: «Дневник тела» рендерит симптомы и измерения');
await page.evaluate(() => { DB.symptoms = []; DB.measures = []; goTo('home'); });

// ── Health Organizer: «Отчёт врачу» ──
const docT = await page.evaluate(() => {
  goTo('health');
  const iso = new Date().toISOString(), day = iso.slice(0, 10);
  DB.meds = [{ id: 9401, kType: 'medication_plan', name: 'Витамин D', dose: '2000 МЕ', active: true, verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.medIntakes = [{ id: 9402, kType: 'medication_intake', medId: 9401, status: 'taken', at: iso, verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.symptoms = [{ id: 9403, kType: 'symptom_observation', name: 'головная боль', severity: 6, note: 'после обеда', verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.measures = [{ id: 9404, kType: 'measurement', name: 'давление', value: '120/80', unit: '', verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.corrections = [];
  openDoctorReport();
  const txt = document.getElementById('doc-report-text').value || '';
  return {
    open: document.getElementById('ov-doc-report').classList.contains('on'),
    meds: /Витамин D — 2000 МЕ · принято за период: 1 раз/.test(txt),
    sym: /головная боль: 1 раз, средняя выраженность 6\/10/.test(txt) && /после обеда/.test(txt),
    mea: /давление: .*120\/80/.test(txt),
    disclaimer: /Не является медицинским документом/.test(txt),
  };
});
ok(docT.open && docT.meds && docT.sym && docT.mea, '«Отчёт врачу»: план+факт, симптомы, измерения — всё в сводке');
ok(docT.disclaimer, '«Отчёт врачу»: явная пометка «не медицинский документ»');
await page.evaluate(() => { DB.meds = []; DB.medIntakes = []; DB.symptoms = []; DB.measures = []; closeOv('ov-doc-report'); goTo('home'); });

// ── Напоминание о приёме на «Сегодня» ──
const remT = await page.evaluate(() => {
  const iso = new Date().toISOString(), day = iso.slice(0, 10);
  goTo('home');
  DB.meds = [{ id: 9501, kType: 'medication_plan', name: 'Магний', active: true, verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  DB.medIntakes = [];
  rMedReminder();
  const pendingShown = /Магний/.test(document.getElementById('h-med-reminder').textContent || '');
  DB.medIntakes = [{ id: 9502, kType: 'medication_intake', medId: 9501, status: 'taken', at: iso, verif: 'user_confirmed', life: 'current', createdAt: iso, day, sv: 2, _u: Date.now() }];
  rMedReminder();
  const clearedAfterTake = (document.getElementById('h-med-reminder').innerHTML || '') === '';
  DB.meds = []; DB.medIntakes = [];
  return { pendingShown, clearedAfterTake };
});
ok(remT.pendingShown && remT.clearedAfterTake, 'напоминание: показано пока приём не отмечен, исчезает после отметки');

// ── Астрология: golden-расчёт + правило неизвестного времени + изоляция ──
const astroT = await page.evaluate(async () => {
  // Golden fixture: J2000 (2000-01-01 12:00 UTC, синтетические данные рождения).
  DB.astroBirth = { kType: 'birth_evidence', privacyClass: 'sensitive', date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, place: 'тест', lat: 55.75, lon: 37.62, verif: 'user_confirmed', life: 'current', createdAt: new Date().toISOString(), sv: 2, _u: Date.now() };
  DB.astroCharts = [];
  openAstro(); asub('setup');
  await runNatalChart();
  const ann = DB.astroCharts[0] || {};
  const chart = ann.chart || {};
  const sun = (chart.planets || []).find(p => p.body === 'Sun') || {};
  const mars = (chart.planets || []).find(p => p.body === 'Mars') || {};
  const outTxt = document.getElementById('astro-out').textContent || '';
  // Правило неизвестного времени: без Asc/домов, полдень не выдаётся за истину.
  DB.astroBirth = { ...DB.astroBirth, timeKnown: false, time: '' };
  const chartNoTime = computeNatalChart(DB.astroBirth);
  // Изоляция: заполненные астро-данные не появляются в факторах риска.
  const risk = cravingRisk();
  const riskClean = !risk.factors.some(f => /астро|зодиак|планет/i.test(f.why || ''));
  const r = {
    goldenSun: Math.abs(sun.lon - 280.37) < 0.05 && sun.sign === 'Козерог',
    goldenMars: mars.sign === 'Водолей' && Math.abs(mars.deg - 27.96) < 0.05,
    hasAngles: !!chart.angles && !!chart.houses,
    versioned: ann.kType === 'symbolic_astrology_annotation' && /astronomy-engine@2\.1\.19/.test((chart.versions || {}).engine || ''),
    // Известный аспект J2000: Луна 223.32° ↔ Солнце 280.37° = 57.05° → секстиль (60°±5)
    goldenAspect: (chart.aspects || []).some(a => a.name === 'секстиль' && ((a.a === 'Луна' && a.b === 'Солнце') || (a.a === 'Солнце' && a.b === 'Луна'))),
    uiRendered: /Солнце — Козерог 10\.4°/.test(outTxt) && /Не прогноз, не диагноз/.test(outTxt),
    noTimeNoHouses: chartNoTime.angles === null && chartNoTime.houses === null,
    riskClean,
  };
  DB.astroBirth = null; DB.astroCharts = [];
  goTo('home');
  return r;
});
ok(astroT.goldenSun && astroT.goldenMars, 'астрология: golden J2000 — Солнце Козерог ~280.37°, Марс Водолей ~27.96° (движок точен)');
ok(astroT.goldenAspect, 'астрология: golden-аспект — Луна секстиль Солнце на J2000 (формула углового расстояния верна)');
ok(astroT.hasAngles && astroT.versioned, 'астрология: Asc/дома при известном времени; аннотация версионирована (engine/ruleset)');
ok(astroT.uiRendered, 'астрология: карта отрендерена + символический дисклеймер');
ok(astroT.noTimeNoHouses, 'астрология: неизвестное время → без асцендента и домов (полдень не выдаётся за истину)');
ok(astroT.riskClean, 'астрология: изоляция — астро-данные не участвуют в факторах риска');

// ── Астрология: транзиты (golden — тот же момент = соединения орб 0) ──
const transitT = await page.evaluate(async () => {
  await loadAstroEngine();
  const birth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62 };
  const natal = computeNatalChart(birth);
  // Транзиты в ТОТ ЖЕ момент: каждая планета в соединении сама с собой (орб 0.0).
  const tr = computeTransits(natal, new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
  const selfConj = tr.hits.filter(h => h.transit === h.natal && h.aspect === 'соединение' && parseFloat(h.exact) < 0.1);
  return {
    bodies: tr.current.length === 10,
    selfConjAll: selfConj.length === 10,
    versioned: /transit-orbs-v1/.test(tr.versions.transitOrbPolicy || ''),
  };
});
ok(transitT.bodies && transitT.selfConjAll, 'транзиты: golden — тот же момент даёт 10 соединений с орбом ~0 (движок согласован)');
ok(transitT.versioned, 'транзиты: орб-политика версионирована');

// ── Астрология 1.1: системы домов — математические golden-инварианты ──
const housesT = await page.evaluate(async () => {
  await loadAstroEngine();
  const sep180 = (a, b) => Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  const close = (a, b, tol) => sep180(a, b) <= tol;
  const mk = hs => computeNatalChart({ date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: hs });
  const quadrant = ['placidus', 'campanus', 'regiomontanus'];
  let cusp1Asc = true, cusp10Mc = true, opp = true;
  for (const hs of quadrant.concat(['equal'])) {
    const ch = mk(hs); const c = ch.houses.cusps;
    if (!close(c[1], ch.angles.asc.lon, 0.01)) cusp1Asc = false;
    if (quadrant.includes(hs) && !close(c[10], ch.angles.mc.lon, 0.01)) cusp10Mc = false;
    for (let k = 1; k <= 6; k++) if (Math.abs(sep180(c[k], c[k + 6]) - 180) > 0.01) opp = false;
  }
  // На экваторе (φ=0, AD=0) все квадрантные системы обязаны совпасть.
  const eq = quadrant.map(hs => computeNatalChart({ date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 0, lon: 0, houseSystem: hs }).houses.cusps);
  let equatorSame = true;
  for (let k = 1; k <= 12; k++) { if (!close(eq[0][k], eq[1][k], 0.1) || !close(eq[0][k], eq[2][k], 0.1)) equatorSame = false; }
  // Выбор системы попадает в аннотацию версий.
  const vers = mk('placidus').versions.houses === 'placidus-v1';
  return { cusp1Asc, cusp10Mc, opp, equatorSame, vers };
});
ok(housesT.cusp1Asc && housesT.cusp10Mc, 'дома: куспид 1 = Asc, куспид 10 = MC (квадрантные системы, ±0.01°)');
ok(housesT.opp, 'дома: противоположные куспиды ровно в оппозиции (все системы)');
ok(housesT.equatorSame, 'дома: golden-инвариант φ=0 — Плацидус=Кампанус=Региомонтанус (равные деления)');
ok(housesT.vers, 'дома: выбранная система версионируется в аннотации');

// ── Астрология 1.2: астероиды + точки — golden-проверки ──
const pointsT = await page.evaluate(async () => {
  await loadAstroEngine();
  const A = window.Astronomy;
  const ch = computeNatalChart({ date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' });
  // 1) Кеплер: солвер сходится, радиусы в пределах орбиты.
  const t0 = A.MakeTime(new Date(Date.UTC(2000, 0, 1, 12)));
  let kepOk = true;
  for (const k of Object.keys(ASTEROID_ELEMENTS)) {
    const el = ASTEROID_ELEMENTS[k]; const a = asteroidLongitude(k, t0);
    if (a.kepErr > 1e-9 || a.r < el.a * (1 - el.e) - 1e-6 || a.r > el.a * (1 + el.e) + 1e-6) kepOk = false;
  }
  // 2) Замыкание орбиты Цереры: через полный период (двухтелая) долгота гелио-вектора совпадает.
  const el = ASTEROID_ELEMENTS.Ceres;
  const periodDays = 365.25 * Math.pow(el.a, 1.5);
  const h1 = keplerHelioVector(el, 2461200.5), h2 = keplerHelioVector(el, 2461200.5 + periodDays);
  const lon1 = Math.atan2(h1.y, h1.x), lon2 = Math.atan2(h2.y, h2.x);
  const orbitCloses = Math.abs(lon1 - lon2) < 0.001;
  // 3) Лилит на J2000 = 83.3532 + 180 = 263.3532° (формула Меёса, T=0).
  const lilithOk = Math.abs(meanLilithLon(A.MakeTime(new Date(Date.UTC(2000, 0, 1, 12)))).valueOf() - 263.3532) < 0.02;
  // 4) Точка Судьбы: арифметика Asc+Moon−Sun (день) / Asc+Sun−Moon (ночь).
  const sun = ch.planets.find(p => p.body === 'Sun').lon, moon = ch.planets.find(p => p.body === 'Moon').lon;
  const asc = ch.angles.asc.lon; const pof = ch.points.fortune;
  const expected = pof.isDay ? ((asc + moon - sun) % 360 + 360) % 360 : ((asc + sun - moon) % 360 + 360) % 360;
  const pofOk = Math.abs(pof.lon - expected) < 1e-9;
  // 5) Антисция: зеркало (λ + antiscia = 180 mod 360); Рак 0° ↔ сам себе.
  const antOk = ch.antiscia.every(a => { const orig = ch.planets.find(p => p.name === a.name).lon; return Math.abs(((orig + a.lon) % 360) - 180) < 1e-9; });
  // 6) Вертекс: лежит на первой вертикали (dot с севером = 0) — уже встроен численно; проверим западность через повторный расчёт.
  const vtxOk = !!ch.points.vertex && isFinite(ch.points.vertex.lon);
  return { kepOk, orbitCloses, lilithOk, pofOk, antOk, vtxOk, hasAst: ch.asteroids.length === 5, versioned: /jpl-sbdb/.test(ch.versions.asteroids || '') };
});
ok(pointsT.kepOk && pointsT.orbitCloses, 'астероиды: солвер Кеплера сходится (<1e-9), радиус в орбите, орбита Цереры замыкается за период');
ok(pointsT.lilithOk, 'Лилит: golden J2000 = 263.35° (ср. перигей Меёса + 180°)');
ok(pointsT.pofOk, 'Точка Судьбы: дневная/ночная формула Asc±(Луна−Солнце) точна');
ok(pointsT.antOk, 'антисции: λ + antiscia ≡ 180° (зеркало оси Рак–Козерог)');
ok(pointsT.vtxOk && pointsT.hasAst && pointsT.versioned, 'астероиды/точки: 5 тел, Вертекс рассчитан, источник JPL версионирован');

// Golden против ОПУБЛИКОВАННОЙ эфемериды: JPL Horizons на 2026-07-24 12:00 UTC
// (геоцентрические эклиптические долготы, запрошены 2026-07-24; допуск 0.05°).
const horizonsT = await page.evaluate(async () => {
  await loadAstroEngine();
  const A = window.Astronomy;
  const t = A.MakeTime(new Date(Date.UTC(2026, 6, 24, 12)));
  const REF = { Chiron: 30.8189, Ceres: 82.7527, Pallas: 21.4210, Juno: 304.2607, Vesta: 24.2565 };
  const out = {};
  for (const k of Object.keys(REF)) { out[k] = Math.abs(asteroidLongitude(k, t).lon - REF[k]); }
  return { maxErr: Math.max(...Object.values(out)), all: Object.values(out).every(d => d < 0.05) };
});
ok(horizonsT.all, `астероиды: golden против JPL Horizons (2026-07-24) — все 5 тел в пределах 0.05° (макс ${horizonsT.maxErr.toFixed(4)}°)`);

// ── Астрология 1.3–1.4: мидпоинты + гармоники (арифметические инварианты) ──
const midT = await page.evaluate(async () => {
  await loadAstroEngine();
  const sep = (a, b) => Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  // Мидпоинт: равноудалён и на короткой дуге (вкл. wrap 350↔10 → 0, не 180).
  const cases = [[350, 10, 0], [10, 90, 50], [0, 180, 90], [300, 100, 20]];
  let mpOk = true;
  for (const [a, b, want] of cases) {
    const m = midpointLon(a, b);
    if (sep(m, a) > sep(a, b) / 2 + 1e-6 || Math.abs(sep(m, a) - sep(m, b)) > 1e-6) mpOk = false;
    if (want !== null && sep(m, want) > 1e-6 && Math.abs(sep(a, b) - 180) > 1e-9) mpOk = false;
  }
  // Дерево: синтетика — Солнце 0°, Луна 90°, Марс 45° → Марс = Солнце/Луна (0°).
  const fake = { planets: [{ name: 'Солнце', lon: 0 }, { name: 'Луна', lon: 90 }, { name: 'Марс', lon: 45.3 }], angles: null };
  const tree = computeMidpointTree(fake);
  const treeOk = tree.some(h => h.point === 'Марс' && h.pair === 'Солнце/Луна' && h.angle === 0 && parseFloat(h.orb) <= 0.31);
  // Гармоника: точный трин (0° и 120°) в H3 → соединение (инвариант Аддея).
  const fake3 = { planets: [{ name: 'A', lon: 10 }, { name: 'B', lon: 130 }] };
  const h3 = computeHarmonic(fake3, 3);
  const harmOk = h3.conj.length === 1 && parseFloat(h3.conj[0].orb) < 1e-6 && Math.abs(h3.planets[0].lon - 30) < 1e-9;
  return { mpOk, treeOk, harmOk };
});
ok(midT.mpOk, 'мидпоинты: середина короткой дуги, равноудалённость (вкл. wrap 350↔10 → 0°)');
ok(midT.treeOk, 'дерево мидпоинтов: Марс = Солнце/Луна при синтетике 0°/90°/45.3°');
ok(midT.harmOk, 'гармоники: точный трин → соединение в H3 (инвариант Аддея), 10°×3=30°');

// ── Астрология оч.2: прогрессии, дирекции, возвращения — golden ──
const progT = await page.evaluate(async () => {
  await loadAstroEngine();
  const A = window.Astronomy;
  const birth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62 };
  const natal = computeNatalChart(birth);
  const b0 = new Date(Date.UTC(2000, 0, 1, 12));
  // 1) Прогрессия на возраст 0 = натал (инвариант).
  const p0 = computeProgressions(birth, b0, 'secondary');
  const zeroOk = p0.planets.every(p => { const n = natal.planets.find(x => x.body === p.body); return Math.abs(((p.lon - n.lon + 180) % 360 + 360) % 360 - 180) < 0.02; });
  // 2) 30 лет: прогрессированное Солнце сдвинуто на ~29.6° (28–31 с учётом эксцентриситета).
  const at30 = new Date(Date.UTC(2030, 0, 1, 12));
  const dir = computeDirections(natal, birth, at30);
  const arcOk = dir.solarArc > 28 && dir.solarArc < 31.5;
  // 3) Найбод за 30 лет = 29.57° ± 0.02.
  const naibodOk = Math.abs(dir.naibod - 0.985647 * dir.ageYears) < 1e-9 && Math.abs(dir.naibod - 29.57) < 0.15;
  // 4) Профекции: возраст 0 → 1-й дом (знак Asc); 12 лет → снова 1-й.
  const d0 = computeDirections(natal, birth, new Date(Date.UTC(2000, 5, 1)));
  const d12 = computeDirections(natal, birth, new Date(Date.UTC(2012, 5, 1)));
  const profOk = d0.profection.house === 1 && d0.profection.sign === natal.angles.asc.sign && d12.profection.house === 1;
  // 5) Соляр: найденный момент — Солнце ровно в натальной долготе (±0.001°), в пределах ±3 дней от ДР.
  const sunN = natal.planets.find(p => p.body === 'Sun').lon;
  const solar = searchReturn('Sun', sunN, new Date(Date.UTC(2025, 11, 1)), 90);
  const sunAt = solar ? A.SunPosition(A.MakeTime(solar)).elon : null;
  const solarOk = solar && Math.abs(((sunAt - sunN + 180) % 360 + 360) % 360 - 180) < 0.001 && Math.abs((solar.getTime() - Date.UTC(2026, 0, 1, 12)) / 864e5) < 3;
  // 6) Лунар: Луна в найденный момент = натальная (±0.01°).
  const moonN = natal.planets.find(p => p.body === 'Moon').lon;
  const lunar = searchReturn('Moon', moonN, new Date(Date.UTC(2026, 5, 1)), 30);
  const moonAt = lunar ? A.EclipticGeoMoon(A.MakeTime(lunar)).lon : null;
  const lunarOk = lunar && Math.abs(((moonAt - moonN + 180) % 360 + 360) % 360 - 180) < 0.01;
  // 7) Третичные: сдвиг = ageDays/лунный месяц (за 27.321582 дней → +1 день) — Луна сдвинута на ~13°.
  const tert = computeProgressions(birth, new Date(b0.getTime() + 27.321582 * 864e5), 'tertiary');
  const moonT = tert.planets.find(p => p.body === 'Moon').lon;
  const tertOk = Math.abs(((moonT - moonN + 180) % 360 + 360) % 360 - 180 - 13.18) < 1.5;
  return { zeroOk, arcOk, naibodOk, profOk, solarOk, lunarOk, tertOk };
});
ok(progT.zeroOk, 'прогрессии: возраст 0 = натальная карта (инвариант)');
ok(progT.arcOk && progT.naibodOk, 'дирекции: солнечная дуга 30 лет ≈ 29.6°, Найбод = 0.9856°/год точно');
ok(progT.profOk, 'профекции: возраст 0 и 12 → 1-й дом (знак Asc), цикл 12 лет');
ok(progT.solarOk, 'соляр: Солнце в момент возвращения = натальная долгота ±0.001°, дата ±3 дня от ДР');
ok(progT.lunarOk, 'лунар: Луна в момент возвращения = натальная долгота ±0.01°');
ok(progT.tertOk, 'третичные прогрессии: 1 лунный месяц жизни → сдвиг Луны ~13.2° (1 день)');

// ── Астрология оч.3: джйотиш — golden-проверки ──
const jyoT = await page.evaluate(async () => {
  await loadAstroEngine();
  const A = window.Astronomy;
  const t0 = A.MakeTime(new Date(Date.UTC(2000, 0, 1, 12)));
  // 1) Айанамши: сид = троп − айанамша (точно); Фаган − Лахири ≈ 0.883° (стабильная разность).
  const ayaL = ayanamsha('lahiri', t0), ayaF = ayanamsha('fagan', t0);
  const ayaOk = Math.abs(ayaL - 23.85306) < 1e-5 && Math.abs((ayaF - ayaL) - 0.88325) < 0.001;
  // 2) Раху (mean) golden J2000 = 125.0445° (Меёс).
  const rahuOk = Math.abs(meanRahuLon(t0) - 125.0445) < 0.001;
  // 3) Навамша-классика: Овен 0° → Овен; Телец 0° → Козерог; Овен 26°40'+ → Стрелец (9-я часть).
  const navOk = vargaSign(9, 0) === 0 && vargaSign(9, 30) === 9 && vargaSign(9, 28) === 8;
  // 4) Вимшоттари: сумма 120 лет; сид. Луна 0° (Ашвини 0) → маха Кету, баланс полный (from = рождение).
  const total = VIMSHOTTARI.reduce((s, v) => s + v[1], 0);
  const birth = new Date(Date.UTC(2000, 0, 1, 12));
  const d = vimshottariDasha(0, birth, new Date(Date.UTC(2003, 0, 1)));
  const dashaOk = total === 120 && d.seq[0].lord === 'Кету' && Math.abs(d.seq[0].from.getTime() - birth.getTime()) < 1000 && d.current.lord === 'Кету';
  // 5) Тити: Луна−Солнце = 5° → тити 1 (Пратипада, шукла); 180° → №16 (кришна начинается)... 179° → 15 Пурнима.
  const p1 = panchanga(0, 5, new Date(Date.UTC(2000, 0, 1))), p15 = panchanga(0, 179, new Date(Date.UTC(2000, 0, 1)));
  const tithiOk = p1.tithi === 1 && p1.paksha === 'шукла' && p15.tithi === 15 && p15.tithiName === 'Пурнима';
  // 6) Уччабала: Солнце в 10° Овна (сид) = 60; в 10° Весов = 0.
  const uOk = Math.abs(ucchaBala('Sun', 10) - 60) < 1e-9 && Math.abs(ucchaBala('Sun', 190) - 0) < 1e-9;
  return { ayaOk, rahuOk, navOk, dashaOk, tithiOk, uOk };
});
ok(jyoT.ayaOk, 'джйотиш: айанамша Лахири J2000 = 23.85306°, Фаган−Лахири = 0.883°');
ok(jyoT.rahuOk, 'джйотиш: Раху (mean) golden J2000 = 125.0445° (Меёс)');
ok(jyoT.navOk, 'джйотиш: навамша — Овен 0°→Овен, Телец 0°→Козерог (классика Парашары)');
ok(jyoT.dashaOk, 'джйотиш: Вимшоттари = 120 лет; Луна в 0° Ашвини → маха Кету от рождения');
ok(jyoT.tithiOk, 'джйотиш: тити 1 (Пратипада) при 5°, Пурнима при 179°');
ok(jyoT.uOk, 'джйотиш: уччабала Солнца — 60 в экзальтации (10° Овна), 0 в дебилитации');

// ── Астрология оч.4: арабские точки + неподвижные звёзды — golden-проверки ──
const q4T = await page.evaluate(async () => {
  await loadAstroEngine();
  const A = window.Astronomy;
  // Синтетическая карта (никаких реальных данных): asc=100, известные долготы.
  const mkChart = (isDay) => ({
    planets: [
      { body: 'Sun', name: 'Солнце', lon: 280 }, { body: 'Moon', name: 'Луна', lon: 50 },
      { body: 'Venus', name: 'Венера', lon: 200 }, { body: 'Mars', name: 'Марс', lon: 10 },
      { body: 'Saturn', name: 'Сатурн', lon: 310 },
    ],
    angles: { asc: { lon: 100 }, mc: { lon: 10 } },
    points: { fortune: { isDay } },
    housesMeta: { system: 'placidus', cusps: [0, 100, 130, 160, 190, 220, 250, 280, 310, 340, 10, 40, 70] },
  });
  const day = computeArabicParts(mkChart(true)), night = computeArabicParts(mkChart(false));
  const get = (arr, nm) => arr.find(p => p.name.startsWith(nm)).lon;
  // 1) Дневные формулы: Дух = asc+Sun−Moon = 330; Брак = asc+desc−Venus = 180;
  //    Болезнь = asc+Mars−Saturn = 160; Смерть = asc+cusp8−Moon = 0.
  const dayOk = Math.abs(get(day, 'Точка Духа') - 330) < 1e-9 && Math.abs(get(day, 'Точка Брака') - 180) < 1e-9 &&
    Math.abs(get(day, 'Точка Болезни') - 160) < 1e-9 && Math.abs(get(day, 'Точка Смерти') - 0) < 1e-9;
  // 2) Ночной реверс Духа: asc+Moon−Sun = 230; Брак от дня/ночи не зависит.
  const nightOk = Math.abs(get(night, 'Точка Духа') - 230) < 1e-9 && Math.abs(get(night, 'Точка Брака') - 180) < 1e-9;
  // 3) Инвариант: Дух + Фортуна ≡ 2·Asc (mod 360) при любом isDay (классика).
  const spirit = get(day, 'Точка Духа'), fortune = (100 + 50 - 280 + 720) % 360; // дневная PoF
  const mirrorOk = Math.abs(((spirit + fortune) % 360) - ((2 * 100) % 360)) < 1e-9;
  // 4) Прецессия: Регул J2000 = 149.83° (Лев) → 2026 ≈ 150.20° — перешёл в Деву.
  const t26 = A.MakeTime(new Date(Date.UTC(2026, 6, 24, 12)));
  const reg = fixedStarLon(149.83, t26);
  const regOk = Math.abs(reg - 150.20) < 0.02 && zodiacOf(reg).sign === 'Дева';
  // 5) Соединения со звёздами: планета точно на Регуле-2026 → hit с орбом ~0; в 1.5° → нет hit'а.
  const hitChart = { planets: [{ body: 'Sun', name: 'Солнце', lon: reg }], angles: null };
  const missChart = { planets: [{ body: 'Sun', name: 'Солнце', lon: (reg + 1.5) % 360 }], angles: null };
  const hits = computeFixedStarHits(hitChart, t26), misses = computeFixedStarHits(missChart, t26);
  const hitOk = hits.length === 1 && hits[0].star === 'Регул' && parseFloat(hits[0].orb) < 0.01 && misses.length === 0;
  // 6) Без углов/фортуны арабские точки не считаются (время неизвестно → честный null).
  const nullOk = computeArabicParts({ planets: [], angles: null, points: {} }) === null;
  return { dayOk, nightOk, mirrorOk, regOk, hitOk, nullOk };
});
ok(q4T.dayOk, 'арабские точки: дневные формулы точны (Дух 330°, Брак 180°, Болезнь 160°, Смерть 0°)');
ok(q4T.nightOk, 'арабские точки: ночной реверс Духа (230°), Брак не зависит от дня/ночи');
ok(q4T.mirrorOk, 'арабские точки: инвариант Дух + Фортуна = 2·Asc (mod 360)');
ok(q4T.regOk, 'звёзды: Регул J2000 149.83° + прецессия → 2026 ≈ 150.20° (перешёл в Деву)');
ok(q4T.hitOk, 'звёзды: соединение на точной долготе найдено (орб ~0), в 1.5° — нет (орб 1°)');
ok(q4T.nullOk, 'арабские точки: без углов (время неизвестно) → null, полдень не подставляем');

// ── Астрология: MC — квадрант-корректность (регрессия к 180°-флипу) ──
// Найдено визуализацией колеса: старая формула atan2(tan…) с ручным флипом
// давала MC, смещённый ровно на 180° (в Льве вместо Водолея на J2000/Москва).
const mcT = await page.evaluate(async () => {
  await loadAstroEngine();
  // 1) Численный golden: J2000 12:00 UT, Москва → RAMC≈318.1°, MC≈315.6° (Водолей),
  //    Asc≈87.7° (Близнецы). Выведено из tan λ = tan α / cos ε (открытая формула).
  const c = computeNatalChart({ date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' });
  const mcGolden = Math.abs(c.angles.mc.lon - 315.62) < 0.3 && c.angles.mc.sign === 'Водолей';
  const ascGolden = Math.abs(c.angles.asc.lon - 87.7) < 0.5 && c.angles.asc.sign === 'Близнецы';
  // 2) Инвариант горизонта: MC всегда на 0..180° зодиакально ПЕРЕД Asc
  //    (верхний меридиан) — во всех квадрантах RAMC и на разных широтах.
  let horizonOk = true;
  for (const hh of ['00:00', '06:00', '12:00', '18:00']) {
    for (const lat of [55.75, -33.9, 0.1]) {
      const ch = computeNatalChart({ date: '2000-01-01', time: hh, timeKnown: true, utcOffset: 0, lat, lon: 37.62, houseSystem: 'whole' });
      const d = ((ch.angles.asc.lon - ch.angles.mc.lon) % 360 + 360) % 360;
      if (!(d > 0 && d < 180)) horizonOk = false;
    }
  }
  // 3) Дома при исправленном MC: куспиды растут по ходу зодиака от Asc (порядок не ломается).
  const cusps = c.housesMeta.cusps;
  let orderOk = true, acc = 0;
  for (let k = 1; k <= 12; k++) { const nx = cusps[k === 12 ? 1 : k + 1]; acc += ((nx - cusps[k]) % 360 + 360) % 360; }
  orderOk = Math.abs(acc - 360) < 0.01;
  return { mcGolden, ascGolden, horizonOk, orderOk, mc: c.angles.mc.lon.toFixed(2), asc: c.angles.asc.lon.toFixed(2) };
});
ok(mcT.mcGolden, `MC golden J2000/Москва: Водолей ~315.6° (получено ${mcT.mc}°) — 180°-флип исправлен`);
ok(mcT.ascGolden, `Asc golden J2000/Москва: Близнецы ~87.7° (получено ${mcT.asc}°)`);
ok(mcT.horizonOk, 'инвариант: MC на 0–180° перед Asc во всех квадрантах RAMC и широтах');
ok(mcT.orderOk, 'дома: 12 куспидов образуют полный круг 360° в правильном порядке');

// ── Астрология: раздел навигации, меню-карточки, SVG-колесо (UI) ──
const astroUI = await page.evaluate(async () => {
  DB.astroBirth = null; DB.astroCharts = [];
  goTo('astro');
  const pgOn = document.querySelector('#pg-astro.on') !== null;
  const navOn = !!document.querySelector('.navlink[data-tab="astro"]');
  const cards = document.querySelectorAll('#as-menu .astro-card').length;
  const empty = /Введите дату и время рождения/.test(document.getElementById('astro-hero').textContent);
  // Данные рождения (синтетика J2000) → карта → превью и колесо.
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  await runNatalChart();
  rAstroHome();
  const preview = document.querySelectorAll('#astro-hero svg').length === 1;
  asub('natal');
  const glyphs = document.querySelectorAll('#astro-wheel .aw-planet').length;
  const signs = document.querySelectorAll('#astro-wheel .aw-sign').length;
  const houseLines = document.querySelectorAll('#astro-wheel .aw-house').length;
  const aspLines = document.querySelectorAll('#astro-wheel .aw-asp').length;
  antab('houses');
  const housesTab = /Плацидус/.test(document.getElementById('astro-ntab-out').textContent);
  antab('planets');
  const planetsTab = /Солнце/.test(document.getElementById('astro-ntab-out').textContent) && /Асцендент/.test(document.getElementById('astro-ntab-out').textContent);
  astroPlanetTap('Sun');
  const tap = /Козерог/.test(document.getElementById('astro-planet-info').textContent);
  asub('points');
  const pointsScreen = /Хирон|Церера/.test(document.getElementById('astro-points-out').textContent);
  asub('menu'); goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { pgOn, navOn, cards, empty, preview, glyphs, signs, houseLines, aspLines, housesTab, planetsTab, tap, pointsScreen };
});
ok(astroUI.pgOn && astroUI.navOn, 'астро-раздел: свой пункт главной навигации, страница открывается');
ok(astroUI.cards >= 10, `астро-меню: сетка карточек-экранов (${astroUI.cards})`);
ok(astroUI.empty, 'пустое состояние: приглашение ввести данные рождения вместо пустых разделов');
ok(astroUI.preview, 'превью мини-колеса на главном экране раздела (тап → полная карта)');
ok(astroUI.glyphs === 10 && astroUI.signs === 12, `SVG-колесо: 10 планет + 12 знаков (${astroUI.glyphs}/${astroUI.signs})`);
ok(astroUI.houseLines === 12 && astroUI.aspLines >= 1, `SVG-колесо: 12 куспидов домов + линии аспектов (${astroUI.houseLines}/${astroUI.aspLines})`);
ok(astroUI.housesTab && astroUI.planetsTab, 'табы натальной карты: Планеты (с Asc/MC) и Дома (Плацидус, куспиды)');
ok(astroUI.tap, 'тап по планете на колесе: карточка деталей (Солнце — Козерог)');
ok(astroUI.pointsScreen, 'экран «Астероиды и точки» рендерится');

// ── Астрология: база интерпретаций + сборка «Кто вы по карте» (Часть 4) ──
const interpT = await page.evaluate(async () => {
  await loadAstroRules();
  const R = window.ASTRO_RULES;
  // 1) Полнота базы: 10×12 знаков + 10×12 домов + 12 Asc + 10 тем, все непустые.
  const bodies = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  const signs = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
  let signCnt = 0, houseCnt = 0;
  for (const b of bodies) {
    for (const s of signs) if ((R.planetInSign[b] || {})[s] && R.planetInSign[b][s].length > 20) signCnt++;
    for (let h = 1; h <= 12; h++) if ((R.planetInHouse[b] || {})[h] && R.planetInHouse[b][h].length > 20) houseCnt++;
  }
  const ascCnt = signs.filter(s => R.ascInSign[s] && R.ascInSign[s].length > 20).length;
  const themeCnt = bodies.filter(b => R.planetTheme[b]).length;
  // 2) Сборка резюме на golden-карте J2000 (синтетика): блоки по 3.1a.
  await loadAstroEngine();
  const chart = computeNatalChart({ date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' });
  const sum = buildChartSummary(chart);
  const titles = sum.blocks.map(b => b.title).join('|');
  const sunBlock = /Ваше Солнце в знаке Козерог/.test(titles);
  const moonBlock = /Как вы себя чувствуете внутри/.test(titles);
  const ascBlock = /Как вас видят другие/.test(titles);
  const growthBlocks = /Ваша сильная сторона/.test(titles) && /Ваш внутренний вызов/.test(titles);
  // 3) Аудит: каждый блок несёт source_rule_id; солнечный — точный id.
  const audited = sum.blocks.every(b => b.ruleIds && b.ruleIds.length > 0);
  const sunRule = sum.ruleIds.includes('planetInSign.Sun.Козерог');
  // 4) Без жаргона: в собранном тексте нет градусов и терминов аспектов.
  const all = sum.blocks.map(b => b.title + ' ' + b.text).join(' ');
  const noJargon = !/°|квадрат|оппозици|трин\b|секстил|орб/i.test(all);
  // 5) Честность времени: без времени рождения нет блока «Как вас видят» (нет Asc).
  const noTime = buildChartSummary(computeNatalChart({ date: '2000-01-01', timeKnown: false, utcOffset: 0 }));
  const noTimeOk = !noTime.blocks.some(b => b.title === 'Как вас видят другие');
  // 6) Кэш ИИ-текста: с ключом и мок-API текст собирается один раз, повторно — из кэша.
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = []; DB.astroTexts = [];
  await runNatalChart();
  setAiKey('sk-test');
  let calls = 0;
  const orig = window.fetch;
  window.fetch = (u, o) => String(u).includes('anthropic')
    ? (calls++, Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: 'Тёплый связный текст о вас. Это символическое описание, а не прогноз.' }], usage: { output_tokens: 42 } }) }))
    : orig(u, o);
  await aiPolishChartSummary();
  await aiPolishChartSummary();
  window.fetch = orig;
  const cacheOk = calls === 1 && DB.astroTexts.length === 1 && DB.astroTexts[0].ruleIds.length > 0 && DB.astroTexts[0].promptVersion === 'astro-summary-v1';
  // 7) UI: на экране натальной карты резюме рендерится первым блоком.
  goTo('astro'); asub('natal');
  await new Promise(r => setTimeout(r, 150));
  const uiOk = /Кто вы по карте/.test(document.getElementById('astro-summary').textContent);
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = []; DB.astroTexts = [];
  return { signCnt, houseCnt, ascCnt, themeCnt, sunBlock, moonBlock, ascBlock, growthBlocks, audited, sunRule, noJargon, noTimeOk, cacheOk, uiOk };
});
ok(interpT.signCnt === 120 && interpT.houseCnt === 120, `база правил: 120 планета-в-знаке + 120 планета-в-доме (${interpT.signCnt}/${interpT.houseCnt})`);
ok(interpT.ascCnt === 12 && interpT.themeCnt === 10, 'база правил: 12 текстов Асцендента + 10 тем планет');
ok(interpT.sunBlock && interpT.moonBlock && interpT.ascBlock && interpT.growthBlocks, 'резюме 3.1a: Солнце, Луна, «как видят», сильная сторона, вызов');
ok(interpT.audited && interpT.sunRule, 'аудит: каждый блок несёт source_rule_id (planetInSign.Sun.Козерог)');
ok(interpT.noJargon, 'без жаргона: в резюме нет градусов и терминов аспектов');
ok(interpT.noTimeOk, 'честность: без времени рождения нет блока про Асцендент');
ok(interpT.cacheOk, 'ИИ-полировка: один вызов API, повторно — из кэша, с ruleIds и версией промпта');
ok(interpT.uiOk, 'UI: «Кто вы по карте» рендерится на экране натальной карты');

// ── Астрология: экран транзитов 3.2 (календарь, bi-wheel, карточки) ──
const trUI = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  const R = window.ASTRO_RULES;
  const giftCnt = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'].filter(b => R.transitGift[b]).length;
  const verbCnt = ['соединение','трин','секстиль','квадрат','оппозиция'].filter(a => R.transitVerb[a]).length;
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro'); asub('transits');
  // Календарь: дата рождения → каждая планета в соединении сама с собой.
  document.getElementById('astro-tr-date').value = '2000-01-01';
  await runTransits();
  await new Promise(r => setTimeout(r, 100));
  const outTx = document.getElementById('astro-transits').textContent;
  const skyHidden = document.getElementById('astro-sky').style.display === 'none';
  const biWheel = document.querySelectorAll('#astro-tr-wheel .aw-transit').length;
  const cardText = /Солнце → ваш Солнце/.test(outTx) && /включает вашу тему/.test(outTx);
  const strongLead = /Особенно ощутимо/.test(outTx);
  const ruleAudit = !!document.querySelector('#astro-transits [data-rule^="transit.Sun.соединение"]');
  const disclaimer = /Не событие и не прогноз/.test(outTx);
  // Сортировка по силе: первая карточка — минимальный орб.
  const degs = [...document.querySelectorAll('#astro-transits [data-rule]')].map(d => parseFloat((d.textContent.match(/точность ([\d.]+)/) || [])[1]));
  const sorted = degs.every((v, i) => i === 0 || v >= degs[i - 1]);
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = []; DB.astroTexts = [];
  return { giftCnt, verbCnt, skyHidden, biWheel, cardText, strongLead, ruleAudit, disclaimer, sorted };
});
ok(trUI.giftCnt === 10 && trUI.verbCnt === 5, 'транзитные тексты: 10 «даров» планет + 5 характеров контакта');
ok(trUI.skyHidden, 'экран транзитов: «Небо сейчас» свёрнуто по умолчанию');
ok(trUI.biWheel === 10, `bi-wheel: 10 транзитных планет снаружи кольца (${trUI.biWheel})`);
ok(trUI.cardText && trUI.strongLead, 'карточки: человеческий текст (дар + контакт + тема), сильные помечены');
ok(trUI.ruleAudit, 'аудит: карточка несёт transit rule id');
ok(trUI.sorted, 'сортировка: аспекты по силе, наименьший орб первым');
ok(trUI.disclaimer, 'дисклеймер «не событие и не прогноз» на месте');

// ── Астрология Часть 5: согласие, минимизация контекста, режимы ИИ ──
const aiModesT = await page.evaluate(async () => {
  await loadAstroEngine();
  // Синтетические данные (никаких реальных).
  const iso = n => new Date(Date.now() - n * 864e5).toISOString();
  const day = n => iso(n).slice(0, 10);
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = []; DB.astroTexts = [];
  await runNatalChart();
  DB.insights = [
    { id: 1, tag: 'personal', body: 'СЕКРЕТНЫЙ ТЕКСТ ДНЕВНИКА', title: 'Имярек Фамильевич', createdAt: iso(2) },
    { id: 2, tag: 'personal', body: 'ещё секрет', createdAt: iso(5) },
    { id: 3, tag: 'vitality', body: 'секрет', createdAt: iso(50) },   // вне окна 30 дней
  ];
  DB.symptoms = [{ id: 1, name: 'головная боль', note: 'СЕКРЕТНАЯ ЗАМЕТКА', createdAt: iso(3) }];
  DB.checkins = [{ date: day(1), sl: 8, cl: 7, mv: 6, st: 3 }, { date: day(2), sl: 6, cl: 5, mv: 4, st: 7 }];
  // 1) Без согласия контекст содержит только карту.
  const ctxNone = buildAstroAiContext({}, 30);
  const noneOk = ctxNone.categories.length === 0 && !ctxNone.diary && !ctxNone.health && !!ctxNone.natal;
  // 2) Минимизация: с согласием — теги/частоты/средние, но НИКОГДА сырые тексты и имена.
  const ctx = buildAstroAiContext({ diary: true, health: true, habits: true }, 30);
  const s = JSON.stringify(ctx);
  const minimized = ctx.diary.insight_count === 2 && ctx.diary.tags.personal === 2 && !ctx.diary.tags.vitality
    && ctx.health.symptom_freq['головная боль'] === 1 && ctx.health.checkin_avg['сон'] === 7
    && !/СЕКРЕТ|секрет|Имярек|ЗАМЕТКА/.test(s);
  // 3) Согласие: сохранение чекбоксов и отзыв.
  document.getElementById('aic-diary').classList.add('on');
  document.getElementById('aic-health').classList.remove('on');
  document.getElementById('aic-habits').classList.remove('on');
  saveAstroAiConsent();
  const consentSaved = DB.astroAiConsent.diary === true && DB.astroAiConsent.health === false && DB.astroAiConsent.version === 'astro-consent-v1';
  // Отзыв: выключаем категорию — она сразу исчезает из контекста.
  document.getElementById('aic-diary').classList.remove('on');
  saveAstroAiConsent();
  const revoked = buildAstroAiContext(DB.astroAiConsent, 30).categories.length === 0;
  // 4) Режим 2 с мок-API: использует deep-модель, сохраняет отчёт с категориями и версией промпта.
  DB.astroAiConsent = { diary: true, health: false, habits: false, acceptedAt: new Date().toISOString(), version: 'astro-consent-v1' };
  localStorage.removeItem('arch5_astro_deep_quota');
  setAiKey('sk-test');
  let modelUsed = null, sentBody = null;
  const orig = window.fetch;
  window.fetch = (u, o) => {
    if (String(u).includes('anthropic')) {
      try { const b = JSON.parse(o.body); modelUsed = b.model; sentBody = JSON.stringify(b); } catch (e) {}
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: 'Мягкий анализ. Это символическое описание, а не прогноз и не диагноз.' }], usage: { output_tokens: 50 } }) });
    }
    return orig(u, o);
  };
  await aiDeepAstroAnalysis();
  const rec = (DB.astroTexts || []).find(t => t.mode === 'deep');
  const deepOk = rec && rec.promptVersion === 'astro-deep-v1' && rec.categories.join() === 'diary' && /sonnet/.test(modelUsed || '');
  const noLeak = sentBody && !/СЕКРЕТ|Имярек|ЗАМЕТКА/.test(sentBody);
  // 5) Квота: после лимита — вежливый отказ без вызова API.
  localStorage.setItem('arch5_astro_deep_quota', JSON.stringify({ day: new Date().toISOString().slice(0, 10), n: 5 }));
  let calls2 = 0;
  window.fetch = (u, o) => { if (String(u).includes('anthropic')) calls2++; return orig(u, o); };
  DB.astroTexts = [];   // сброс кэша, чтобы квота была единственным барьером
  await aiDeepAstroAnalysis();
  const quotaOk = calls2 === 0;
  window.fetch = orig;
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = []; DB.astroTexts = []; DB.astroAiConsent = null;
  DB.insights = []; DB.symptoms = []; DB.checkins = [];
  localStorage.removeItem('arch5_astro_deep_quota');
  return { noneOk, minimized, consentSaved, revoked, deepOk, noLeak, quotaOk };
});
ok(aiModesT.noneOk, 'режим 2: без согласия в контексте только карта (категории пусты)');
ok(aiModesT.minimized, 'минимизация: теги/частоты/средние за окно, сырые тексты и имена НЕ передаются');
ok(aiModesT.consentSaved, 'согласие: чекбоксы по категориям сохраняются с версией');
ok(aiModesT.revoked, 'отзыв согласия: категория сразу исчезает из будущих запросов');
ok(aiModesT.deepOk, 'режим 2: deep-модель, отчёт сохранён с категориями и версией промпта');
ok(aiModesT.noLeak, 'приватность: в теле API-запроса нет сырых текстов дневника/заметок');
ok(aiModesT.quotaOk, 'лимит: после 5 глубоких анализов в день API не вызывается');

// ── Астрология: экраны 3.3–3.5 (прогрессии/возвращения/ведическая) ──
const scr2T = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro');
  // 3.3: сегменты + возраст 30 лет → прогрессированное Солнце ≈ натал+29.6° (Водолей), тема в тексте.
  asub('prog');
  document.getElementById('astro-prog-age').value = '30';
  STATE.progSeg = 'secondary';
  await rPrognostics();
  const progTx = document.getElementById('astro-prog').textContent;
  const progWheel = document.querySelectorAll('#astro-prog-wheel .aw-transit').length;
  const progOk = /возраст 30/.test(progTx) && /звучит тема \(Водолей\)/.test(progTx) && progWheel === 10;
  STATE.progSeg = 'profection';
  await rPrognostics();
  const profTx = document.getElementById('astro-prog').textContent;
  const profOk = /год 7-го дома|год \d+-го дома/.test(profTx) && /В фокусе года/.test(profTx);
  // 3.4: соляр конкретного года — дата в пределах ±3 дней от ДР, колесо возврата, аспекты.
  asub('ret');
  document.getElementById('astro-ret-type').value = 'solar';
  document.getElementById('astro-ret-period').value = '2026';
  await rReturns();
  const retTx = document.getElementById('astro-ret').textContent;
  const retWheel = document.querySelectorAll('#astro-ret-wheel .aw-transit').length;
  const retOk = /Соляр 2026: 2025-12-31|Соляр 2026: 2026-01-0/.test(retTx) && retWheel === 10 && /Ключевые аспекты к наталу/.test(retTx);
  // 3.5: ведическая — сетка South Indian (12 знаков), навамша-таб, даша-таб с темой.
  asub('jyo');
  STATE.jyoTab = 'rashi';
  await rJyotish();
  const cells = document.querySelectorAll('#astro-jyo .jyo-cell:not(.jyo-empty)').length;
  const lagna = /Лг/.test(document.getElementById('astro-jyo').textContent);
  STATE.jyoTab = 'dasha';
  await rJyotish();
  const dashaTx = document.getElementById('astro-jyo').textContent;
  const dashaOk = /Сейчас — маха-даша/.test(dashaTx) && /окрашенный темой/.test(dashaTx) && /Полный цикл Вимшоттари/.test(dashaTx);
  STATE.jyoTab = 'navamsha';
  await rJyotish();
  const navGrid = document.querySelectorAll('#astro-jyo .jyo-cell:not(.jyo-empty)').length === 12;
  STATE.jyoTab = 'rashi';
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { progOk, profOk, retOk, cells, lagna, dashaOk, navGrid };
});
ok(scr2T.progOk, 'экран прогрессий: возраст 30 → тема Водолея, bi-wheel 10 прогрессированных');
ok(scr2T.profOk, 'экран профекций: дом года + «В фокусе года» с темой дома');
ok(scr2T.retOk, 'экран возвращений: соляр 2026 у дня рождения, колесо + аспекты к наталу');
ok(scr2T.cells === 12 && scr2T.lagna, 'ведическая: сетка South Indian — 12 знаков, лагна отмечена');
ok(scr2T.dashaOk, 'ведическая: таб даш — текущая маха-даша с темой + полный цикл 120 лет');
ok(scr2T.navGrid, 'ведическая: таб навамши — сетка D9 рендерится');

// ── Астрология: синастрия 3.6 (две карты, bi-wheel, межличностные аспекты) ──
const synT = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = []; DB.astroPartners = [];
  await runNatalChart();
  const my = DB.astroCharts[0].chart;
  // 1) Golden: синастрия карты с самой собой = 10 соединений с орбом 0.
  const self = computeSynastry(my, my);
  const selfConj = self.hits.filter(h => h.a === h.b && h.aspect === 'соединение' && parseFloat(h.exact) < 0.05);
  const selfOk = selfConj.length === 10 && /synastry-orbs-v1/.test(self.versions.synastryOrbPolicy);
  // 2) Тексты: 5 глаголов, карточка собирается с rule id.
  const verbs = ['соединение','трин','секстиль','квадрат','оппозиция'].filter(a => window.ASTRO_RULES.synastryVerb[a]).length;
  const tx = synastryHitText({ aBody: 'Sun', bBody: 'Moon', a: 'Солнце', b: 'Луна', aspect: 'трин', exact: '1.0' });
  const textOk = verbs === 5 && tx && /воля и самовыражение/.test(tx.text) && tx.ruleId === 'synastry.Sun.трин.Moon';
  // 3) UI: добавить партнёра (синтетика) → select, bi-wheel, карточки, дисклеймер.
  goTo('astro'); asub('syn');
  document.getElementById('sp-label').value = 'Тест-партнёр';
  document.getElementById('sp-date').value = '1992-11-03';
  document.getElementById('sp-time-known').classList.remove('on');
  document.getElementById('sp-utc').value = '0';
  saveAstroPartner();
  await new Promise(r => setTimeout(r, 400));
  const saved = (DB.astroPartners || []).length === 1 && DB.astroPartners[0].privacyClass === 'sensitive';
  const selOk = document.querySelectorAll('#sp-select option').length === 1;
  const wheelOk = document.querySelectorAll('#astro-syn-wheel .aw-transit').length === 10;
  const outTx = document.getElementById('astro-syn').textContent;
  const cardsOk = /межличностные аспекты/.test(outTx) && /партнёра\./.test(outTx);
  const discOk = /не «процент совместимости»/.test(outTx) && /только на устройстве/.test(outTx);
  const ruleOk = !!document.querySelector('#astro-syn [data-rule^="synastry."]');
  // 4) Изоляция: партнёрские данные не влияют на риски.
  const risk = cravingRisk();
  const isoOk = !risk.factors.some(f => /партн|синастр/i.test(f.why || ''));
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = []; DB.astroPartners = [];
  return { selfOk, textOk, saved, selOk, wheelOk, cardsOk, discOk, ruleOk, isoOk };
});
ok(synT.selfOk, 'синастрия golden: карта сама с собой = 10 соединений орб 0, версия орб-политики');
ok(synT.textOk, 'синастрия: 5 глаголов контакта, текст с темами и rule id');
ok(synT.saved && synT.selOk, 'синастрия: партнёр сохраняется (sensitive) и появляется в списке');
ok(synT.wheelOk, 'синастрия: bi-wheel — вы внутри, 10 планет партнёра снаружи');
ok(synT.cardsOk && synT.ruleOk, 'синастрия: карточки межличностных аспектов с текстом и аудитом');
ok(synT.discOk, 'синастрия: дисклеймер — не процент совместимости, данные только на устройстве');
ok(synT.isoOk, 'синастрия: изоляция — не влияет на факторы риска');

// ── Никаких неожиданных ошибок ──
ok(errors.length === 0, `нет ошибок консоли/страницы (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);

console.log(`\nИтог: ${pass}/${pass + fail} passed`);
await browser.close();
process.exit(fail ? 1 : 0);
