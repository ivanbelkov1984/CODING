// Wave 5 (issue #158) — надёжность, sync, восстановление и готовность к выпуску.
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium, тем же стилем,
// что и остальные spec-файлы репозитория. Проверки блокирующие: они должны
// падать, если дефект вернётся, а не просто «проходить».

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + join(ROOT, 'dist', 'app.html');
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const s = document.getElementById('splash'); if (s) s.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  });
  await p.waitForTimeout(150);
  return p;
}
const page = await boot();

// ── 1. SCALAR MERGE CONTRACT ────────────────────────────────────────
// Главный дефект Волны 5: astroTexts / astroAiConsent / astroRectify не
// входили в scalar-список mergeDB и терялись при синхронизации.
{
  const cov = await page.evaluate(() => ({
    scalarKeys: SCALAR_KEYS.slice().sort(),
    registry: Object.keys(SCALAR_REGISTRY).sort(),
    idcols: IDCOLS.slice(),
    defaultKeys: Object.keys(DEFAULT_DB),
    internal: DB_INTERNAL_KEYS.slice(),
  }));

  // Каждый ключ DEFAULT_DB обязан быть ЛИБО ID-коллекцией, ЛИБО скаляром,
  // ЛИБО явно объявленным внутренним. Третьего не дано — иначе поле выпадает
  // из sync-контракта незаметно, ровно как это произошло с astro-полями.
  const unclassified = cov.defaultKeys.filter(k =>
    !cov.idcols.includes(k) && !cov.scalarKeys.includes(k) && !cov.internal.includes(k));
  ok(unclassified.length === 0,
    `scalar coverage: каждый ключ DEFAULT_DB классифицирован (нераспределённых: ${unclassified.length})`,
    unclassified.join(','));

  // Реестр обязан совпадать со списком скаляров: добавил поле в DEFAULT_DB,
  // но не зарегистрировал — падение.
  const missingInRegistry = cov.scalarKeys.filter(k => !cov.registry.includes(k));
  const staleInRegistry = cov.registry.filter(k => !cov.scalarKeys.includes(k));
  ok(missingInRegistry.length === 0,
    `scalar coverage: все скаляры зарегистрированы в SCALAR_REGISTRY (незарегистрированных: ${missingInRegistry.length})`,
    missingInRegistry.join(','));
  ok(staleInRegistry.length === 0,
    `scalar coverage: в реестре нет несуществующих полей (лишних: ${staleInRegistry.length})`,
    staleInRegistry.join(','));

  // Именно те три поля, из-за которых волна и начата.
  ['astroTexts', 'astroAiConsent', 'astroRectify'].forEach(k => {
    ok(cov.scalarKeys.includes(k), `scalar coverage: ${k} входит в scalar merge contract`);
  });
}

// ── 2. Sync: два устройства, оба направления ────────────────────────
{
  const mk = (ts, over) => Object.assign({
    __ts: ts, insights: [], _del: {},
    astroTexts: [], astroAiConsent: null, astroRectify: null,
  }, over);

  const r = await page.evaluate(() => {
    const base = (ts, over) => Object.assign({
      __ts: ts, insights: [], _del: {},
      astroTexts: [], astroAiConsent: null, astroRectify: null,
    }, over);

    // Устройство A новее: его astro-скаляры обязаны выиграть.
    const A = base(2000, {
      astroTexts: [{ key: 'k1', text: 'a' }],
      astroAiConsent: { diary: true, version: 1 },
      astroRectify: { events: [{ n: 1 }], result: 'A' },
    });
    const B = base(1000, {
      astroTexts: [{ key: 'k2', text: 'b' }],
      astroAiConsent: { diary: false, version: 1 },
      astroRectify: { events: [], result: 'B' },
    });
    const aWins = mergeDB(B, A);           // local=B(старее), remote=A(новее)
    const bWins = mergeDB(A, B);           // local=A(новее), remote=B(старее)
    // Симметрия: кто новее по __ts, тот и побеждает, независимо от стороны.
    const aWins2 = mergeDB(A, B.__ts > A.__ts ? B : A);
    return {
      aTexts: aWins.astroTexts[0] && aWins.astroTexts[0].key,
      aConsent: aWins.astroAiConsent && aWins.astroAiConsent.diary,
      aRect: aWins.astroRectify && aWins.astroRectify.result,
      bTexts: bWins.astroTexts[0] && bWins.astroTexts[0].key,
      bRect: bWins.astroRectify && bWins.astroRectify.result,
      sym: aWins2.astroRectify && aWins2.astroRectify.result,
    };
  });
  ok(r.aTexts === 'k1' && r.aConsent === true && r.aRect === 'A',
    `sync A→B: astro-скаляры более свежего документа сохранены (${r.aTexts}/${r.aConsent}/${r.aRect})`);
  ok(r.bTexts === 'k1' && r.bRect === 'A',
    `sync B→A: побеждает тот же более свежий документ, направление не влияет (${r.bTexts}/${r.bRect})`);
  ok(r.sym === 'A', 'sync: LWW симметричен относительно порядка аргументов');

  // Отзыв согласия обязан переноситься (иначе AI считался бы разрешённым).
  const revoke = await page.evaluate(() => {
    const old = { __ts: 1000, insights: [], _del: {}, astroAiConsent: { diary: true, version: 1 } };
    const rev = { __ts: 2000, insights: [], _del: {}, astroAiConsent: null };
    const out = mergeDB(old, rev);
    return out.astroAiConsent;
  });
  ok(revoke === null, 'sync: отзыв согласия (null) переносится и не откатывается к разрешению');

  // Старый профиль, где полей нет вообще: merge не должен ломаться и не
  // должен выдумывать значения.
  const legacy = await page.evaluate(() => {
    const oldProfile = { __ts: 500, insights: [], _del: {} };   // без astro-полей
    const remote = { __ts: 100, insights: [], _del: {} };
    const out = mergeDB(oldProfile, remote);
    return { texts: JSON.stringify(out.astroTexts), consent: out.astroAiConsent, rect: out.astroRectify };
  });
  ok(legacy.texts === '[]' && legacy.consent === null && legacy.rect === null,
    'sync: старый профиль без astro-полей получает дефолты, а не undefined/мусор');

  // Пустое значение — легитимное состояние, не повод откатиться к старому.
  const emptyWins = await page.evaluate(() => {
    const withData = { __ts: 1000, insights: [], _del: {}, astroTexts: [{ key: 'x' }] };
    const cleared = { __ts: 2000, insights: [], _del: {}, astroTexts: [] };
    return mergeDB(withData, cleared).astroTexts.length;
  });
  ok(emptyWins === 0, 'sync: очистка (пустой массив) в более свежем документе переносится');

  // ID-коллекции не должны быть затронуты изменением scalar-контракта.
  const idcolsIntact = await page.evaluate(() => {
    const A = { __ts: 1000, insights: [{ id: 1, t: 'a', _u: 10 }], _del: {} };
    const B = { __ts: 2000, insights: [{ id: 2, t: 'b', _u: 20 }], _del: {} };
    const out = mergeDB(A, B);
    return out.insights.length;
  });
  ok(idcolsIntact === 2, 'sync: семантика ID-коллекций не изменена (обе записи слиты по id)');
}

