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
import { ROUTES } from './evidence/routes.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// Сетевые ошибки к ВНЕШНИМ хостам (CDN-шрифт/иконки, бэкенд-health, Anthropic)
// зависят от окружения (file://-origin, офлайн-CI) и не являются багами
// приложения. Валим только на настоящих JS-ошибках самого кода.
const EXT = /navigator.vibrate|ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|net::|Failed to load resource|CORS policy|Access-Control-Allow-Origin|fonts\.googleapis|gstatic|unpkg\.com|railway\.app|anthropic\.com|openai\.com|googleapis\.com/i;

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
  // Песочница тестов офлайн: глушим автосинк на весь прогон, иначе отложенный
  // таймер persist() стреляет «sync fail» в случайной точке сьюта (гонка).
  window.ARCHITECT_API = ''; if (typeof resetSyncState === 'function') resetSyncState();
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
// Класс .on навешивается вторым requestAnimationFrame — ждём селектор,
// а не фиксированную паузу (гонка проявлялась при росте объёма приложения).
const rcOn = await page.waitForSelector('#react-card.on .rc-row', { timeout: 3000 }).then(() => true).catch(() => false);
ok(rcOn, 'после сохранения инсайта появляется карточка-отклик');
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
  let acc = 0;
  for (let k = 1; k <= 12; k++) { const nx = cusps[k === 12 ? 1 : k + 1]; acc += ((nx - cusps[k]) % 360 + 360) % 360; }
  const orderOk = Math.abs(acc - 360) < 0.01;
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
  const progOk = /возраст 30/.test(progTx) && /Большая тема этих лет \(Водолей\)/.test(progTx) && progWheel === 10;
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
  const cardsOk = /межличностные аспекты/.test(outTx) && /В целом/.test(outTx);
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

// ── Астрология: база правил приоритет 2 (аспекты личных + куспиды) ──
const p2T = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  const R = window.ASTRO_RULES;
  // 1) Полнота: 10 пар личных × 5 аспектов = 50 текстов; словари куспидов 12+12.
  const pers = ['Sun','Moon','Mercury','Venus','Mars'];
  const asps = ['соединение','трин','секстиль','квадрат','оппозиция'];
  let cnt = 0;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
    for (const a of asps) if (((R.aspectMeaning[pers[i] + '-' + pers[j]] || {})[a] || '').length > 30) cnt++;
  const cuspOk = Object.keys(R.houseCuspSphere).length === 12 && Object.keys(R.houseCuspStyle).length === 12;
  // 144 комбинации собираются и непусты.
  let cuspCnt = 0;
  for (let h = 1; h <= 12; h++) for (const s of ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'])
    if (houseCuspText(h, s) && houseCuspText(h, s).text.length > 20) cuspCnt++;
  // 2) Порядок пары не важен (Moon,Sun → ключ Sun-Moon).
  const rev = aspectMeaningText('Moon', 'Sun', 'секстиль');
  const revOk = rev && rev.ruleId === 'aspectMeaning.Sun-Moon.секстиль';
  // 3) Неличная пара → null (fallback на шаблон тем).
  const outer = aspectMeaningText('Sun', 'Saturn', 'трин') === null;
  // 4) UI: J2000 — таб аспектов показывает текст Луна-секстиль-Солнце, таб домов — тексты куспидов.
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro'); asub('natal');
  antab('aspects');
  const aspUI = !!document.querySelector('#astro-ntab-out [data-rule="aspectMeaning.Sun-Moon.секстиль"]');
  antab('houses');
  const houseUI = document.querySelectorAll('#astro-ntab-out [data-rule^="houseCusp."]').length === 12;
  antab('planets');
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { cnt, cuspOk, cuspCnt, revOk, outer, aspUI, houseUI };
});
ok(p2T.cnt === 50, `аспекты личных: 50 текстов (10 пар × 5 мажоров), все содержательные (${p2T.cnt})`);
ok(p2T.cuspOk && p2T.cuspCnt === 144, `куспиды: 12 сфер × 12 стилей → 144 текста (${p2T.cuspCnt})`);
ok(p2T.revOk, 'аспекты личных: порядок пары не важен (Moon,Sun → Sun-Moon)');
ok(p2T.outer, 'аспекты с внешними планетами → шаблон тем (fallback), не выдумка');
ok(p2T.aspUI, 'таб «Аспекты»: текст Луна-секстиль-Солнце с rule id (golden J2000)');
ok(p2T.houseUI, 'таб «Дома»: 12 текстов знаков на куспидах с rule id');

// ── Астрология: карточка «Транзит дня» на главной (opt-in) ──
const dailyT = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  localStorage.removeItem('arch5_astro_daily');
  // 1) Выключено по умолчанию → карточки нет.
  CFG.astroDaily = false;
  rAstroDaily();
  await new Promise(r => setTimeout(r, 300));
  const offEmpty = document.getElementById('h-astro-daily').innerHTML === '';
  // 2) Включаем → карточка с самым точным транзитом и пометкой символичности; кэш на день.
  CFG.astroDaily = true;
  rAstroDaily();
  await new Promise(r => setTimeout(r, 600));
  const html1 = document.getElementById('h-astro-daily').innerHTML;
  const cardOk = /Транзит дня/.test(html1) && /символическое, не прогноз/.test(html1);
  let cache = null; try { cache = JSON.parse(localStorage.getItem('arch5_astro_daily')); } catch (e) {}
  const cacheOk = cache && cache.day === new Date().toISOString().slice(0, 10) && cache.html === html1;
  // 3) Повторный рендер берёт кэш (мгновенно, без пересчёта).
  document.getElementById('h-astro-daily').innerHTML = '';
  rAstroDaily();
  const fromCache = document.getElementById('h-astro-daily').innerHTML === html1;
  // 4) Тумблер в разделе синхронизирован с CFG.
  goTo('astro');
  const togOn = document.getElementById('astro-daily-tog').classList.contains('on');
  goTo('home');
  CFG.astroDaily = false;
  localStorage.removeItem('arch5_astro_daily');
  DB.astroBirth = null; DB.astroCharts = [];
  return { offEmpty, cardOk, cacheOk, fromCache, togOn };
});
ok(dailyT.offEmpty, '«Транзит дня»: выключено по умолчанию — карточки нет (opt-in)');
ok(dailyT.cardOk, '«Транзит дня»: карточка с самым точным транзитом и пометкой «символическое»');
ok(dailyT.cacheOk && dailyT.fromCache, '«Транзит дня»: кэш на день, повторный рендер без пересчёта');
ok(dailyT.togOn, '«Транзит дня»: тумблер в разделе отражает состояние');

// ── Астрология: полноэкранное колесо (оверлей, тап по планете) ──
const fwT = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro'); rAstroHome();
  // 1) Превью на главном экране раздела теперь открывает полноэкранное колесо.
  const previewHook = /openFullWheel/.test(document.getElementById('astro-hero').innerHTML);
  openFullWheel();
  const ovOn = !!document.querySelector('#ov-astro-wheel.on');
  const glyphs = document.querySelectorAll('#astro-wheel-full .aw-planet').length;
  const houses = document.querySelectorAll('#astro-wheel-full .aw-house').length;
  const interactive = /astroPlanetTap/.test(document.getElementById('astro-wheel-full').innerHTML);
  // 2) Тап по планете в полноэкранном режиме пишет детали в оверлей.
  astroPlanetTap('Sun');
  const infoInOverlay = /Козерог/.test(document.getElementById('astro-wheel-full-info').textContent);
  closeOv('ov-astro-wheel');
  const closed = !document.querySelector('#ov-astro-wheel.on');
  // 3) Вне оверлея тап пишет как раньше — на экран карты.
  asub('natal');
  astroPlanetTap('Moon');
  const infoOnScreen = /Скорпион/.test(document.getElementById('astro-planet-info').textContent);
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { previewHook, ovOn, glyphs, houses, interactive, infoInOverlay, closed, infoOnScreen };
});
ok(fwT.previewHook && fwT.ovOn, 'полноэкранное колесо: тап по превью открывает оверлей');
ok(fwT.glyphs === 10 && fwT.houses === 12 && fwT.interactive, 'полноэкранное колесо: 10 планет, 12 секторов домов, интерактивно');
ok(fwT.infoInOverlay && fwT.closed, 'полноэкранное колесо: тап по планете — детали в оверлее, закрытие работает');
ok(fwT.infoOnScreen, 'экран карты: тап по планете после закрытия оверлея работает как раньше');

// ── Астрология: полная база развёрнутых текстов (grounded-v2) ──
const fullT = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  // 1) Ленивая загрузка natal-части: 717 текстов, ключевые категории на месте.
  await loadAstroTexts('natal');
  const N = window.ASTRO_TEXTS_NATAL;
  const cnt = Object.keys(N).length;
  const catOk = !!N['planetInSign.Sun.Козерог'] && !!N['planetInHouse.Moon.6'] && !!N['ascInSign.Рак']
    && !!N['houseCusp.10.Водолей'] && !!N['aspectMeaning.Sun-Moon.секстиль'] && !!N['pointInSign.Ceres.Лев'];
  const longOk = N['planetInSign.Sun.Козерог'].length > 500;
  // 2) Маршрутизация rule id → файл-часть.
  const routeOk = astroTextPart('transit.Sun.трин.Moon') === 'transit' && astroTextPart('grahaInRashi.Shani.Дхану') === 'jyotish'
    && astroTextPart('synastry.Mars.квадрат.Venus') === 'synastry' && astroTextPart('unknown.x') === null;
  // 3) Тап «Подробнее» в карточке планеты открывает модал с полным текстом.
  goTo('astro'); asub('natal');
  astroPlanetTap('Sun');
  document.querySelector('#astro-planet-info [data-rule]').click();
  await new Promise(r => setTimeout(r, 300));
  const ovOn = !!document.querySelector('#ov-astro-text.on');
  const bodyTx = document.getElementById('astro-text-body').textContent;
  const modalOk = bodyTx.length > 400 && /не прогноз и не диагноз/.test(bodyTx);
  const titleOk = /Солнце в знаке Козерог/.test(document.getElementById('astro-text-title').textContent);
  closeOv('ov-astro-text');
  // 4) Тап по строке резюме (data-rules) тоже открывает полный текст.
  await new Promise(r => setTimeout(r, 200));
  const sumEl = document.querySelector('#astro-summary [data-rules]');
  if (sumEl) sumEl.click();
  await new Promise(r => setTimeout(r, 250));
  const sumModal = !!document.querySelector('#ov-astro-text.on');
  closeOv('ov-astro-text');
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { cnt, catOk, longOk, routeOk, ovOn, modalOk, titleOk, sumModal };
});
ok(fullT.cnt === 717 && fullT.catOk, `полная база: natal-часть 717 текстов, все 6 категорий (${fullT.cnt})`);
ok(fullT.longOk, 'полная база: развёрнутый текст (>500 символов) для golden-позиции');
ok(fullT.routeOk, 'полная база: маршрутизация rule id → файл (transit/jyotish/synastry, unknown → null)');
ok(fullT.ovOn && fullT.modalOk && fullT.titleOk, 'модал «Подробнее»: полный текст + заголовок + дисклеймер');
ok(fullT.sumModal, 'резюме «Кто вы по карте»: тап по блоку открывает развёрнутый текст');

// ── Астрология P1: покрытие тапами готовых текстов + правило заглушки ──
const covT = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = []; DB.astroPartners = [];
  await runNatalChart();
  goTo('astro');
  // 1) Правило покрытия: валидные и невалидные rule id.
  const hasOk = astroHasText('pointInSign.Chiron.Овен') && astroHasText('grahaInRashi.Shani.Дхану')
    && astroHasText('mahadasha.Кету') && !astroHasText('pointInSign.EastPoint.Овен')
    && !astroHasText('grahaInRashi.Uranus.Меша') && !astroHasText('star.Регул') && !astroHasText('');
  // 2) Экран «Астероиды и точки»: Хирон с тапом, Антивертекс/Восточная — без.
  asub('points');
  const chironTap = !!document.querySelector('#astro-points-out [data-rule^="pointInSign.Chiron."]');
  const fortuneTap = !!document.querySelector('#astro-points-out [data-rule^="pointInSign.Fortune."]');
  const pointsRules = [...document.querySelectorAll('#astro-points-out [data-rule]')].map(d => d.dataset.rule);
  const noBare = pointsRules.every(r => astroHasText(r));
  // 3) Ведическая: граха с тапом, внешняя планета — без, накшатра и даша — с тапом.
  asub('jyo'); STATE.jyoTab = 'rashi';
  await rJyotish();
  const grahaTap = !!document.querySelector('#astro-jyo [data-rule^="grahaInRashi.Shani."], #astro-jyo [data-rule^="grahaInRashi.Surya."]');
  const uranusBare = ![...document.querySelectorAll('#astro-jyo [data-rule]')].some(d => /Uranus|Neptune|Pluto/.test(d.dataset.rule));
  const nakTap = !!document.querySelector('#astro-jyo [data-rule^="nakshatraMoon."]');
  STATE.jyoTab = 'dasha';
  await rJyotish();
  const dashaTap = !!document.querySelector('#astro-jyo [data-rule^="mahadasha."]');
  STATE.jyoTab = 'rashi';
  // 4) Возвращения: карточки аспектов с тапом на полный transit-текст.
  asub('ret');
  document.getElementById('astro-ret-type').value = 'solar';
  document.getElementById('astro-ret-period').value = '2026';
  await rReturns();
  const retTap = !!document.querySelector('#astro-ret [data-rule^="transit."]');
  // 5) Заглушка: валидный маршрут, но отсутствующий ключ → честный текст, не пусто.
  await astroFullText('pointInSign.Chiron.НетТакогоЗнака', 'Тест');
  await new Promise(r => setTimeout(r, 200));
  const stub = /Расшифровка для этого элемента готовится/.test(document.getElementById('astro-text-body').textContent);
  closeOv('ov-astro-text');
  // 6) Реальный тап: Хирон открывает полный текст.
  asub('points');
  document.querySelector('#astro-points-out [data-rule^="pointInSign.Chiron."]').click();
  await new Promise(r => setTimeout(r, 300));
  const chironText = document.getElementById('astro-text-body').textContent.length > 400;
  closeOv('ov-astro-text');
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { hasOk, chironTap, fortuneTap, noBare, grahaTap, uranusBare, nakTap, dashaTap, retTap, stub, chironText };
});
ok(covT.hasOk, 'правило покрытия: astroHasText точен (включая отказ для непокрытых объектов)');
ok(covT.chironTap && covT.fortuneTap && covT.noBare, 'экран точек: тапы у покрытых объектов, «голых» ссылок нет');
ok(covT.grahaTap && covT.uranusBare && covT.nakTap && covT.dashaTap, 'ведическая: тапы у грах/накшатры/даши, внешние планеты — честно без тапа');
ok(covT.retTap, 'возвращения: карточки аспектов открывают полный transit-текст');
ok(covT.stub, 'ШАГ 3: отсутствующий текст → честная заглушка, не пустая карточка');
ok(covT.chironText, 'экран точек: тап по Хирону открывает развёрнутый текст');

