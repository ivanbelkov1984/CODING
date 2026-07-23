// ─────────────────────────────────────────────────────────────────────────
//  backup-evidence.mjs — реальное browser/mobile evidence для зашифрованного
//  backup (Slice 6). Поднимает localhost HTTP (НЕ file://), отдаёт собранный
//  dist/ (index.html + backup/*.mjs + sw.js), запускает мобильный движок
//  (chromium | webkit) и прогоняет обязательные end-to-end сценарии, включая
//  расшифровку скачанного файла production-ядром. Скриншоты + JSON-отчёт в
//  architect/evidence/<engine>/. Синтетические данные, без сети к backend/CDN.
//
//  Запуск:
//    EVIDENCE_ENGINE=chromium EVIDENCE_EXECUTABLE=/path/chrome node tests/backup-evidence.mjs
//    EVIDENCE_ENGINE=webkit  node tests/backup-evidence.mjs
// ─────────────────────────────────────────────────────────────────────────

import http from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, dirname, normalize } from 'path';
import { fileURLToPath } from 'url';
import * as pw from 'playwright';
import { decryptEnvelope, parseEnvelopeText } from '../backup/backup-core.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const DIST = join(ROOT, 'dist');
const ENGINE = process.env.EVIDENCE_ENGINE || 'chromium';
const EXEC = process.env.EVIDENCE_EXECUTABLE || undefined;
const OUT = join(ROOT, 'evidence', ENGINE);

const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };

let pass = 0, fail = 0; const results = [];
const ok = (c, n) => { if (c) { pass++; results.push({ ok: true, status: 'PASS', n }); console.log('  ✓ ' + n); } else { fail++; results.push({ ok: false, status: 'FAIL', n }); console.log('  ✗ ' + n); } };
// Некоторые проверки честно НЕ являются PASS (SKIP/BLOCKED). Их НЕ засчитываем
// как pass — фиксируем реальный статус в отчёте (см. item 10: no ok(true) для
// невыполненного теста; отчёт различает PASS/FAIL/SKIP/BLOCKED).
const mark = (status, n) => { results.push({ ok: null, status, n }); console.log('  • ' + status + ' ' + n); };