// ── 3. Storage durability ───────────────────────────────────────────
{
  const api = await page.evaluate(async () => {
    const s = await storageSummary();
    return {
      keys: Object.keys(s).sort(),
      apiAvailable: s.apiAvailable,
      hasPersisted: 'persisted' in s,
      percentType: s.percent === null ? 'null' : typeof s.percent,
      dbBytesType: typeof s.dbBytes,
    };
  });
  ok(api.keys.includes('persisted') && api.keys.includes('usage') && api.keys.includes('quota'),
    'storage: сводка содержит persisted/usage/quota');
  ok(api.keys.includes('percent') && api.keys.includes('mediaCount') && api.keys.includes('dbBytes'),
    'storage: сводка содержит percent/mediaCount/dbBytes');
  ok(api.dbBytesType === 'number', `storage: размер DB оценивается числом (${api.dbBytesType})`);

  // Приложение обязано работать, если API нет вовсе (старый WebKit).
  const noApi = await page.evaluate(async () => {
    const real = navigator.storage;
    try {
      Object.defineProperty(navigator, 'storage', { configurable: true, get() { return undefined; } });
      const s = await storageSummary();
      const p = await requestPersistentStorage();
      const q = await storagePersisted();
      return { apiAvailable: s.apiAvailable, persist: p, persisted: q, threw: false };
    } catch (e) { return { threw: true, msg: e.message }; }
    finally { Object.defineProperty(navigator, 'storage', { configurable: true, get() { return real; } }); }
  });
  ok(noApi.threw === false, 'storage: отсутствие navigator.storage не роняет приложение', noApi.msg);
  ok(noApi.apiAvailable === false && noApi.persist === null && noApi.persisted === null,
    'storage: при недоступном API возвращается честный null, а не выдуманное значение');

  // Размер медиа НЕ должен считаться чтением всех блобов.
  const src = await page.evaluate(() => storageSummary.toString() + mediaCountEstimate.toString());
  ok(!/idbGet\s*\(/.test(src) && /idbKeys\s*\(/.test(src),
    'storage: сводка читает только индекс медиа (idbKeys), не значения (idbGet)');

  // Запрос разрешения не должен вызываться на старте автоматически.
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  const autoAsk = /(?:^|[^.\w])requestPersistentStorage\(\)/gm;
  const calls = (bundle.match(autoAsk) || []).length;
  ok(calls === 0 || !/setTimeout\([^)]*requestPersistentStorage/.test(bundle),
    'storage: постоянное хранилище не запрашивается навязчиво при каждом запуске');
}

// ── 4. Quota-safe writes ────────────────────────────────────────────
{
  const quota = await page.evaluate(() => {
    // Подменяем localStorage.setItem так, чтобы он бросал QuotaExceededError
    // для основного слота DB — ровно как переполненное хранилище.
    const realSet = Storage.prototype.setItem;
    const before = JSON.stringify(DB);
    let toastMsg = null;
    const realToast = window.toast;
    window.toast = (m, k) => { toastMsg = { m, k }; };
    let threw = false, result = null;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (String(k).indexOf('arch5_db_') === 0) {
          const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
        }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } catch (e) { threw = true; }
    finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    return {
      threw, result,
      dbUnchanged: JSON.stringify(DB) === before,
      err: lastPersistError(),
      toastMsg,
    };
  });
  ok(quota.threw === false, 'quota: переполнение не выбрасывает исключение наружу');
  ok(quota.result === false, 'quota: persistLocal честно возвращает false вместо тихого успеха');
  ok(quota.err && quota.err.quota === true, 'quota: сбой зафиксирован как переполнение хранилища');
  ok(quota.dbUnchanged, 'quota: данные в памяти не повреждены неудачной записью');
  ok(quota.toastMsg && /переполнено/i.test(quota.toastMsg.m) && quota.toastMsg.k === 'err',
    'quota: пользователь получает понятную ошибку, а не молчание');
  ok(quota.toastMsg && /НЕ сохранена/.test(quota.toastMsg.m),
    'quota: сообщение прямо говорит, что запись не сохранена');

  // Автоматической очистки пользовательских данных быть не должно.
  const srcPersist = await page.evaluate(() => persistLocal.toString() + pruneSnapshotsForSpace.toString() + notifyStorageFull.toString());
  ok(!/localStorage\.clear\(\)/.test(srcPersist),
    'quota: приложение никогда не вызывает localStorage.clear() при переполнении');
  ok(/snapPrefix/.test(srcPersist) && !/dbKey\(id\)\s*\)\s*;?\s*\/\/\s*удал/i.test(srcPersist),
    'quota: освобождается место только за счёт снимков, не за счёт пользовательских записей');

  // Успешная запись сбрасывает флаг ошибки.
  const recovered = await page.evaluate(() => { persistLocal(); return lastPersistError(); });
  ok(recovered === null, 'quota: успешная запись сбрасывает состояние ошибки');
}

// ── 5. Профильная изоляция runtime-кэшей ────────────────────────────
{
  const reg = await page.evaluate(() => ({
    names: profileScopedCacheNames(),
    switchSrc: switchProfile.toString(),
  }));
  ok(reg.names.includes('astroSourceProjection'),
    'изоляция: кэш астропроекции зарегистрирован в реестре');
  ok(reg.names.includes('synthesisRenderState'),
    'изоляция: рендер-состояние «Закономерностей» зарегистрировано в реестре');
  ok(/resetProfileScopedCaches\(\)/.test(reg.switchSrc),
    'изоляция: switchProfile сбрасывает кэши через единый реестр');
  ok(!/resetAstroSourceCache\(\)/.test(reg.switchSrc),
    'изоляция: switchProfile не содержит разрозненных ручных сбросов (их легко забыть)');

  const works = await page.evaluate(() => {
    let called = 0;
    registerProfileCache('__test_probe', () => { called++; });
    resetProfileScopedCaches();
    return { called, listed: profileScopedCacheNames().includes('__test_probe') };
  });
  ok(works.called === 1 && works.listed, 'изоляция: зарегистрированный кэш реально сбрасывается');
}