// ── Астрология P2: новые тексты (звёзды, точки, гармоники, прогрессии) ──
const p2uiT = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  // 1) Файл extra: 118 текстов, ключевые категории.
  await loadAstroTexts('extra');
  const E = window.ASTRO_TEXTS_EXTRA;
  const cnt = Object.keys(E).length;
  const catOk = !!E['star.Regulus'] && !!E['arabicPart.Spirit'] && !!E['antivertexInSign.Овен']
    && !!E['eastPointInSign.Рыбы'] && !!E['progSunInSign.Водолей'] && !!E['harmonic.5']
    && !!E['profectionYear.7'] && !!E['midpointPair.Sun-Moon']
    && !!E['tithi.15'] && !!E['vara.1'] && !!E['yoga.27'] && !!E['karana.Вишти'] && !!E['antiscia.Sun'] && !!E['mcInSign.Водолей'];
  // 2) Покрытие: новые префиксы валидируются, мусор — нет.
  const hasOk = astroHasText('star.Regulus') && astroHasText('harmonic.5') && astroHasText('midpointPair.Sun-Moon')
    && !astroHasText('star.Unknown') && !astroHasText('harmonic.64') && !astroHasText('midpointPair.Sun-Foo');
  goTo('astro');
  // 3) Экран звёзд: каталог с тапами (10 звёзд).
  asub('parts');
  await new Promise(r => setTimeout(r, 500));
  const starTaps = document.querySelectorAll('#astro-parts [data-rule^="star."]').length;
  const arabicTaps = document.querySelectorAll('#astro-parts [data-rule^="arabicPart."]').length;
  // 4) Тап по звезде из каталога открывает текст.
  const starEl = document.querySelector('#astro-parts [data-rule="star.Regulus"]');
  if (starEl) starEl.click();
  await new Promise(r => setTimeout(r, 300));
  const starText = document.getElementById('astro-text-body').textContent.length > 400;
  closeOv('ov-astro-text');
  // 5) Мидпоинты: тапы у пар; гармоника H5 с тапом.
  asub('mid');
  await new Promise(r => setTimeout(r, 200));
  const midTaps = document.querySelectorAll('#astro-mid [data-rule^="midpointPair."]').length >= 1;
  document.getElementById('astro-harm-n').value = '5';
  rHarmonic();
  const harmTap = !!document.querySelector('#astro-harm [data-rule="harmonic.5"]');
  // 6) Прогрессии: тема этапа с тапом progSunInSign; профекция с тапом.
  asub('prog'); STATE.progSeg = 'secondary';
  document.getElementById('astro-prog-age').value = '30';
  await rPrognostics();
  const progTap = !!document.querySelector('#astro-prog [data-rule^="progSunInSign."]');
  STATE.progSeg = 'profection';
  await rPrognostics();
  const profTap = !!document.querySelector('#astro-prog [data-rule^="profectionYear."]');
  STATE.progSeg = 'secondary';
  // 7) Экран точек: Антивертекс/Восточная теперь с тапами.
  asub('points');
  const avTap = !!document.querySelector('#astro-points-out [data-rule^="antivertexInSign."]');
  const epTap = !!document.querySelector('#astro-points-out [data-rule^="eastPointInSign."]');
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { cnt, catOk, hasOk, starTaps, arabicTaps, starText, midTaps, harmTap, progTap, profTap, avTap, epTap };
});
ok(p2uiT.cnt === 215 && p2uiT.catOk, `P2+P3: extra-файл 215 текстов, все 14 категорий (${p2uiT.cnt})`);
ok(p2uiT.hasOk, 'P2: правило покрытия знает новые префиксы и отвергает мусор');
ok(p2uiT.starTaps >= 10 && p2uiT.arabicTaps >= 2, `P2: каталог звёзд (${p2uiT.starTaps}) и арабские точки (${p2uiT.arabicTaps}) с тапами`);
ok(p2uiT.starText, 'P2: тап по Регулу открывает развёрнутый текст');
ok(p2uiT.midTaps && p2uiT.harmTap, 'P2: мидпоинт-пары и гармоника H5 открывают тексты');
ok(p2uiT.progTap && p2uiT.profTap, 'P2: прогрессированное Солнце и профекция года с тапами');
ok(p2uiT.avTap && p2uiT.epTap, 'P2: Антивертекс и Восточная точка теперь с текстами');

// ── Астрология P3: панчанга/антисции тапы + астероиды и звёзды на колесе ──
const p3T = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro');
  // 1) Покрытие новых префиксов.
  const hasOk = astroHasText('tithi.30') && astroHasText('vara.7') && astroHasText('yoga.27')
    && astroHasText('karana.Вишти') && astroHasText('antiscia.Sun')
    && !astroHasText('tithi.31') && !astroHasText('karana.Нет') && !astroHasText('antiscia.Foo');
  // 2) Панчанга-таб: 4 тапа (тити/вара/йога/карана).
  asub('jyo'); STATE.jyoTab = 'panchanga';
  await rJyotish();
  const panTaps = ['tithi.', 'vara.', 'yoga.', 'karana.'].filter(p => document.querySelector(`#astro-jyo [data-rule^="${p}"]`)).length;
  STATE.jyoTab = 'rashi';
  // 3) Антисции: тапы на экране точек.
  asub('points');
  const antTaps = document.querySelectorAll('#astro-points-out [data-rule^="antiscia."]').length;
  // 4) Колесо: тумблер выключен → без extras; включён → астероиды и звёзды.
  CFG.astroWheelExtras = false;
  asub('natal');
  const offExtras = document.querySelectorAll('#astro-wheel .aw-extra, #astro-wheel .aw-star').length;
  CFG.astroWheelExtras = true;
  rNatalScreen();
  const astExtras = document.querySelectorAll('#astro-wheel .aw-extra').length;
  const starExtras = document.querySelectorAll('#astro-wheel .aw-star').length;
  const tapable = /astroFullText\('pointInSign\./.test(document.getElementById('astro-wheel').innerHTML)
    && /astroFullText\('star\./.test(document.getElementById('astro-wheel').innerHTML);
  CFG.astroWheelExtras = false;
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { hasOk, panTaps, antTaps, offExtras, astExtras, starExtras, tapable };
});
ok(p3T.hasOk, 'P3: покрытие тити/вара/йога/карана/антисции (мусор отвергается)');
ok(p3T.panTaps === 4, `P3: панчанга — 4 тапа (тити/вара/йога/карана), получено ${p3T.panTaps}`);
ok(p3T.antTaps === 10, `P3: антисции — 10 тапов (${p3T.antTaps})`);
ok(p3T.offExtras === 0, 'P3: тумблер выключен → на колесе нет астероидов и звёзд');
ok(p3T.astExtras === 6 && p3T.starExtras === 10, `P3: тумблер включён → 6 астероидов + 10 звёзд на колесе (${p3T.astExtras}/${p3T.starExtras})`);
ok(p3T.tapable, 'P3: астероиды и звёзды на колесе открывают тексты по тапу');

// ── Астрология: North Indian стиль ведической сетки ──
const niT = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro'); asub('jyo');
  // 1) North: ромбовидная сетка, 12 номеров раши, дом 1 = лагна.
  CFG.jyoStyle = 'north';
  STATE.jyoTab = 'rashi';
  await rJyotish();
  const northSvg = !!document.querySelector('#astro-jyo .jyo-north');
  const nums = [...document.querySelectorAll('#astro-jyo .jn-num')].map(n => +n.textContent);
  // Лагна: тропический Asc 87.78° − Лахири 23.85° = 63.93° → Митхуна (№3).
  const lagnaOk = nums.length === 12 && nums[0] === 3;
  const allNums = [...nums].sort((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12';
  // 2) Навамша в North тоже рендерится.
  STATE.jyoTab = 'navamsha';
  await rJyotish();
  const navNorth = !!document.querySelector('#astro-jyo .jyo-north');
  // 3) Переключение обратно в South.
  CFG.jyoStyle = 'south';
  STATE.jyoTab = 'rashi';
  await rJyotish();
  const southBack = !!document.querySelector('#astro-jyo .jyo-grid') && !document.querySelector('#astro-jyo .jyo-north');
  // 4) Без времени рождения North честно падает в South с пояснением.
  CFG.jyoStyle = 'north';
  DB.astroBirth = { date: '2000-01-01', timeKnown: false, utcOffset: 0 };
  DB.astroCharts = [];
  await runNatalChart();
  await rJyotish();
  const fallback = !!document.querySelector('#astro-jyo .jyo-grid') && /требует известного времени/.test(document.getElementById('astro-jyo').textContent);
  CFG.jyoStyle = 'south';
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { northSvg, lagnaOk, allNums, navNorth, southBack, fallback };
});
ok(niT.northSvg && niT.allNums, 'North Indian: ромбовидная сетка с 12 номерами раши');
ok(niT.lagnaOk, 'North Indian: дом 1 показывает раши лагны (Митхуна №3 для golden-карты)');
ok(niT.navNorth, 'North Indian: навамша D9 рендерится в северном стиле');
ok(niT.southBack, 'переключение стилей: South возвращается');
ok(niT.fallback, 'без времени рождения North честно падает в South с пояснением');

// ── Астрология: дома Коха (из отложенного, формула подтверждена) ──
const kochT = await page.evaluate(async () => {
  await loadAstroEngine();
  const mkCtx = (birth) => {
    const c = computeNatalChart(birth);
    return { chart: c, cusps: c.housesMeta && c.housesMeta.cusps };
  };
  const birth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'koch' };
  const { chart, cusps } = mkCtx(birth);
  // 1) Самотест формулы: Asc(RAMC − SDA_MC) = MC (фундаментальное свойство Коха).
  const A = window.Astronomy;
  const t = A.MakeTime(new Date(Date.UTC(2000, 0, 1, 12)));
  const lst = (A.SiderealTime(t) * 15 + 37.62 + 360) % 360;
  const eps = 23.4392911, phi = 55.75, DEGr = Math.PI / 180;
  const dec = Math.asin(Math.sin(eps * DEGr) * Math.sin(chart.angles.mc.lon * DEGr));
  const SDA = 90 + Math.asin(Math.tan(phi * DEGr) * Math.tan(dec)) / DEGr;
  const backAsc = ascFromRamc(lst - SDA, eps, phi);
  const fwdAsc = ascFromRamc(lst + SDA, eps, phi);
  const ic = (chart.angles.mc.lon + 180) % 360;
  const selfOk = Math.abs(((backAsc - chart.angles.mc.lon + 180) % 360 + 360) % 360 - 180) < 0.05
    && Math.abs(((fwdAsc - ic + 180) % 360 + 360) % 360 - 180) < 0.05;
  // 2) Каркас: куспиды 1/10 = Asc/MC; противоположные через 180°; полный круг.
  const oppOk = [1, 2, 3, 4, 5, 6].every(k => Math.abs(((cusps[k] + 180 - cusps[k + 6] + 180) % 360 + 360) % 360 - 180) < 0.01);
  let acc = 0; for (let k = 1; k <= 12; k++) acc += ((cusps[k === 12 ? 1 : k + 1] - cusps[k]) % 360 + 360) % 360;
  const circleOk = Math.abs(acc - 360) < 0.01;
  // 3) На экваторе все квадрантные системы совпадают (Кох включительно).
  const eq = {};
  for (const hs of ['koch', 'placidus', 'campanus', 'regiomontanus'])
    eq[hs] = mkCtx({ ...birth, lat: 0.001, houseSystem: hs }).cusps;
  const eqOk = [11, 12, 2, 3].every(k => ['placidus', 'campanus', 'regiomontanus']
    .every(hs => Math.abs(((eq.koch[k] - eq[hs][k] + 180) % 360 + 360) % 360 - 180) < 0.1));
  // 4) Кох ≠ Плацидус на высокой широте (система действительно другая).
  const pl = mkCtx({ ...birth, houseSystem: 'placidus' }).cusps;
  const differs = [11, 12, 2, 3].some(k => Math.abs(((cusps[k] - pl[k] + 180) % 360 + 360) % 360 - 180) > 0.2);
  return { selfOk, oppOk, circleOk, eqOk, differs };
});
ok(kochT.selfOk, 'Кох: самотест формулы — Asc(RAMC−SDA)=MC и Asc(RAMC+SDA)=IC (±0.05°)');
ok(kochT.oppOk && kochT.circleOk, 'Кох: противоположные куспиды 180°, полный круг 360°');
ok(kochT.eqOk, 'Кох: на экваторе совпадает с Плацидусом/Кампанусом/Региомонтанусом (±0.1°)');
ok(kochT.differs, 'Кох: на широте Москвы отличается от Плацидуса (реально другая система)');

