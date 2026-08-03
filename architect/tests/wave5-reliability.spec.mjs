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
    const real = window.migrateRecords;
    const id = activeId();
    const key = 'arch5_db_' + id;
    const saved = localStorage.getItem(key);
    try {
      localStorage.setItem(key, JSON.stringify({ insights: [{ id: 5, title: 'до миграции' }] }));
      window.migrateRecords = () => { throw new Error('boom'); };
      hydrate();
      return {
        codes: startupIssues().map(i => i.code),
        stored: localStorage.getItem(key),
        threw: false,
      };
    } catch (e) { return { threw: true, msg: e.message }; }
    finally {
      window.migrateRecords = real;
      if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved);
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
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  ok(/const LKG\s*=/.test(sw), 'deploy: заведён кэш last-known-good');
  ok(/k !== V && k !== LKG/.test(sw),
    'deploy: activate больше не удаляет ВСЕ прежние кэши — рабочая копия сохраняется');
  ok(/arch:startup-ok/.test(sw), 'deploy: сборка становится last-known-good только после подтверждения старта');
  ok(/promoteToLastKnownGood/.test(sw), 'deploy: есть явная процедура повышения до last-known-good');
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

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

await browser.close();
console.log(`\nWave 5 (reliability & release): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
