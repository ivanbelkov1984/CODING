// DRIVE SYNC HUB v1 (решения владельца D-1…D-6).
//
// Что доказывается здесь:
//   D-1  Drive — ТОЛЬКО read-адаптер: подача проходит существующий путь
//        моста (preview → подтверждение → commit → ledger), прямого пути
//        Drive → DB нет, своего дедупа нет, идентичность прежняя.
//   D-2  access-token живёт только в памяти сессии: его нет в DB, CFG,
//        localStorage, IndexedDB, теле запроса к backend, резервной копии,
//        пакете синхронизации и в evidence.
//   D-3  чтение только по явному действию; commit требует подтверждения.
//   D-4  запрашивается только non-sensitive per-file scope drive.file;
//        drive.readonly / drive.metadata.readonly не запрашиваются вовсе.
//   D-5  пропавший/отозванный объект → source_unavailable, canonical цел.
//   D-6  принимаются только детерминированные пакеты architect-external-work.
//   + курсор — ТОЛЬКО оптимизация: его потеря даёт лишние чтения и ноль дублей.
//
// ВСЕ фикстуры синтетические (TEST-DRV-*). Сеть в тестах заблокирована,
// поэтому транспорт Google подменён — подменяется РОВНО транспорт, а вся
// семантика приёма остаётся производственной.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { encryptPayload } from '../backup/backup-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.DRIVE_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
// Сеть закрыта целиком: ни один тест не должен реально ходить в Google.
const netHits = [];
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('file://')) return r.continue();
  netHits.push(u);
  return r.abort();
});
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

// Синтетический пакет-подача: тот же формат, что принимает мост сегодня.
const pkg = (sourceId, title, body, over) => ({
  format: 'architect-external-work-v1',
  source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
  session: { clientRef: 'TEST-DRV-SESSION', summary: 'TEST-DRV синтетическая подача', date: '2026-04-10' },
  entities: [{
    clientRef: 'e1', type: 'insight', sourceId,
    claimClass: 'user_experience', textOrigin: 'user_words',
    data: { title, body, tag: 'personal' },
    ...((over && over.entity) || {}),
  }],
  links: [],
  ...((over && over.pkg) || {}),
});

const reset = () => page.evaluate(() => {
  ['insights', 'externalConnections', 'externalWorkSessions', 'corrections', 'moments'].forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) { }
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  if (typeof driveCursorsDrop === 'function') driveCursorsDrop();
  if (typeof driveTokenClear === 'function') driveTokenClear();
  _extConnActive = null; _extBatchFeed = null;
  persist();
});

// Подменный транспорт Google. Возвращает управляемые метаданные/содержимое.
const installFakeNet = (files) => page.evaluate((files) => {
  window.__drvCalls = { meta: 0, content: 0 };
  const store = new Map(files.map(f => [f.id, f]));
  Object.assign(DRIVE_NET, {
    requestToken: async () => ({ access_token: 'TEST-DRV-TOKEN-secret', expires_in: 3600 }),
    pickFiles: async () => files.map(f => ({ id: f.id, name: f.name, mimeType: 'application/json' })),
    getMeta: async (id) => {
      window.__drvCalls.meta++;
      const f = store.get(id);
      if (!f || f.gone) { const e = new Error('нет'); e.notFound = true; throw e; }
      if (f.forbidden) { const e = new Error('нет доступа'); e.forbidden = true; throw e; }
      if (f.expired) { const e = new Error('истекло'); e.needAuth = true; throw e; }
      return { id, name: f.name, mimeType: 'application/json', modifiedTime: f.modifiedTime, version: f.version, md5Checksum: f.md5, trashed: !!f.trashed };
    },
    getContent: async (id) => {
      window.__drvCalls.content++;
      const f = store.get(id);
      if (!f || f.gone) { const e = new Error('нет'); e.notFound = true; throw e; }
      return f.text;
    },
  });
  return true;
}, files);

const TOKEN = 'TEST-DRV-TOKEN-secret';