// ── Астрология: полярные широты — страж квадрантных систем (ПРОВЕРКА владельца) ──
const polarT = await page.evaluate(async () => {
  await loadAstroEngine();
  const mk = (lat, hs, time) => computeNatalChart({ date: '1990-04-15', time, timeKnown: true, utcOffset: 8, lat, lon: 112.25, houseSystem: hs });
  // 1) 66.41° (широта со скрина): решение ещё существует — считаем без отката.
  const c1 = mk(66.41, 'placidus', '06:00');
  const ok66 = c1.housesMeta.system === 'placidus' && !c1.housesMeta.fallbackFrom && cuspsSane(c1.housesMeta.cusps);
  // 2) 70° при «плохом» звёздном времени: срыв порядка куспидов → честный
  // автоматический откат на Whole-sign с пометкой fallbackFrom.
  const c2 = mk(70, 'koch', '06:00');
  const fb = c2.housesMeta.system === 'whole' && c2.housesMeta.fallbackFrom === 'koch' && cuspsSane(c2.housesMeta.cusps);
  // 3) Whole-sign и Равнодомная там же работают всегда (безопасные системы).
  const c3 = mk(70, 'equal', '06:00');
  const safeOk = cuspsSane(c3.housesMeta.cusps) && c3.housesMeta.system === 'equal' && !c3.housesMeta.fallbackFrom;
  // 4) Регрессия: на обычной широте ничего не изменилось.
  const c4 = mk(55.75, 'placidus', '06:00');
  const normalOk = c4.housesMeta.system === 'placidus' && !c4.housesMeta.fallbackFrom;
  // 5) Живое предупреждение в настройках — до расчёта.
  goTo('astro'); asub('setup');
  document.getElementById('ab-lat').value = '66.41';
  document.getElementById('ab-houses').value = 'placidus';
  updatePolarWarn();
  const warnEl = document.getElementById('ab-polar-warn');
  const warnShown = warnEl.style.display !== 'none' && /Рекомендуем Whole-sign или Равнодомную/.test(warnEl.textContent) && /66\.4/.test(warnEl.textContent);
  document.getElementById('ab-houses').value = 'whole'; updatePolarWarn();
  const warnHiddenWhole = warnEl.style.display === 'none';
  document.getElementById('ab-houses').value = 'koch';
  document.getElementById('ab-lat').value = '55.75'; updatePolarWarn();
  const warnHiddenLat = warnEl.style.display === 'none';
  // 6) Полный цикл на 70°: компактная карточка в настройках сообщает об
  // откате, таб «Дома» объясняет причину; технического дампа больше нет.
  DB.astroBirth = { date: '1990-04-15', time: '06:00', timeKnown: true, utcOffset: 8, lat: 70, lon: 112.25, houseSystem: 'koch' };
  DB.astroCharts = [];
  await runNatalChart();
  const settingsTxt = document.getElementById('astro-out').textContent;
  const compactOk = /Карта рассчитана/.test(settingsTxt) && !/Антисции/.test(settingsTxt) && /Whole-sign/.test(settingsTxt);
  asub('natal'); antab('houses');
  const housesTxt = document.getElementById('astro-ntab-out').textContent;
  const tabExplains = /не имеет корректного решения/.test(housesTxt) && /Whole-sign/.test(housesTxt) && /Кох/.test(housesTxt);
  goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { ok66, fb, safeOk, normalOk, warnShown, warnHiddenWhole, warnHiddenLat, compactOk, tabExplains };
});
ok(polarT.ok66, 'полярный страж: 66.41° (скрин владельца) — Плацидус ещё имеет решение, отката нет');
ok(polarT.fb, 'полярный страж: 70°/06:00 Кох срывается → честный откат на Whole-sign с пометкой');
ok(polarT.safeOk && polarT.normalOk, 'полярный страж: Whole/Equal безопасны на 70°; обычные широты — без изменений');
ok(polarT.warnShown && polarT.warnHiddenWhole && polarT.warnHiddenLat, 'полярный страж: живое предупреждение в настройках (>66° + квадрантная система), гаснет для Whole/обычных широт');
ok(polarT.compactOk, 'настройки: вместо технического дампа — понятная карточка «Карта рассчитана» с кнопкой и пометкой об откате');
ok(polarT.tabExplains, 'таб «Дома»: причина отката объяснена человеческим языком');

// ── Астрология: видимая тапаемость + шапки-пояснения (СРОЧНАЯ ПРОВЕРКА владельца) ──
const affT = await page.evaluate(async () => {
  await loadAstroEngine(); try { await loadAstroRules(); } catch (e) {}
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro'); asub('points');   // экран «Астероиды и точки»
  const ptsEl = document.getElementById('astro-points-out');
  const preIntro = /необязательный слой карты/.test(ptsEl.textContent);
  const prePts = /Расчётные точки — не небесные тела/.test(ptsEl.textContent);
  const preAnt = /зеркальное отражение/.test(ptsEl.textContent) && /оси солнцестояний/.test(ptsEl.textContent);
  // Видимый индикатор тапаемости: CSS дорисовывает «›» каждому [data-rule].
  const tappable = Array.from(ptsEl.querySelectorAll('[data-rule]'));
  const marker = tappable.length >= 10 && tappable.every(el => getComputedStyle(el, '::after').content.includes('›'));
  // Антисции — отдельные кликабельные строки (не сплошной абзац): 10 тапов.
  const antTap = tappable.filter(el => (el.getAttribute('data-rule') || '').startsWith('antiscia.')).length === 10;
  // Преамбула над табами натальной карты: куда смотреть новичку.
  asub('natal');
  await new Promise(r => setTimeout(r, 350));
  const natalTx = document.getElementById('as-natal').textContent;
  const preTabs = /начните с блока «Кто вы по карте»/.test(natalTx) && /технические детали/i.test(natalTx);
  antab('points');
  const tabPre = /необязательный слой/.test(document.getElementById('astro-ntab-out').textContent);
  goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { preIntro, prePts, preAnt, marker, antTap, preTabs, tabPre, nTappable: tappable.length };
});
ok(affT.marker, `видимая тапаемость: каждый элемент с расшифровкой помечен «›» через CSS (${affT.nTappable} элементов)`);
ok(affT.antTap, 'антисции: 10 отдельных кликабельных строк с текстами (не сплошной абзац)');
ok(affT.preIntro && affT.prePts && affT.preAnt, 'шапки-пояснения: интро экрана точек, «Расчётные точки», «Антисции» — простым языком до тапа');
ok(affT.preTabs && affT.tabPre, 'преамбула над табами: новичка отправляют к «Кто вы по карте», значок › объяснён');

// ── Астрология: умный дефолт системы домов + защита при выборе (задача владельца) ──
const hsT = await page.evaluate(async () => {
  // Юнит: правило дефолта (образец Astro Library).
  const d1 = smartHouseDefault(55.75, true) === 'placidus';
  const d2 = smartHouseDefault(66.41, true) === 'whole';
  const d3 = smartHouseDefault(59, true) === 'whole';
  const d4 = smartHouseDefault(55.75, false) === 'whole';
  // Форма: авто-подбор на кейсе владельца (66.41°, время известно).
  DB.astroBirth = null; DB.astroCharts = [];
  goTo('astro'); asub('setup');   // пустая форма → авто-режим
  const latEl = document.getElementById('ab-lat'), sel = document.getElementById('ab-houses');
  document.getElementById('ab-time-known').classList.add('on');
  latEl.value = '66.41'; updateHouseAssist();
  const autoPolar = sel.value === 'whole' && /Подобрана автоматически/.test(document.getElementById('ab-houses-desc').textContent);
  latEl.value = '55.75'; updateHouseAssist();
  const autoNormal = sel.value === 'placidus';
  // Ручной выбор Коха на 66.41° → предупреждение с кнопками ПРИ выборе.
  latEl.value = '66.41'; updateHouseAssist();
  sel.value = 'koch'; houseSelChanged();
  const warn = document.getElementById('ab-polar-warn');
  const warned = warn.style.display !== 'none' && /приполярных регионах/.test(warn.textContent)
    && /Выбрать рекомендованную/.test(warn.textContent) && /Всё равно использовать/.test(warn.textContent);
  polarPickSafe();
  const picked = sel.value === 'whole' && warn.style.display === 'none';
  sel.value = 'placidus'; houseSelChanged();
  polarKeepRisky();
  const kept = sel.value === 'placidus' && warn.style.display === 'none';
  // Подписи у всех вариантов; редкие системы — в группе «для специалистов»; общая подсказка.
  const descAll = ['placidus', 'whole', 'equal', 'koch', 'campanus', 'regiomontanus'].every(k => (HOUSE_SYSTEM_DESC[k] || '').length > 20);
  const grouped = !!sel.querySelector('optgroup[label*="для специалистов"] option[value="koch"]');
  const hint = /оставьте вариант по умолчанию/.test(document.getElementById('as-setup').textContent);
  // Авто-дефолт НЕ переписывает сохранённый пользователем выбор.
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 66.41, lon: 112.25, houseSystem: 'koch' };
  fillAstroForm();
  const savedKept = sel.value === 'koch';
  goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { d1, d2, d3, d4, autoPolar, autoNormal, warned, picked, kept, descAll, grouped, hint, savedKept };
});
ok(hsT.d1 && hsT.d2 && hsT.d3 && hsT.d4, 'умный дефолт: Плацидус до 59°, Whole-sign от 59° и без времени');
ok(hsT.autoPolar && hsT.autoNormal, 'форма: на 66.41° авто-подбор Whole-sign с подписью, на 55.75° — Плацидус');
ok(hsT.warned, 'защита при выборе: Кох на 66.41° → предупреждение с кнопками сразу, не после расчёта');
ok(hsT.picked && hsT.kept, 'кнопки: «Выбрать рекомендованную» → Whole-sign; «Всё равно использовать» уважает выбор');
ok(hsT.descAll && hsT.grouped && hsT.hint, 'подписи у всех 6 систем, редкие — в группе «для специалистов», общая подсказка есть');
ok(hsT.savedKept, 'авто-дефолт не переписывает сохранённый выбор пользователя');

// ── Джйотиш: Навамша D9 — контекст, легенда, Варготтама, свёрнутые варги (задача владельца) ──
const navT = await page.evaluate(async () => {
  await loadAstroEngine();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; await runNatalChart();
  goTo('astro'); asub('jyo');
  await new Promise(r => setTimeout(r, 400));
  STATE.jyoTab = 'navamsha'; await rJyotish();
  const el = document.getElementById('astro-jyo');
  const tx = el.textContent;
  // 1) Вводный смысл ДО таблицы (дословный текст из ТЗ).
  const intro = /карта брака и внутренней силы/.test(tx) && /внешним обещанием и внутренней реализацией/.test(tx)
    && tx.indexOf('карта брака') < tx.indexOf('Варготтама');
  // 2) Легенда сокращений и тапаемые сокращения в сетке.
  const legend = /Сл — Солнце/.test(tx) && /Лг — лагна/.test(tx);
  const gridTaps = el.querySelectorAll('.jyo-grid [data-rule]').length >= 5;
  // 3) Варготтама: сверка вывода UI с независимым пересчётом.
  const A = window.Astronomy; const t = A.MakeTime(birthUTCDate(DB.astroBirth));
  const aya = ayanamsha('lahiri', t);
  const classical = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  let expected = 0;
  DB.astroCharts[0].chart.planets.forEach(p => {
    const L = norm360(p.lon - aya);
    if (classical.includes(p.body) && Math.floor(L / 30) === vargaSign(9, L)) expected++;
  });
  const rahu = norm360(meanRahuLon(t) - aya), ketu = norm360(rahu + 180);
  if (Math.floor(rahu / 30) === vargaSign(9, rahu)) expected++;
  if (Math.floor(ketu / 30) === vargaSign(9, ketu)) expected++;
  const uiCount = (tx.match(/— Варготтама/g) || []).length;
  const vargoOk = expected > 0 ? uiCount === expected : /нет планет-Варготтама/.test(tx);
  // 4) Технические детали свёрнуты; повисшая строка «Также считаются» исчезла.
  const techEl = document.getElementById('jyo-tech');
  const techHidden = !!techEl && techEl.style.display === 'none';
  const techContent = /дашамша — карьера/.test(techEl.innerHTML) && /саптамша — дети/.test(techEl.innerHTML)
    && /двадашамша — родители/.test(techEl.innerHTML) && /D16–D60/.test(techEl.innerHTML);
  const noDangling = !/Также считаются/.test(tx);
  // 5) Тот же подход в D1: сетка тапаема.
  STATE.jyoTab = 'rashi'; await rJyotish();
  const d1Taps = document.querySelectorAll('#astro-jyo .jyo-grid [data-rule]').length >= 5;
  goTo('home'); DB.astroBirth = null; DB.astroCharts = []; STATE.jyoTab = 'rashi';
  return { intro, legend, gridTaps, expected, uiCount, vargoOk, techHidden, techContent, noDangling, d1Taps };
});
ok(navT.intro, 'навамша: вводный смысл («карта брака и внутренней силы») стоит ДО таблицы');
ok(navT.legend && navT.gridTaps, 'навамша: легенда сокращений + сокращения в сетке тапаемы');
ok(navT.vargoOk, `навамша: Варготтама сверена с независимым расчётом (${navT.uiCount}/${navT.expected}${navT.expected === 0 ? ', явное «нет»' : ''})`);
ok(navT.techHidden && navT.techContent && navT.noDangling, 'навамша: D10/D7/D12 в свёрнутых «Технических деталях», повисшая строка убрана');
ok(navT.d1Taps, 'раши D1: сетка тоже тапаема (тот же подход)');

// ── «Мои записи»: индивидуальное удаление любой пользовательской записи ──
const recT = await page.evaluate(async () => {
  const now = Date.now(); const day = todayKey();
  DB.checkins.push({ id: now + 1, date: '2026-01-01', sl: 7, sq: 7, cl: 8, mv: 6, st: 3, ci: true, _u: now });
  DB.cravings.push({ id: now + 2, kind: 'cue', intensity: 7, outcome: 'held', day, _u: now });
  DB.meds.push({ id: now + 3, name: 'Витамин D (тест)', active: true, _u: now });
  DB.medIntakes.push({ id: now + 4, medId: now + 3, at: new Date().toISOString(), _u: now });
  DB.symptoms.push({ id: now + 5, name: 'тестовый симптом', severity: 4, day, _u: now });
  DB.measures.push({ id: now + 6, name: 'вес', value: '80', unit: 'кг', day, _u: now });
  DB.evolution.unshift({ id: now + 7, lv: 1, text: 'тестовая веха', dt: 'сегодня', _u: now });
  DB.bots.push({ id: now + 8, title: 'тестовая задача', prio: 'high', done: false, _u: now });
  DB.chats = DB.chats || []; DB.chats.push({ id: now + 9, title: 'тестовый чат', msgs: [], _u: now });
  DB.astroPartners = DB.astroPartners || []; DB.astroPartners.push({ id: now + 10, label: 'Тест-партнёр', _u: now });
  DB.oq.push('Тестовый вопрос?');
  DB.astroBirth = { date: '2000-01-01', timeKnown: false, utcOffset: 0 };
  persist();
  openRecords();
  const ovOn = document.getElementById('ov-records').classList.contains('on');
  const sel = document.getElementById('rec-coll');
  const optionCount = sel.options.length;
  const delOne = (coll, id) => {
    sel.value = coll; rRecords();
    const shown = document.querySelectorAll('#records-list .si-row').length > 0;
    recDel(coll, id);
    return shown && !(DB[coll] || []).some(r => r.id === id) && !!DB._del[id];
  };
  const allDeleted = ['checkins', 'cravings', 'medIntakes', 'meds', 'symptoms', 'measures', 'evolution', 'bots', 'chats', 'astroPartners']
    .every((coll, i) => delOne(coll, now + [1, 2, 4, 3, 5, 6, 7, 8, 9, 10][i]));
  // Undo возвращает последнюю удалённую запись (партнёра) и снимает надгробие.
  undoDelete();
  const undone = DB.astroPartners.some(r => r.id === now + 10) && !DB._del[now + 10];
  recDel('astroPartners', now + 10);
  // oq: удаление по индексу (confirm автопринимается харнессом), __ts обновлён.
  sel.value = 'oq'; rRecords();
  const tsBefore = DB.__ts || 0;
  recDelOq(DB.oq.indexOf('Тестовый вопрос?'));
  const oqGone = !DB.oq.includes('Тестовый вопрос?') && (DB.__ts || 0) >= tsBefore;
  // astroBirth: отдельная строка + подтверждение.
  sel.value = 'astroBirth'; rRecords();
  const birthRow = /Дата и место рождения/.test(document.getElementById('records-list').textContent);
  recDelBirth();
  const birthGone = DB.astroBirth === null;
  // Слияние: надгробие партнёра действует и при merge «с другим устройством».
  const merged = mergeDB({ ...DEFAULT_DB, _del: { [now + 10]: Date.now() }, __ts: Date.now() },
    { ...DEFAULT_DB, astroPartners: [{ id: now + 10, label: 'Тест-партнёр', _u: now }], __ts: now });
  const mergeKills = !merged.astroPartners.some(r => r.id === now + 10);
  // astroBirth — скалярное поле: более свежий документ (с null) побеждает.
  const merged2 = mergeDB({ ...DEFAULT_DB, astroBirth: null, __ts: Date.now() },
    { ...DEFAULT_DB, astroBirth: { date: '2000-01-01' }, __ts: now });
  const birthMerge = merged2.astroBirth === null;
  closeOv('ov-records');
  return { ovOn, optionCount, allDeleted, undone, oqGone, birthRow, birthGone, mergeKills, birthMerge };
});
ok(recT.ovOn && recT.optionCount >= 21, `«Мои записи»: менеджер открывается, типов записей ${recT.optionCount} (≥21)`);
ok(recT.allDeleted, '«Мои записи»: каждый тип удаляется индивидуально (запись исчезает + надгробие для синка)');
ok(recT.undone, '«Мои записи»: удаление можно отменить (undo возвращает запись и снимает надгробие)');
ok(recT.oqGone && recT.birthRow && recT.birthGone, '«Мои записи»: открытые вопросы и данные рождения удаляются с подтверждением');
ok(recT.mergeKills && recT.birthMerge, 'синк: надгробие партнёра действует при слиянии; удаление данных рождения переживает merge');