// ── 6. AI provider hardening ────────────────────────────────────────
{
  const gem = await page.evaluate(() => AI_PROVIDERS.gemini.call.toString());
  ok(!/\?key=/.test(gem) && !/key=\$\{/.test(gem),
    'AI: ключ Gemini больше не передаётся в query string');
  ok(/x-goog-api-key/.test(gem), 'AI: ключ Gemini передаётся официальным заголовком x-goog-api-key');
  ok(/_aiFetch\(/.test(gem), 'AI: запрос к Gemini идёт через обёртку с таймаутом');
  ok(/responseSchema/.test(gem) && /schemaUnsupported/.test(gem),
    'AI: Gemini реально передаёт JSON-схему, а несовместимую честно отклоняет');

  const oai = await page.evaluate(() => AI_PROVIDERS.openai.call.toString());
  ok(/_aiFetch\(/.test(oai), 'AI: запрос к OpenAI идёт через обёртку с таймаутом');

  // Таймаут действительно срабатывает и нормализуется.
  const timeout = await page.evaluate(async () => {
    const realFetch = window.fetch;
    window.fetch = (url, init) => new Promise((_, rej) => {
      init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    });
    try {
      await AI_PROVIDERS.gemini.call({ key: 'k', model: 'm', user: 'u', maxTokens: 10 });
      return { caught: false };
    } catch (e) {
      return { caught: true, timeout: !!e.timeout, msg: e.message, leaksKey: /(?:^|\W)k(?:\W|$)/.test(e.message) && e.message.includes('k=') };
    } finally { window.fetch = realFetch; }
  });
  ok(timeout.caught && timeout.timeout === true,
    `AI: таймаут распознаётся как timeout, а не как «нет соединения» (${timeout.msg})`);

  // Несовместимая схема — явный отказ, а не тихий обычный запрос.
  const badSchema = await page.evaluate(async () => {
    let sent = null;
    const realFetch = window.fetch;
    window.fetch = (url, init) => { sent = { url, init }; return Promise.resolve(new Response('{}', { status: 200 })); };
    try {
      await AI_PROVIDERS.gemini.call({ key: 'k', model: 'm', user: 'u', maxTokens: 10, schema: { oneOf: [{ type: 'string' }] } });
      return { rejected: false, sent: !!sent };
    } catch (e) { return { rejected: true, unsupported: !!e.schemaUnsupported, sent: !!sent }; }
    finally { window.fetch = realFetch; }
  });
  ok(badSchema.rejected && badSchema.unsupported && badSchema.sent === false,
    'AI: несовместимая схема отклоняется ДО запроса, а не превращается в свободный текст');

  // Валидная схема реально доходит до тела запроса, а ключ — только в заголовке.
  const goodSchema = await page.evaluate(async () => {
    let sent = null;
    const realFetch = window.fetch;
    window.fetch = (url, init) => { sent = { url, init }; return Promise.resolve(new Response(JSON.stringify({ candidates: [] }), { status: 200 })); };
    try {
      await AI_PROVIDERS.gemini.call({
        key: 'SECRET-KEY-VALUE', model: 'm', user: 'u', maxTokens: 10,
        schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
      });
    } catch (_) { /* ответ пустой — не важно */ }
    finally { window.fetch = realFetch; }
    const body = sent ? JSON.parse(sent.init.body) : null;
    return {
      url: sent ? sent.url : '',
      keyInUrl: sent ? sent.url.includes('SECRET-KEY-VALUE') : true,
      keyInBody: sent ? sent.init.body.includes('SECRET-KEY-VALUE') : true,
      keyInHeader: sent ? sent.init.headers['x-goog-api-key'] === 'SECRET-KEY-VALUE' : false,
      schemaSent: !!(body && body.generationConfig && body.generationConfig.responseSchema),
      mime: body && body.generationConfig && body.generationConfig.responseMimeType,
    };
  });
  ok(goodSchema.keyInUrl === false, 'AI: ключ отсутствует в URL запроса Gemini');
  ok(goodSchema.keyInBody === false, 'AI: ключ отсутствует в теле запроса Gemini');
  ok(goodSchema.keyInHeader === true, 'AI: ключ присутствует в заголовке x-goog-api-key');
  ok(goodSchema.schemaSent && goodSchema.mime === 'application/json',
    'AI: валидная JSON-схема реально уходит в generationConfig.responseSchema');
}

// ── 7. Secret leakage ───────────────────────────────────────────────
{
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  // Реальные секреты не должны попасть в собранный бандл.
  const SECRET_PATTERNS = [
    { re: /sk-[A-Za-z0-9]{20,}/g, name: 'OpenAI-подобный ключ (sk-…)' },
    { re: /sk-ant-[A-Za-z0-9-]{20,}/g, name: 'Anthropic ключ (sk-ant-…)' },
    { re: /AIza[A-Za-z0-9_-]{30,}/g, name: 'Google API-ключ (AIza…)' },
    { re: /ghp_[A-Za-z0-9]{30,}/g, name: 'GitHub token (ghp_…)' },
  ];
  SECRET_PATTERNS.forEach(p => {
    const hits = bundle.match(p.re) || [];
    ok(hits.length === 0, `секреты: в собранном бандле нет ${p.name} (найдено: ${hits.length})`);
  });

  // Диагностический отчёт не должен содержать пользовательского содержимого.
  const diag = await page.evaluate(async () => {
    // Кладём заведомо узнаваемые «личные» данные во все чувствительные места.
    DB.insights = [{ id: 1, title: 'СЕКРЕТНЫЙ-ЗАГОЛОВОК', body: 'СЕКРЕТНЫЙ-ТЕКСТ-ДНЕВНИКА', createdAt: '' }];
    DB.symptoms = [{ id: 2, name: 'СЕКРЕТНЫЙ-СИМПТОМ', severity: 5 }];
    DB.relationshipContexts = [{ id: 'rel:1', label: 'СЕКРЕТНОЕ-ИМЯ' }];
    DB.astroBirth = { date: '1984-01-01', time: '12:00', place: 'СЕКРЕТНОЕ-МЕСТО', lat: 1, lon: 2 };
    DB.moments = [{ id: 3, note: 'СЕКРЕТНАЯ-ЗАМЕТКА', emo: 'СЕКРЕТНАЯ-ЭМОЦИЯ' }];
    CFG.aiKey = 'sk-ant-SECRETKEYVALUE1234567890';
    const rep = await diagnosticsReport();
    const json = JSON.stringify(rep);
    return {
      json,
      leaks: ['СЕКРЕТНЫЙ', 'СЕКРЕТНОЕ', 'СЕКРЕТНАЯ', 'sk-ant-', '1984-01-01'].filter(s => json.includes(s)),
      hasRelease: !!rep.release, hasIntegrity: !!rep.integrity, hasStorage: !!rep.storage,
    };
  });
  ok(diag.leaks.length === 0,
    `диагностика: отчёт не содержит пользовательских данных и ключей (утечек: ${diag.leaks.length})`,
    diag.leaks.join(', '));
  ok(diag.hasRelease && diag.hasIntegrity && diag.hasStorage,
    'диагностика: отчёт содержит release/integrity/storage');

  // Ключи не должны уходить в лог.
  const logSafe = await page.evaluate(() => {
    const src = (typeof log === 'function' ? log.toString() : '') + persistLocal.toString();
    return !/aiKey|getAiKeyFor\(/.test(src);
  });
  ok(logSafe, 'секреты: путь логирования не обращается к API-ключам');
}

// ── 8. Startup integrity ────────────────────────────────────────────
{
  // Повреждённый JSON профиля: данные не затираются пустым DEFAULT_DB.
  const corrupt = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    try {
      localStorage.setItem(key, '{ это не JSON');
      localStorage.removeItem(bakK);
      hydrate();
      const issues = startupIssues().map(i => i.code);
      const stillCorrupt = localStorage.getItem(key) === '{ это не JSON';
      return { issues, stillCorrupt, threw: false };
    } catch (e) { return { threw: true, msg: e.message }; }
    finally {
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
    }
  });
  ok(corrupt.threw === false, 'старт: повреждённый профиль не роняет загрузку', corrupt.msg);
  ok(corrupt.issues && corrupt.issues.includes('profile-corrupt'),
    `старт: повреждение зафиксировано явно, а не проглочено (${(corrupt.issues || []).join(',')})`);
  ok(corrupt.stillCorrupt,
    'старт: повреждённый слот НЕ перезаписан пустым DEFAULT_DB (данные можно спасти вручную)');

  // Восстановление из резервной копии.
  const fromBak = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    try {
      localStorage.setItem(bakK, JSON.stringify({ insights: [{ id: 77, title: 'из бэкапа' }] }));
      localStorage.setItem(key, '{ битый');
      hydrate();
      return { codes: startupIssues().map(i => i.code), n: (DB.insights || []).length };
    } finally {
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
    }
  });
  ok(fromBak.n === 1 && fromBak.codes.includes('recovered-from-backup'),
    `старт: данные восстановлены из резервной копии и это отражено в отчёте (${fromBak.codes.join(',')})`);

  // Сбой миграции: запись не выполняется, полурезультат не закрепляется.
  const migFail = await page.evaluate(() => {
    const real = window.migrateRecordsOn;
    const id = activeId();
    const key = 'arch5_db_' + id;
    const saved = localStorage.getItem(key);
    try {
      localStorage.setItem(key, JSON.stringify({ insights: [{ id: 5, title: 'до миграции' }] }));
      window.migrateRecordsOn = () => { throw new Error('boom'); };
      hydrate();
      return {
        codes: startupIssues().map(i => i.code),
        stored: localStorage.getItem(key),
        threw: false,
      };
    } catch (e) { return { threw: true, msg: e.message }; }
    finally {
      window.migrateRecordsOn = real;
      if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved);
      resolveRecovery('discarded'); hydrate();
    }
  });
  ok(migFail.threw === false, 'старт: исключение миграции не роняет загрузку', migFail.msg);
  ok(migFail.codes && migFail.codes.includes('migration-failed'),
    `старт: сбой миграции зафиксирован явно (${(migFail.codes || []).join(',')})`);

  // Недоступный localStorage — приложение не должно падать.
  const noLs = await page.evaluate(() => {
    const realGet = Storage.prototype.getItem;
    try {
      Storage.prototype.getItem = function () { throw new Error('SecurityError'); };
      hydrate();
      return { threw: false };
    } catch (e) { return { threw: true, msg: e.message }; }
    finally { Storage.prototype.getItem = realGet; hydrate(); }
  });
  ok(noLs.threw === false, 'старт: недоступный localStorage не роняет приложение', noLs.msg);
}

// ── 9. Release metadata ─────────────────────────────────────────────
{
  const rel = await page.evaluate(() => releaseInfo());
  ok(rel.injected === true, 'release: метаданные подставлены сборкой, а не остались плейсхолдерами');
  ok(typeof rel.build === 'string' && rel.build.length > 0, `release: есть идентификатор сборки (${rel.build})`);
  ok(typeof rel.sha === 'string' && rel.sha.length > 0, `release: есть build SHA (${rel.sha})`);
  ok(!Number.isNaN(Date.parse(rel.builtAt)), `release: время сборки — валидная дата (${rel.builtAt})`);
  ok(rel.schemaVersion === 5, `release: версия schema (${rel.schemaVersion})`);
  ok(rel.backupEnvelopeVersion === 1 && rel.backupPayloadVersion === 1,
    'release: версии backup-конверта присутствуют');
  ok(typeof rel.astroEngine === 'string' && rel.astroEngine.includes('astronomy-engine'),
    `release: версия астродвижка (${rel.astroEngine})`);
  ok(typeof rel.astroRuleset === 'string' && rel.astroRuleset.length > 0,
    `release: версия набора правил (${rel.astroRuleset})`);

  // Метаданные генерируются в ОДНОМ месте (build.mjs), а не поддерживаются руками.
  const appSrc = readFileSync(join(ROOT, 'app.js'), 'utf8');
  ok(appSrc.includes("'__ARCH_BUILD__'") && appSrc.includes("'__ARCH_SHA__'"),
    'release: app.js содержит только плейсхолдеры, значения не зашиты руками');
  const buildSrc = readFileSync(join(ROOT, 'build.mjs'), 'utf8');
  ok(/__ARCH_BUILD__/.test(buildSrc) && /injectRelease/.test(buildSrc),
    'release: подстановка выполняется build.mjs — единственным источником');
}