console.log('\nDRIVE SYNC HUB v1\n');

// ── 1. D-4: запрашивается только non-sensitive per-file scope ────────
{
  const sc = await page.evaluate(() => ({
    scope: DRIVE_SCOPE,
    bundleHasRestricted: null,
  }));
  ok(sc.scope === 'https://www.googleapis.com/auth/drive.file',
    `запрашивается non-sensitive per-file scope drive.file (${sc.scope})`);
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  const restricted = ['auth/drive.readonly', 'auth/drive.metadata', 'auth/drive.activity', "auth/drive'", 'auth/drive"']
    .filter(s => bundle.includes(s));
  ok(restricted.length === 0,
    'restricted-скоупы (drive.readonly / drive.metadata / drive.activity) не встречаются в сборке вовсе',
    restricted.join(', '));
}

// ── 2. D-1/D-3: первая подача → preview → подтверждённый commit ──────
{
  await reset();
  await installFakeNet([{ id: 'TEST-DRV-F1', name: 'life.json', modifiedTime: '2026-04-10T10:00:00Z', version: '1', md5: 'aaa', text: JSON.stringify(pkg('TEST-DRV-S1', 'Заголовок 1', 'Тело 1')) }]);
  const r = await page.evaluate(async () => {
    const c = driveConnCreate('TEST-DRV Канал');
    driveFeedsAdd(c.rec.id, [{ id: 'TEST-DRV-F1', name: 'life.json', mimeType: 'application/json' }]);
    driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
    const before = (DB.insights || []).length;
    const read = await driveReadFeed(c.rec.id);
    // Чтение НИЧЕГО не меняет в canonical — это только preview-материал.
    const afterRead = (DB.insights || []).length;
    _extConnActive = c.rec.id;
    const prev = await extBridgeRefresh(c.rec.id, read.feedText);
    const afterPreview = (DB.insights || []).length;
    const applied = extBridgeApply(c.rec.id);
    driveCursorsCommit(c.rec.id);
    const conn = extConnFind(c.rec.id);
    return {
      connId: c.rec.id,
      readOk: read.ok, packages: read.packages,
      before, afterRead, afterPreview,
      previewNew: prev.ok ? prev.totals.new : -1,
      applied: applied.ok, created: applied.created,
      final: (DB.insights || []).length,
      ledger: (DB.externalWorkSessions || []).length,
      checkpoint: (conn.checkpoint.committedPackageHashes || []).length,
      cursorSet: !!(conn.driveFeeds[0] && conn.driveFeeds[0].cursor && conn.driveFeeds[0].cursor.md5 === 'aaa'),
      sourceId: (DB.insights[0] || {}).ext ? DB.insights[0].ext.sourceId : null,
      container: conn.container,
    };
  });
  ok(r.readOk && r.packages === 1, 'подача прочитана из Drive и превращена в один пакет', JSON.stringify(r));
  ok(r.before === 0 && r.afterRead === 0 && r.afterPreview === 0,
    'чтение и предпросмотр НЕ меняют canonical (прямого пути Drive → DB нет)', JSON.stringify(r));
  ok(r.previewNew === 1, 'предпросмотр честно показывает одну новую запись');
  ok(r.applied && r.created === 1 && r.final === 1, 'подтверждённый commit создал запись через мост', JSON.stringify(r));
  ok(r.ledger === 1 && r.checkpoint === 1, 'ledger и чекпойнт моста задействованы (свой дедуп не появился)');
  ok(r.cursorSet, 'курсор зафиксирован только после успешного применения');
}