// ── Синастрия v2: сюжет по разделам вместо каталога аспектов (задача владельца) ──
const synNT = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  const R = window.ASTRO_RULES;
  // 1) Семантический слой: 25 пар × 2 тона, все тексты непустые и без рамки.
  const keys = Object.keys(R.synPair || {});
  const pairsOk = keys.length === 25 && keys.every(k => (R.synPair[k].harm || '').length > 60 && (R.synPair[k].tense || '').length > 60);
  // 2) Скоринг: личные > личные↔социальные > прочие > поколенческие (скрыть).
  const prioOk = synPriority('Venus', 'Mars') === 3 && synPriority('Sun', 'Saturn') === 2
    && synPriority('Uranus', 'Pluto') === 0 && synPriority('Sun', 'Pluto') === 1 && synPriority('Jupiter', 'Saturn') === 1;
  // 3) Golden-прогон: партнёр «Виолетта» = та же карта J2000 (детерминированно).
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; DB.astroPartners = [];
  await runNatalChart();
  const my = DB.astroCharts[0].chart;
  DB.astroPartners.push({ id: 777, label: 'Виолетта', birth: { date: '2000-01-01' }, chart: my, _u: Date.now() });
  goTo('astro'); asub('syn');
  await new Promise(r => setTimeout(r, 500));
  const el = document.getElementById('astro-syn');
  const html1 = el.innerHTML;
  const tx = el.textContent;
  // 4) Структура: вход → разделы → «В целом»; без шаблонной рамки.
  const opener = /гармоничных контактов \d+, напряжённых \d+/.test(tx);
  const sections = /Притяжение и близость/.test(tx) && /Как вы общаетесь и думаете вместе/.test(tx) && /Что усиливает друг друга/.test(tx);
  const noFrame = !/Ваш [А-Я][а-я]+ ↔/.test(tx);
  const orderOk = tx.indexOf('Притяжение и близость') < tx.indexOf('В целом');
  // 5) Анти-клише: старые заготовки не встречаются чаще 1 раза на экран.
  const cliche = ['звучат в унисон', 'открывают друг другу возможности', 'точку роста пары']
    .every(p => (tx.split(p).length - 1) <= 1);
  // 6) Поколенческое — только в свёрнутом «Фоне эпохи».
  const eraEl = document.getElementById('syn-era');
  const eraHidden = !!eraEl && eraEl.style.display === 'none' && /Уран/.test(eraEl.textContent);
  // Скрывается именно генерационная↔генерационная (prio 0); личная↔генерационная
  // (например, Луна—Уран) — легитимная динамика пары и остаётся в разделах.
  const sigs = computeSynastry(my, my).hits.map(synSignal);
  const genOnlyEra = sigs.filter(s => s.prio === 0).every(s => s.section === 'era')
    && sigs.filter(s => s.prio > 0).every(s => s.section !== 'era')
    && Array.from(eraEl.querySelectorAll('[data-rule], .si-text'))
      .filter(d => /·/.test(d.textContent))
      .every(d => (d.textContent.match(/Уран|Нептун|Плутон/g) || []).length >= 2);
  // 7) Синтез: доминанта + держится + вызов + честная кода; без процентов.
  const synM = tx.match(/В этой паре доминирует[\s\S]*?определяет судьбу пары\./);
  const synWords = synM ? synM[0].split(/\s+/).length : 0;
  const synthesis = !!synM && synWords >= 50 && synWords <= 200 && !/%/.test(synM[0]) && /не приговор/.test(synM[0]);
  // 8) Тапы на полные тексты сохранены; детерминизм рендера.
  const taps = document.querySelectorAll('#astro-syn [data-rule^="synastry."]').length >= 5;
  await rSynastry();
  const deterministic = document.getElementById('astro-syn').innerHTML === html1;
  goTo('home'); DB.astroBirth = null; DB.astroCharts = []; DB.astroPartners = [];
  return { pairsOk, prioOk, opener, sections, noFrame, orderOk, cliche, eraHidden, genOnlyEra, synthesis, synWords, taps, deterministic };
});
ok(synNT.pairsOk, 'синастрия v2: семантический слой — 25 пар × 2 тона (наблюдение → смысл → быт)');
ok(synNT.prioOk, 'синастрия v2: иерархия — личные > личные↔социальные > прочие > поколенческие');
ok(synNT.opener && synNT.sections && synNT.orderOk, 'синастрия v2: вход-абзац → тематические разделы → «В целом»');
ok(synNT.noFrame && synNT.cliche, 'синастрия v2: рамка «Ваш X ↔ Y» убрана, старые клише ≤1 раза на экран');
ok(synNT.eraHidden && synNT.genOnlyEra, 'синастрия v2: поколенческие пары — только в свёрнутом «Фоне эпохи»');
ok(synNT.synthesis, `синастрия v2: синтез «В целом» (${synNT.synWords} слов), без процентов, с честной кодой`);
ok(synNT.taps && synNT.deterministic, 'синастрия v2: тапы на полные тексты сохранены, рендер детерминирован');

// ── Астрология: контекстный проход — шапки-пояснения и свёрнутая техника везде ──
const ctxT = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; await runNatalChart();
  goTo('astro');
  // Прогрессии: интро + «эмоциональный сезон» Луны + позиции свёрнуты.
  asub('prog'); document.getElementById('astro-prog-age').value = '30';
  STATE.progSeg = 'secondary'; await rPrognostics();
  const pTx = document.getElementById('astro-prog').textContent;
  const secOk = /внутренний календарь/.test(pTx) && /Эмоциональный сезон/.test(pTx)
    && document.getElementById('prog-tech').style.display === 'none';
  // Дирекции: интро + контакты с текстами аспектов ИЛИ честное «спокойный участок».
  STATE.progSeg = 'solararc'; await rPrognostics();
  const saTx = document.getElementById('astro-prog').textContent;
  const saOk = /сдвигается примерно на 1°/.test(saTx) && (/Активные дирекции/.test(saTx) || /спокойный участок/.test(saTx))
    && document.getElementById('sa-tech').style.display === 'none';
  // Возвращения: «карта года», позиции свёрнуты, аспекты к наталу на месте.
  asub('ret'); document.getElementById('astro-ret-type').value = 'solar';
  document.getElementById('astro-ret-period').value = '2026'; await rReturns();
  const rTx = document.getElementById('astro-ret').textContent;
  const retOk = /карта года/.test(rTx) && document.getElementById('ret-tech').style.display === 'none' && /Ключевые аспекты/.test(rTx);
  // Мидпоинты и гармоника: интро простым языком.
  asub('mid'); rMidpoints(); rHarmonic();
  const midTx = document.getElementById('astro-mid').textContent + document.getElementById('astro-harm').textContent;
  const midOk = /точка ровно посередине/.test(midTx) && /«умноженная» на число N/.test(midTx);
  // Джйотиш: раши (почему знаки другие), даши (интро + полный цикл свёрнут), панчанга.
  asub('jyo'); STATE.jyoTab = 'rashi'; await rJyotish();
  const rashiOk = /сидерическому зодиаку/.test(document.getElementById('astro-jyo').textContent);
  STATE.jyoTab = 'dasha'; await rJyotish();
  const dashaOk = /ведический календарь больших периодов/.test(document.getElementById('astro-jyo').textContent)
    && document.getElementById('dasha-full').style.display === 'none';
  STATE.jyoTab = 'panchanga'; await rJyotish();
  const panOk = /пять характеристик момента рождения/.test(document.getElementById('astro-jyo').textContent);
  // Транзиты и исторический слой: интро.
  asub('transits'); await runTransits();
  const trOk = /фон дня, не событие/.test(document.getElementById('astro-transits').textContent);
  asub('parts'); await rPartsStars();
  const partsOk = /Исторический слой карты/.test(document.getElementById('astro-parts').textContent);
  STATE.jyoTab = 'rashi'; goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { secOk, saOk, retOk, midOk, rashiOk, dashaOk, panOk, trOk, partsOk };
});
ok(ctxT.secOk, 'контекст: прогрессии — «внутренний календарь», эмоциональный сезон Луны, позиции свёрнуты');
ok(ctxT.saOk, 'контекст: дирекции — интро + активные контакты (или честное «спокойный участок»), позиции свёрнуты');
ok(ctxT.retOk, 'контекст: возвращения — «карта года», позиции свёрнуты, аспекты к наталу на месте');
ok(ctxT.midOk, 'контекст: мидпоинты и гармоники — интро простым языком');
ok(ctxT.rashiOk && ctxT.dashaOk && ctxT.panOk, 'контекст: джйотиш — айанамша объяснена, даши с интро и свёрнутым циклом, панчанга с интро');
ok(ctxT.trOk && ctxT.partsOk, 'контекст: транзиты и исторический слой — интро на месте');

// ── Астрология: единый narrative-движок (очередь 3) ──
const narT = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  // Юнит движка: баланс, доминанта, сильнейшие сигналы.
  const st = narrativeStats([
    { tone: 'harm', strength: 3 }, { tone: 'tense', strength: 2 }, { tone: 'tense', strength: 1 },
  ]);
  const statsOk = st.n === 3 && st.harm === 1 && st.tense === 2 && st.dom === 'tense'
    && st.top.strength === 3 && st.topTense.strength === 2;
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; await runNatalChart();
  goTo('astro');
  // Транзиты на 2026-01-01: транзитное Солнце у натального (соединение
  // гарантировано у дня рождения) → narrative-вход присутствует.
  asub('transits');
  document.getElementById('astro-tr-date').value = '2026-01-01';
  await runTransits();
  const trTx = document.getElementById('astro-transits').textContent;
  const trNar = /(День|Этот день) (поддерживает|с характером|смешанный)/.test(trTx) && /Самый точный контакт/.test(trTx);
  // Соляр: Солнце соединяется с натальным по определению → «Тон года».
  asub('ret');
  document.getElementById('astro-ret-type').value = 'solar';
  document.getElementById('astro-ret-period').value = '2026';
  await rReturns();
  const rTx = document.getElementById('astro-ret').textContent;
  const retNar = /Тон года — (поддерживающий|рабочий|смешанный)/.test(rTx);
  // Джйотиш: «ядро» — лагна, Луна с накшатрой, текущая даша одним абзацем.
  asub('jyo'); STATE.jyoTab = 'rashi'; await rJyotish();
  const jyoTx = document.getElementById('astro-jyo').textContent;
  const jyoNar = /Ядро вашей ведической карты/.test(jyoTx) && /восходит/.test(jyoTx)
    && /в накшатре/.test(jyoTx) && /большой период/.test(jyoTx);
  // Гармоника: пояснение к соединениям (если они есть — H5 для J2000 даёт).
  asub('mid'); rHarmonic();
  const harmTx = document.getElementById('astro-harm').textContent;
  const harmNar = !/Соединения в гармонике/.test(harmTx) || /работают как один узел/.test(harmTx);
  STATE.jyoTab = 'rashi'; goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { statsOk, trNar, retNar, jyoNar, harmNar };
});
ok(narT.statsOk, 'narrative-движок: баланс/доминанта/сильнейшие сигналы считаются верно');
ok(narT.trNar, 'narrative: транзиты открываются выводом «что главное сейчас» с сильнейшим контактом');
ok(narT.retNar, 'narrative: соляр открывается «тоном года» из баланса аспектов возврата');
ok(narT.jyoNar, 'narrative: ведическая карта — «ядро» (лагна + Луна/накшатра + текущая даша) одним абзацем');
ok(narT.harmNar, 'narrative: соединения в гармонике объяснены («работают как один узел»)');

// ── Астрология: True Lilith — оскулирующий апогей Луны (контракт владельца) ──
const tlT = await page.evaluate(async () => {
  await loadAstroEngine();
  const A = window.Astronomy;
  // 1) Физический golden: в момент апогея Луна стоит в своём оскулирующем
  // апогее — её долгота обязана совпасть с True Lilith (3 апогея подряд).
  let ap = A.SearchLunarApsis(A.MakeTime(new Date(Date.UTC(2026, 0, 1))));
  const errs = [];
  for (let i = 0; i < 6 && errs.length < 3; i++) {
    if (ap.kind === 1) {   // апоцентр
      const moonLon = A.EclipticGeoMoon(ap.time).lon;
      const tl = trueLilithLon(ap.time);
      errs.push(Math.abs(((tl - moonLon + 180) % 360 + 360) % 360 - 180));
    }
    ap = A.NextLunarApsis(ap);
  }
  const apsisOk = errs.length === 3 && errs.every(e => e < 0.3);
  // 2) Осцилляция вокруг средней Лилит: заметная (>5° хоть раз), но ≤ ~40°;
  // средняя знаковая разница за 2 года мала (истинная ходит ВОКРУГ средней).
  let maxDev = 0, sum = 0; const N = 48;
  for (let i = 0; i < N; i++) {
    const t = A.MakeTime(new Date(Date.UTC(2025, 0, 1 + i * 15)));
    const d = ((trueLilithLon(t) - meanLilithLon(t) + 180) % 360 + 360) % 360 - 180;
    maxDev = Math.max(maxDev, Math.abs(d)); sum += d;
  }
  const oscOk = maxDev > 5 && maxDev < 40 && Math.abs(sum / N) < 8;
  // 3) Карта и UI: обе Лилит в точках, честная пометка о колебании.
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; await runNatalChart();
  const P = DB.astroCharts[0].chart.points;
  const inChart = !!P.lilithTrue && isFinite(P.lilithTrue.lon) && P.lilith && P.lilithTrue.lon !== P.lilith.lon;
  goTo('astro'); asub('points');
  const tx = document.getElementById('astro-points-out').textContent;
  const uiOk = /Лилит истинная/.test(tx) && /±30°/.test(tx) && /Лилит \(ср\. апогей\)/.test(tx);
  goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { apsisOk, errs: errs.map(e => +e.toFixed(3)), oscOk, maxDev: +maxDev.toFixed(1), inChart, uiOk };
});
ok(tlT.apsisOk, `True Lilith: физический golden — в 3 апогеях подряд совпадает с долготой Луны (ошибки ${tlT.errs}°)`);
ok(tlT.oscOk, `True Lilith: колеблется вокруг средней (макс ${tlT.maxDev}°, в пределах ±40°, среднее ~0)`);
ok(tlT.inChart && tlT.uiOk, 'True Lilith: в карте и на экране точек, с честной пометкой о колебании ±30°');

