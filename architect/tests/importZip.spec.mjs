// ИМПОРТ ПОСТАВКИ (.zip) — один архив = один предпросмотр = одна транзакция.
//
// Что здесь защищено:
//   1. Архив превращается в ОДИН feed существующего моста: кумулятивный
//      предпросмотр всех пакетов на одном кандидате, терминальная модель,
//      атомарный apply с полным откатом. Второго импортёра нет.
//   2. Fail-closed транспорт: битый архив, битый JSON, несовпавшая
//      контрольная сумма, отсутствующий файл манифеста, path traversal,
//      лишние файлы, дубль пакета, лимиты — всё отклоняется с нулевой
//      мутацией и внятной причиной.
//   3. Порядок пакетов задаёт манифест (order), не имена файлов.
//   4. Идемпотентность: повтор архива → 0 новых; частично ввезённый архив
//      довозит только остаток; сбой сохранения → полный откат.
//   5. Перезагрузка между предпросмотром и подтверждением не коммитит
//      устаревший предпросмотр.
//
// ВСЕ фикстуры синтетические (TEST-ZIP-*). Реальные данные владельца в
// репозиторий не попадают ни в каком виде (privacy canary внизу).
//
// Гоняет РЕАЛЬНЫЙ собранный бандл (dist/app.html) в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { deflateRawSync } from 'zlib';
import { createHash } from 'crypto';
import { encryptPayload, decryptEnvelope, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.IMPORTZIP_BUNDLE || join(ROOT, 'dist', 'app.html'));
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