// ── 3. Точный повтор → ноль дублей ───────────────────────────────────
{
  const rep = await page.evaluate(async () => {
    const conn = (DB.externalConnections || [])[0];
    // Курсор специально сбрасываем: доказываем, что защита от дублей —
    // это ledger, а не курсор.
    extConnUpdate(conn.id, c => { c.driveFeeds = c.driveFeeds.map(f => ({ ...f, cursor: null })); });
    const read = await driveReadFeed(conn.id);
    _extConnActive = conn.id;
    await extBridgeRefresh(conn.id, read.feedText);
    const applied = extBridgeApply(conn.id);
    return {
      contentReRead: window.__drvCalls.content,
      insights: (DB.insights || []).length,
      ledger: (DB.externalWorkSessions || []).length,
      created: applied.created || 0,
    };
  });
  ok(rep.insights === 1 && rep.created === 0,
    'точный повтор подачи → ноль дублей (гарантия — ledger, а не курсор)', JSON.stringify(rep));
  ok(rep.ledger === 1, 'журнал импорта не вырос от повторной подачи');
}

// ── 4. Курсор — только оптимизация ───────────────────────────────────
{
  const cur = await page.evaluate(async () => {
    const conn = (DB.externalConnections || [])[0];
    const before = window.__drvCalls.content;
    // Курсор на месте и совпадает → файл не скачивается вовсе.
    extConnUpdate(conn.id, c => { c.driveFeeds = c.driveFeeds.map(f => ({ ...f, cursor: { modifiedTime: '2026-04-10T10:00:00Z', version: '1', md5: 'aaa' } })); });
    const read = await driveReadFeed(conn.id);
    return { skipped: (read.skipped || []).length, nothingNew: !!read.nothingNew, downloads: window.__drvCalls.content - before, insights: (DB.insights || []).length };
  });
  ok(cur.skipped === 1 && cur.nothingNew && cur.downloads === 0,
    'совпавший курсор пропускает скачивание — это экономия, а не решение о данных', JSON.stringify(cur));
  ok(cur.insights === 1, 'canonical при этом не изменился');
}

// ── 5. D-5: пропавший/отозванный объект ──────────────────────────────
{
  await installFakeNet([{ id: 'TEST-DRV-F1', name: 'life.json', gone: true }]);
  const gone = await page.evaluate(async () => {
    const conn = (DB.externalConnections || [])[0];
    const snapshot = JSON.stringify(DB.insights);
    const read = await driveReadFeed(conn.id);
    const after = extConnFind(conn.id);
    return {
      failed: !read.ok, unavailable: !!read.unavailable,
      status: after.status,
      canonicalIntact: JSON.stringify(DB.insights) === snapshot,
      insights: (DB.insights || []).length,
    };
  });
  ok(gone.failed && gone.unavailable && gone.status === 'source_unavailable',
    'пропавший объект → source_unavailable', JSON.stringify(gone));
  ok(gone.canonicalIntact && gone.insights === 1,
    'исчезновение источника НИКОГДА не удаляет canonical записи', JSON.stringify(gone));

  const trashed = await page.evaluate(async () => {
    // Реальный Drive для файла в корзине ОТДАЁТ метаданные с trashed:true,
    // а не ошибку — отдельный путь, и он тоже не смеет трогать canonical.
    Object.assign(DRIVE_NET, {
      getMeta: async () => ({ id: 'TEST-DRV-F1', name: 'life.json', modifiedTime: 't9', version: '9', md5Checksum: 'z9', trashed: true }),
      getContent: async () => { throw new Error('не должно вызываться для корзины'); },
    });
    const conn = (DB.externalConnections || [])[0];
    extConnResume(conn.id);
    const snapshot = JSON.stringify(DB.insights);
    const read = await driveReadFeed(conn.id);
    return {
      unavailable: !!read.unavailable,
      canonicalIntact: JSON.stringify(DB.insights) === snapshot,
      insights: (DB.insights || []).length,
      status: extConnFind(conn.id).status,
    };
  });
  ok(trashed.unavailable && trashed.status === 'source_unavailable',
    'файл в корзине Drive → source_unavailable', JSON.stringify(trashed));
  ok(trashed.canonicalIntact && trashed.insights === 1,
    'файл в корзине НЕ удаляет импортированные записи', JSON.stringify(trashed));

  const forb = await page.evaluate(async () => {
    Object.assign(DRIVE_NET, { getMeta: async () => { const e = new Error('нет доступа'); e.forbidden = true; throw e; } });
    const conn = (DB.externalConnections || [])[0];
    extConnResume(conn.id);
    const read = await driveReadFeed(conn.id);
    return { unavailable: !!read.unavailable, insights: (DB.insights || []).length };
  });
  ok(forb.unavailable && forb.insights === 1, 'отозванный доступ ведёт себя так же: данные целы');
}