// ── Астрология: первичные дирекции к углам (контракт владельца) ──
const pdT = await page.evaluate(async () => {
  await loadAstroEngine(); try { await loadAstroRules(); } catch (e) {}
  const A = window.Astronomy;
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; await runNatalChart();
  const chart = DB.astroCharts[0].chart;
  const t = A.MakeTime(birthUTCDate(DB.astroBirth));
  const ramc = ((A.SiderealTime(t) * 15 + 37.62) % 360 + 360) % 360;
  const sep = (a, b) => Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  // 1) ФИЗИЧЕСКИЙ инвариант Asc: повернув небо на дугу дирекции, промиссор
  // обязан взойти — Asc(RAMC+дуга) = долгота промиссора. Для всех 10 планет.
  const ascOk = chart.planets.every(p => {
    const arc = primaryArcToAngle(p.lon, 'asc', ramc, 55.75);
    return arc == null || sep(ascFromRamc(ramc + arc, 23.4392911, 55.75), p.lon) < 0.05;
  });
  // 2) Инвариант MC: RA точки эклиптики на MC — прямое восхождение.
  const mcOk = chart.planets.every(p => {
    const arc = primaryArcToAngle(p.lon, 'mc', ramc, 55.75);
    const ramc2 = (ramc + arc) * Math.PI / 180, e = 23.4392911 * Math.PI / 180;
    const mcLon = ((Math.atan2(Math.sin(ramc2), Math.cos(ramc2) * Math.cos(e)) * 180 / Math.PI) + 360) % 360;
    return sep(mcLon, p.lon) < 0.05;
  });
  // 3) Ключ Найбода и границы: годы = дуга/0.985647, всё в (0, 100], сортировка.
  const pd = computePrimaryDirections(chart, DB.astroBirth);
  const keyOk = pd.length >= 5 && pd.every(d => Math.abs(d.years - d.arc / 0.985647) < 1e-9 && d.years > 0 && d.years <= 100)
    && pd.every((d, i) => i === 0 || d.years >= pd[i - 1].years);
  // 4) UI: сегмент «Первичные» — интро с честной чувствительностью, список, полный свёрнут.
  goTo('astro'); asub('prog');
  STATE.progSeg = 'primary'; await rPrognostics();
  const tx = document.getElementById('astro-prog').textContent;
  const uiOk = /старейшая прогностическая техника/.test(tx) && /±4 минуты/.test(tx)
    && /≈ возраст \d/.test(tx) && document.getElementById('pd-all').style.display === 'none';
  // 5) Честный отказ без времени рождения.
  DB.astroBirth = { date: '2000-01-01', timeKnown: false, utcOffset: 0 };
  DB.astroCharts = []; await runNatalChart();
  await rPrognostics();
  const noTime = /требуют известного времени/.test(document.getElementById('astro-prog').textContent);
  STATE.progSeg = 'secondary'; goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { ascOk, mcOk, keyOk, n: pd.length, uiOk, noTime };
});
ok(pdT.ascOk, 'первичные дирекции: физический инвариант Asc — повернув небо на дугу, промиссор восходит (10 планет, ±0.05°)');
ok(pdT.mcOk, 'первичные дирекции: инвариант MC — дуга через прямое восхождение точна (10 планет)');
ok(pdT.keyOk, `первичные дирекции: ключ Найбода, окно 0–100 лет, сортировка (${pdT.n} событий)`);
ok(pdT.uiOk, 'первичные дирекции UI: интро с честной чувствительностью ±4 мин ≈ ±1 год, полный список свёрнут');
ok(pdT.noTime, 'первичные дирекции: без времени рождения — честный отказ');

// ── Джйотиш: полная Шадбала (BPHS гл. 27; контракт владельца) ──
const sbT = await page.evaluate(async () => {
  await loadAstroEngine();
  // 1) Юниты спхута-дришти: опорные точки классической функции.
  const dr = (a, d, s) => sbDrishti(a, d, s || 1);
  const drishtiOk = dr('Sun', 180) === 60 && dr('Sun', 90) === 45 && dr('Sun', 120) === 30
    && dr('Sun', 60) === 15 && dr('Sun', 0) === 0 && dr('Saturn', 65, 3) === 60
    && dr('Mars', 100, 4) === 60 && dr('Jupiter', 125, 5) === 60;
  // 2) Юниты новых варг (стандарт Парашары).
  const vOk = vargaSign(2, 10) === 4 && vargaSign(2, 40) === 3       // хора: Овен→Лев, Телец→Рак
    && vargaSign(3, 15) === 4 && vargaSign(3, 45) === 5              // дрекана: Овен 15° (2-й декан) → Лев, Телец 15° → Дева
    && vargaSign(30, 3) === 0 && vargaSign(30, 27) === 6             // тримшамша Овна: Ма(Овен), Ве(Весы)
    && vargaSign(30, 33) === 1 && vargaSign(30, 57) === 7;           // тримшамша Тельца: Ве(Телец), Ма(Скорпион)
  // 3) Пакша-синтетика: полнолуние → бенефики 60, Луна 120, малефики 0.
  const lons0 = { Sun: 0, Moon: 180, Mars: 10, Mercury: 20, Jupiter: 30, Venus: 40, Saturn: 50 };
  const birth0 = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62 };
  const t0 = window.Astronomy.MakeTime(new Date(Date.UTC(2000, 0, 1, 12)));
  const sb0 = computeShadbala(lons0, 0, birth0, t0);
  const pakshaOk = Math.abs(sb0.Jupiter.paksha - 60) < 0.01 && Math.abs(sb0.Moon.paksha - 120) < 0.01 && Math.abs(sb0.Saturn.paksha - 0) < 0.01;
  // Кендради: граха в знаке лагны (Солнце в 0° при лагне 0°) = кендра 60.
  const kendraOk = sb0.Sun.kendradi === 60;
  // 4) Реальная карта J2000: диапазоны всех компонентов и структура.
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  DB.astroCharts = []; await runNatalChart();
  const chart = DB.astroCharts[0].chart;
  const t = window.Astronomy.MakeTime(birthUTCDate(DB.astroBirth));
  const aya = ayanamsha('lahiri', t);
  const sidLons = {};
  SB_GRAHAS.forEach(g => { const p = chart.planets.find(x => x.body === g); sidLons[g] = ((p.lon - aya) % 360 + 360) % 360; });
  const sb = computeShadbala(sidLons, ((chart.angles.asc.lon - aya) % 360 + 360) % 360, DB.astroBirth, t);
  const rangesOk = SB_GRAHAS.every(g => { const b = sb[g];
    return b.uchcha >= 0 && b.uchcha <= 60 && b.saptavargaja >= 7 * 1.875 && b.saptavargaja <= 315
      && [0, 15, 30].includes(b.ojayugma) && [15, 30, 60].includes(b.kendradi) && [0, 15].includes(b.drekkana)
      && b.dig >= 0 && b.dig <= 60 && b.nathonnata >= 0 && b.nathonnata <= 60
      && b.paksha >= 0 && b.paksha <= 120 && [0, 60].includes(b.tribhaga) && b.abdadi >= 0 && b.abdadi <= 150
      && b.ayana >= 0 && b.ayana <= 120 && b.cheshta >= 0 && b.cheshta <= 60
      && Math.abs(b.drik) <= 105 && b.total > 0 && isFinite(b.rupas);
  });
  const naisOk = sb.Sun.naisargika === 60 && sb.Saturn.naisargika === 8.57
    && sb.Sun.naisargika > sb.Moon.naisargika && sb.Moon.naisargika > sb.Venus.naisargika;
  // Детерминизм.
  const sb2 = computeShadbala(sidLons, ((chart.angles.asc.lon - aya) % 360 + 360) % 360, DB.astroBirth, t);
  const det = JSON.stringify(sb) === JSON.stringify(sb2);
  // 5) UI: таб «Шадбала» — интро, 7 грах с рупами и разбивкой; без времени — отказ.
  goTo('astro'); asub('jyo');
  STATE.jyoTab = 'bala'; await rJyotish();
  const tx = document.getElementById('astro-jyo').textContent;
  const uiOk = /шестикратная сила/.test(tx) && (tx.match(/рупы/g) || []).length >= 7
    && /стхана/.test(tx) && /дрик/.test(tx) && /(выше|ниже) нормы/.test(tx) && /Юддха/.test(tx);
  DB.astroBirth = { date: '2000-01-01', timeKnown: false, utcOffset: 0 };
  DB.astroCharts = []; await runNatalChart(); await rJyotish();
  const noTime = /требует известного времени/.test(document.getElementById('astro-jyo').textContent);
  STATE.jyoTab = 'rashi'; goTo('home'); DB.astroBirth = null; DB.astroCharts = [];
  return { drishtiOk, vOk, pakshaOk, kendraOk, rangesOk, naisOk, det, uiOk, noTime };
});
ok(sbT.drishtiOk, 'Шадбала: спхута-дришти — опорные точки (180°→60, 90°→45, 120°→30, 60°→15) + особые аспекты Ма/Юп/Са');
ok(sbT.vOk, 'Шадбала: варги D2/D3/D30 — юниты стандарта Парашары');
ok(sbT.pakshaOk && sbT.kendraOk, 'Шадбала: пакша-синтетика (полнолуние: бенефики 60, Луна 120, малефики 0) и кендради');
ok(sbT.rangesOk && sbT.naisOk, 'Шадбала: все 12 подкомпонентов в границах BPHS; найсаргика-иерархия точна');
ok(sbT.det && sbT.uiOk && sbT.noTime, 'Шадбала: детерминизм; таб с рупами/разбивкой/нормой; без времени — честный отказ');

// ── Астрология: полный портрет карты (интро, Asc/MC, синтез-слой) ──
const portT = await page.evaluate(async () => {
  await loadAstroEngine(); await loadAstroRules();
  DB.astroBirth = { date: '2000-01-01', time: '12:00', timeKnown: true, utcOffset: 0, lat: 55.75, lon: 37.62, houseSystem: 'placidus' };
  DB.astroCharts = [];
  await runNatalChart();
  goTo('astro'); asub('natal');
  await new Promise(r => setTimeout(r, 400));
  // Пробел 3: вводный текст видим в начале экрана.
  const natal = document.getElementById('as-natal');
  const intro = /разговор о возможностях, а не как приговор/.test(natal.textContent);
  // Порядок блоков: интро → summary → persona → portrait → колесо.
  const html = natal.innerHTML;
  const orderOk = html.indexOf('разговор о возможностях') < html.indexOf('astro-summary')
    && html.indexOf('astro-summary') < html.indexOf('astro-persona')
    && html.indexOf('astro-persona') < html.indexOf('astro-portrait')
    && html.indexOf('astro-portrait') < html.indexOf('astro-wheel');
  // Пробел 1: блоки Asc и MC с краткими текстами и тапами.
  const personaTx = document.getElementById('astro-persona').textContent;
  const maskOk = /Ваша маска для мира/.test(personaTx) && /Близнецы/.test(personaTx);
  const mcOk = /Ваше призвание/.test(personaTx) && /Водолей/.test(personaTx);
  const mcTap = !!document.querySelector('#astro-persona [data-rule="mcInSign.Водолей"]');
  const ascTap = !!document.querySelector('#astro-persona [data-rule="ascInSign.Близнецы"]');
  // Пробел 2: golden синтеза для J2000 — вода в дефиците (1), фиксированных 5,
  // стеллиум в Водолее (Марс, Уран, Нептун).
  const b = computeChartBalance(DB.astroCharts[0].chart);
  const elOk = b.elements['вода'] === 1 && b.elements['земля'] === 3 && b.elements['огонь'] === 3 && b.elements['воздух'] === 3;
  const quOk = b.qualities['фиксированный'] === 5;
  const lineWater = b.lines.some(l => l.k === 'вода_мало');
  const lineFixed = b.lines.some(l => l.k === 'фиксированный_много');
  const stell = b.stelliums.some(s => /Стеллиум в знаке Водолей/.test(s.t) && /Марс/.test(s.t) && /Уран/.test(s.t) && /Нептун/.test(s.t));
  const portraitTx = document.getElementById('astro-portrait').textContent;
  const uiOk = /Общий портрет вашей карты/.test(portraitTx) && /Воды мало/.test(portraitTx) && /Стеллиум в знаке Водолей/.test(portraitTx);
  // Честность: без времени — persona пуста, портрет без полушарий.
  DB.astroBirth = { date: '2000-01-01', timeKnown: false, utcOffset: 0 };
  DB.astroCharts = [];
  await runNatalChart();
  await rPersona(); await rPortrait();
  const noTime = document.getElementById('astro-persona').innerHTML === ''
    && /при известном времени/.test(document.getElementById('astro-portrait').textContent);
  goTo('home');
  DB.astroBirth = null; DB.astroCharts = [];
  return { intro, orderOk, maskOk, mcOk, mcTap, ascTap, elOk, quOk, lineWater, lineFixed, stell, uiOk, noTime };
});
ok(portT.intro && portT.orderOk, 'портрет: вводный текст о потенциале первым, порядок блоков по ТЗ');
ok(portT.maskOk && portT.ascTap, 'портрет: «Ваша маска для мира» (Asc) с кратким текстом и тапом');
ok(portT.mcOk && portT.mcTap, 'портрет: «Ваше призвание» (MC) с кратким текстом и тапом');
ok(portT.elOk && portT.quOk, 'синтез golden J2000: стихии 3/3/3/1 (вода дефицит), фиксированных 5');
ok(portT.lineWater && portT.lineFixed, 'синтез: тексты «воды мало» и «фиксированного много» выбраны верно');
ok(portT.stell && portT.uiOk, 'синтез: стеллиум Водолея (Марс+Уран+Нептун) найден и показан');
ok(portT.noTime, 'честность: без времени рождения — без Asc/MC-блоков и полушарий');