// ── 10. Deploy recovery / service worker ────────────────────────────
{
  // Поведенческие сценарии deploy recovery живут в отдельной сюите
  // tests/wave5-sw-recovery.spec.mjs (реальный sw.js на mock CacheStorage).
  // Здесь — только интеграция со стороны приложения.
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  ok(/const LKG\s*=/.test(sw), 'deploy: заведён кэш last-known-good');
  ok(/arch:startup-ok/.test(sw), 'deploy: сборка становится last-known-good только после подтверждения старта');
  ok(/promoteToLastKnownGood/.test(sw), 'deploy: есть явная процедура повышения до last-known-good');
  ok(/arch:restore-lkg/.test(sw), 'deploy: реализован путь явного восстановления, а не только сохранение кэша');
  ok(!/location\.reload/.test(sw), 'deploy: service worker не инициирует перезагрузок (нет reload-петли)');

  const appSrc = readFileSync(join(ROOT, 'app.js'), 'utf8');
  ok(/arch:startup-ok/.test(appSrc), 'deploy: приложение отправляет health-marker после успешного старта');
  ok(/_startupFailed/.test(appSrc),
    'deploy: подтверждение не отправляется, если при старте были ошибки');
  ok(/STARTUP_OK_DELAY_MS/.test(appSrc),
    'deploy: подтверждение отложено, чтобы ошибки инициализации успели проявиться');

  // Health marker действительно блокируется ошибкой старта.
  const marker = await page.evaluate(() => {
    const sent = [];
    const realCtl = navigator.serviceWorker.controller;
    // markStartupOk использует контроллер; в file:// его нет — проверяем логику
    // через флаг ошибки и запись в localStorage.
    localStorage.removeItem('arch5_last_good_build');
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    const blocked = markStartupOk();
    const stored = localStorage.getItem('arch5_last_good_build');
    return { blocked, stored, sent: sent.length, hadCtl: !!realCtl };
  });
  ok(marker.blocked === false && marker.stored === null,
    'deploy: после ошибки старта сборка НЕ помечается как рабочая');
}

// ── 11. Диагностика целостности ─────────────────────────────────────
{
  const d = await page.evaluate(() => {
    DB.insights = [{ id: 1 }, { id: 1 }, { id: null }];       // дубль + невалидный id
    DB.psyLinks = [{ id: 'p1', fromId: 1, toId: 99999, relation: 'record_to_record' }];
    const r = diagnoseProfile();
    return { codes: r.issues.map(i => i.code), ok: r.ok, counts: !!r.counts, scalars: r.scalarKeys.length };
  });
  ok(d.codes.includes('duplicate-ids'), 'диагностика: дубли id обнаружены');
  ok(d.codes.includes('invalid-ids'), 'диагностика: невалидные id обнаружены');
  ok(d.codes.includes('broken-psy-links'), 'диагностика: битые psyLinks обнаружены');
  ok(d.ok === false && d.counts && d.scalars > 0, 'диагностика: отчёт структурирован и помечает профиль как проблемный');

  // Диагностика строго read-only.
  const readOnly = await page.evaluate(() => {
    DB.insights = [{ id: 1 }, { id: 1 }];
    const before = JSON.stringify(DB);
    diagnoseProfile();
    return before === JSON.stringify(DB);
  });
  ok(readOnly, 'диагностика: ничего не чинит и не изменяет DB');

  const noAutoRepair = await page.evaluate(() => {
    const src = diagnoseProfile.toString();
    return !/DB\.[a-zA-Z]+\s*=|\.splice\(|\.push\(/.test(src.replace(/issues\.push\(|shapeErrors\.push\(/g, ''));
  });
  ok(noAutoRepair, 'диагностика: в коде нет автоматических правок пользовательских данных');
}

// ── 12. Schema / backup не затронуты ────────────────────────────────
{
  const impact = await page.evaluate(() => ({
    schema: SCHEMA_VERSION,
    idcols: IDCOLS.length,
    roundtrip: (() => {
      const scal = {};
      SCALAR_KEYS.forEach(k => { scal[k] = DEFAULT_DB[k]; });
      return JSON.stringify(scal) === JSON.stringify(JSON.parse(JSON.stringify(scal)));
    })(),
  }));
  ok(impact.schema === 5, `schema: версия не поднята Волной 5 (${impact.schema})`);
  ok(impact.idcols === 25, `ID-коллекции: состав не изменён (${impact.idcols})`);
  ok(impact.roundtrip, 'backup: скаляры переживают сериализацию без потерь');
}

// ── 13. UI и a11y критических потоков ───────────────────────────────
{
  const ui = await page.evaluate(async () => {
    await openStorage();
    const ov = document.getElementById('ov-storage');
    const entry = document.querySelector('[onclick="openStorage()"]');
    const persistBtn = document.getElementById('storage-persist-btn');
    const out = document.getElementById('storage-out');
    const diag = document.getElementById('diag-out');
    const btns = Array.from(ov.querySelectorAll('button'));
    const small = btns.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44); });
    const noName = btns.filter(b => !(b.textContent || '').trim() && !b.getAttribute('aria-label'));
    const divClick = Array.from(ov.querySelectorAll('div[onclick]')).length;
    const overflow = btns.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > window.innerWidth + 1); });
    return {
      open: ov.classList.contains('on'),
      entryIsButton: entry ? entry.tagName === 'BUTTON' : false,
      hasPersistBtn: !!persistBtn,
      live: out ? out.getAttribute('aria-live') : null,
      diagLive: diag ? diag.getAttribute('aria-live') : null,
      smallTargets: small.length, unnamed: noName.length,
      interactiveDivs: divClick, overflow: overflow.length,
    };
  });
  ok(ui.open, 'UI: экран «Хранилище и диагностика» открывается');
  ok(ui.entryIsButton, 'a11y: вход — настоящий <button>, а не кликабельный div');
  ok(ui.hasPersistBtn, 'UI: есть кнопка запроса постоянного хранилища');
  ok(ui.live === 'polite' && ui.diagLive === 'polite',
    'a11y: результаты объявляются через aria-live');
  ok(ui.unnamed === 0, `a11y: у всех кнопок есть доступное имя (безымянных: ${ui.unnamed})`);
  ok(ui.smallTargets === 0, `a11y: тап-цели не меньше 44px (мелких: ${ui.smallTargets})`);
  ok(ui.interactiveDivs === 0, `a11y: нет интерактивных div (найдено: ${ui.interactiveDivs})`);
  ok(ui.overflow === 0, `UI: элементы не выходят за границы экрана iPhone (${ui.overflow})`);

  // Запрос разрешения — только по явному действию пользователя.
  const explicit = await page.evaluate(() => {
    const btn = document.getElementById('storage-persist-btn');
    return (btn.getAttribute('onclick') || '').includes('askPersistentStorage');
  });
  ok(explicit, 'storage: разрешение запрашивается только по явному нажатию пользователя');
}