// ── 6. Истёкшая авторизация — fail closed ────────────────────────────
{
  const exp = await page.evaluate(async () => {
    driveTokenClear();
    Object.assign(DRIVE_NET, { getMeta: async () => { const e = new Error('истекло'); e.needAuth = true; throw e; } });
    const conn = (DB.externalConnections || [])[0];
    extConnResume(conn.id);
    const read = await driveReadFeed(conn.id);
    return { failed: !read.ok, needAuth: !!read.needAuth, insights: (DB.insights || []).length, auth: driveAuthState() };
  });
  ok(exp.failed && exp.needAuth, 'истёкшая авторизация → отказ с просьбой переподключиться (fail closed)', JSON.stringify(exp));
  ok(exp.insights === 1 && exp.auth === 'none', 'при этом ни одна запись не изменилась, токена в памяти нет');
}

// ── 7. D-6: произвольные документы не принимаются ────────────────────
{
  await reset();
  const bad = await page.evaluate(async () => {
    const c = driveConnCreate('TEST-DRV Документ');
    driveFeedsAdd(c.rec.id, [{ id: 'TEST-DRV-DOC', name: 'заметки.txt', mimeType: 'text/plain' }]);
    driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
    Object.assign(DRIVE_NET, {
      getMeta: async () => ({ id: 'TEST-DRV-DOC', name: 'заметки.txt', modifiedTime: 'x', version: '1', md5Checksum: 'z' }),
      getContent: async () => 'Это просто свободный текст, а не подача Архитектора.',
    });
    const read = await driveReadFeed(c.rec.id);
    return { failed: !read.ok, err: (read.errors || [])[0] || '', insights: (DB.insights || []).length };
  });
  ok(bad.failed && bad.insights === 0,
    'произвольный документ отклонён — разбирается только детерминированная подача', JSON.stringify(bad));
  ok(/не корректный JSON|формат|feed|пакет/i.test(bad.err), 'отказ объясняет причину человеческим языком', bad.err);
}

// ── 8. D-2: токен не покидает память сессии ──────────────────────────
{
  const tok = await page.evaluate(async (TOKEN) => {
    await new Promise(r => setTimeout(r, 0));
    driveTokenPut(TOKEN, 3600);
    const c = driveConnCreate('TEST-DRV Токен');
    // Подача обязательна: утечка токена в элемент allowlist иначе осталась бы
    // невидимой для проверки «токена нет в записи подключения».
    driveFeedsAdd(c.rec.id, [{ id: 'TEST-DRV-TOKFEED', name: 'tok.json', mimeType: 'application/json' }]);
    persist();
    // Полный обход всего, что переживает сессию или уходит наружу.
    const lsDump = (() => {
      let s = '';
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); s += k + '=' + (localStorage.getItem(k) || '') + '\n'; }
      return s;
    })();
    const idbDump = await (async () => {
      try {
        const names = (indexedDB.databases ? await indexedDB.databases() : []).map(d => d.name).filter(Boolean);
        let out = '';
        for (const n of names) {
          const db = await new Promise(res => { const rq = indexedDB.open(n); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
          if (!db) continue;
          for (const st of [...db.objectStoreNames]) {
            const rows = await new Promise(res => { const rq = db.transaction(st).objectStore(st).getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => res([]); });
            out += JSON.stringify(rows);
          }
          db.close();
        }
        return out;
      } catch (_) { return ''; }
    })();
    const packed = await packPayload();
    return {
      inDB: JSON.stringify(DB).includes(TOKEN),
      inCFG: JSON.stringify(CFG).includes(TOKEN),
      inLocalStorage: lsDump.includes(TOKEN),
      inIndexedDB: idbDump.includes(TOKEN),
      inSyncPack: JSON.stringify(packed).includes(TOKEN),
      inConnRecord: JSON.stringify(extConnFind(c.rec.id)).includes(TOKEN),
      stillInMemory: driveAuthState() === 'active',
    };
  }, TOKEN);
  ok(!tok.inDB && !tok.inCFG, 'токена нет в DB и CFG', JSON.stringify(tok));
  ok(!tok.inLocalStorage, 'токена нет в localStorage (ничего не переживает сессию)');
  ok(!tok.inIndexedDB, 'токена нет ни в одном постоянном хранилище IndexedDB');
  ok(!tok.inSyncPack, 'токена нет в пакете синхронизации, который уходит на backend');
  ok(!tok.inConnRecord, 'токена нет в записи подключения');
  ok(tok.stillInMemory, 'при этом токен действителен в памяти — проверка не ложноположительная');
}