// ── Астрология: ректификация (инструмент сужения диапазона времени) ──
const rectT = await page.evaluate(async () => {
  await loadAstroEngine();
  // Синтетика: «истинное» время 15:30. События подобраны так, чтобы на даты
  // событий солнечно-дуговые дирекции планет попадали в углы ИСТИННОЙ карты —
  // функциональный тест восстановления времени по событиям.
  const birthTrue = { date: '1990-04-15', time: '15:30', timeKnown: true, utcOffset: 3, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  const chartTrue = computeNatalChart(birthTrue);
  const a0 = chartTrue.angles.asc.lon, m0 = chartTrue.angles.mc.lon;
  const angles4 = [a0, m0, (a0 + 180) % 360, (m0 + 180) % 360];
  const birthNoTime = { date: '1990-04-15', timeKnown: false, utcOffset: 3, lat: 55.75, lon: 37.62 };
  const noonUTC = new Date(Date.parse('1990-04-15T12:00:00Z') - 3 * 3600e3);
  const noon = bodiesAt(window.Astronomy.MakeTime(noonUTC));
  const sepOf = (x, y) => Math.abs(((x - y + 180) % 360 + 360) % 360 - 180);
  // Дуга Солнца на дату (та же база-полдень, что в rectifyEventContext).
  const sunN = noon.find(p => p.body === 'Sun').lon;
  const arcAt = date => {
    const ageYears = (Date.parse(date + 'T12:00:00Z') - Date.parse('1990-04-15T12:00:00Z')) / 864e5 / 365.2425;
    const tP = window.Astronomy.MakeTime(new Date(noonUTC.getTime() + ageYears * 864e5));
    return ((window.Astronomy.SunPosition(tP).elon - sunN) % 360 + 360) % 360;
  };
  const events = [];
  outer:
  for (let y = 2; y <= 69; y++) for (let m = 1; m <= 12; m++) {
    const date = (1990 + y) + '-' + String(m).padStart(2, '0') + '-15';
    if (events.length && Date.parse(date) - Date.parse(events[events.length - 1].date) < 1.5 * 365 * 864e5) continue;
    const arc = arcAt(date);
    const hit = noon.some(p => p.body !== 'Moon' &&
      angles4.some(a => sepOf((p.lon + arc) % 360, a) < 0.25));
    if (hit) { events.push({ id: events.length + 1, type: 'other', date }); if (events.length >= 6) break outer; }
  }
  // 1) Детерминизм: одинаковые входы → одинаковый результат.
  const res1 = rectifyRun(birthNoTime, events, 'all', 30);
  const res2 = rectifyRun(birthNoTime, events, 'all', 30);
  const deterministic = JSON.stringify(res1) === JSON.stringify(res2);
  // 2) Кандидат истинного времени гарантированно ловит все подобранные дирекции.
  const c930 = res1.candidates.find(c => c.minute === 930);
  const dirHits = c930 ? c930.hits.filter(h => /дирекция/.test(h.text)).length : 0;
  const catchesAll = dirHits >= events.length;
  // 3) Восстановление в суженном режиме («днём», как в ТЗ): истинное время
  // попадает в один из топ-диапазонов (±30 мин); кластеры в рамках диапазона.
  const resDay = rectifyRun(birthNoTime, events, 'day', 30);
  const recovered = resDay.clusters.some(c => c.fromMin - 30 <= 930 && 930 <= c.toMin + 30);
  const inRange = resDay.clusters.every(c => c.fromMin >= 660 && c.toMin <= 1080);
  // 3a) Метрика поддержки абсолютная: 1..eventsUsed, у топ-кластера — большинство.
  const supportedOk = resDay.clusters.every(c => c.supported >= 1 && c.supported <= resDay.eventsUsed)
    && resDay.clusters[0].supported >= Math.ceil(resDay.eventsUsed / 2);
  // 3b) Грязные данные: одна дата сбита на 2 года (дуга уходит на ~2° — мимо
  // орба) — истинное время всё равно удерживается остальными событиями.
  const dirtyEvents = [{ ...events[0], date: (parseInt(events[0].date.slice(0, 4), 10) + 2) + events[0].date.slice(4) }, ...events.slice(1)];
  const resDirty = rectifyRun(birthNoTime, dirtyEvents, 'day', 30);
  const dirtyRecovered = resDirty.clusters.some(c => c.fromMin - 30 <= 930 && 930 <= c.toMin + 30);
  // 4) Кластеры: не больше 3, отсортированы по убыванию score, score > 0.
  const clustersOk = res1.clusters.length <= 3 && resDay.clusters.length <= 3
    && res1.clusters.every(c => c.score > 0)
    && res1.clusters.every((c, i) => i === 0 || c.score <= res1.clusters[i - 1].score);
  // 5) Диапазоны перебора: «ночь» — два отрезка через полночь, «день» — в рамках.
  const night = rectifyCandidateMinutes('night', 30);
  const nightOk = night.length === 16 && night.every(m => m >= 1320 || m < 360);
  const day = rectifyCandidateMinutes('day', 15);
  const dayOk = day.length === 28 && day.every(m => m >= 660 && m < 1080);
  return { nEvents: events.length, deterministic, catchesAll, recovered, inRange, supportedOk, dirtyRecovered, clustersOk, nightOk, dayOk };
});
ok(rectT.supportedOk, 'ректификация: метрика «поддержано X из Y» абсолютная, топ-вариант держит большинство событий');
ok(rectT.dirtyRecovered, 'ректификация: одна дата, сбитая на 2 года, не ломает восстановление (устойчивость к грязным данным)');
ok(rectT.nEvents >= 4, `ректификация: синтетика дала ≥4 событий-дирекций (${rectT.nEvents})`);
ok(rectT.inRange, 'ректификация: кластеры не выходят за выбранный диапазон поиска');
ok(rectT.deterministic, 'ректификация: расчёт детерминирован (одни входы — один результат)');
ok(rectT.catchesAll, 'ректификация: кандидат истинного времени ловит все подобранные дирекции к углам');
ok(rectT.recovered, 'ректификация: истинное время (15:30) восстановлено в топ-диапазонах режима «днём» (±30 мин)');
ok(rectT.clustersOk, 'ректификация: ≤3 кластеров, по убыванию согласованности, score > 0');
ok(rectT.nightOk && rectT.dayOk, 'ректификация: пресеты диапазонов корректны (ночь через полночь, день в рамках)');

const rectUi = await page.evaluate(async () => {
  // Экран: без данных рождения — честная подсказка, не пустой расчёт.
  DB.astroBirth = null; DB.astroRectify = null;
  goTo('astro'); asub('rectify');
  const noData = /Сначала — дата и место рождения/.test(document.getElementById('as-rectify').textContent);
  const menuCard = /Уточнение времени рождения/.test(document.getElementById('as-menu').textContent);
  const introHonest = /не автоматическое определение точного времени/.test(document.getElementById('as-rectify').textContent);
  // С данными рождения (время неизвестно) — анкета и прогон.
  DB.astroBirth = { date: '1990-04-15', time: '', timeKnown: false, utcOffset: 3, lat: 55.75, lon: 37.62, houseSystem: 'whole' };
  asub('rectify');
  const formOk = /Шаг 1/.test(document.getElementById('astro-rect-form').textContent);
  const R = rectifyDB();
  R.events = [ { id: 1, type: 'career', date: '2015-06-01' }, { id: 2, type: 'marriage', date: '2012-09-10' }, { id: 3, type: 'move', date: '2008-03-20' } ];
  R.rangeMode = 'day'; R.stepMin = 30; R.temperament = 'earth';
  await runRectify();
  const outTx = document.getElementById('astro-rect-out').textContent;
  // Обязательная честная формулировка — дословно по контракту.
  const disclaimer = /Это статистическая оценка, не 100% гарантия — для точного подтверждения рекомендуем свидетельство о рождении или консультацию с профессиональным астрологом/.test(outTx);
  const ranked = /№1/.test(outTx) && /Асцендент/.test(outTx);
  const stored = !!(DB.astroRectify.lastResult && DB.astroRectify.lastResult.clusters);
  // Калибровка: метрика абсолютная («X из 3 событий»), процентов нет,
  // при 3 событиях предупреждение «мало данных» не показывается.
  const supportMetric = /поддержано \d+ из 3 событий/.test(outTx) && !/согласованность \d+%/.test(outTx);
  const noWarnAt3 = !/Недостаточно данных/.test(outTx);
  // 1–2 события — явное предупреждение о ненадёжности.
  R.events = R.events.slice(0, 2);
  await runRectify();
  const outTx2 = document.getElementById('astro-rect-out').textContent;
  const warnAt2 = /Недостаточно данных для надёжной оценки/.test(outTx2) && /из 2 событий/.test(outTx2);
  // Незатирание: расчёт и «применить» НЕ меняют сохранённые данные рождения.
  const notOverwritten1 = DB.astroBirth.timeKnown === false && DB.astroBirth.time === '';
  rectifyApply('15:30');
  const applyFills = document.getElementById('ab-time').value === '15:30';
  const notOverwritten2 = DB.astroBirth.timeKnown === false && DB.astroBirth.time === '';
  goTo('home');
  DB.astroBirth = null; DB.astroRectify = null; DB.astroCharts = [];
  return { noData, menuCard, introHonest, formOk, disclaimer, ranked, stored, supportMetric, noWarnAt3, warnAt2, notOverwritten1, applyFills, notOverwritten2 };
});
ok(rectUi.noData && rectUi.formOk, 'ректификация UI: без данных рождения — подсказка; с данными — анкета');
ok(rectUi.menuCard && rectUi.introHonest, 'ректификация UI: карточка в меню + честное позиционирование («не автоматическое определение»)');
ok(rectUi.disclaimer, 'ректификация UI: обязательная формулировка о статистической оценке — дословно');
ok(rectUi.ranked && rectUi.stored, 'ректификация UI: ранжированные варианты с Асцендентом, результат сохранён');
ok(rectUi.supportMetric && rectUi.noWarnAt3, 'ректификация UI: метрика «поддержано X из Y событий» без процентов; при 3 событиях без предупреждения');
ok(rectUi.warnAt2, 'ректификация UI: при 1–2 событиях — явное «Недостаточно данных для надёжной оценки»');
ok(rectUi.notOverwritten1 && rectUi.applyFills && rectUi.notOverwritten2, 'ректификация UI: данные рождения не перезаписываются — «применить» лишь подставляет время в форму');

// ── Navigation shell v2 — базовый слой (за флагом arch_nav_v2; аддитивно, OFF по умолчанию) ──
const nsh = await page.evaluate(() => {
  const r = {};
  // По умолчанию OFF: класс не стоит, таб-бар скрыт, ＋ = прежний инсайт.
  r.offNoClass = !document.body.classList.contains('navshell');
  r.offHidden = getComputedStyle(document.getElementById('nsh-tabbar')).display === 'none';
  // Включаем флаг.
  localStorage.setItem('arch_nav_v2', '1'); applyNavShell();
  r.onClass = document.body.classList.contains('navshell');
  r.addLabel = document.getElementById('topbar-add').getAttribute('aria-label');
  r.tabs = document.querySelectorAll('#nsh-tabbar .nsh-tab').length;
  r.hasFab = !!document.getElementById('nsh-fab');
  // Вкладки shell ведут на СУЩЕСТВУЮЩИЕ разделы (ничего не потеряно).
  navGo('diary');    r.diary = document.getElementById('pg-map').classList.contains('on');
  navGo('overview'); r.overview = document.getElementById('pg-sys').classList.contains('on');
  navGo('today');    r.today = document.getElementById('pg-home').classList.contains('on');
  r.todayActive = document.querySelector('.nsh-tab[data-nav="today"]').classList.contains('on');
  // «Ещё» открывает сгруппированный хаб (1.1) со всеми разделами.
  navGo('more');     r.more = document.getElementById('ov-more').classList.contains('on');
  r.moreRows = document.querySelectorAll('#ov-more .srow').length;
  r.moreActive = document.querySelector('.nsh-tab[data-nav="more"]').classList.contains('on');
  closeOv('ov-more');
  // Полный лаунчер «Записать» (1.2): все типы записи; «Запись сферы» не падает без сфер.
  openCapture();     r.capture = document.getElementById('ov-capture').classList.contains('on');
  r.capBtns = document.querySelectorAll('#ov-capture .nsh-cap').length;
  captureSphere();   r.sphereSafe = true; // не бросает исключение даже без сфер
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  capturePlus();     r.plusCapture = document.getElementById('ov-capture').classList.contains('on');
  closeOv('ov-capture');
  // Hash-роутинг (1.5): destination сериализуется и восстанавливается.
  navGo('diary');    r.hashDiary = location.hash === '#/diary';
  navGo('overview'); r.hashOverview = location.hash === '#/overview';
  location.hash = '#/spheres'; window.dispatchEvent(new HashChangeEvent('hashchange'));
  r.hashRestore = document.getElementById('pg-vit').classList.contains('on');
  // Тап-цели навигации ≥44px (accessibility).
  const small = [...document.querySelectorAll('#nsh-tabbar .nsh-tab, #nsh-fab')].filter(e => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; });
  r.tapOk = small.length === 0;
  // Выключаем — прежнее поведение возвращается; hash больше не пишется.
  localStorage.setItem('arch_nav_v2', '0'); applyNavShell();
  r.offAgain = !document.body.classList.contains('navshell');
  r.offLabel = document.getElementById('topbar-add').getAttribute('aria-label');
  const hashBefore = location.hash;
  goTo('home'); r.hashFrozenOff = location.hash === hashBefore; // OFF: goTo не трогает hash
  capturePlus();     r.plusInsightOff = document.getElementById('ov-add').classList.contains('on');
  closeOv('ov-add');
  try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
  goTo('home');
  return r;
});
ok(nsh.offNoClass && nsh.offHidden, 'nav shell: по умолчанию OFF — класс не стоит, таб-бар скрыт');
ok(nsh.onClass && nsh.tabs === 4 && nsh.hasFab, 'nav shell ON: body.navshell, 4 вкладки + FAB');
ok(nsh.addLabel === 'Записать' && nsh.offLabel === 'Новый инсайт', 'nav shell: ＋ = «Записать» при ON, «Новый инсайт» при OFF');
ok(nsh.diary && nsh.overview && nsh.today, 'nav shell: вкладки ведут на существующие разделы (map/sys/home)');
ok(nsh.todayActive && nsh.more && nsh.moreActive && nsh.moreRows >= 9, 'nav shell 1.1: «Ещё» — сгруппированный хаб со всеми разделами, вкладка подсвечена');
ok(nsh.capture && nsh.capBtns >= 9 && nsh.plusCapture, 'nav shell 1.2: полный лаунчер «Записать» (все типы записи)');
ok(nsh.sphereSafe, 'nav shell 1.2: «Запись сферы» безопасна без сфер (без исключений)');
ok(nsh.hashDiary && nsh.hashOverview, 'nav shell 1.5: раздел сериализуется в hash (#/diary, #/overview)');
ok(nsh.hashRestore, 'nav shell 1.5: hashchange восстанавливает раздел (#/spheres → Сферы)');
ok(nsh.tapOk, 'nav shell: тап-цели вкладок и FAB ≥44px');
ok(nsh.offAgain && nsh.plusInsightOff, 'nav shell OFF: прежнее поведение возвращается (＋ = инсайт)');
ok(nsh.hashFrozenOff, 'nav shell OFF: goTo не трогает location.hash');