// ── Синтетический генератор ZIP (stored + deflate, честные CRC) ─────
const CRC_T = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {
  // files: [{name, data:string|Buffer, method?:0|8, crc?:number(подмена)}]
  const chunks = []; const central = []; let offset = 0;
  const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xFFFF); return b; };
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const method = f.method === 0 ? 0 : 8;
    const packed = method === 0 ? data : deflateRawSync(data);
    const crc = typeof f.crc === 'number' ? f.crc : crc32(data);
    const usize = typeof f.usize === 'number' ? f.usize : data.length;   // лживый usize для бомбы
    const lh = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(packed.length), u32(usize), u16(name.length), u16(0), name, packed]);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(packed.length), u32(usize), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name]));
    chunks.push(lh); offset += lh.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(offset), u16(0)]);
  return Buffer.concat([...chunks, cd, eocd]);
}
const sha256 = buf => createHash('sha256').update(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8')).digest('hex');

// Синтетический v2-пакет.
let uid = 0;
const pkg = (sessionRef, entities) => ({
  format: 'architect-external-work-v2',
  source: { kind: 'google_drive', label: 'TEST-ZIP источник', module: 'TEST-ZIP-MODULE' },
  session: { clientRef: sessionRef, summary: 'синтетическая сессия', date: '2026-06-0' + ((++uid % 9) + 1) },
  entities,
});
const dream = (sid, body, seq, over) => ({
  clientRef: 'c' + (++uid), type: 'dream', sourceId: sid,
  claimClass: 'user_experience', textOrigin: 'structured_summary', sourceDate: '2026-06-01',
  sourceVersion: seq == null ? undefined : { sequence: seq },
  data: { title: 'сон ' + sid.slice(-6), body, arch: 'трактовка' }, ...(over || {}),
});
const insight = (sid, body, seq, over) => ({
  clientRef: 'c' + (++uid), type: 'insight', sourceId: sid,
  claimClass: 'user_experience', textOrigin: 'user_words', sourceDate: '2026-06-02',
  sourceVersion: seq == null ? undefined : { sequence: seq },
  data: { tag: 'personal', title: 'инсайт', body }, ...(over || {}),
});
// Каноническая поставка: FEEDS/ + манифест(поле packages c order/sha) + SHA256SUMS.
function delivery(pkgs, opts = {}) {
  const files = pkgs.map((p, i) => ({ name: `FEEDS/${String(i + 1).padStart(2, '0')}_TEST.json`, data: JSON.stringify(p) }));
  const manifest = {
    handoff: opts.handoff || 'TEST-ZIP-DELIVERY',
    packages: files.map((f, i) => ({ order: i + 1, file: f.name.slice(6), sha256: sha256(f.data) })),
  };
  const withMeta = [...files,
    { name: 'OWNER-IMPORT-MANIFEST.json', data: JSON.stringify(manifest) },
    { name: 'README-OWNER-IMPORT.txt', data: 'синтетическая поставка' }];
  const sums = withMeta.filter(f => /\.json$/.test(f.name)).map(f => `${sha256(f.data)}  ${f.name}`).join('\n');
  return makeZip(opts.mutate ? opts.mutate(withMeta, sums) : [...withMeta, { name: 'SHA256SUMS.txt', data: sums }]);
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => {
  const s = document.getElementById('splash'); if (s) s.style.display = 'none';
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

const COLLS = ['externalConnections', 'externalWorkSessions', 'insights', 'dreams', 'patterns',
  'whys', 'moments', 'psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations',
  'psyReviews', 'psyLinks', 'relationshipContexts', 'spiritual', 'evolution', 'sphereLogs'];
const reset = () => page.evaluate((colls) => {
  colls.forEach(c => { DB[c] = []; });
  DB._del = {};
  try { resolveRecovery('discarded'); } catch (_) {}
  if (typeof extBridgeCancel === 'function') extBridgeCancel();
  _extConnActive = null; _extBatchFeed = null; _extPendingConn = null;
  openExtImport();
}, COLLS);
const canonSnap = () => page.evaluate((colls) => JSON.stringify(Object.fromEntries(
  colls.map(c => [c, DB[c] || []]))), COLLS.filter(c => !['externalConnections', 'externalWorkSessions'].includes(c)));
const stateCounts = () => page.evaluate(() => ({
  dreams: DB.dreams.length, insights: DB.insights.length,
  journal: DB.externalWorkSessions.length,
  checkpoint: ((DB.externalConnections || [])[0] || { checkpoint: { committedPackageHashes: [] } }).checkpoint.committedPackageHashes.length,
  sources: (DB.externalConnections || []).length,
  refs: ['dreams', 'insights'].reduce((n, c) => n + DB[c].reduce((m, r) => m + ((r.ext && r.ext.sourceRefs) ? r.ext.sourceRefs.length : 0), 0), 0),
}));
const TMPZ = join(tmpdir(), 'test-zip-delivery.zip');
const pickZip = async (buf, expectPreview = true) => {
  // Прошлый результат стирается ДО выбора: ждать нужно свежий ответ, а не
  // совпадение со старым текстом на экране.
  await page.evaluate(() => {
    ['ext-out', 'ext-actions', 'ext-conn-out'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    const f = document.getElementById('ext-file'); if (f) f.value = '';
  });
  writeFileSync(TMPZ, buf);
  await page.setInputFiles('#ext-file', TMPZ);
  await page.waitForFunction(() => {
    const c = document.getElementById('ext-conn-out'), o = document.getElementById('ext-out');
    return (c && (c.innerHTML.includes('Что изменится') || /Не удалось прочитать/.test(c.textContent || ''))) ||
           (o && /не принят|Ошибка/.test(o.textContent || ''));
  }, null, { timeout: 15000 });
  return page.evaluate(() => ({
    conn: (document.getElementById('ext-conn-out').textContent || '').replace(/\s+/g, ' '),
    out: (document.getElementById('ext-out').textContent || '').replace(/\s+/g, ' '),
    note: (document.getElementById('ext-file-note') || {}).textContent || '',
    step: Number(document.querySelector('#ext-steps .ext-step.on').getAttribute('data-step')),
  }));
};
const applyBatch = async () => {
  await page.evaluate(() => extConnUiConfirm());
  const r = await page.evaluate(() => { const before = JSON.stringify(Object.keys(DB)); extConnUiApply(); return before && true; });
  await page.waitForTimeout(150);
  return page.evaluate(() => (document.getElementById('ext-conn-out').textContent || '').replace(/\s+/g, ' '));
};

console.log('\nИМПОРТ ПОСТАВКИ (.zip)\n');

// ── 1. Обычный JSON-файл по-прежнему работает ────────────────────────
{
  await reset();
  const TMPJ = join(tmpdir(), 'test-zip-single.json');
  writeFileSync(TMPJ, JSON.stringify(pkg('TEST-ZIP-S1', [dream('TEST-ZIP-D-SINGLE', 'нарратив', 1)])));
  await page.setInputFiles('#ext-file', TMPJ);
  await page.waitForFunction(() => document.getElementById('ext-out').innerHTML.trim() && !/Проверяю/.test(document.getElementById('ext-out').textContent), null, { timeout: 8000 });
  const st = await page.evaluate(() => (document.getElementById('ext-out').textContent || ''));
  ok(/Будет добавлено записей: 1/.test(st), 'одиночный JSON-файл работает как раньше', st.slice(0, 80));
  unlinkSync(TMPJ);
}

// ── 2. Happy path: архив из трёх пакетов ─────────────────────────────
{
  await reset();
  uid = 500;   // детерминизм: повтор в следующем сценарии соберёт те же байты
  const zip = delivery([
    pkg('TEST-ZIP-A1', [dream('TEST-ZIP-D1', 'нарратив 1', 1), dream('TEST-ZIP-D2', 'нарратив 2', 1)]),
    pkg('TEST-ZIP-A2', [insight('TEST-ZIP-I1', 'текст 1', 1)]),
    pkg('TEST-ZIP-A3', [insight('TEST-ZIP-I2', 'текст 2', 1)]),
  ]);
  const before = await canonSnap();
  const p1 = await pickZip(zip);
  ok(/пакетов: 3/.test(p1.note), 'подпись файла называет число пакетов', p1.note);
  ok(/Пакетов в поставке: 3/.test(p1.conn), 'предпросмотр называет число пакетов');
  ok(/Новых записей: 4/.test(p1.conn), 'кумулятивный итог NEW по всей поставке');
  ok(/Сны/.test(p1.conn) && /Инсайты/.test(p1.conn), 'разбивка по разделам приложения в предпросмотре');
  ok(/ничего не меняется/.test(p1.conn), 'гарантия «ещё ничего не записано» на экране');
  ok(before === await canonSnap(), 'предпросмотр архива: ноль канонических мутаций');
  ok((await stateCounts()).journal === 0 && (await stateCounts()).checkpoint === 0,
    'предпросмотр архива: журнал и чекпойнт не тронуты');
  ok(p1.step === 2, 'индикатор на шаге 2');
  const res = await applyBatch();
  const st = await stateCounts();
  ok(/Готово · добавлено записей: 4/.test(res), 'применение: итог назван', res.slice(0, 100));
  ok(/Сны/.test(res) && /Инсайты/.test(res), 'результат разложен по разделам');
  ok(st.dreams === 2 && st.insights === 2, `записи созданы (${st.dreams}/${st.insights})`);
  ok(st.journal === 3 && st.checkpoint === 3, `журнал и чекпойнт = пакетам (${st.journal}/${st.checkpoint})`);
  ok(st.sources === 1, 'источник создан автоматически из поставки — один');
  const backupBtn = await page.evaluate(() => [...document.querySelectorAll('#ext-actions button')].map(b => b.textContent.trim()));
  ok(backupBtn.some(b => /резервную копию/.test(b)), 'очевидный следующий шаг — создать резервную копию', backupBtn.join(' | '));
}

// ── 3. Повтор того же архива: 0 новых, 0 дублей ──────────────────────
{
  await page.evaluate(() => extResetToStep1());
  // Пакеты собираются с теми же clientRef/датами → тот же contentHash.
  uid = 500;
  const p1 = await pickZip(delivery([
    pkg('TEST-ZIP-A1', [dream('TEST-ZIP-D1', 'нарратив 1', 1), dream('TEST-ZIP-D2', 'нарратив 2', 1)]),
    pkg('TEST-ZIP-A2', [insight('TEST-ZIP-I1', 'текст 1', 1)]),
    pkg('TEST-ZIP-A3', [insight('TEST-ZIP-I2', 'текст 2', 1)]),
  ]));
  const st = await stateCounts();
  ok(/Новых записей: 0/.test(p1.conn), 'повтор: NEW=0', p1.conn.slice(0, 160));
  ok(/уже импортировано: 3|по журналу\): 3/.test(p1.conn), 'повтор: все пакеты опознаны по журналу');
  ok(st.dreams === 2 && st.insights === 2, 'повтор: дублей не создано');
  await page.evaluate(() => extBridgeCancel());
}

// ── 4. Кумулятивная зависимость: пакет 2 обновляет запись пакета 1 ───
{
  await reset();
  const p1 = await pickZip(delivery([
    pkg('TEST-ZIP-B1', [dream('TEST-ZIP-CHAIN', 'версия один', 1)]),
    pkg('TEST-ZIP-B2', [dream('TEST-ZIP-CHAIN', 'версия два', 2)]),
  ]));
  ok(/Новых записей: 1/.test(p1.conn) && /Будут обновлены: 1/.test(p1.conn),
    'пакет 2 видит запись пакета 1: NEW=1, CHANGED=1 (не дубль)', p1.conn.slice(0, 200));
  await applyBatch();
  const body = await page.evaluate(() => (DB.dreams.find(d => d.ext && /TEST-ZIP-CHAIN/.test(d.ext.sourceId)) || {}).body);
  const n = await page.evaluate(() => DB.dreams.length);
  ok(n === 1 && body === 'версия два', `применилась новейшая версия одной записи (${n}, «${body}»)`);
}

// ── 5. Порядок задаёт манифест, не имена файлов ──────────────────────
{
  await reset();
  // Алфавитный порядок имён — НЕПРАВИЛЬНЫЙ (сначала обновление, потом
  // создание). Манифест указывает верный: создание → обновление.
  const create = pkg('TEST-ZIP-C1', [dream('TEST-ZIP-ORD', 'первая', 1)]);
  const update = pkg('TEST-ZIP-C2', [dream('TEST-ZIP-ORD', 'вторая', 2)]);
  const files = [
    { name: 'FEEDS/aa_update.json', data: JSON.stringify(update) },
    { name: 'FEEDS/zz_create.json', data: JSON.stringify(create) },
  ];
  const manifest = { handoff: 'TEST-ZIP-ORDER', packages: [
    { order: 1, file: 'zz_create.json', sha256: sha256(files[1].data) },
    { order: 2, file: 'aa_update.json', sha256: sha256(files[0].data) },
  ] };
  const all = [...files, { name: 'OWNER-IMPORT-MANIFEST.json', data: JSON.stringify(manifest) }];
  const sums = all.map(f => `${sha256(f.data)}  ${f.name}`).join('\n');
  const p1 = await pickZip(makeZip([...all, { name: 'SHA256SUMS.txt', data: sums }]));
  ok(/Новых записей: 1/.test(p1.conn) && /Будут обновлены: 1/.test(p1.conn) && !/не будет применена/.test(p1.conn),
    'порядок манифеста применён: создание раньше обновления, блокировок нет', p1.conn.slice(0, 220));
  await applyBatch();
  const body = await page.evaluate(() => (DB.dreams[0] || {}).body);
  ok(body === 'вторая', 'после применения — новейшая версия');
}

// ── 6. Одинаковый текст, разные sourceId → две записи ────────────────
{
  await reset();
  const p1 = await pickZip(delivery([
    pkg('TEST-ZIP-T1', [dream('TEST-ZIP-TXT-1', 'одинаковый текст', 1), dream('TEST-ZIP-TXT-2', 'одинаковый текст', 1)]),
  ]));
  ok(/Новых записей: 2/.test(p1.conn), 'похожесть текста не участвует в идентичности');
  await applyBatch();
  ok((await stateCounts()).dreams === 2, 'созданы две отдельные записи');
}

// ── 7. Частично ввезённая поставка: довозится только остаток ─────────
{
  await reset();
  uid = 100;
  const pkgA = pkg('TEST-ZIP-P1', [dream('TEST-ZIP-PD1', 'нарратив A', 1)]);
  await pickZip(delivery([pkgA]));
  await applyBatch();
  await page.evaluate(() => extResetToStep1());
  uid = 100;
  const pkgA2 = pkg('TEST-ZIP-P1', [dream('TEST-ZIP-PD1', 'нарратив A', 1)]);
  const pkgB = pkg('TEST-ZIP-P2', [dream('TEST-ZIP-PD2', 'нарратив B', 1)]);
  const p2 = await pickZip(delivery([pkgA2, pkgB]));
  ok(/уже импортировано: 1|по журналу\): 1/.test(p2.conn) && /Новых записей: 1/.test(p2.conn),
    'предпросмотр честно делит: 1 пакет уже ввезён, 1 новый', p2.conn.slice(0, 200));
  await applyBatch();
  const st = await stateCounts();
  ok(st.dreams === 2 && st.journal === 2, `довезён только остаток (${st.dreams} записи, журнал ${st.journal})`);
}

// ── 8. Транспортные отказы: ноль мутаций, внятные причины ────────────
{
  await reset();
  const goodZip = delivery([pkg('TEST-ZIP-E1', [dream('TEST-ZIP-ED1', 'нарратив', 1)])]);
  const before = await canonSnap();

  // битый внешний архив
  let p1 = await pickZip(Buffer.from(goodZip.subarray(0, Math.floor(goodZip.length / 2))), false);
  ok(/не принят/.test(p1.out) && /повреждён|central directory/.test(p1.out), 'обрезанный архив отклонён', p1.out.slice(0, 120));
  ok(p1.step === 1, 'после отказа индикатор остаётся на шаге 1');

  // битый внутренний JSON
  p1 = await pickZip(makeZip([{ name: 'FEEDS/01.json', data: '{сломан' }]), false);
  ok(/не принят/.test(p1.out) && /01\.json/.test(p1.out), 'битый JSON отклонён с именем файла', p1.out.slice(0, 140));

  // подменённая контрольная сумма
  p1 = await pickZip(delivery([pkg('TEST-ZIP-E2', [dream('TEST-ZIP-ED2', 'нарратив', 1)])], {
    mutate: (files) => [...files, { name: 'SHA256SUMS.txt', data: files.filter(f => /\.json$/.test(f.name)).map(f => `${'0'.repeat(64)}  ${f.name}`).join('\n') }],
  }), false);
  ok(/контрольная сумма не совпала/.test(p1.out), 'несовпавшая SHA256 отклонена', p1.out.slice(0, 140));

  // манифест указывает отсутствующий файл
  const mMissing = { packages: [{ order: 1, file: 'нет-такого.json' }] };
  p1 = await pickZip(makeZip([
    { name: 'FEEDS/01.json', data: JSON.stringify(pkg('TEST-ZIP-E3', [dream('TEST-ZIP-ED3', 'н', 1)])) },
    { name: 'OWNER-IMPORT-MANIFEST.json', data: JSON.stringify(mMissing) },
  ]), false);
  ok(/которого нет в архиве/.test(p1.out), 'отсутствующий файл из манифеста отклонён', p1.out.slice(0, 140));

  // path traversal
  p1 = await pickZip(makeZip([{ name: '../evil.json', data: JSON.stringify(pkg('TEST-ZIP-E4', [dream('TEST-ZIP-ED4', 'н', 1)])) }]), false);
  ok(/небезопасное имя/.test(p1.out), 'path traversal отклонён', p1.out.slice(0, 120));

  // слишком много файлов
  const many = Array.from({ length: 65 }, (_, i) => ({ name: `FEEDS/f${i}.json`, data: '{}' }));
  p1 = await pickZip(makeZip(many), false);
  ok(/слишком много файлов/.test(p1.out), 'лимит числа файлов работает', p1.out.slice(0, 120));

  // неподдерживаемый формат пакета
  p1 = await pickZip(makeZip([{ name: 'FEEDS/01.json', data: JSON.stringify({ format: 'weird-format', entities: [] }) }]), false);
  ok(/01\.json/.test(p1.out) && /format|формат/i.test(p1.out), 'неподдерживаемый формат отклонён', p1.out.slice(0, 160));

  // дубль одинакового пакета в двух файлах
  uid = 200; const dup1 = pkg('TEST-ZIP-DUP', [dream('TEST-ZIP-DUPD', 'н', 1)]);
  uid = 200; const dup2 = pkg('TEST-ZIP-DUP', [dream('TEST-ZIP-DUPD', 'н', 1)]);
  p1 = await pickZip(makeZip([
    { name: 'FEEDS/01.json', data: JSON.stringify(dup1) },
    { name: 'FEEDS/02.json', data: JSON.stringify(dup2) },
  ]), false);
  ok(/двойная поставка запрещена/.test(p1.out), 'дубль пакета в двух файлах отклонён', p1.out.slice(0, 140));

  // повреждённые данные записи (CRC)
  const zbuf = makeZip([{ name: 'FEEDS/01.json', data: JSON.stringify(pkg('TEST-ZIP-E5', [dream('TEST-ZIP-ED5', 'н', 1)])), method: 0 }]);
  const patched = Buffer.from(zbuf); patched[50] = patched[50] ^ 0xFF;   // байт внутри stored-данных (данные с offset 43)
  p1 = await pickZip(patched, false);
  ok(/CRC|не совпал/.test(p1.out), 'повреждённые данные записи отклонены (CRC)', p1.out.slice(0, 140));

  // слишком большой распакованный файл
  p1 = await pickZip(makeZip([{ name: 'FEEDS/big.json', data: Buffer.alloc(9 * 1024 * 1024, 0x20), method: 8 }]), false);
  ok(/слишком большой после распаковки/.test(p1.out), 'лимит размера одного файла работает', p1.out.slice(0, 120));

  ok(before === await canonSnap(), 'ВСЕ транспортные отказы: ноль канонических мутаций');
  const st = await stateCounts();
  ok(st.journal === 0, 'журнал не тронут ни одним отказом');
}

// ── 9. BOM в feed-файле — валидный транспорт ─────────────────────────
{
  await reset();
  const body = JSON.stringify(pkg('TEST-ZIP-BOM', [dream('TEST-ZIP-BOMD', 'нарратив', 1)]));
  const withBom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(body, 'utf8')]);
  const p1 = await pickZip(makeZip([{ name: 'FEEDS/01.json', data: withBom }]));
  ok(/Новых записей: 1/.test(p1.conn), 'файл с UTF-8 BOM импортируется', (p1.conn || p1.out).slice(0, 120));
}