// ── 9. D-2: токена нет в резервной копии ─────────────────────────────
{
  const snap = await page.evaluate(() => ({ db: JSON.stringify(DB), cfg: JSON.stringify(CFG) }));
  const bundle = {
    payloadVersion: 1, app: 'architect', mode: 'data-only',
    createdAt: new Date().toISOString(), profileName: 'TEST-DRV-профиль',
    db: JSON.parse(snap.db), cfg: JSON.parse(snap.cfg), media: [],
  };
  const env = await encryptPayload(bundle, 'TEST-DRV-passphrase');
  const raw = JSON.stringify(bundle);
  ok(!raw.includes(TOKEN), 'токена нет в содержимом резервной копии до шифрования');
  ok(!JSON.stringify(env).includes(TOKEN), 'токена нет в зашифрованном конверте копии');
}

// ── 10. D-3: ни одного сетевого обращения без действия владельца ─────
{
  const googleHits = netHits.filter(u => /google|gstatic|googleapis/i.test(u));
  ok(googleHits.length === 0,
    `за весь прогон приложение ни разу не обратилось к Google само (${googleHits.length})`,
    googleHits.slice(0, 3).join('\n'));
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  // Скрипты Google обязаны грузиться лениво: в разметке их быть не должно.
  ok(!/<script[^>]+accounts\.google\.com/.test(bundle) && !/<script[^>]+apis\.google\.com/.test(bundle),
    'скрипты Google не подключены в разметке — только ленивая загрузка по действию');
}

// ── 11. Две подачи с одним sourceId → одна сущность ──────────────────
{
  await reset();
  await installFakeNet([
    { id: 'TEST-DRV-A', name: 'a.json', modifiedTime: 't1', version: '1', md5: 'm1', text: JSON.stringify(pkg('TEST-DRV-SHARED', 'Общий', 'Тело A')) },
    { id: 'TEST-DRV-B', name: 'b.json', modifiedTime: 't1', version: '1', md5: 'm2', text: JSON.stringify(pkg('TEST-DRV-SHARED', 'Общий', 'Тело A')) },
  ]);
  const dup = await page.evaluate(async () => {
    const c = driveConnCreate('TEST-DRV Два файла');
    driveFeedsAdd(c.rec.id, [{ id: 'TEST-DRV-A', name: 'a.json' }, { id: 'TEST-DRV-B', name: 'b.json' }]);
    driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
    const read = await driveReadFeed(c.rec.id);
    _extConnActive = c.rec.id;
    await extBridgeRefresh(c.rec.id, read.feedText);
    const applied = extBridgeApply(c.rec.id);
    return {
      packages: read.packages,
      insights: (DB.insights || []).length,
      created: applied.created || 0,
      sourceId: ((DB.insights[0] || {}).ext || {}).sourceId || null,
    };
  });
  ok(dup.packages === 2, 'обе подачи прочитаны как два пакета одной поставки');
  ok(dup.insights === 1 && dup.sourceId === 'TEST-DRV-SHARED',
    'один sourceId в двух файлах Drive → ОДНА семантическая сущность (fileId идентичность не подменяет)', JSON.stringify(dup));
}