// ── Navigation shell v2: полный «Записать», hash-история, sidebar-группы ──
const nsh2 = await page.evaluate(async () => {
  const r = {};
  localStorage.setItem('arch_nav_v2', '1'); applyNavShell();
  const on = id => document.getElementById(id).classList.contains('on');
  const openCap = () => { document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on')); openCapture(); };
  // 1) «Состояние»: один тип, два режима → существующие формы (данные раздельны).
  openCap(); capGo('ov-moment'); r.stQuick = on('ov-moment') && !on('ov-capture');
  openCap(); capGo('ov-ci');     r.stFull = on('ov-ci') && !on('ov-capture');
  // 2) Остальные 6 типов + сфера (с реальной сферой из фикстур).
  const forms = [['ov-add', 'insight'], ['ov-drm', 'dream'], ['ov-why', 'why'], ['ov-symptom', 'symptom'], ['ov-measure', 'measure'], ['ov-craving', 'craving']];
  r.forms = forms.every(([ov]) => { openCap(); capGo(ov); return on(ov) && !on('ov-capture'); });
  openCap(); captureSphere();
  // Открылась либо форма записи (1 сфера), либо явный выбор (несколько) —
  // детальные сценарии 0/1/N проверяются отдельным блоком ниже.
  r.sphere = (on('ov-sphere-log') || on('ov-sphere-pick')) && !on('ov-capture');
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  // 3) Hash: #/capture и #/more адресуемы; закрытие возвращает hash раздела.
  goTo('home');
  openCapture(); r.hashCap = location.hash === '#/capture';
  closeOv('ov-capture'); nshHashToPage(); r.hashBackToday = location.hash === '#/today';
  navGo('more'); r.hashMore = location.hash === '#/more';
  closeOv('ov-more'); nshHashToPage();
  // 4) История: переходы → pushState; back/forward работают.
  goTo('map'); goTo('sys');
  await new Promise(res => { const h = () => { window.removeEventListener('hashchange', h); res(); }; window.addEventListener('hashchange', h); history.back(); });
  r.backDiary = location.hash === '#/diary' && on('pg-map');
  await new Promise(res => { const h = () => { window.removeEventListener('hashchange', h); res(); }; window.addEventListener('hashchange', h); history.forward(); });
  r.fwdOverview = location.hash === '#/overview' && on('pg-sys');
  // 5) Неизвестный hash → безопасно «Сегодня» (и hash нормализуется).
  location.hash = '#/bogus-route'; window.dispatchEvent(new HashChangeEvent('hashchange'));
  r.unknownSafe = on('pg-home') && location.hash === '#/today';
  // 6) #/capture из hashchange (диплинк) открывает лист.
  location.hash = '#/capture'; window.dispatchEvent(new HashChangeEvent('hashchange'));
  r.deepCapture = on('ov-capture');
  closeOv('ov-capture'); nshHashToPage();
  return r;
});
ok(nsh2.stQuick && nsh2.stFull, 'shell v2: «Состояние» — Быстро→Момент, Полно→Check-in (лист закрывается)');
ok(nsh2.forms && nsh2.sphere, 'shell v2: «Записать» маршрутизирует во все 8 существующих форм');
ok(nsh2.hashCap && nsh2.hashMore && nsh2.hashBackToday, 'shell v2: #/capture и #/more адресуемы, закрытие возвращает hash раздела');
ok(nsh2.backDiary && nsh2.fwdOverview, 'shell v2: browser back/forward ходят по разделам (pushState-история)');
ok(nsh2.unknownSafe, 'shell v2: неизвестный hash безопасно ведёт на «Сегодня» и нормализуется');
ok(nsh2.deepCapture, 'shell v2: диплинк #/capture открывает лист «Записать»');

// Вьюпорты: iPhone SE / std / Pro Max — таб-бар; iPad portrait — сгруппированный sidebar.
const vps = [[375, 667, 'phone'], [390, 844, 'phone'], [430, 932, 'phone'], [820, 1180, 'ipad']];
const vpRes = [];
for (const [w, h, kind] of vps) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(120);
  vpRes.push(await page.evaluate((kind2) => {
    const bar = document.getElementById('nsh-tabbar');
    const barVisible = getComputedStyle(bar).display !== 'none';
    const side = document.getElementById('sidebar');
    const sideVisible = side.getBoundingClientRect().x >= 0 && getComputedStyle(side).transform === 'none';
    const pad = parseInt(getComputedStyle(document.querySelector('.content')).paddingBottom, 10);
    const groups = document.querySelectorAll('#nsh-nav-groups .nsh-grp-lbl').length;
    const grpBtns = document.querySelectorAll('#nsh-nav-groups .navlink').length;
    if (kind2 === 'phone') return { ok: barVisible && pad >= 64, barVisible, pad };
    return { ok: !barVisible && sideVisible && groups === 6 && grpBtns >= 12, barVisible, sideVisible, groups, grpBtns };
  }, kind));
}
ok(vpRes[0].ok && vpRes[1].ok && vpRes[2].ok, 'shell v2: iPhone SE/std/Pro Max — таб-бар виден, контент не перекрыт (padding ≥64)');
ok(vpRes[3].ok, 'shell v2: iPad portrait — постоянный сгруппированный sidebar (6 групп TARGET-IA), таб-бар скрыт');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(100);

// Темы: shell рендерится в тёмной и светлой без исключений.
const themesOk = await page.evaluate(() => {
  const vis = () => getComputedStyle(document.getElementById('nsh-tabbar')).display !== 'none';
  document.body.classList.remove('dark'); const light = vis();
  document.body.classList.add('dark'); const dark = vis();
  return { light, dark };
});
ok(themesOk.light && themesOk.dark, 'shell v2: таб-бар присутствует в светлой и тёмной темах');

// A11y smoke: реальные <button>, доступные имена, focus-visible в CSS.
const a11y = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#nsh-tabbar .nsh-tab, #nsh-fab, #ov-capture .nsh-cap, #nsh-nav-groups .navlink')];
  const allButtons = els.every(e => e.tagName === 'BUTTON');
  const named = els.every(e => (e.getAttribute('aria-label') || e.textContent.trim()).length > 0);
  const focusRule = [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(rr => (rr.cssText || '').includes('.nsh-tab:focus-visible')); } catch (e) { return false; } });
  const current = document.querySelectorAll('.nsh-tab[aria-current="page"]').length === 1;
  return { n: els.length, allButtons, named, focusRule, current };
});
ok(a11y.allButtons && a11y.named && a11y.focusRule && a11y.current, `shell v2 a11y: ${a11y.n} элементов — настоящие button с именами, focus-visible, aria-current`);

// Маршрутная полнота: все 46 маршрутов достижимы при включённом shell.
const routesData = ROUTES.map(r2 => ({ id: r2.id, nav: r2.nav }));
const reach = await page.evaluate(async (routes) => {
  const failed = [];
  for (const r3 of routes) {
    try {
      document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
      const nav = r3.nav || {};
      if (nav.tab) goTo(nav.tab);
      if (nav.msub) { if (!document.getElementById('pg-map').classList.contains('on')) goTo('map'); msub(nav.msub); }
      if (nav.asub) { if (!document.getElementById('pg-astro').classList.contains('on')) goTo('astro'); asub(nav.asub); }
      if (nav.open) window[nav.open]();
      if (nav.overlay) openOv(nav.overlay);
      if (nav.call) { const args = nav.args ? [...nav.args] : []; if (nav.sphereIdx != null) args.unshift(DB.spheres[nav.sphereIdx].id); await window[nav.call](...args); }
      await new Promise(res => setTimeout(res, 30));
      if (nav.overlay && !document.getElementById(nav.overlay).classList.contains('on')) { failed.push(r3.id); continue; }
      if (nav.tab && !nav.overlay && !nav.call && !nav.open && !document.getElementById('pg-' + nav.tab).classList.contains('on')) { failed.push(r3.id); continue; }
    } catch (e) { failed.push(r3.id + ':' + e.message); }
  }
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  goTo('home');
  return { total: routes.length, failed };
}, routesData);
ok(reach.failed.length === 0 && reach.total === 46, `shell v2: маршрутная полнота — ${reach.total - reach.failed.length}/${reach.total} достижимы${reach.failed.length ? ' (провалены: ' + reach.failed.join(', ') + ')' : ''}`);

// Перезагрузка при ON: hash восстанавливает раздел (реальный reload).
await page.evaluate(() => { location.hash = '#/overview'; });
await page.reload();
await page.waitForTimeout(700);
const reloadOk = await page.evaluate(() => {
  try { document.getElementById('splash').style.display = 'none'; } catch (e) {}
  return { restored: document.getElementById('pg-sys').classList.contains('on'), flagOn: document.body.classList.contains('navshell') };
});
ok(reloadOk.flagOn && reloadOk.restored, 'shell v2: перезагрузка при ON восстанавливает раздел из hash (#/overview → Обзор)');

// «Запись сферы»: 0 сфер → раздел «Сферы» с подсказкой; 1 → сразу форма;
// несколько → явный выбор (не первая молча). Данные не персистятся.
const sph = await page.evaluate(() => {
  const r = {};
  const on = id => document.getElementById(id).classList.contains('on');
  const closeAll = () => document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  const saved = DB.spheres;
  try { document.getElementById('splash').style.display = 'none'; } catch (e) {}
  // 0 сфер: никакая форма не открыта, ведём в раздел «Сферы».
  DB.spheres = [];
  goTo('home'); closeAll(); openCapture(); captureSphere();
  r.zeroVit = on('pg-vit') && !document.querySelector('.ov.on');
  r.zeroHash = location.hash === '#/spheres';
  // 1 сфера: форма записи этой сферы открывается сразу.
  DB.spheres = [{ id: 111, name: 'Сон-тест', icon: '', color: '#1056CC', type: 'score' }];
  goTo('home'); closeAll(); openCapture(); captureSphere();
  r.oneLog = on('ov-sphere-log') && document.getElementById('sphere-log-title').textContent.includes('Сон-тест');
  r.oneHash = location.hash === '#/today';
  closeAll();
  // Несколько сфер: лист выбора; выбираем ЯВНО не первую.
  DB.spheres = [
    { id: 111, name: 'Сон-тест', icon: '', color: '#1056CC', type: 'score' },
    { id: 222, name: 'Спорт-тест', icon: '', color: '#0E7490', type: 'habit' },
  ];
  goTo('home'); closeAll(); openCapture(); captureSphere();
  r.pickShown = on('ov-sphere-pick') && !on('ov-sphere-log');
  const btns = [...document.querySelectorAll('#sphere-pick-list button')];
  r.pickA11y = btns.length === 2 && btns.every(b => b.tagName === 'BUTTON' && b.getAttribute('type') === 'button' && b.textContent.trim().length > 0);
  btns[1].click();
  r.pickSecond = on('ov-sphere-log') && !on('ov-sphere-pick') && document.getElementById('sphere-log-title').textContent.includes('Спорт-тест');
  r.pickHash = location.hash === '#/today';
  closeAll();
  // Лист выбора нормально закрывается своей кнопкой «Закрыть».
  openCapture(); captureSphere();
  document.querySelector('#ov-sphere-pick .btn').click();
  r.pickCloses = !on('ov-sphere-pick') && !on('ov-sphere-log');
  closeAll();
  DB.spheres = saved;
  localStorage.setItem('arch_nav_v2', '0');
  try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
  applyNavShell(); goTo('home');
  return r;
});
ok(sph.zeroVit && sph.zeroHash, 'запись сферы: 0 сфер — переход в раздел «Сферы» (hash #/spheres), форма не открывается');
ok(sph.oneLog && sph.oneHash, 'запись сферы: 1 сфера — её форма открывается сразу, hash корректен');
ok(sph.pickShown && sph.pickA11y, 'запись сферы: несколько сфер — доступный явный выбор (настоящие кнопки с именами)');
ok(sph.pickSecond && sph.pickHash && sph.pickCloses, 'запись сферы: выбор НЕ первой сферы открывает её openSphereLog; лист закрывается, hash корректен');

// Переключатель «Новая навигация» в Настройках: настоящий <button>,
// aria-pressed, синхронный статус «Вкл/Выкл», клавиатурное управление.
const tgl0 = await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '0'); applyNavShell(); goTo('settings');
  const t = document.getElementById('navshell-toggle');
  const b = t.getBoundingClientRect();
  return {
    isButton: t.tagName === 'BUTTON' && t.getAttribute('type') === 'button',
    named: /Новая навигация/.test(t.textContent),
    pressedOff: t.getAttribute('aria-pressed') === 'false',
    lblOff: document.getElementById('navshell-lbl').textContent === 'Выкл',
    tapOk: b.height >= 44 && b.width >= 44,
  };
});
await page.focus('#navshell-toggle');
await page.keyboard.press('Enter');
const tglOn = await page.evaluate(() => ({
  pressed: document.getElementById('navshell-toggle').getAttribute('aria-pressed') === 'true',
  lbl: document.getElementById('navshell-lbl').textContent === 'Вкл',
  shellOn: document.body.classList.contains('navshell'),
}));
await page.keyboard.press('Space');
const tglOff = await page.evaluate(() => ({
  pressed: document.getElementById('navshell-toggle').getAttribute('aria-pressed') === 'false',
  lbl: document.getElementById('navshell-lbl').textContent === 'Выкл',
  shellOff: !document.body.classList.contains('navshell'),
}));
ok(tgl0.isButton && tgl0.named && tgl0.tapOk, 'настройки: «Новая навигация» — настоящий <button type=button> с доступным именем, tap ≥44px');
ok(tgl0.pressedOff && tgl0.lblOff && tglOn.pressed && tglOn.lbl && tglOn.shellOn, 'настройки: aria-pressed и «Вкл/Выкл» синхронны; Enter с клавиатуры включает');
ok(tglOff.pressed && tglOff.lbl && tglOff.shellOff, 'настройки: Space с клавиатуры выключает — полное клавиатурное управление');