// ── 10. Блокирующие состояния протекают из моста без ослаблений ──────
{
  // конфликт идентичности: один sourceId — два типа в разных пакетах
  await reset();
  let p1 = await pickZip(delivery([
    pkg('TEST-ZIP-X1', [dream('TEST-ZIP-CROSS', 'нарратив', 1)]),
    pkg('TEST-ZIP-X2', [insight('TEST-ZIP-CROSS', 'текст', 1)]),
  ]));
  ok(/Конфликты: 1/.test(p1.conn), 'кросс-типовой конфликт идентичности виден в предпросмотре', p1.conn.slice(0, 200));
  const before = await canonSnap();
  const res = await applyBatch();
  ok(/откатен целиком|не применена|не применен/.test(res), 'apply с конфликтом отказывает целиком', res.slice(0, 160));
  ok(before === await canonSnap(), 'после отказа canonical byte-identical');
  ok((await stateCounts()).journal === 0 && (await stateCounts()).checkpoint === 0, 'журнал/чекпойнт не продвинуты');

  // STALE: в приложении версия новее
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-ST1', [dream('TEST-ZIP-STALE', 'новая', 5)])]));
  await applyBatch();
  await page.evaluate(() => extResetToStep1());
  p1 = await pickZip(delivery([pkg('TEST-ZIP-ST2', [dream('TEST-ZIP-STALE', 'старая', 2)])]));
  ok(/более старые уже известные версии: 1/.test(p1.conn), 'STALE виден в предпросмотре');
  const r2 = await applyBatch();
  ok(/не применена/.test(r2) && (await page.evaluate(() => DB.dreams[0].body)) === 'новая',
    'STALE блокирует поставку, запись не откатилась', r2.slice(0, 140));

  // ORDER_UNKNOWN: обновление без доказательства порядка
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-OU1', [dream('TEST-ZIP-ORDU', 'первая', null)])]));
  await applyBatch();
  await page.evaluate(() => extResetToStep1());
  p1 = await pickZip(delivery([pkg('TEST-ZIP-OU2', [dream('TEST-ZIP-ORDU', 'другая', null)])]));
  ok(/Порядок версий неизвестен: 1/.test(p1.conn), 'ORDER_UNKNOWN виден в предпросмотре');
  const r3 = await applyBatch();
  ok(/не применена/.test(r3), 'ORDER_UNKNOWN блокирует поставку', r3.slice(0, 140));

  // UPDATE_REJECTED: попытка повышения до факта
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-UR1', [dream('TEST-ZIP-UPRJ', 'опыт', 1)])]));
  await applyBatch();
  await page.evaluate(() => extResetToStep1());
  p1 = await pickZip(delivery([pkg('TEST-ZIP-UR2', [dream('TEST-ZIP-UPRJ', 'опыт', 2, { claimClass: 'external_event', textOrigin: 'structured_summary' })])]));
  ok(/защитой утверждений: 1/.test(p1.conn), 'UPDATE_REJECTED виден в предпросмотре', p1.conn.slice(0, 260));
  const r4 = await applyBatch();
  ok(/не применена/.test(r4), 'UPDATE_REJECTED блокирует поставку', r4.slice(0, 140));
}