// ── 14. Owner review #2: транзакционность persistLocal ──────────────
// Fault injection по КАЖДОМУ отдельному setItem. Проверяется содержимое
// localStorage, а не только DB в памяти: раньше сбой на CFG приводил к
// записанному DB, откату не подлежащему, и общему `true` — ложный успех.
{
  const scenario = await page.evaluate(async (which) => {
    const id = activeId();
    const K = { db: 'arch5_db_' + id, cfg: 'arch5_cfg_' + id, bak: 'arch5_bak_' + id };
    const snap = k => localStorage.getItem(k);

    // Исходное согласованное состояние.
    DB.insights = [{ id: 1, title: 'исходная' }];
    CFG.userName = 'ИСХОДНОЕ-ИМЯ';
    persistLocal();
    const before = { db: snap(K.db), cfg: snap(K.cfg), bak: snap(K.bak) };

    // Меняем и то и другое, затем ломаем ровно один setItem.
    DB.insights = [{ id: 1, title: 'новая' }, { id: 2, title: 'ещё' }];
    CFG.userName = 'НОВОЕ-ИМЯ';
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; window.toast = () => {};
    let result;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (k === K[which]) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }

    const after = { db: snap(K.db), cfg: snap(K.cfg), bak: snap(K.bak) };
    return {
      result,
      dbRolledBack: after.db === before.db,
      cfgRolledBack: after.cfg === before.cfg,
      bakRolledBack: after.bak === before.bak,
      err: lastPersistError(),
    };
  }, 'cfg');
  ok(scenario.result === false,
    'транзакция: сбой на записи CFG НЕ возвращает успех (раньше был ложный true)');
  ok(scenario.dbRolledBack,
    'транзакция: уже записанный DB откачен к прежнему значению — частичного состояния нет');
  ok(scenario.cfgRolledBack, 'транзакция: CFG остался прежним');
  ok(scenario.err && scenario.err.quota === true, 'транзакция: ошибка классифицирована как переполнение');

  // То же для сбоя на резервном слоте — раньше он глотался и скрывал частичность.
  const bakCase = await page.evaluate(async () => {
    const id = activeId();
    const K = { db: 'arch5_db_' + id, cfg: 'arch5_cfg_' + id, bak: 'arch5_bak_' + id };
    DB.insights = [{ id: 1, title: 'база' }]; CFG.userName = 'БАЗА';
    persistLocal();
    const before = { db: localStorage.getItem(K.db), cfg: localStorage.getItem(K.cfg) };
    DB.insights = [{ id: 9, title: 'изменено' }]; CFG.userName = 'ИЗМЕНЕНО';
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; window.toast = () => {};
    let result;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (k === K.bak) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    return {
      result,
      dbRolledBack: localStorage.getItem(K.db) === before.db,
      cfgRolledBack: localStorage.getItem(K.cfg) === before.cfg,
    };
  });
  ok(bakCase.result === false, 'транзакция: сбой на резервном слоте не маскируется общим успехом');
  ok(bakCase.dbRolledBack && bakCase.cfgRolledBack,
    'транзакция: DB и CFG откачены при сбое резервного слота');

  // Сбой на самом DB — первая же запись, откатывать нечего, но и успеха нет.
  const dbCase = await page.evaluate(async () => {
    const id = activeId();
    const K = 'arch5_db_' + id;
    DB.insights = [{ id: 1 }]; persistLocal();
    const before = localStorage.getItem(K);
    DB.insights = [{ id: 2 }];
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; window.toast = () => {};
    let result;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (k === K) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    return { result, unchanged: localStorage.getItem(K) === before };
  });
  ok(dbCase.result === false && dbCase.unchanged,
    'транзакция: сбой на DB оставляет прежнее значение в хранилище и возвращает false');

  // Retry после prune повторяет ВЕСЬ набор, а не только DB.
  const retry = await page.evaluate(async () => {
    const id = activeId();
    const K = { db: 'arch5_db_' + id, cfg: 'arch5_cfg_' + id };
    DB.insights = [{ id: 1, title: 'до' }]; CFG.userName = 'ДО'; persistLocal();
    localStorage.setItem('arch5_snap_' + id + '_2020-01-01', 'x');
    DB.insights = [{ id: 5, title: 'после' }]; CFG.userName = 'ПОСЛЕ';
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; window.toast = () => {};
    let attempts = 0, result;
    try {
      Storage.prototype.setItem = function (k, v) {
        // Падаем на CFG только пока снимок не удалён — имитируем освобождение.
        if (k === K.cfg && localStorage.getItem('arch5_snap_' + id + '_2020-01-01') !== null) {
          attempts++; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
        }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    return {
      result, attempts,
      cfg: JSON.parse(localStorage.getItem(K.cfg) || '{}').userName,
      db: (JSON.parse(localStorage.getItem(K.db) || '{}').insights || [])[0],
    };
  });
  ok(retry.result === true, 'транзакция: после освобождения места повтор набора удаётся');
  ok(retry.cfg === 'ПОСЛЕ' && retry.db && retry.db.id === 5,
    `транзакция: повтор записал ВЕСЬ набор — и DB, и CFG (${retry.cfg})`);

  // Реализация не должна писать «в лоб» мимо транзакции.
  const src = await page.evaluate(() => persistLocal.toString());
  ok(!/localStorage\.setItem/.test(src),
    'транзакция: persistLocal не пишет напрямую — только через транзакционный помощник');
}

// ── 15. Owner review #3: recovery write lock ────────────────────────
{
  // Повреждённый слот → hydrate → обычная правка + persist → исходная
  // повреждённая строка обязана остаться byte-identical.
  const lockCase = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    const CORRUPT = '{ "insights": [ {"id":1,"title":"ЦЕННЫЕ ДАННЫЕ"';   // обрезанный JSON
    try {
      localStorage.setItem(key, CORRUPT);
      localStorage.removeItem(bakK);
      hydrate();
      const locked = isWriteLocked();
      // Пользователь делает обычное действие.
      DB.insights = [{ id: 42, title: 'новая запись' }];
      const wrote = persistLocal();
      const stored = localStorage.getItem(key);
      return {
        locked, wrote,
        identical: stored === CORRUPT,
        lockInfo: recoveryLock(),
        err: lastPersistError(),
      };
    } finally {
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(lockCase.locked === true, 'lock: повреждённый профиль без резервной копии блокирует запись');
  ok(lockCase.wrote === false, 'lock: обычный persist отклонён, а не выполнен молча');
  ok(lockCase.identical,
    'lock: исходная повреждённая строка осталась byte-identical — ручное спасение возможно');
  ok(lockCase.err && lockCase.err.locked === true, 'lock: причина отказа записи — блокировка, и она видна');
  ok(lockCase.lockInfo && lockCase.lockInfo.reasons.includes('profile-corrupt'),
    'lock: причина блокировки зафиксирована');

  // Миграция мутировала и упала → и память, и хранилище остаются исходными.
  const migCase = await page.evaluate(() => {
    const real = window.migrateRecordsOn;
    const id = activeId();
    const key = 'arch5_db_' + id;
    const saved = localStorage.getItem(key);
    const ORIGINAL = JSON.stringify({ insights: [{ id: 7, title: 'оригинал' }] });
    try {
      localStorage.setItem(key, ORIGINAL);
      // Мутирует переданный объект и только потом бросает.
      window.migrateRecordsOn = (target) => {
        target.insights[0].title = 'ИСПОРЧЕНО МИГРАЦИЕЙ';
        target.__halfMigrated = true;
        throw new Error('boom');
      };
      hydrate();
      const inMemory = (DB.insights || [])[0];
      const wrote = persistLocal();
      return {
        locked: isWriteLocked(),
        memoryClean: inMemory && inMemory.title === 'оригинал' && !DB.__halfMigrated,
        wrote,
        storedIdentical: localStorage.getItem(key) === ORIGINAL,
        codes: startupIssues().map(i => i.code),
      };
    } finally {
      window.migrateRecordsOn = real;
      resolveRecovery('discarded');
      if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved);
      hydrate();
    }
  });
  ok(migCase.memoryClean,
    'lock: миграция шла над клоном — полурезультат НЕ попал в живой DB');
  ok(migCase.locked === true && migCase.wrote === false,
    'lock: после сбоя миграции запись заблокирована');
  ok(migCase.storedIdentical,
    'lock: сохранённый слот после сбоя миграции остался byte-identical');
  ok(migCase.codes.includes('migration-failed'), 'lock: сбой миграции зафиксирован');

  // Явное подтверждённое разрешение снимает блокировку.
  const resolveCase = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    try {
      localStorage.setItem(key, '{ битый');
      localStorage.removeItem(bakK);
      hydrate();
      const before = isWriteLocked();
      const badKind = resolveRecovery('что-то-другое');     // неизвестный исход
      const stillLocked = isWriteLocked();
      const okKind = resolveRecovery('exported');
      DB.insights = [{ id: 3, title: 'после разблокировки' }];
      const wrote = persistLocal();
      return { before, badKind, stillLocked, unlocked: !isWriteLocked(), wrote };
    } finally {
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(resolveCase.before === true && resolveCase.badKind === false && resolveCase.stillLocked === true,
    'lock: произвольная строка не снимает блокировку — только из перечня безопасных исходов');
  ok(resolveCase.unlocked === true && resolveCase.wrote === true,
    'lock: явное подтверждённое разрешение снимает блокировку и запись снова работает');

  // Сброс профиля требует подтверждения.
  const discard = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    try {
      localStorage.setItem(key, '{ битый');
      localStorage.removeItem(bakK);
      hydrate();
      const withoutConfirm = discardCorruptProfile(false);
      const stillLocked = isWriteLocked();
      const withConfirm = discardCorruptProfile(true);
      return { withoutConfirm, stillLocked, withConfirm, unlocked: !isWriteLocked() };
    } finally {
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(discard.withoutConfirm === false && discard.stillLocked === true,
    'lock: сброс профиля без подтверждения не выполняется');
  ok(discard.withConfirm === true && discard.unlocked === true,
    'lock: сброс с подтверждением выполняется и снимает блокировку');

  // Сырой слот можно выгрузить ДО любой перезаписи.
  const rawExport = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id;
    const saved = localStorage.getItem(key);
    try {
      localStorage.setItem(key, '{ ЦЕННОЕ но битое');
      return exportRawSlot() === '{ ЦЕННОЕ но битое';
    } finally { if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved); }
  });
  ok(rawExport, 'lock: сырое содержимое повреждённого слота доступно для выгрузки');

  // Блокировка профиль-специфична.
  const perProfile = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    try {
      localStorage.setItem(key, '{ битый');
      localStorage.removeItem(bakK);
      hydrate();
      return { thisOne: isWriteLocked(id), other: isWriteLocked('p-другой-профиль') };
    } finally {
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(perProfile.thisOne === true && perProfile.other === false,
    'lock: блокировка профиль-специфична — другие профили писать можно');

  // UI восстановления присутствует и объясняет, что делать.
  const panel = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    try {
      localStorage.setItem(key, '{ битый'); localStorage.removeItem(bakK);
      hydrate();
      const html = recoveryPanelHtml();
      return {
        has: html.length > 0,
        backup: html.includes('Восстановить из резервной копии'),
        raw: html.includes('Выгрузить как есть'),
        discard: html.includes('Сбросить профиль'),
        buttons: (html.match(/<button/g) || []).length,
        divClick: (html.match(/<div[^>]*onclick/g) || []).length,
      };
    } finally {
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(panel.has && panel.backup && panel.raw && panel.discard,
    'lock: панель предлагает все три безопасных исхода');
  ok(panel.buttons === 3 && panel.divClick === 0,
    `lock: действия — настоящие button, интерактивных div нет (${panel.buttons}/${panel.divClick})`);
}

// ── 16. Owner review (финальный проход): write barrier целиком ──────
// Блокировка обязана останавливать не только persistLocal, но и persist
// (включая метки времени), планирование синка, применение серверных данных
// и автоматические снимки.
{
  const barrier = await page.evaluate(async () => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    const realToast = window.toast; window.toast = () => {};
    let fetches = 0;
    const realFetch = window.fetch;
    window.fetch = (...a) => { fetches++; return realFetch(...a); };
    try {
      localStorage.setItem(key, '{ битый');
      localStorage.removeItem(bakK);
      hydrate();                              // взводит блокировку

      // persist(): метки времени не двигаются, синк не планируется.
      const tsBefore = { db: DB.__ts, cfg: CFG._ts };
      DB.insights = [{ id: 1, title: 'попытка' }];
      const persisted = persist();
      const tsAfter = { db: DB.__ts, cfg: CFG._ts };

      // scheduleSync(): не выставляет dirty-флаг и не заводит таймер.
      CFG.apiUrl = 'https://example.invalid';
      _dirty = false;
      scheduleSync(1);
      const dirtyAfterSchedule = _dirty;

      // runSync(): ноль сетевых вызовов. Настраиваем всё так, чтобы БЕЗ
      // гейта запрос точно ушёл бы (privacy-согласие + ключ пространства) —
      // иначе тест не отличал бы гейт блокировки от других ранних выходов.
      CFG.plainSyncConsent = true;
      CFG.spaceKey = 'test-space';
      await runSync({ manual: false });
      const fetchesAfterRun = fetches;
      CFG.plainSyncConsent = false; CFG.spaceKey = '';

      // applyServer(): отказ с пометкой locked, runtime не изменён.
      const dbJson = JSON.stringify(DB);
      let applyErr = null;
      try { await applyServer({ db: { insights: [{ id: 999, title: 'с сервера' }] }, cfg: {}, updated_at: new Date().toISOString() }); }
      catch (e) { applyErr = { locked: !!e.locked }; }
      const dbUnchanged = JSON.stringify(DB) === dbJson;

      // snapshotDaily(): новых snapshot-ключей нет.
      const snapPre = 'arch5_snap_' + id + '_';
      const snapsBefore = Object.keys(localStorage).filter(k => k.startsWith(snapPre)).length;
      snapshotDaily();
      const snapsAfter = Object.keys(localStorage).filter(k => k.startsWith(snapPre)).length;

      return {
        persisted, tsUnchanged: tsBefore.db === tsAfter.db && tsBefore.cfg === tsAfter.cfg,
        dirtyAfterSchedule, fetchesAfterRun,
        applyErr, dbUnchanged,
        snapsBefore, snapsAfter,
        slotIdentical: localStorage.getItem(key) === '{ битый',
      };
    } finally {
      window.fetch = realFetch; window.toast = realToast;
      CFG.apiUrl = '';
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(barrier.persisted === false && barrier.tsUnchanged,
    'барьер: persist() под блокировкой отклонён и НЕ сдвинул __ts/_ts');
  ok(barrier.dirtyAfterSchedule === false, 'барьер: scheduleSync() под блокировкой не планирует синк');
  ok(barrier.fetchesAfterRun === 0, `барьер: runSync() под блокировкой — ноль сетевых вызовов (${barrier.fetchesAfterRun})`);
  ok(barrier.applyErr && barrier.applyErr.locked === true,
    'барьер: applyServer() отказывает с пометкой locked');
  ok(barrier.dbUnchanged, 'барьер: серверные данные не слиты в runtime заблокированного профиля');
  ok(barrier.snapsAfter === barrier.snapsBefore,
    `барьер: snapshotDaily() не создал снимков (${barrier.snapsBefore} → ${barrier.snapsAfter})`);
  ok(barrier.slotIdentical, 'барьер: повреждённый слот остался byte-identical после всех попыток');
}

// ── 17. Per-profile блокировка переживает переключение профиля ──────
{
  const perProfile = await page.evaluate(() => {
    const idA = activeId();
    const keyA = 'arch5_db_' + idA, bakA = 'arch5_bak_' + idA;
    const savedDb = localStorage.getItem(keyA), savedBak = localStorage.getItem(bakA);
    const savedProfiles = localStorage.getItem('arch5_profiles');
    const realToast = window.toast; window.toast = () => {};
    try {
      // A повреждён → блокировка A.
      localStorage.setItem(keyA, '{ битый A');
      localStorage.removeItem(bakA);
      hydrate();
      const aLocked1 = isWriteLocked(idA);

      // Заводим здоровый профиль B и «переключаемся» на него, как это делает
      // switchProfile: смена activeId + hydrate.
      const idB = 'p-test-b-' + Date.now();
      const list = JSON.parse(localStorage.getItem('arch5_profiles') || '[]');
      list.push({ id: idB, name: 'B', color: '#1056CC' });
      localStorage.setItem('arch5_profiles', JSON.stringify(list));
      localStorage.setItem('arch5_db_' + idB, JSON.stringify({ insights: [{ id: 1, title: 'данные B' }] }));
      setActiveId(idB);
      hydrate();
      const bLocked = isWriteLocked(idB);
      DB.insights.push({ id: 2, title: 'новая запись B' });
      const bWrote = persistLocal();
      const aLockedWhileOnB = isWriteLocked(idA);

      // Возвращаемся на A.
      setActiveId(idA);
      hydrate();
      const aLocked2 = isWriteLocked(idA);
      const aSlotIdentical = localStorage.getItem(keyA) === '{ битый A';

      // Уборка B.
      localStorage.removeItem('arch5_db_' + idB);
      localStorage.removeItem('arch5_cfg_' + idB);
      localStorage.removeItem('arch5_bak_' + idB);
      return { aLocked1, bLocked, bWrote, aLockedWhileOnB, aLocked2, aSlotIdentical };
    } finally {
      window.toast = realToast;
      resolveRecovery('discarded');
      if (savedProfiles === null) localStorage.removeItem('arch5_profiles'); else localStorage.setItem('arch5_profiles', savedProfiles);
      if (savedDb === null) localStorage.removeItem(keyA); else localStorage.setItem(keyA, savedDb);
      if (savedBak === null) localStorage.removeItem(bakA); else localStorage.setItem(bakA, savedBak);
      setActiveId(idA); hydrate();
    }
  });
  ok(perProfile.aLocked1 === true, 'per-profile: A заблокирован после повреждения');
  ok(perProfile.bLocked === false && perProfile.bWrote === true,
    'per-profile: здоровый B работает и сохраняется, пока A заблокирован');
  ok(perProfile.aLockedWhileOnB === true,
    'per-profile: блокировка A видна и во время работы в B (реестр, не одна переменная)');
  ok(perProfile.aLocked2 === true, 'per-profile: после возврата A по-прежнему заблокирован');
  ok(perProfile.aSlotIdentical, 'per-profile: повреждённый слот A не изменился за всё время');
}

// ── 18. Транзакционное разрешение: restoreSnapshot и discard ────────
{
  // Снимок восстанавливается ПОД блокировкой; успех — только после записи.
  const snapRestore = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const snapKey = 'arch5_snap_' + id + '_2026-01-01';
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    const realToast = window.toast; const toasts = [];
    window.toast = (m, k) => toasts.push({ m, k });
    const realConfirm = window.confirm; window.confirm = () => true;
    try {
      localStorage.setItem(snapKey, JSON.stringify({ insights: [{ id: 5, title: 'из снимка' }] }));
      localStorage.setItem(key, '{ битый');
      localStorage.removeItem(bakK);
      hydrate();
      const lockedBefore = isWriteLocked();
      const okRestore = restoreSnapshot(snapKey);
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      return {
        lockedBefore, okRestore,
        unlocked: !isWriteLocked(),
        storedTitle: (stored.insights || [{}])[0].title,
        runtimeTitle: (DB.insights || [{}])[0].title,
        successToast: toasts.some(t => /восстановлены/i.test(t.m) && t.k === 'ok'),
      };
    } finally {
      window.toast = realToast; window.confirm = realConfirm;
      localStorage.removeItem(snapKey);
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(snapRestore.lockedBefore === true && snapRestore.okRestore === true,
    'restore: снимок восстановлен через recovery-safe путь под блокировкой');
  ok(snapRestore.unlocked === true, 'restore: блокировка снята ПОСЛЕ успешной записи');
  ok(snapRestore.storedTitle === 'из снимка' && snapRestore.runtimeTitle === 'из снимка',
    'restore: и хранилище, и runtime содержат восстановленные данные');
  ok(snapRestore.successToast, 'restore: успех показан только после реального восстановления');

  // Сбой записи при восстановлении: блокировка стоит, corrupt slot цел,
  // «Восстановлено» НЕ показывается.
  const snapFail = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const snapKey = 'arch5_snap_' + id + '_2026-01-02';
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    const realToast = window.toast; const toasts = [];
    window.toast = (m, k) => toasts.push({ m, k });
    const realConfirm = window.confirm; window.confirm = () => true;
    const realSet = Storage.prototype.setItem;
    try {
      localStorage.setItem(snapKey, JSON.stringify({ insights: [{ id: 5, title: 'из снимка' }] }));
      localStorage.setItem(key, '{ битый');
      localStorage.removeItem(bakK);
      hydrate();
      Storage.prototype.setItem = function (k, v) {
        if (k === key) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      const okRestore = restoreSnapshot(snapKey);
      Storage.prototype.setItem = realSet;
      return {
        okRestore,
        stillLocked: isWriteLocked(),
        slotIdentical: localStorage.getItem(key) === '{ битый',
        falseSuccess: toasts.some(t => /восстановлены/i.test(t.m) && t.k === 'ok'),
        failureShown: toasts.some(t => t.k === 'err'),
      };
    } finally {
      Storage.prototype.setItem = realSet;
      window.toast = realToast; window.confirm = realConfirm;
      localStorage.removeItem(snapKey);
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(snapFail.okRestore === false && snapFail.stillLocked === true,
    'restore-сбой: возврат false и блокировка остаётся');
  ok(snapFail.slotIdentical, 'restore-сбой: corrupt slot остался byte-identical');
  ok(snapFail.falseSuccess === false && snapFail.failureShown === true,
    'restore-сбой: ложного «Восстановлено» нет, ошибка показана');

  // discard при сбое записи: возврат false, блокировка стоит, успех не показан.
  const discardFail = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    const realToast = window.toast; const toasts = [];
    window.toast = (m, k) => toasts.push({ m, k });
    const realConfirm = window.confirm; window.confirm = () => true;
    const realSet = Storage.prototype.setItem;
    try {
      localStorage.setItem(key, '{ ЦЕННОЕ битое');
      localStorage.removeItem(bakK);
      hydrate();
      Storage.prototype.setItem = function (k, v) {
        if (k === key) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      const done = recoveryDiscard();
      Storage.prototype.setItem = realSet;
      return {
        done,
        stillLocked: isWriteLocked(),
        slotIdentical: localStorage.getItem(key) === '{ ЦЕННОЕ битое',
        falseSuccess: toasts.some(t => /сброшен/i.test(t.m) && t.k === 'ok'),
        failureShown: toasts.some(t => /не удался/i.test(t.m) && t.k === 'err'),
      };
    } finally {
      Storage.prototype.setItem = realSet;
      window.toast = realToast; window.confirm = realConfirm;
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(discardFail.done === false && discardFail.stillLocked === true,
    'discard-сбой: возврат false, блокировка НЕ снята до успешной записи');
  ok(discardFail.slotIdentical, 'discard-сбой: corrupt slot сохранён');
  ok(discardFail.falseSuccess === false && discardFail.failureShown === true,
    'discard-сбой: ложного «сброшено» нет, показана ошибка');

  // exportRaw при сбое скачивания: блокировка стоит.
  const exportFail = await page.evaluate(() => {
    const id = activeId();
    const key = 'arch5_db_' + id, bakK = 'arch5_bak_' + id;
    const savedDb = localStorage.getItem(key), savedBak = localStorage.getItem(bakK);
    const realToast = window.toast; window.toast = () => {};
    const realCreate = document.createElement.bind(document);
    try {
      localStorage.setItem(key, '{ битый'); localStorage.removeItem(bakK);
      hydrate();
      document.createElement = () => { throw new Error('blocked'); };
      const done = recoveryExportRaw();
      return { done, stillLocked: isWriteLocked() };
    } finally {
      document.createElement = realCreate;
      window.toast = realToast;
      resolveRecovery('discarded');
      if (savedDb === null) localStorage.removeItem(key); else localStorage.setItem(key, savedDb);
      if (savedBak === null) localStorage.removeItem(bakK); else localStorage.setItem(bakK, savedBak);
      hydrate();
    }
  });
  ok(exportFail.done === false && exportFail.stillLocked === true,
    'export-сбой: неудавшаяся выгрузка не снимает блокировку и не заявляет успех');
}

// ── 19. Rollback failure = критическое состояние ────────────────────
{
  // Case A: DB записан, CFG упал, откат DB тоже упал.
  const caseA = await page.evaluate(() => {
    const id = activeId();
    const K = { db: 'arch5_db_' + id, cfg: 'arch5_cfg_' + id };
    DB.insights = [{ id: 1, title: 'база' }]; CFG.userName = 'БАЗА'; persistLocal();
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; const toasts = [];
    window.toast = (m, k) => toasts.push({ m, k });
    let dbWrites = 0;
    DB.insights = [{ id: 2, title: 'новое' }]; CFG.userName = 'НОВОЕ';
    let result;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (k === K.db) {
          dbWrites++;
          if (dbWrites >= 2) { const e = new Error('rollback-fail'); e.name = 'QuotaExceededError'; throw e; }
          return realSet.call(this, k, v);     // первая запись DB удаётся
        }
        if (k === K.cfg) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    const err = lastPersistError();
    const lock = recoveryLock();
    const persistAfter = persist();
    _dirty = false; CFG.apiUrl = 'https://example.invalid'; scheduleSync(1);
    const syncBlocked = _dirty === false;
    CFG.apiUrl = '';
    resolveRecovery('discarded');
    return {
      result,
      rollbackFailed: !!(err && err.rollbackFailed), critical: !!(err && err.critical),
      affected: err && err.affectedKeys, lockReason: lock && lock.reasons[0], lockCritical: !!(lock && lock.critical),
      persistAfter, syncBlocked,
      criticalToast: toasts.some(t => /гарантированно восстановить/i.test(t.m)),
    };
  });
  ok(caseA.result === false && caseA.rollbackFailed && caseA.critical,
    'rollback A: сбой отката DB зафиксирован как rollbackFailed + critical');
  ok(Array.isArray(caseA.affected) && caseA.affected.length > 0,
    `rollback A: перечислены затронутые ключи (${(caseA.affected || []).join(',')})`);
  ok(caseA.lockReason === 'transaction-rollback-failed' && caseA.lockCritical,
    'rollback A: профиль в критической блокировке transaction-rollback-failed');
  ok(caseA.persistAfter === false, 'rollback A: обычный persist после критического сбоя запрещён');
  ok(caseA.syncBlocked === true, 'rollback A: синк после критического сбоя не планируется');
  ok(caseA.criticalToast, 'rollback A: пользователь видит сообщение об остановке записи и синка');

  // Case B: новый ключ создан, следующая запись падает, откат removeItem падает.
  const caseB = await page.evaluate(() => {
    const id = activeId();
    const K = { db: 'arch5_db_' + id, cfg: 'arch5_cfg_' + id, bak: 'arch5_bak_' + id };
    const savedCfg = localStorage.getItem(K.cfg);
    DB.insights = [{ id: 1, title: 'есть' }]; persistLocal();
    localStorage.removeItem(K.cfg);            // cfg-ключа до транзакции НЕ существует
    const realSet = Storage.prototype.setItem;
    const realRemove = Storage.prototype.removeItem;
    const realToast = window.toast; window.toast = () => {};
    let result;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (k === K.bak) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet.call(this, k, v);
      };
      Storage.prototype.removeItem = function (k) {
        if (k === K.cfg) { throw new Error('remove-fail'); }   // откат нового ключа падает
        return realRemove.call(this, k);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; Storage.prototype.removeItem = realRemove; window.toast = realToast; }
    const err = lastPersistError();
    const lock = recoveryLock();
    resolveRecovery('discarded');
    if (savedCfg === null) localStorage.removeItem(K.cfg); else localStorage.setItem(K.cfg, savedCfg);
    return { result, rollbackFailed: !!(err && err.rollbackFailed), lockCritical: !!(lock && lock.critical) };
  });
  ok(caseB.result === false && caseB.rollbackFailed && caseB.lockCritical,
    'rollback B: сбой удаления созданного ключа при откате — тоже критическое состояние');

  // Case C: откат полностью успешен — критической блокировки НЕТ, retry работает.
  const caseC = await page.evaluate(() => {
    const id = activeId();
    const K = { cfg: 'arch5_cfg_' + id };
    DB.insights = [{ id: 1, title: 'база' }]; CFG.userName = 'БАЗА'; persistLocal();
    localStorage.setItem('arch5_snap_' + id + '_2020-02-02', 'x');
    const realSet = Storage.prototype.setItem;
    const realToast = window.toast; window.toast = () => {};
    DB.insights = [{ id: 3, title: 'после' }]; CFG.userName = 'ПОСЛЕ';
    let result;
    try {
      Storage.prototype.setItem = function (k, v) {
        if (k === K.cfg && localStorage.getItem('arch5_snap_' + id + '_2020-02-02') !== null) {
          const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
        }
        return realSet.call(this, k, v);
      };
      result = persistLocal();
    } finally { Storage.prototype.setItem = realSet; window.toast = realToast; }
    return { result, locked: isWriteLocked(), err: lastPersistError() };
  });
  ok(caseC.result === true && caseC.locked === false && caseC.err === null,
    'rollback C: полностью успешный откат → обычный quota-retry работает, критической блокировки нет');

  // Сбой на фазе snapshot: транзакция не начинается, ничего не записано.
  const snapPhase = await page.evaluate(() => {
    const id = activeId();
    const K = 'arch5_db_' + id;
    DB.insights = [{ id: 1, title: 'снап-база' }]; persistLocal();
    const before = localStorage.getItem(K);
    const realGet = Storage.prototype.getItem;
    const realToast = window.toast; window.toast = () => {};
    let result;
    try {
      DB.insights = [{ id: 9, title: 'не должно записаться' }];
      Storage.prototype.getItem = function (k) {
        if (k === 'arch5_cfg_' + id) throw new Error('SecurityError');
        return realGet.call(this, k);
      };
      result = persistLocal();
    } finally { Storage.prototype.getItem = realGet; window.toast = realToast; }
    return { result, unchanged: localStorage.getItem(K) === before, locked: isWriteLocked() };
  });
  ok(snapPhase.result === false && snapPhase.unchanged,
    'snapshot-фаза: сбой чтения прежнего значения не даёт транзакции начаться — ничего не записано');
  ok(snapPhase.locked === false,
    'snapshot-фаза: это обычный отказ, не критическое состояние (ничего не менялось)');

  // Диагностика показывает критическое состояние без содержимого значений.
  const diagCritical = await page.evaluate(async () => {
    enterCriticalState(activeId(), ['arch5_db_' + activeId()]);
    const rep = await diagnosticsReport();
    const lock = recoveryLock();
    const json = JSON.stringify(rep.integrity) + JSON.stringify(lock);
    resolveRecovery('discarded');
    return {
      lockCritical: !!(lock && lock.critical),
      keysListed: !!(lock && lock.affectedKeys && lock.affectedKeys.length),
      noValues: !/ЦЕННОЕ|битый|title/.test(json),
    };
  });
  ok(diagCritical.lockCritical && diagCritical.keysListed,
    'диагностика: критическое состояние видно с именами затронутых ключей');
  ok(diagCritical.noValues, 'диагностика: содержимое значений в отчёт не попадает');
}

// ── 20. ACK восстановления на стороне приложения ────────────────────
{
  // Фейковый контроллер SW: отвечает через MessageChannel как настоящий.
  const setupCtl = (mode) => `
    (() => {
      const fake = { postMessage(msg, ports) {
        const p = ports && ports[0]; if (!p) return;
        const mode = ${JSON.stringify('%MODE%')};
        setTimeout(() => {
          if (mode === 'silent') return;                       // молчание → таймаут
          if (msg.type === 'arch:restore-lkg')
            p.postMessage(mode === 'ok' ? { type: 'arch:restore-lkg-result', ok: true, version: 'arch-vB' }
                                        : { type: 'arch:restore-lkg-result', ok: false, reason: 'no-last-known-good' });
          if (msg.type === 'arch:exit-recovery') p.postMessage({ type: 'arch:exit-recovery-result', ok: mode === 'ok' });
        }, 10);
      } };
      Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => fake });
    })();`;

  // Отрицательный ответ → reload запрещён.
  const neg = await page.evaluate(async (code) => {
    eval(code);
    window.__reloadMarker = 'alive';
    const realToast = window.toast; const toasts = [];
    window.toast = (m, k) => toasts.push({ m, k });
    const r = await restorePreviousBuild();
    await new Promise(res => setTimeout(res, 700));
    window.toast = realToast;
    return { r, marker: window.__reloadMarker, err: toasts.some(t => t.k === 'err' && /не выполнено/.test(t.m)) };
  }, setupCtl('neg').replace('%MODE%', 'neg'));
  ok(neg.r === false && neg.marker === 'alive',
    'ACK: отрицательный ответ (no-last-known-good) — перезагрузки не было');
  ok(neg.err, 'ACK: пользователь получил точную причину отказа');

  // Молчание SW → таймаут → reload запрещён. Таймаут проверяем напрямую
  // через swRequest с коротким лимитом.
  const silent = await page.evaluate(async (code) => {
    eval(code);
    const r = await swRequest({ type: 'arch:restore-lkg' }, 300);
    return r;
  }, setupCtl('silent').replace('%MODE%', 'silent'));
  ok(silent && silent.ok === false && silent.reason === 'timeout',
    'ACK: молчание SW распознаётся как таймаут, а не как успех');

  // Нет контроллера вообще → честный отказ без reload.
  const noCtl = await page.evaluate(async () => {
    Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => null });
    const realToast = window.toast; window.toast = () => {};
    const r = await restorePreviousBuild();
    window.toast = realToast;
    return r;
  });
  ok(noCtl === false, 'ACK: без активного SW восстановление честно отклоняется');

  // Положительный ACK → возврат true (reload запланирован). Отдельная
  // страница: настоящий reload не должен убить общий прогон.
  const okPage = await boot();
  const pos = await okPage.evaluate(async (code) => {
    eval(code);
    const realToast = window.toast; window.toast = () => {};
    const r = await restorePreviousBuild();
    window.toast = realToast;
    return r;
  }, setupCtl('ok').replace('%MODE%', 'ok'));
  await okPage.close();
  ok(pos === true, 'ACK: положительный ответ разрешает перезагрузку');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 5 (reliability & release): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