// ── 12. Конфликт → ноль частичного применения ────────────────────────
{
  await reset();
  const conflict = await page.evaluate(async () => {
    // Первый импорт: запись создана и локально исправлена владельцем.
    const c = driveConnCreate('TEST-DRV Конфликт');
    driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
    const v1 = { id: 'TEST-DRV-C', name: 'c.json', modifiedTime: 't1', version: '1', md5Checksum: 'c1' };
    Object.assign(DRIVE_NET, {
      getMeta: async () => v1,
      getContent: async () => JSON.stringify({
        format: 'architect-external-work-v1',
        source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
        session: { clientRef: 'TEST-DRV-C1', summary: 'TEST-DRV', date: '2026-04-10' },
        entities: [{ clientRef: 'e1', type: 'insight', sourceId: 'TEST-DRV-CONF', claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: 1 }, data: { title: 'Версия 1', body: 'Тело 1', tag: 'personal' } }],
        links: [],
      }),
    });
    driveFeedsAdd(c.rec.id, [{ id: 'TEST-DRV-C', name: 'c.json' }]);
    const r1 = await driveReadFeed(c.rec.id);
    _extConnActive = c.rec.id;
    await extBridgeRefresh(c.rec.id, r1.feedText);
    extBridgeApply(c.rec.id);
    driveCursorsCommit(c.rec.id);
    // Владелец правит запись локально.
    DB.insights[0].title = 'Правка владельца';
    DB.insights[0]._u = Date.now();
    persist();
    const localTitle = DB.insights[0].title;
    // Источник присылает более новую версию ТОГО ЖЕ поля.
    Object.assign(DRIVE_NET, {
      getMeta: async () => ({ id: 'TEST-DRV-C', name: 'c.json', modifiedTime: 't2', version: '2', md5Checksum: 'c2' }),
      getContent: async () => JSON.stringify({
        format: 'architect-external-work-v1',
        source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
        session: { clientRef: 'TEST-DRV-C2', summary: 'TEST-DRV', date: '2026-04-11' },
        entities: [{ clientRef: 'e1', type: 'insight', sourceId: 'TEST-DRV-CONF', claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: 2 }, data: { title: 'Версия 2 из источника', body: 'Тело 2', tag: 'personal' } }],
        links: [],
      }),
    });
    const r2 = await driveReadFeed(c.rec.id);
    const prev = await extBridgeRefresh(c.rec.id, r2.feedText);
    const beforeApply = JSON.stringify(DB.insights);
    const applied = extBridgeApply(c.rec.id);
    const conn = extConnFind(c.rec.id);
    return {
      localTitle,
      conflicts: prev.ok ? (prev.totals.changedConflicts + prev.totals.orderUnknown) : -1,
      applyBlocked: !applied.ok,
      canonicalUnchanged: JSON.stringify(DB.insights) === beforeApply,
      titleNow: DB.insights[0].title,
      cursorNotMoved: conn.driveFeeds[0].cursor.md5 === 'c1',
      count: (DB.insights || []).length,
    };
  });
  ok(conflict.conflicts >= 1, 'более новая версия по локально правленному полю распознана как требующая решения', JSON.stringify(conflict));
  ok(conflict.applyBlocked && conflict.canonicalUnchanged && conflict.titleNow === 'Правка владельца',
    'подача с конфликтом НЕ применена ни частично, ни целиком — правка владельца цела', JSON.stringify(conflict));
  ok(conflict.cursorNotMoved,
    'курсор не сдвинулся после неудачного применения — следующее чтение честно перечитает файл');
  ok(conflict.count === 1, 'дубля конфликт тоже не создал');
}