// ── 11. Поздний сбой пакета → полный откат всего архива ──────────────
{
  // claim promotion при СОЗДАНИИ бьётся ещё на валидации пакета: весь
  // предпросмотр отказывает fail-closed, до кнопки дело не доходит.
  await reset();
  const pv = await pickZip(delivery([
    pkg('TEST-ZIP-R0', [insight('TEST-ZIP-RI0', 'текст', 1, { textOrigin: 'assistant_interpretation', claimClass: 'external_event' })]),
  ]));
  ok(/Не удалось прочитать/.test(pv.conn), 'promotion на создании отклонён на валидации (fail-closed)', pv.conn.slice(0, 200));
  ok((await stateCounts()).dreams === 0 && (await stateCounts()).journal === 0, 'отказ валидации: ноль мутаций');

  // Поздний сбой НА COMMIT-СТАДИИ: пакет 2 несёт invalid plan-статуса
  // (защита «not_done ≠ not_helpful») — применение обязано откатить ВСЁ.
  await reset();
  const badEpisode = {
    clientRef: 'r2', type: 'psyInterventionEpisode', sourceId: 'TEST-ZIP-RI1',
    claimClass: 'practice_action', textOrigin: 'structured_summary', sourceDate: '2026-06-04',
    sourceVersion: { sequence: 1 },
    data: { dateTime: '2026-06-04T10:00:00Z', targetProblem: 'x', targetMechanism: 'y',
      methodFamily: 'CBT', interventionSummary: 'z', adherence: 'not_done', outcomeClass: 'not_helpful' },
  };
  const p1 = await pickZip(delivery([
    pkg('TEST-ZIP-R1', [dream('TEST-ZIP-RD1', 'нарратив', 1)]),
    pkg('TEST-ZIP-R2', [badEpisode]),
  ]));
  ok(/Отклонено: 1/.test(p1.conn), 'проблемный пакет виден в предпросмотре', p1.conn.slice(0, 220));
  const before = await canonSnap();
  const res = await applyBatch();
  ok(/откатен целиком/.test(res), 'сбой позднего пакета откатывает ВЕСЬ архив', res.slice(0, 160));
  ok(before === await canonSnap(), 'canonical byte-identical после отката');
  const st = await stateCounts();
  ok(st.journal === 0 && st.checkpoint === 0 && st.dreams === 0, 'журнал/чекпойнт/записи — нетронуты');
}