function serveDist() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/' ) p = '/index.html';
      const file = normalize(join(DIST, p));
      if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
      const body = await readFile(file);
      const ext = p.slice(p.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// Синтетические данные для сидинга приложения (никаких реальных данных).
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD'; // валидный base64 (len%4==0)
const AUD = 'data:audio/webm;codecs=opus;base64,GkXfowEAAAAAAAAfQoaB'; // валидный base64 (len%4==0)
const SEED = {
  profileId: 'pEvidence',
  profiles: [{ id: 'pEvidence', name: 'Синтетик', color: '#1056CC' }],
  db: { insights: [{ id: 1, title: 'Заметка', body: 'текст', media: ['m1', 'm2'] }, { id: 2, title: 'Без медиа' }], dreams: [] },
  cfg: { userName: 'Синтетик', domainLabel: 'Книга', apiUrl: 'https://keep.example', spaceKey: 'KEEP_SPACE', lastSync: '2026-07-01T00:00:00.000Z' },
};

async function seed(page) {
  await page.evaluate(async (S) => {
    localStorage.clear();
    localStorage.setItem('arch5_profiles', JSON.stringify(S.profiles));
    localStorage.setItem('arch5_active', S.profileId);
    localStorage.setItem('arch5_db_' + S.profileId, JSON.stringify(S.db));
    localStorage.setItem('arch5_cfg_' + S.profileId, JSON.stringify(S.cfg));
    localStorage.setItem('arch5_pass_' + S.profileId, 'PASSPHRASE_SECRET');
    localStorage.setItem('arch5_rec_' + S.profileId, 'RECOVERY_SECRET');       // ключ восстановления
    localStorage.setItem('arch5_aikey_' + S.profileId, 'AIKEY_SECRET');         // локальный AI/API-ключ
    localStorage.setItem('arch5_tour_done', '1');
    // media в IndexedDB arch5_media/media
    await new Promise((res, rej) => {
      const r = indexedDB.open('arch5_media', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('media')) r.result.createObjectStore('media'); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction('media', 'readwrite'); const s = tx.objectStore('media'); s.put({ data: S.IMG, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, 'm1'); s.put({ data: S.AUD, type: 'audio', createdAt: '2026-01-01T00:00:00.000Z' }, 'm2'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
      r.onerror = () => rej(r.error);
    });
  }, { ...SEED, IMG, AUD });
}

async function openSheet(page) {
  await page.evaluate(() => { ['ov-onboard', 'ov-tour', 'splash'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('on'); e.style.display = 'none'; } }); if (typeof goTo === 'function') goTo('settings'); });
  await page.waitForFunction(() => !!(window.ArchBackup && window.ArchBackup.open), null, { timeout: 5000 });
  await page.evaluate(() => window.ArchBackup.open());
  await page.waitForSelector('#ov-backup-enc.on', { timeout: 5000 });
}

async function shot(page, name) { try { await mkdir(OUT, { recursive: true }); await page.screenshot({ path: join(OUT, name + '.png') }); } catch (e) {} }

// Полный снимок мутируемого состояния для zero-mutation проверок: весь
// localStorage (registry/active/db/cfg/bak/…) + все записи IndexedDB arch5_media.
async function fullSnapshot(page) {
  return await page.evaluate(async () => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const md = await new Promise((res) => {
      const out = {};
      const r = indexedDB.open('arch5_media', 1);
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('media')) return res(out);
        const tx = db.transaction('media', 'readonly'); const s = tx.objectStore('media');
        const kq = s.getAllKeys(), vq = s.getAll();
        tx.oncomplete = () => { kq.result.forEach((k, i) => { out[k] = JSON.stringify(vq.result[i]); }); res(out); };
        tx.onerror = () => res(out);
      };
      r.onerror = () => res(out);
    });
    return JSON.stringify({ ls, md });
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await serveDist();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const errors = [];
  const engine = ENGINE === 'webkit' ? pw.webkit : pw.chromium;
  const browser = await engine.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  // Никаких обращений к production backend/внешним сервисам: evidence работает
  // только с локальным synthetic-профилем. Отдаём этим хостам локальный 503
  // (запрос НЕ уходит наружу; приложение штатно ловит неуспех синка — без
  // uncaught-ошибок, в отличие от abort, который WebKit роняет в pageerror).
  await ctx.route(u => /railway|anthropic|openai|googleapis|gstatic|keep\.example/i.test(u.href),
    r => r.fulfill({ status: 503, contentType: 'text/plain', body: '' }).catch(() => {}));
  const page = await ctx.newPage();
  // Сетевые/кросс-доменные ошибки к заблокированным/некэшированным ресурсам (в
  // т.ч. WebKit-формулировка CORS и офлайн-фаза) — это среда, а не баг: валим
  // только на настоящих JS-ошибках самого приложения. Корректность офлайна
  // доказывается ПОЛОЖИТЕЛЬНОЙ проверкой (модули в кэше / ArchBackup доступен).
  const EXT = /ERR_FAILED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|ERR_ABORTED|net::|Failed to load resource|Load cannot follow|Load failed|Returned response is null|CORS policy|Access-Control-Allow-Origin|is not allowed by|Request aborted|503|railway|keep\.example|\/health|anthropic\.com|openai\.com|googleapis|gstatic|favicon|sync fail|Нет соединения/i;
  page.on('pageerror', e => { if (!EXT.test(e.message)) errors.push('pageerror: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !EXT.test(m.text())) errors.push('console: ' + m.text()); });

  try {
    // ── Открытие UI ──
    await page.goto(base, { waitUntil: 'load' });
    await seed(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.ArchBackup), null, { timeout: 8000 });
    ok(true, 'приложение загрузилось, backup-модуль подключён по HTTP');
    // entry видима
    await page.evaluate(() => { ['ov-onboard', 'ov-tour', 'splash'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('on'); e.style.display = 'none'; } }); goTo('settings'); });
    const entryVisible = await page.locator('text=Зашифрованная резервная копия').first().isVisible();
    ok(entryVisible, 'точка входа «Зашифрованная резервная копия» видима в настройках');
    await openSheet(page);
    ok(await page.locator('#ov-backup-enc.on').count() === 1, 'sheet backup открывается');
    ok(await page.locator('#be-pw1').isVisible(), 'поля пароля доступны');
    await shot(page, '01-sheet-open');

    // ── Data-only creation + decrypt ──
    await page.click('#be-mode .tp[data-be-mode="data-only"]');
    await page.fill('#be-pw1', 'evidence-pass-1'); await page.fill('#be-pw2', 'evidence-pass-1');
    await page.check('#be-ack-loss'); await page.check('#be-ack-sens');
    await page.waitForSelector('#be-create-btn:not([disabled])', { timeout: 5000 });
    const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('#be-create-btn')]);
    const f1 = await dl1.path(); const text1 = await readFile(f1, 'utf8');
    const env1 = parseEnvelopeText(text1);
    const p1 = await decryptEnvelope(env1, 'evidence-pass-1');
    ok(p1.mode === 'data-only' && Array.isArray(p1.db.insights) && p1.db.insights.length === 2, 'data-only: DB/CFG присутствуют в файле');
    ok(p1.media.length === 0 && !('media' in p1.db.insights[0]), 'data-only: media bytes отсутствуют, ссылки очищены в копии');
    ok(!('apiUrl' in p1.cfg) && !('spaceKey' in p1.cfg) && !('lastSync' in p1.cfg), 'data-only: connection fields отсутствуют');
    ok(!text1.includes('PASSPHRASE_SECRET') && !text1.includes('KEEP_SPACE'), 'data-only: секретов нет в файле');
    // live DB не изменился
    const liveMedia = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem('arch5_db_pEvidence')); return db.insights[0].media && db.insights[0].media.join(); });
    ok(liveMedia === 'm1,m2', 'data-only: живой DB не изменён (media-ссылки на месте)');
    const pwCleared = await page.evaluate(() => [document.getElementById('be-pw1').value, document.getElementById('be-pw2').value]);
    ok(pwCleared[0] === '' && pwCleared[1] === '', 'создание: поля пароля очищены после успеха');
    await shot(page, '02-dataonly-done');

    // ── Complete creation + decrypt + sha/MIME ──
    await page.click('#be-mode .tp[data-be-mode="complete"]');
    await page.fill('#be-pw1', 'evidence-pass-2'); await page.fill('#be-pw2', 'evidence-pass-2');
    if (!(await page.isChecked('#be-ack-loss'))) await page.check('#be-ack-loss');
    if (!(await page.isChecked('#be-ack-sens'))) await page.check('#be-ack-sens');
    await page.waitForSelector('#be-create-btn:not([disabled])', { timeout: 5000 });
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#be-create-btn')]);
    const text2 = await readFile(await dl2.path(), 'utf8');
    const p2 = await decryptEnvelope(parseEnvelopeText(text2), 'evidence-pass-2');
    const mids = p2.media.map(m => m.id).sort().join(',');
    ok(p2.mode === 'complete' && mids === 'm1,m2', 'complete: включены только реально referenced media');
    const au = p2.media.find(m => m.mime.startsWith('audio/'));
    ok(au && au.mime === 'audio/webm;codecs=opus', 'complete: MIME с параметрами сохранён');
    ok(p2.media.every(m => /^[0-9a-f]{64}$/.test(m.sha256)), 'complete: raw-byte SHA-256 присутствует для media');
    ok(!text2.includes('PASSPHRASE_SECRET'), 'complete: секретов нет в файле');
    await shot(page, '03-complete-done');

    // ── Wrong password: safe error + ПОЛНЫЙ zero-mutation snapshot ──
    // (registry, active, все DB/CFG/bak + все записи IndexedDB arch5_media).
    await page.click('#be-tab-restore');
    const beforeWP = await fullSnapshot(page);
    await page.setInputFiles('#be-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text1) });
    await page.fill('#be-rpw', 'WRONG-PASSWORD');
    await page.click('#be-restore-new-btn');
    await page.waitForFunction(() => /Неверный пароль/.test((document.getElementById('be-restore-status') || {}).textContent || ''), null, { timeout: 8000 });
    const errText = await page.locator('#be-restore-status').textContent();
    ok(/Неверный пароль/.test(errText) && !errText.includes('WRONG-PASSWORD'), 'wrong password: безопасное сообщение без пароля');
    ok((await fullSnapshot(page)) === beforeWP, 'wrong password: полный zero-mutation (registry/active/DB/CFG/bak/IndexedDB)');
    await shot(page, '04-wrong-password');

    // ── Corrupted ciphertext: safe error + ПОЛНЫЙ zero-mutation snapshot ──
    {
      const corrupt = (() => { const e = JSON.parse(text2); const b = Buffer.from(e.ciphertext, 'base64'); b[10] ^= 0xff; b[20] ^= 0xff; e.ciphertext = b.toString('base64'); return JSON.stringify(e); })();
      const beforeCC = await fullSnapshot(page);
      await page.setInputFiles('#be-file', { name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from(corrupt) });
      await page.fill('#be-rpw', 'evidence-pass-2');
      await page.click('#be-restore-new-btn');
      await page.waitForFunction(() => /повреждён|Неверный пароль/i.test((document.getElementById('be-restore-status') || {}).textContent || ''), null, { timeout: 8000 });
      ok(true, 'corrupted ciphertext: показано безопасное сообщение');
      ok((await fullSnapshot(page)) === beforeCC, 'corrupted ciphertext: полный zero-mutation (registry/active/DB/CFG/bak/IndexedDB)');
    }
    // Чистый сброс controller-состояния между сценариями восстановления.
    await page.click('#be-close');
    await openSheet(page);
    await page.click('#be-tab-restore');

    // ── Restore as new profile (default) + persistence ──
    await page.fill('#be-rpw', 'evidence-pass-2');
    await page.setInputFiles('#be-file', { name: 'complete.json', mimeType: 'application/json', buffer: Buffer.from(text2) });
    // item1: помечаем УСТАРЕВШЕЕ in-memory состояние — гидратация обязана его убрать.
    await page.evaluate(() => { if (typeof DB === 'object' && DB) DB.__staleMarker = 'STALE-NEW'; });
    await page.click('#be-restore-new-btn');
    await page.waitForFunction(() => /новый профиль/i.test((document.getElementById('be-restore-status') || {}).textContent || ''), null, { timeout: 15000 });
    const afterRestore = await page.evaluate(() => { const profs = JSON.parse(localStorage.getItem('arch5_profiles')); const active = localStorage.getItem('arch5_active'); const cfg = JSON.parse(localStorage.getItem('arch5_cfg_' + active) || '{}'); return { count: profs.length, activeIsNew: active !== 'pEvidence', apiUrl: cfg.apiUrl, oldUntouched: !!localStorage.getItem('arch5_db_pEvidence') }; });
    ok(afterRestore.count === 2 && afterRestore.activeIsNew, 'restore-new: создан отдельный новый профиль и активирован');
    ok(afterRestore.oldUntouched, 'restore-new: существующий профиль не изменён');
    ok(afterRestore.apiUrl === '', 'restore-new: connection fields нового профиля пустые/default');
    // item1: гидратация БЕЗ ручного reload — in-memory = восстановленный профиль.
    const hydr = await page.evaluate(() => ({
      active: activeId(),
      staleGone: !(DB && DB.__staleMarker),
      hasRestored: !!(DB && DB.insights && DB.insights.some(i => i.title === 'Заметка')),
    }));
    ok(hydr.active !== 'pEvidence', 'item1(new): активный профиль — новый (в памяти)');
    ok(hydr.staleGone && hydr.hasRestored, 'item1(new): гидратация без reload заменила in-memory DB на восстановленный');
    // item1: немедленная правка — persist ДОБАВЛЯЕТ к восстановленному, не пишет старый.
    await page.evaluate(() => { DB.insights.push({ id: 987654, title: 'AFTER-RESTORE', createdAt: new Date().toISOString(), day: '2026-07-23', sv: 2 }); persist(); });
    const appended = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem('arch5_db_' + activeId())); const titles = (db.insights || []).map(i => i.title); return { hasNew: titles.includes('AFTER-RESTORE'), hasRestored: titles.includes('Заметка'), noStale: !('__staleMarker' in db) }; });
    ok(appended.hasNew && appended.hasRestored && appended.noStale, 'item1(new): persist после restore добавляет к восстановленному DB (не перезаписывает старым)');
    // reload → данные присутствуют
    await page.reload({ waitUntil: 'load' });
    const persisted = await page.evaluate(() => { const active = localStorage.getItem('arch5_active'); const db = JSON.parse(localStorage.getItem('arch5_db_' + active) || 'null'); return db && db.insights && db.insights.length; });
    ok(persisted >= 1, 'restore-new: после reload данные присутствуют');
    // item10.4: рендер восстановленного медиа реальными <img>/<audio> + ТОЧНОЕ
    // сравнение ОБЕИХ записей IndexedDB (data/type/createdAt) с ожидаемым.
    const render = await page.evaluate(async (EXP) => {
      const db = JSON.parse(localStorage.getItem('arch5_db_' + localStorage.getItem('arch5_active')));
      const ins = (db.insights || []).find(i => Array.isArray(i.media) && i.media.length >= 2);
      if (!ins || typeof rDetMedia !== 'function') return { fail: true };
      await rDetMedia(ins);
      const el = document.getElementById('det-media');
      const img = el && el.querySelector('img'), aud = el && el.querySelector('audio');
      const get = id => new Promise(res => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const s = r.result.transaction('media', 'readonly').objectStore('media'); const g = s.get(id); g.onsuccess = () => res(g.result); g.onerror = () => res(null); }; r.onerror = () => res(null); });
      const r0 = await get(ins.media[0]), r1 = await get(ins.media[1]);
      const match = (rec, e) => !!(rec && rec.data === e.data && rec.type === e.type && rec.createdAt === e.createdAt);
      return {
        img: !!(img && img.src === EXP.image.data),
        aud: !!(aud && aud.src === EXP.audio.data),
        rec0: match(r0, EXP.image), rec1: match(r1, EXP.audio),
        ids: [ins.media[0], ins.media[1]].join(','),
      };
    }, { image: { data: IMG, type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, audio: { data: AUD, type: 'audio', createdAt: '2026-01-01T00:00:00.000Z' } });
    ok(render.img, 'media render: реальный <img>, src = точный восстановленный data URL');
    ok(render.aud, 'media render: реальный <audio>, src = точный восстановленный data URL');
    ok(render.rec0 && render.rec1, 'media render: ОБЕ записи IndexedDB точно совпадают (data+type+createdAt)');
    await shot(page, '05-restore-new');

    // ── Item 3/10.5: Multi-profile GC — медиа НЕактивного профиля выживает ──
    await page.evaluate(async () => {
      const profs = JSON.parse(localStorage.getItem('arch5_profiles'));
      profs.push({ id: 'pB', name: 'Второй', color: '#1A7F3C' });
      localStorage.setItem('arch5_profiles', JSON.stringify(profs));
      localStorage.setItem('arch5_db_pB', JSON.stringify({ insights: [{ id: 5, title: 'B', media: ['mB'] }] }));
      await new Promise((res, rej) => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const tx = r.result.transaction('media', 'readwrite'); const s = tx.objectStore('media'); s.put({ data: 'data:image/png;base64,AAAA', type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, 'mB'); s.put({ data: 'data:image/png;base64,BBBB', type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, 'mOrphan'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    });
    await page.evaluate(async () => { if (typeof gcMedia === 'function') await gcMedia(); });
    const gc = await page.evaluate(async () => {
      const has = id => new Promise(res => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const g = r.result.transaction('media', 'readonly').objectStore('media').get(id); g.onsuccess = () => res(!!g.result); g.onerror = () => res(false); }; r.onerror = () => res(false); });
      return { mB: await has('mB'), mOrphan: await has('mOrphan'), m1: await has('m1') };
    });
    ok(gc.mB === true, 'multi-profile GC: медиа НЕактивного профиля B сохранено');
    ok(gc.m1 === true, 'multi-profile GC: медиа, на которое ссылаются профили, сохранено');
    ok(gc.mOrphan === false, 'multi-profile GC: непривязанное медиа удалено');

    // ── Round2/BLOCKING1: GC при ПОВРЕЖДЁННОМ активном профиле — ноль удалений ──
    const goodSlot = await page.evaluate(async () => {
      const active = localStorage.getItem('arch5_active');
      const good = localStorage.getItem('arch5_db_' + active);
      localStorage.setItem('arch5_db_' + active, '{ corrupt json <<< not valid');  // повреждаем raw-слот активного
      await new Promise((res, rej) => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const tx = r.result.transaction('media', 'readwrite'); const s = tx.objectStore('media'); s.put({ data: 'data:image/png;base64,CCCC', type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, 'mActiveRef'); s.put({ data: 'data:image/png;base64,DDDD', type: 'image', createdAt: '2026-01-01T00:00:00.000Z' }, 'mOrphan2'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
      return good;
    });
    await page.evaluate(async () => { if (typeof gcMedia === 'function') await gcMedia(); });
    const corruptGc = await page.evaluate(async () => {
      const has = id => new Promise(res => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const g = r.result.transaction('media', 'readonly').objectStore('media').get(id); g.onsuccess = () => res(!!g.result); g.onerror = () => res(false); }; r.onerror = () => res(false); });
      return { ref: await has('mActiveRef'), orphan: await has('mOrphan2'), m1: await has('m1'), mB: await has('mB') };
    });
    ok(corruptGc.ref && corruptGc.orphan && corruptGc.m1 && corruptGc.mB, 'GC fail-safe: повреждённый АКТИВНЫЙ профиль останавливает GC — ни одной записи не удалено');
    await page.evaluate((good) => { localStorage.setItem('arch5_db_' + localStorage.getItem('arch5_active'), good); if (typeof hydrate === 'function') hydrate(); }, goodSlot);

    // ── Replace: требует destructive mode + второе подтверждение ──
    await openSheet(page);
    await page.click('#be-tab-restore');
    await page.setInputFiles('#be-file', { name: 'complete.json', mimeType: 'application/json', buffer: Buffer.from(text2) });
    await page.fill('#be-rpw', 'evidence-pass-2');
    ok(await page.locator('#be-replace-panel').isHidden(), 'replace: destructive-панель скрыта по умолчанию');
    await page.click('#be-replace-arm');
    ok(await page.locator('#be-replace-panel').isVisible(), 'replace: destructive-режим включается явно');
    await page.click('#be-replace-btn');
    ok(await page.locator('#be-confirm2').isVisible(), 'replace: показывается отдельное второе подтверждение');
    // отмена второго подтверждения = без мутаций
    const beforeReplace = await page.evaluate(() => localStorage.getItem('arch5_profiles'));
    await page.click('#be-confirm2-cancel');
    ok(await page.locator('#be-confirm2').isHidden() && (await page.evaluate(() => localStorage.getItem('arch5_profiles'))) === beforeReplace, 'replace: отказ второго подтверждения — без мутаций');
    await shot(page, '06-replace-confirm');

    // ── Item 10.1: УСПЕШНАЯ замена pEvidence + connection/секреты + гидратация ──
    // Панель всё ещё armed, файл выбран, rpw заполнен, target = pEvidence (первый).
    await page.click('#be-replace-btn');
    ok(await page.locator('#be-confirm2').isVisible(), 'replace(success): второе подтверждение показано снова');
    await page.evaluate(() => { if (typeof DB === 'object' && DB) DB.__staleMarker = 'STALE-REPL'; });
    await page.click('#be-confirm2-yes');
    await page.waitForFunction(() => /заменён/i.test((document.getElementById('be-restore-status') || {}).textContent || ''), null, { timeout: 15000 });
    const repl = await page.evaluate(() => {
      const cfg = JSON.parse(localStorage.getItem('arch5_cfg_pEvidence') || '{}');
      const db = JSON.parse(localStorage.getItem('arch5_db_pEvidence') || '{}');
      const bak = JSON.parse(localStorage.getItem('arch5_bak_pEvidence') || 'null');
      return {
        dbHasRestored: (db.insights || []).some(i => i.title === 'Заметка'),
        apiUrl: cfg.apiUrl, spaceKey: cfg.spaceKey, lastSync: cfg.lastSync,
        pass: localStorage.getItem('arch5_pass_pEvidence'),
        rec: localStorage.getItem('arch5_rec_pEvidence'),
        aikey: localStorage.getItem('arch5_aikey_pEvidence'),
        bakMatches: JSON.stringify(bak) === JSON.stringify(db),
        active: activeId(), staleGone: !(DB && DB.__staleMarker),
      };
    });
    ok(repl.dbHasRestored, 'replace(success): DB заменён содержимым backup');
    ok(repl.apiUrl === 'https://keep.example' && repl.spaceKey === 'KEEP_SPACE' && repl.lastSync === '2026-07-01T00:00:00.000Z', 'replace(success): connection (apiUrl/spaceKey/lastSync) сохранены');
    ok(repl.pass === 'PASSPHRASE_SECRET' && repl.rec === 'RECOVERY_SECRET' && repl.aikey === 'AIKEY_SECRET', 'replace(success): локальные секреты не тронуты (парольная фраза + ключ восстановления + AI-ключ)');
    ok(repl.bakMatches, 'replace(success): bak-слот = восстановленный DB (не старый профиль)');
    ok(repl.active === 'pEvidence' && repl.staleGone, 'replace(success): гидратация без ручного reload (устаревший in-memory сброшен)');
    // Round2: немедленный persist ДО reload дополняет восстановленный DB (как в restore-new).
    await page.evaluate(() => { DB.insights.push({ id: 543210, title: 'AFTER-REPLACE', createdAt: new Date().toISOString(), day: '2026-07-23', sv: 2 }); persist(); });
    const replAppend = await page.evaluate(() => { const t = (JSON.parse(localStorage.getItem('arch5_db_pEvidence') || '{}').insights || []).map(i => i.title); return { hasNew: t.includes('AFTER-REPLACE'), hasRestored: t.includes('Заметка') }; });
    ok(replAppend.hasNew && replAppend.hasRestored, 'replace(success): persist после замены дополняет восстановленный DB (не пишет старый профиль)');
    await page.reload({ waitUntil: 'load' });
    ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('arch5_db_pEvidence') || '{}').insights || []).some(i => i.title === 'Заметка')), 'replace(success): после reload данные восстановленного профиля на месте');
    ok(await page.evaluate(async () => { const has = id => new Promise(res => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const g = r.result.transaction('media', 'readonly').objectStore('media').get(id); g.onsuccess = () => res(!!g.result); g.onerror = () => res(false); }; r.onerror = () => res(false); }); return await has('mB'); }), 'replace(success): медиа другого (неактивного) профиля не затронуто');

    // ── Item 6: XSS-safe профиль-select (имя как текст, без инъекции DOM) ──
    await page.evaluate(() => {
      const profs = JSON.parse(localStorage.getItem('arch5_profiles'));
      profs.push({ id: 'p"q\'x', name: '</option><img src=x onerror=window.__xss=1>', color: '#1056CC' });
      localStorage.setItem('arch5_profiles', JSON.stringify(profs));
      localStorage.setItem('arch5_db_p"q\'x', JSON.stringify({ insights: [] }));
      window.__xss = 0;
    });
    await openSheet(page);
    await page.click('#be-tab-restore');
    await page.click('#be-replace-arm');
    const sel = await page.evaluate(() => {
      const s = document.getElementById('be-target');
      const opts = Array.from(s.options);
      const evil = opts.find(o => o.value.indexOf('q') >= 0 && o.value.indexOf('"') >= 0);
      return { regCount: JSON.parse(localStorage.getItem('arch5_profiles')).length, optCount: opts.length, img: s.querySelectorAll('img').length, xss: window.__xss, evilText: evil ? evil.textContent : null, evilOk: !!evil };
    });
    ok(sel.img === 0 && sel.xss === 0, 'item6: имя профиля не инъектирует DOM/скрипт (нет <img>, onerror не сработал)');
    ok(sel.evilText === '</option><img src=x onerror=window.__xss=1>', 'item6: злонамеренное имя показано как литеральный текст');
    ok(sel.evilOk && sel.optCount === sel.regCount, 'item6: профиль с кавычками в id — ровно один option, счёт совпадает с реестром');
    await page.click('#be-close');

    // ── Item 7: Escape закрывает через контроллер + полный сброс при reopen ──
    await openSheet(page);
    await page.fill('#be-pw1', 'secretpw'); await page.fill('#be-pw2', 'secretpw');
    await page.click('#be-tab-restore');
    await page.setInputFiles('#be-file', { name: 'complete.json', mimeType: 'application/json', buffer: Buffer.from(text2) });
    await page.click('#be-replace-arm');
    await page.keyboard.press('Escape');
    ok(await page.locator('#ov-backup-enc.on').count() === 0, 'item7: Escape закрыл backup-sheet через контроллер');
    await openSheet(page);
    const reset = await page.evaluate(() => ({ pw1: document.getElementById('be-pw1').value, pw2: document.getElementById('be-pw2').value, rpw: document.getElementById('be-rpw').value, file: document.getElementById('be-file').value, panelHidden: document.getElementById('be-replace-panel').style.display === 'none', createDisabled: document.getElementById('be-create-btn').disabled }));
    ok(reset.pw1 === '' && reset.pw2 === '' && reset.rpw === '' && reset.file === '', 'item7: после Escape+reopen все поля пусты');
    ok(reset.panelHidden && reset.createDisabled, 'item7: destructive-панель скрыта, создание заблокировано');
    await page.click('#be-close');

    // ── Item 8: complete при недоступном медиа → отказ, без скачивания ──
    await page.evaluate(async () => { await new Promise((res, rej) => { const r = indexedDB.open('arch5_media', 1); r.onsuccess = () => { const tx = r.result.transaction('media', 'readwrite'); tx.objectStore('media').delete('m2'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); }); });
    const liveBeforeMM = await page.evaluate(() => localStorage.getItem('arch5_db_' + localStorage.getItem('arch5_active')));
    await openSheet(page);
    await page.click('#be-mode .tp[data-be-mode="complete"]');
    await page.fill('#be-pw1', 'evidence-pass-3'); await page.fill('#be-pw2', 'evidence-pass-3');
    if (!(await page.isChecked('#be-ack-loss'))) await page.check('#be-ack-loss');
    if (!(await page.isChecked('#be-ack-sens'))) await page.check('#be-ack-sens');
    await page.waitForSelector('#be-create-btn:not([disabled])', { timeout: 5000 });
    let mmDownload = false; const onDl = () => { mmDownload = true; }; page.on('download', onDl);
    await page.click('#be-create-btn');
    await page.waitForFunction(() => /недоступн|только данные/i.test((document.getElementById('be-create-status') || {}).textContent || ''), null, { timeout: 8000 });
    await page.waitForTimeout(300); page.off('download', onDl);
    ok(!mmDownload, 'item8: complete с недоступным медиа — скачивание не началось');
    ok((await page.evaluate(() => localStorage.getItem('arch5_db_' + localStorage.getItem('arch5_active')))) === liveBeforeMM, 'item8: живой DB не изменён при MISSING_MEDIA');
    const [dl3] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('#be-mode .tp[data-be-mode="data-only"]'); await page.click('#be-create-btn'); })()]);
    ok(!!(await dl3.path()), 'item8: data-only работает даже при недоступном медиа');
    await page.click('#be-close');

    // ── Cleanup при закрытии ──
    await openSheet(page);
    await page.click('#be-tab-restore');
    await page.fill('#be-rpw', 'x'); await page.setInputFiles('#be-file', { name: 'complete.json', mimeType: 'application/json', buffer: Buffer.from(text2) });
    await page.click('#be-close');
    const cleaned = await page.evaluate(() => ({ rpw: document.getElementById('be-rpw').value, file: document.getElementById('be-file').value, open: document.getElementById('ov-backup-enc').classList.contains('on') }));
    ok(cleaned.rpw === '' && cleaned.file === '' && !cleaned.open, 'закрытие: пароль и выбор файла очищены, sheet закрыт');

    // ── Offline: backup-модули в service-worker cache (основа офлайна) ──
    // Прямая проверка кэша работает на обоих движках и доказывает, что модули
    // доступны офлайн без зависимости от навигации.
    await page.evaluate(async () => { if (navigator.serviceWorker) { try { await navigator.serviceWorker.ready; } catch (_) {} } });
    const cached = await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        const ks = await caches.keys();
        for (const k of ks) { const c = await caches.open(k); if (await c.match('./backup/backup-boot.mjs')) return true; }
        await new Promise(r => setTimeout(r, 300));
      }
      return false;
    });
    ok(cached, (ENGINE === 'webkit' ? 'WEBKIT_CACHE_PRESENCE=PASS — ' : '') + 'offline shell: backup-модули присутствуют в service-worker cache');
    // Полный офлайн-reload — обязательный PASS минимум на Chromium. В WebKit
    // headless reload при offline бросает internal error самого движка (не
    // приложения) — честно фиксируем BLOCKED_ENGINE_LIMITATION, а НЕ ok(true).
    if (ENGINE === 'chromium') {
      await ctx.setOffline(true);
      await page.reload({ waitUntil: 'load' });
      const offlineOk = await page.evaluate(() => new Promise(res => { setTimeout(() => res(!!(window.ArchBackup && window.ArchBackup.open)), 1500); }));
      ok(offlineOk, 'offline reload: backup-модуль загрузился из кэша (без import error)');
      await ctx.setOffline(false);
    } else {
      mark('BLOCKED_ENGINE_LIMITATION', 'WEBKIT_OFFLINE_RELOAD — WebKit headless не поддерживает reload в offline (ограничение движка); кэш модулей подтверждён (WEBKIT_CACHE_PRESENCE=PASS)');
    }
    await shot(page, '07-offline');

    ok(errors.length === 0, 'console/page errors отсутствуют (' + errors.length + (errors.length ? ': ' + errors[0] : '') + ')');
  } catch (e) {
    fail++; results.push({ ok: false, n: 'FATAL: ' + (e && e.message) }); console.error('FATAL', e && e.stack || e);
    try { await shot(page, 'FATAL'); } catch (_) {}
  } finally {
    await browser.close(); server.close();
  }

  const statuses = results.reduce((acc, r) => { const s = r.status || (r.ok ? 'PASS' : 'FAIL'); acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  await writeFile(join(OUT, 'report.json'), JSON.stringify({ engine: ENGINE, pass, fail, statuses, results, errors, ts: new Date().toISOString() }, null, 2));
  console.log('\nBackup evidence [' + ENGINE + ']: ' + pass + '/' + (pass + fail) + ' passed  · статусы ' + JSON.stringify(statuses) + '  (report: evidence/' + ENGINE + '/report.json)');
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('RUNNER FATAL', e); process.exit(1); });