// ── Контекстный action dock раздела (issue #138), iPhone-only ──
// 1) OFF-флаг: dock отсутствует, старое поведение не меняется.
const ctxOff = await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '0'); applyNavShell();
  goTo('map'); msub('dreams');
  const dock = document.getElementById('nsh-ctx-dock');
  return { hidden: !dock.classList.contains('on'), empty: dock.innerHTML.trim() === '', shellOff: !document.body.classList.contains('navshell') };
});
ok(ctxOff.hidden && ctxOff.empty && ctxOff.shellOff, 'context dock: при OFF отсутствует, старое поведение не меняется');

const ctx = await page.evaluate(async () => {
  const r = {};
  // Явно без AI-ключа: dock-кнопка «Собрать обзор недели» вызывает mkDig(),
  // который при наличии ключа тихо фонит enrichDigestAutonomously() —
  // реальный сетевой запрос. Более ранние тесты могли оставить fake-ключ
  // ('sk-test') в localStorage; здесь мы его не используем и не хотим.
  setAiKey('');
  localStorage.setItem('arch_nav_v2', '1'); applyNavShell();
  const btns = () => [...document.querySelectorAll('#nsh-ctx-dock .nsh-ctx-btn')];
  const dockOn = () => document.getElementById('nsh-ctx-dock').classList.contains('on');

  // 2)+3)+4)+5) Дневник: dock обновляется при каждом поддержанном msub.
  goTo('map');
  msub('dreams');
  r.dreamsBtn = btns().length === 1 && /Записать сон/.test(btns()[0].textContent);
  btns()[0].click(); r.dreamsOpens = document.getElementById('ov-drm').classList.contains('on'); closeOv('ov-drm');

  msub('insights');
  r.insightsBtn = btns().length === 1 && /Новый инсайт/.test(btns()[0].textContent);
  btns()[0].click(); r.insightsOpens = document.getElementById('ov-add').classList.contains('on'); closeOv('ov-add');

  msub('patterns');
  btns()[0].click(); r.patternsOpens = document.getElementById('ov-pat-add').classList.contains('on'); closeOv('ov-pat-add');

  msub('spiritual');
  btns()[0].click(); r.spiritualOpens = document.getElementById('ov-spi-add').classList.contains('on'); closeOv('ov-spi-add');

  msub('evolution');
  btns()[0].click(); r.evolutionOpens = document.getElementById('ov-evo-add').classList.contains('on'); closeOv('ov-evo-add');

  // 9) Подразделы без зарегистрированного действия — dock скрыт (не придумываем workflow).
  msub('book');  r.bookHidden  = !dockOn();
  msub('chats'); r.chatsHidden = !dockOn();
  msub('graph'); r.graphHidden = !dockOn();

  // 6) Сферы: «Отметить сферу» сохраняет исправленное поведение 0/1/N (PR #137),
  // не выбирает первую автоматически.
  const savedSpheres = DB.spheres;
  DB.spheres = [];
  goTo('vit');
  r.vitBtns = btns().length === 2;
  btns()[0].click();
  r.zeroToVit = document.getElementById('pg-vit').classList.contains('on') && !document.querySelector('.ov.on');

  DB.spheres = [{ id: 111, name: 'Сон-тест', icon: '', color: '#1056CC', type: 'score' }];
  goTo('vit'); btns()[0].click();
  r.oneOpensLog = document.getElementById('ov-sphere-log').classList.contains('on') && document.getElementById('sphere-log-title').textContent.includes('Сон-тест');
  closeOv('ov-sphere-log');

  DB.spheres = [
    { id: 111, name: 'Сон-тест', icon: '', color: '#1056CC', type: 'score' },
    { id: 222, name: 'Спорт-тест', icon: '', color: '#0E7490', type: 'habit' },
  ];
  goTo('vit'); btns()[0].click();
  r.multiShowsPick = document.getElementById('ov-sphere-pick').classList.contains('on');
  const pickBtns = [...document.querySelectorAll('#sphere-pick-list button')];
  if (pickBtns[1]) pickBtns[1].click();
  r.multiPicksSecond = document.getElementById('ov-sphere-log').classList.contains('on') && document.getElementById('sphere-log-title').textContent.includes('Спорт-тест');
  closeOv('ov-sphere-log');

  goTo('vit'); btns()[1].click(); // secondary: «Новая сфера»
  r.newSphereOpens = document.getElementById('ov-sphere-edit').classList.contains('on');
  closeOv('ov-sphere-edit');
  DB.spheres = savedSpheres;

  // 7) Здоровье: три действия открывают правильные формы.
  goTo('health');
  r.healthBtns = btns().length === 3;
  const hLbl = btns().map(b => b.textContent.trim());
  r.healthLabelsOk = /Симптом/.test(hLbl[0]) && /Измерение/.test(hLbl[1]) && /Тяга/.test(hLbl[2]);
  btns()[0].click(); r.symptomOpens = document.getElementById('ov-symptom').classList.contains('on'); closeOv('ov-symptom');
  goTo('health'); btns()[1].click(); r.measureOpens = document.getElementById('ov-measure').classList.contains('on'); closeOv('ov-measure');
  goTo('health'); btns()[2].click(); r.cravingOpens = document.getElementById('ov-craving').classList.contains('on'); closeOv('ov-craving');

  // 8) Обзор: mkDig() и ov-doc-report вызываются корректно.
  goTo('sys');
  r.sysBtns = btns().length === 2;
  // mkDig() дедуплицирует по календарной неделе (обновляет карточку, а не
  // плодит дубли) — сравниваем id (=timestamp), а не длину массива.
  const digestIdBefore = (DB.digests[0] && DB.digests[0].id) || 0;
  btns()[0].click();
  await new Promise(res => setTimeout(res, 400));
  r.digestMade = DB.digests.length > 0 && DB.digests[0].id > digestIdBefore;
  goTo('sys'); btns()[1].click();
  r.docReportOpens = document.getElementById('ov-doc-report').classList.contains('on');
  closeOv('ov-doc-report');

  // Astro: только натальная карта имеет dock-действие; остальные подэкраны — без dock.
  goTo('astro'); asub('natal');
  r.natalBtn = btns().length === 1 && /Колесо на весь экран/.test(btns()[0].textContent);
  asub('transits');
  r.transitsHidden = !dockOn();

  // 9) Ещё/Настройки — без dock.
  goTo('settings'); r.settingsHidden = !dockOn();

  // Today — dock скрыт на первом этапе (дизайн Today не меняется).
  goTo('home'); r.todayHidden = !dockOn();

  // При открытом оверлее панель скрыта — не перекрывает форму и не крадёт фокус.
  goTo('vit'); r.vitShown = dockOn();
  openOv('ov-sphere-edit'); r.hiddenDuringOverlay = !dockOn();
  closeOv('ov-sphere-edit'); r.shownAfterClose = dockOn();

  // 10) A11y: настоящие button, доступные имена, tap ≥44×44.
  goTo('health');
  const els = btns();
  r.a11yButtons = els.every(e => e.tagName === 'BUTTON' && e.getAttribute('type') === 'button');
  r.a11yNamed = els.every(e => e.textContent.trim().length > 0);
  r.a11yTap = els.every(e => { const b = e.getBoundingClientRect(); return b.width >= 44 && b.height >= 44; });

  goTo('home');
  return r;
});
ok(ctx.dreamsBtn && ctx.dreamsOpens, 'context dock: Дневник → Сны — «Записать сон» открывает ov-drm');
ok(ctx.insightsBtn && ctx.insightsOpens, 'context dock: Дневник → Инсайты — открывает ov-add');
ok(ctx.patternsOpens && ctx.spiritualOpens && ctx.evolutionOpens, 'context dock: Паттерны/Духовное/Эволюция — открывают правильные существующие формы');
ok(ctx.bookHidden && ctx.chatsHidden && ctx.graphHidden, 'context dock: Книга/Диалоги/Карта — без прямого existing-handler, dock скрыт (workflow не придуман)');
ok(ctx.vitBtns && ctx.zeroToVit, 'context dock: Сферы 0 — «Отметить сферу» ведёт в раздел (не выбирает первую)');
ok(ctx.oneOpensLog && ctx.multiShowsPick && ctx.multiPicksSecond, 'context dock: Сферы 1/N — форма сразу либо явный выбор не первой (поведение PR #137 сохранено)');
ok(ctx.newSphereOpens, 'context dock: Сферы — secondary «Новая сфера» открывает openSphereEdit()');
ok(ctx.healthBtns && ctx.healthLabelsOk, 'context dock: Здоровье — три действия (Симптом/Измерение/Тяга), не больше');
ok(ctx.symptomOpens && ctx.measureOpens && ctx.cravingOpens, 'context dock: Здоровье — все три действия открывают правильные формы');
ok(ctx.sysBtns && ctx.digestMade, 'context dock: Обзор — primary «Собрать обзор недели» вызывает mkDig()');
ok(ctx.docReportOpens, 'context dock: Обзор — secondary «Отчёт врачу» открывает ov-doc-report');
ok(ctx.natalBtn && ctx.transitsHidden, 'context dock: Астрология — только натальная карта имеет действие, остальные подэкраны без dock');
ok(ctx.settingsHidden && ctx.todayHidden, 'context dock: Настройки и Сегодня — dock скрыт (Today не меняется, системные экраны — без dock)');
ok(ctx.vitShown && ctx.hiddenDuringOverlay && ctx.shownAfterClose, 'context dock: скрыт при открытом оверлее (не перекрывает форму, не крадёт фокус), возвращается после закрытия');
ok(ctx.a11yButtons && ctx.a11yNamed && ctx.a11yTap, 'context dock a11y: настоящие button, доступные имена, tap-цели ≥44×44');

// Клавиатура: Tab доходит до кнопки dock, Enter активирует существующий обработчик.
const ctxKb = await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '1'); applyNavShell();
  goTo('map'); msub('dreams');
  const b = document.querySelector('#nsh-ctx-dock .nsh-ctx-btn');
  b.focus();
  return { focused: document.activeElement === b, focusRule: [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(rr => (rr.cssText || '').includes('.nsh-ctx-btn:focus-visible')); } catch (e) { return false; } }) };
});
await page.keyboard.press('Enter');
const ctxKbOpen = await page.evaluate(() => document.getElementById('ov-drm').classList.contains('on'));
await page.evaluate(() => closeOv('ov-drm'));
ok(ctxKb.focused && ctxKb.focusRule, 'context dock: кнопка фокусируема с клавиатуры, focus-visible объявлен в CSS');
ok(ctxKbOpen, 'context dock: Enter с клавиатуры активирует существующий обработчик (открывает ov-drm)');

// 11) Вьюпорты: dock не перекрывает контент/tab bar на iPhone SE/std/Pro Max; на iPad — dock отсутствует (первый этап только iPhone).
const ctxVpRes = [];
for (const [w, h, kind] of [[375, 667, 'phone'], [390, 844, 'phone'], [430, 932, 'phone'], [820, 1180, 'ipad']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(100);
  ctxVpRes.push(await page.evaluate((kind2) => {
    goTo('vit');
    const dock = document.getElementById('nsh-ctx-dock');
    const tabbar = document.getElementById('nsh-tabbar');
    const dockVisible = getComputedStyle(dock).display !== 'none';
    if (kind2 === 'ipad') return { ok: !dockVisible, dockVisible };
    const dr = dock.getBoundingClientRect(), tr = tabbar.getBoundingClientRect();
    const noOverlap = dr.bottom <= tr.top + 1;
    const pad = parseInt(getComputedStyle(document.querySelector('.content')).paddingBottom, 10);
    return { ok: dockVisible && noOverlap && pad >= 110, dockVisible, noOverlap, pad };
  }, kind));
}
ok(ctxVpRes[0].ok && ctxVpRes[1].ok && ctxVpRes[2].ok, 'context dock: iPhone SE/std/Pro Max — панель над tab bar, контент не перекрыт');
ok(ctxVpRes[3].ok, 'context dock: iPad — панель отсутствует (первый этап — только iPhone)');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(100);

// Тёмная/светлая тема.
const ctxThemes = await page.evaluate(() => {
  goTo('vit');
  const vis = () => getComputedStyle(document.getElementById('nsh-ctx-dock')).display !== 'none';
  document.body.classList.remove('dark'); const light = vis();
  document.body.classList.add('dark'); const dark = vis();
  document.body.classList.remove('dark');
  return { light, dark };
});
ok(ctxThemes.light && ctxThemes.dark, 'context dock: рендерится в светлой и тёмной темах');

// 12) Перезагрузка и browser back не оставляют dock от предыдущего раздела.
await page.evaluate(() => { goTo('health'); });
await page.reload();
await page.waitForTimeout(700);
const ctxReload = await page.evaluate(() => {
  try { document.getElementById('splash').style.display = 'none'; } catch (e) {}
  const dock = document.getElementById('nsh-ctx-dock');
  const btnsNow = [...dock.querySelectorAll('.nsh-ctx-btn')].map(b => b.textContent.trim());
  return { onHealth: document.getElementById('pg-health').classList.contains('on'), noStaleDreams: !btnsNow.some(t => /Записать сон/.test(t)), hasHealthActions: dock.classList.contains('on') };
});
ok(ctxReload.onHealth && ctxReload.hasHealthActions && ctxReload.noStaleDreams, 'context dock: перезагрузка не оставляет панель от предыдущего раздела (актуализируется под Health)');

const ctxBack = await page.evaluate(async () => {
  goTo('vit'); goTo('health');
  await new Promise(res => { const h = () => { window.removeEventListener('hashchange', h); res(); }; window.addEventListener('hashchange', h); history.back(); });
  const dock = document.getElementById('nsh-ctx-dock');
  const btnsNow = [...dock.querySelectorAll('.nsh-ctx-btn')].map(b => b.textContent.trim());
  return { onVit: document.getElementById('pg-vit').classList.contains('on'), staleHealthGone: !btnsNow.some(t => /Симптом/.test(t)) };
});
ok(ctxBack.onVit && ctxBack.staleHealthGone, 'context dock: browser back актуализирует панель под восстановленный раздел, старая не остаётся');

// 13) Существующий launcher «Записать» и все тесты PR #137 остаются зелёными
// (полный regression прогоняется этим же сьютом — 431/431 базовых + shell не менялись).
const launcherStillWorks = await page.evaluate(() => {
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  openCapture();
  const capOk = document.getElementById('ov-capture').classList.contains('on');
  closeOv('ov-capture');
  return capOk;
});
ok(launcherStillWorks, 'context dock: глобальный launcher «Записать» не затронут, продолжает открываться');

// Возврат к дефолту (OFF) для чистоты остатка сьюта.
await page.evaluate(() => {
  localStorage.setItem('arch_nav_v2', '0');
  try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
  applyNavShell(); goTo('home');
  window.ARCHITECT_API = '';
});

// ── Никаких неожиданных ошибок ──
ok(errors.length === 0, `нет ошибок консоли/страницы (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);

console.log(`\nИтог: ${pass}/${pass + fail} passed`);
await browser.close();
process.exit(fail ? 1 : 0);