// ── 12. Сбой persist → полный откат ──────────────────────────────────
{
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-PF1', [dream('TEST-ZIP-PFD1', 'нарратив', 1)])]));
  const before = await canonSnap();
  const res = await page.evaluate(() => {
    const orig = persist;
    persist = () => false;
    extConnUiConfirm(); extConnUiApply();
    persist = orig;
    return (document.getElementById('ext-conn-out').textContent || '').replace(/\s+/g, ' ');
  });
  ok(/не применён|не удалось сохранить/.test(res), 'отказ хранилища честно показан', res.slice(0, 140));
  ok(before === await canonSnap(), 'canonical byte-identical после отказа persist');
  ok((await stateCounts()).journal === 0, 'журнал не продвинут');
}

// ── 13. Сбой сохранения чекпойнта → честное degraded, без дублей ─────
{
  await reset();
  uid = 400;
  await pickZip(delivery([pkg('TEST-ZIP-CK1', [dream('TEST-ZIP-CKD1', 'нарратив', 1)])]));
  const res = await page.evaluate(() => {
    const orig = persist; let calls = 0;
    persist = () => { calls++; return calls === 2 ? false : orig(); };
    extConnUiConfirm(); extConnUiApply();
    persist = orig;
    return (document.getElementById('ext-conn-out').textContent || '').replace(/\s+/g, ' ');
  });
  ok(/checkpoint.*не сохранена|контрольная точка/.test(res), 'деградация чекпойнта показана честно', res.slice(0, 160));
  const st = await stateCounts();
  ok(st.dreams === 1 && st.journal === 1, 'записи и журнал применены (данные не потеряны)');
  // повтор безопасен: журнал даёт 0 дублей, чекпойнт догоняет
  await page.evaluate(() => extResetToStep1());
  uid = 400;
  const p2 = await pickZip(delivery([pkg('TEST-ZIP-CK1', [dream('TEST-ZIP-CKD1', 'нарратив', 1)])]));
  void p2;
  await applyBatch();
  const st2 = await stateCounts();
  ok(st2.dreams === 1 && st2.checkpoint === 1, `повтор: 0 дублей, чекпойнт догнал (${st2.dreams}/${st2.checkpoint})`);
}