// ── 13. Потеря курсора → безопасная сходимость ───────────────────────
{
  const lost = await page.evaluate(async () => {
    const conn = (DB.externalConnections || [])[0];
    // Полная потеря инкрементального состояния (как после LWW-затирания
    // чужим устройством): курсоры обнулены.
    extConnUpdate(conn.id, c => { c.driveFeeds = c.driveFeeds.map(f => ({ ...f, cursor: null })); });
    const before = JSON.stringify(DB.insights);
    const ledgerBefore = (DB.externalWorkSessions || []).length;
    // Источник снова отдаёт ИСХОДНУЮ версию (та, что уже импортирована).
    Object.assign(DRIVE_NET, {
      getMeta: async () => ({ id: 'TEST-DRV-C', name: 'c.json', modifiedTime: 't1', version: '1', md5Checksum: 'c1' }),
      getContent: async () => JSON.stringify({
        format: 'architect-external-work-v1',
        source: { kind: 'google_drive', label: 'TEST-DRV источник', module: 'TEST-DRV-MODULE' },
        session: { clientRef: 'TEST-DRV-C1', summary: 'TEST-DRV', date: '2026-04-10' },
        entities: [{ clientRef: 'e1', type: 'insight', sourceId: 'TEST-DRV-CONF', claimClass: 'user_experience', textOrigin: 'user_words', sourceVersion: { sequence: 1 }, data: { title: 'Версия 1', body: 'Тело 1', tag: 'personal' } }],
        links: [],
      }),
    });
    const read = await driveReadFeed(conn.id);
    _extConnActive = conn.id;
    await extBridgeRefresh(conn.id, read.feedText);
    const applied = extBridgeApply(conn.id);
    return {
      reRead: read.ok,
      created: applied.created || 0,
      canonicalSame: JSON.stringify(DB.insights) === before,
      ledgerSame: (DB.externalWorkSessions || []).length === ledgerBefore,
      count: (DB.insights || []).length,
    };
  });
  ok(lost.reRead, 'потерянный курсор приводит к повторному чтению — это лишняя работа, а не пропуск');
  ok(lost.created === 0 && lost.count === 1 && lost.ledgerSame,
    'повторное чтение сошлось без дублей: гарантия — ledger, а не курсор', JSON.stringify(lost));
}

// ── 14. Резервная копия/восстановление хранит метаданные источника ───
{
  const bak = await page.evaluate(() => {
    const conn = (DB.externalConnections || [])[0];
    const clone = JSON.parse(JSON.stringify(DB));
    return {
      hasConn: (clone.externalConnections || []).length === 1,
      hasFeeds: ((clone.externalConnections[0] || {}).driveFeeds || []).length === 1,
      hasCursor: !!(clone.externalConnections[0].driveFeeds[0].cursor),
      hasLedger: (clone.externalWorkSessions || []).length >= 1,
      fileIdKept: clone.externalConnections[0].driveFeeds[0].fileId === 'TEST-DRV-C',
      noToken: !JSON.stringify(clone).includes('TEST-DRV-TOKEN-secret'),
      connId: conn.id,
    };
  });
  ok(bak.hasConn && bak.hasFeeds && bak.hasLedger && bak.fileIdKept,
    'копия сохраняет canonical, журнал и метаданные источника (включая fileId как происхождение)', JSON.stringify(bak));
  ok(bak.noToken, 'и НЕ содержит OAuth-секрета');
}

// ── 15. Отключение источника не трогает записи ───────────────────────
{
  const dis = await page.evaluate(() => {
    const conn = (DB.externalConnections || [])[0];
    driveTokenPut('TEST-DRV-TOKEN-secret', 3600);
    const before = JSON.stringify(DB.insights);
    driveDisconnect(conn.id);
    const after = extConnFind(conn.id);
    return {
      status: after.status,
      tokenCleared: driveAuthState() === 'none',
      canonicalIntact: JSON.stringify(DB.insights) === before,
      count: (DB.insights || []).length,
    };
  });
  ok(dis.status === 'disconnected' && dis.tokenCleared,
    'отключение источника гасит токен в памяти', JSON.stringify(dis));
  ok(dis.canonicalIntact && dis.count === 1, 'импортированные записи остаются — это данные владельца, а не кэш источника');
}