// ── 14. Перезагрузка между предпросмотром и подтверждением ───────────
{
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-RL1', [dream('TEST-ZIP-RLD1', 'нарратив', 1)])]));
  const res = await page.evaluate(() => {
    _bridgePending = null;   // эквивалент перезагрузки: preview живёт только в памяти
    extConnUiApply();
    return (document.getElementById('ext-conn-out').textContent || '').replace(/\s+/g, ' ');
  });
  ok(/нет готового предпросмотра/.test(res), 'устаревший предпросмотр не коммитится вслепую', res.slice(0, 140));
  ok((await stateCounts()).dreams === 0, 'ноль мутаций');
}

// ── 15. Изоляция профилей ────────────────────────────────────────────
{
  await reset();
  const profilesBefore = await page.evaluate(() => loadProfiles().length);
  await pickZip(delivery([pkg('TEST-ZIP-PR1', [dream('TEST-ZIP-PRD1', 'нарратив', 1)])]));
  await applyBatch();
  const profilesAfter = await page.evaluate(() => loadProfiles().length);
  ok(profilesBefore === profilesAfter, `импорт не создаёт и не трогает другие профили (${profilesBefore}→${profilesAfter})`);
}

// ── 16. Шифрованная копия после ZIP-импорта + replay после restore ───
{
  await reset();
  uid = 300;
  const zipBuf = delivery([
    pkg('TEST-ZIP-BK1', [dream('TEST-ZIP-BKD1', 'нарратив 1', 1)]),
    pkg('TEST-ZIP-BK2', [insight('TEST-ZIP-BKI1', 'текст 1', 1)]),
  ]);
  await pickZip(zipBuf);
  await applyBatch();
  const snap = await page.evaluate(() => JSON.parse(JSON.stringify(DB)));
  const extAfter = await page.evaluate((cs) => cs.flatMap(c => (DB[c] || []).map(r => r.ext).filter(Boolean)),
    ['dreams', 'insights']);
  const feedText = await page.evaluate(() => _extBatchFeed.text);
  const mkStorage = (init = {}) => { const m = new Map(Object.entries(init));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] }; };
  const mkMedia = () => { const m = new Map(); return { get: async i => m.get(i), put: async (i, v) => { m.set(i, v); }, del: async i => { m.delete(i); }, keys: async () => [...m.keys()] }; };
  const NOW = '2026-12-31T00:00:00.000Z';
  const st = mkStorage({ [KEYS.PKEY]: JSON.stringify([{ id: 'pZ', name: 'Z', color: '#1056CC' }]), [KEYS.AKEY]: 'pZ',
    [KEYS.db('pZ')]: JSON.stringify(snap), [KEYS.cfg('pZ')]: JSON.stringify({ userName: 'Z' }) });
  const adapter = createBackupAdapter({ storage: st, media: mkMedia(), now: () => NOW });
  const { payload } = await adapter.buildBundle({ id: 'pZ', mode: 'data-only' });
  const env = await encryptPayload(payload, 'test-zip-backup');
  const ser = serializeEnvelope(env);
  await decryptEnvelope(env, 'test-zip-backup');
  const dest = { storage: mkStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: mkMedia() };
  const ad2 = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
  const r = await restoreBackup({ adapter: ad2, file: { size: ser.length, text: async () => ser }, password: 'test-zip-backup', mode: 'new', genProfileId: () => 'pR', now: () => NOW });
  const rdb = JSON.parse(dest.storage.getItem(KEYS.db('pR')));
  const extRestored = ['dreams', 'insights'].flatMap(c => (rdb[c] || []).map(x => x.ext).filter(Boolean));
  ok(r.ok && JSON.stringify(extAfter) === JSON.stringify(extRestored),
    'шифрованная копия после ZIP-импорта: provenance byte-identical');
  ok(!extAfter.some(e => e.sourceId && ser.includes(String(e.sourceId))), 'sourceId не лежит в копии открытым текстом');
  const replay = await page.evaluate(async ({ snapStr, text }) => {
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, JSON.parse(snapStr)); persist();
    const rr = await extBridgeRefresh(DB.externalConnections[0].id, text);
    extBridgeCancel();
    return { new: rr.totals.new, changed: rr.totals.changed };
  }, { snapStr: JSON.stringify(rdb), text: feedText });
  ok(replay.new === 0 && replay.changed === 0, `replay после restore: 0/0 (${replay.new}/${replay.changed})`);
}

// ── 17. UX-прозрачность безопасной нормализации ──────────────────────
{
  await reset();
  const e = {
    clientRef: 'n1', type: 'psyInterventionEpisode', sourceId: 'TEST-ZIP-NORM-1',
    claimClass: 'practice_action', textOrigin: 'structured_summary', sourceDate: '2026-06-03',
    sourceVersion: { sequence: 1 },
    data: { dateTime: '2026-06-03T10:00:00Z', targetProblem: 'x', targetMechanism: 'y',
      methodFamily: 'CBT', interventionSummary: 'z', adherence: 'done',
      outcomeClass: 'unclear', acceptability: 'TEST-вне-словаря' },
  };
  const p1 = await pickZip(delivery([pkg('TEST-ZIP-N1', [e])]));
  ok(/значению «неизвестно»: 1/.test(p1.conn), 'нормализация вне словаря видна в предпросмотре', p1.conn.slice(0, 260));
  await applyBatch();
  const val = await page.evaluate(() => (DB.psyInterventionEpisodes[0] || {}).acceptability);
  ok(val === 'unknown', 'семантика не расширена: значение приведено к unknown');
}

// ── 19. ZIP-бомба: лживый usize отклоняется ПОТОКОВЫМ лимитом ────────
{
  await reset();
  // central directory заявляет 10 байт, deflate раздувается в 200 КБ.
  const big = Buffer.alloc(200 * 1024, 0x30);
  const p1 = await pickZip(makeZip([{ name: 'FEEDS/01.json', data: big, method: 8, usize: 10, crc: crc32(big) }]), false);
  ok(/превышают заявленный размер/.test(p1.out),
    'лживый usize отклонён потоковым лимитом (обрыв ДО буферизации)', p1.out.slice(0, 160));
  ok((await stateCounts()).journal === 0, 'бомба: ноль мутаций');
}

// ── 20. SHA256SUMS: только точный путь записи ────────────────────────
{
  await reset();
  const feedData = JSON.stringify(pkg('TEST-ZIP-SP1', [dream('TEST-ZIP-SPD1', 'нарратив', 1)]));
  // сумма ВЕРНАЯ, но путь указывает на другой каталог — совпадение по
  // basename было бы подменой.
  const p1 = await pickZip(makeZip([
    { name: 'FEEDS/x.json', data: feedData },
    { name: 'SHA256SUMS.txt', data: `${sha256(feedData)}  OTHER/x.json` },
  ]), false);
  ok(/OTHER\/x\.json.*отсутствует в архиве|отсутствует в архиве/.test(p1.out),
    'SHA256SUMS: чужой путь с верной суммой отклонён как отсутствующий файл', p1.out.slice(0, 160));
}

// ── 21. Манифест: дубли order и неоднозначный basename — fail closed ─
{
  await reset();
  const a = JSON.stringify(pkg('TEST-ZIP-MO1', [dream('TEST-ZIP-MOD1', 'н1', 1)]));
  const b = JSON.stringify(pkg('TEST-ZIP-MO2', [dream('TEST-ZIP-MOD2', 'н2', 1)]));
  let p1 = await pickZip(makeZip([
    { name: 'FEEDS/01.json', data: a },
    { name: 'FEEDS/02.json', data: b },
    { name: 'OWNER-IMPORT-MANIFEST.json', data: JSON.stringify({ packages: [
      { order: 1, file: '01.json' }, { order: 1, file: '02.json' }] }) },
  ]), false);
  ok(/order.*повторяются/.test(p1.out), 'дубль order в манифесте отклонён', p1.out.slice(0, 140));

  p1 = await pickZip(makeZip([
    { name: 'FEEDS/x.json', data: a },
    { name: 'SUB/FEEDS/x.json', data: b },
    { name: 'OWNER-IMPORT-MANIFEST.json', data: JSON.stringify({ packages: [{ order: 1, file: 'x.json' }] }) },
  ]), false);
  ok(/неоднозначно/.test(p1.out), 'неоднозначный basename в манифесте отклонён', p1.out.slice(0, 140));
}