// ── 16. Allowlist ограничен и не растёт молча ────────────────────────
{
  const al = await page.evaluate(() => {
    const c = driveConnCreate('TEST-DRV Лимит');
    const three = [{ id: 'TEST-DRV-L1', name: 'f1' }, { id: 'TEST-DRV-L2', name: 'f2' }, { id: 'TEST-DRV-L3', name: 'f3' }];
    const first = driveFeedsAdd(c.rec.id, three);
    const afterFirst = (extConnFind(c.rec.id).driveFeeds || []).length;
    // Те же файлы повторно — дублей в allowlist быть не должно.
    const dup = driveFeedsAdd(c.rec.id, three);
    const afterDup = (extConnFind(c.rec.id).driveFeeds || []).length;
    // Превышение лимита — отказ ЦЕЛИКОМ, без частичной записи.
    const many = Array.from({ length: DRIVE_MAX_FEEDS + 3 }, (_, i) => ({ id: 'TEST-DRV-M' + i, name: 'm' + i }));
    const over = driveFeedsAdd(c.rec.id, many);
    const afterOver = (extConnFind(c.rec.id).driveFeeds || []).length;
    return {
      firstOk: first.ok, firstAdded: first.added, afterFirst,
      dupAdded: dup.ok ? dup.added : -1, afterDup,
      overRejected: !over.ok, afterOver, MAX: DRIVE_MAX_FEEDS,
    };
  });
  ok(al.firstOk && al.firstAdded === 3 && al.afterFirst === 3, 'выбранные подачи попадают в allowlist', JSON.stringify(al));
  ok(al.dupAdded === 0 && al.afterDup === 3, 'повторный выбор тех же файлов не дублирует allowlist', JSON.stringify(al));
  ok(al.overRejected && al.afterOver === 3,
    `превышение лимита (${al.MAX}) отклоняется ЦЕЛИКОМ — частичной записи allowlist не бывает`, JSON.stringify(al));
}

// ── 17. Service worker не кэширует ответы Google ─────────────────────
// Иначе приватное содержимое подач владельца осело бы в кэше и пережило бы
// сессию — при том что сам токен по D-2 живёт только в памяти.
{
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/if \((\/[^\n]+\/)\.test\(url\.host\)\) return;/g) || [];
  const rules = m.map(line => {
    const rx = line.match(/\/(.+)\/\.test/);
    return rx ? new RegExp(rx[1]) : null;
  }).filter(Boolean);
  const excluded = h => rules.some(r => r.test(h));
  ok(excluded('www.googleapis.com') && excluded('accounts.google.com') && excluded('apis.google.com'),
    'service worker исключает googleapis/google-хосты из кэша (содержимое подач не оседает)');
  ok(!excluded('ivanbelkov1984.github.io'),
    'при этом собственные ассеты приложения по-прежнему кэшируются (офлайн не сломан)');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'driveSyncHub.spec.mjs'), 'utf8');
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  const marks = [['GDRI', 'VE:'], ['LIFE-2', '02'], ['DREAM-2', '02'], ['PARA-2', '02'], ['INT-2', '02']]
    .map(p => new RegExp(p.join('')));
  const inSpec = marks.filter(r => r.test(src)).length;
  const inBundle = marks.filter(r => r.test(bundle)).length;
  ok(inSpec === 0 && inBundle === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в сборке (${inSpec}/${inBundle})`);
  ok(/TEST-DRV-/.test(src), 'все фикстуры несут синтетический префикс TEST-DRV-*');
  // Длина обязательна: в интерфейсе есть подсказка-заполнитель «AIza…» для
  // поля ключа Gemini — она не секрет и ловиться не должна.
  ok(!/AIza[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z_-]{20,}|GOCSPX-[0-9A-Za-z_-]{10,}/.test(bundle),
    'в сборке нет настоящих ключей/секретов Google (подсказка-заполнитель не считается)');
}

await browser.close();
console.log(`\nDRIVE SYNC HUB: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