// ── 22. Автоисточник не персистентен до подтверждения ────────────────
{
  // чистое состояние → предпросмотр → источников в DB нет
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-PC1', [dream('TEST-ZIP-PCD1', 'нарратив', 1)])]));
  let sources = await page.evaluate(() => { persist(); return DB.externalConnections.length; });
  ok(sources === 0, `предпросмотр не создаёт персистентного источника (${sources})`);
  // отмена/сброс → по-прежнему ноль
  await page.evaluate(() => extResetToStep1());
  sources = await page.evaluate(() => { persist(); return DB.externalConnections.length; });
  ok(sources === 0, 'после отмены источников нет');

  // битый архив → ноль
  await pickZip(Buffer.from('PK\x03\x04мусор'), false);
  sources = await page.evaluate(() => DB.externalConnections.length);
  ok(sources === 0, 'битый архив не оставляет источника');

  // предпросмотр → сбой persist на apply → ноль
  await page.evaluate(() => extResetToStep1());
  uid = 700;
  await pickZip(delivery([pkg('TEST-ZIP-PC2', [dream('TEST-ZIP-PCD2', 'нарратив', 1)])]));
  sources = await page.evaluate(() => {
    const orig = persist;
    persist = () => false;
    extConnUiConfirm(); extConnUiApply();
    persist = orig;
    persist();
    return DB.externalConnections.length;
  });
  ok(sources === 0, `сбой apply не оставляет источника-сироты (${sources})`);

  // предпросмотр → успешный apply → ровно один персистентный источник
  await page.evaluate(() => extResetToStep1());
  uid = 700;
  await pickZip(delivery([pkg('TEST-ZIP-PC2', [dream('TEST-ZIP-PCD2', 'нарратив', 1)])]));
  await applyBatch();
  const st = await page.evaluate(() => ({ sources: DB.externalConnections.length, dreams: DB.dreams.length,
    checkpoint: DB.externalConnections[0].checkpoint.committedPackageHashes.length }));
  ok(st.sources === 1 && st.dreams === 1 && st.checkpoint === 1,
    `успешный apply создаёт ровно один источник с чекпойнтом (${st.sources}/${st.dreams}/${st.checkpoint})`);
}

// ── 18. a11y и мобильная вёрстка ZIP-пути ────────────────────────────
{
  await reset();
  await pickZip(delivery([pkg('TEST-ZIP-A11Y', [dream('TEST-ZIP-A11YD', 'нарратив', 1)])]));
  const ui = await page.evaluate(() => {
    const ov = document.getElementById('ov-ext-import');
    const vis = el => !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
    const btns = [...ov.querySelectorAll('button')].filter(vis);
    return {
      small: btns.filter(b => b.getBoundingClientRect().height < 44).length,
      unnamed: btns.filter(b => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length,
      overflow: btns.filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth + 1; }).length,
      live: document.getElementById('ext-conn-out').getAttribute('aria-live'),
      label: !!ov.querySelector('label[for="ext-file"]'),
    };
  });
  ok(ui.small === 0 && ui.unnamed === 0 && ui.overflow === 0,
    `a11y: тап-цели ≥44px, кнопки именованы, без переполнения (${ui.small}/${ui.unnamed}/${ui.overflow})`);
  ok(ui.live === 'polite' && ui.label, 'a11y: aria-live и подпись поля файла на месте');
  const err = await pickZip(Buffer.from('PK\x03\x04мусор'), false);
  const alertRole = await page.evaluate(() => !!document.querySelector('#ext-out [role="alert"]'));
  ok(/не принят/.test(err.out) && alertRole, 'ошибка архива объявляется как alert');
}

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 3).join('\n'));

// ── Privacy canary ──────────────────────────────────────────────────
{
  const src = readFileSync(join(DIR, 'importZip.spec.mjs'), 'utf8');
  const bundle = readFileSync(join(ROOT, 'dist', 'app.html'), 'utf8');
  // Маркеры собраны по кускам, чтобы сам файл не содержал искомую строку.
  const marks = [['GDRI', 'VE:'], ['LIFE-2', '02'], ['DREAM-2', '02'], ['PARA-2', '02'], ['INT-2', '02'],
    ['B01A_QU', 'EUE'], ['OWNERIMP', 'ORT-B01']].map(p => new RegExp(p.join('')));
  const inSpec = marks.filter(r => r.test(src)).length;
  const inBundle = marks.filter(r => r.test(bundle)).length;
  ok(inSpec === 0 && inBundle === 0,
    `privacy canary: приватных маркеров нет ни в тесте, ни в бандле (${inSpec}/${inBundle})`);
  ok(/TEST-ZIP-/.test(src), 'все фикстуры несут синтетический префикс TEST-ZIP-*');
}

try { unlinkSync(TMPZ); } catch (_) {}
await browser.close();
console.log(`\nИМПОРТ ПОСТАВКИ (.zip): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
