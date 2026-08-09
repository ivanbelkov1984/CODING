// ─────────────────────────────────────────────────────────────────────────
//  wave6-backup-roundtrip.test.mjs — Wave 6 (issue #160): роундтрип
//  зашифрованной переносимой копии для ДВУХ новых носителей состояния моста
//  внешней работы:
//    1) DB.externalWorkSessions — журнал импортов (audit/provenance/
//       идемпотентность), id-коллекция с namespaced строковыми id;
//    2) поле `ext` (provenance) на обычных canonical-записях.
//  Смысл проверки: мост НЕ должен иметь собственной логики переноса. Если
//  журнал и provenance переживают production-адаптер, шифрование и
//  production-оркестратор restore без единой строки Wave-6-специфичного кода,
//  значит резервная копия покрывает их генерически — и повторный импорт из
//  восстановленного профиля по-прежнему опознаётся как дубль по contentHash.
//
//  Использует ТЕ ЖЕ production adapter/core/restore, что и wave1/wave2/wave4
//  (фейки ниже — фейки браузерных примитивов, не логики бэкапа).
//  Только синтетические данные. Запуск: node tests/wave6-backup-roundtrip.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, decryptEnvelope, encryptPayload, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }
async function throwsCode(fn, code, n) {
  try { await fn(); ok(false, n + ' (не бросил, ожидался ' + code + ')'); return null; }
  catch (e) { ok(e instanceof BackupError && e.code === code, n + (e && e.code !== code ? ' (код ' + (e && e.code) + '/' + (e && e.message) + ')' : '')); return e; }
}

function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
}
function makeMedia() {
  const m = new Map();
  return { get: async id => (m.has(id) ? m.get(id) : undefined), put: async (id, val) => { m.set(id, val); }, del: async id => { m.delete(id); }, keys: async () => [...m.keys()] };
}
const NOW = '2026-08-08T12:00:00.000Z';
const HASH = 'a3f1c0de5b7284916d0e4f2a8c1b6739e5d40a92cf83b7e16d240985fa3c17bb';

// Синтетический provenance ровно той формы, которую пишет extProvenance()
// (app.js): все 17 полей, включая вложенный массив relatedSourceIds — именно
// его сохранность и проверяется побайтово.
const PROV = {
  format: 'architect-external-work-v1', packageHash: HASH, sessionRef: 'sess-1',
  sourceSystem: 'chatgpt', sourceModule: 'TEST-MODULE', sourceChatId: 'chat-test-1',
  sourceLabel: 'Синтетическая сессия', sourceId: 'TEST-LIFE-003', sourceDate: '2026-03-01',
  sourceDateRange: null, claimClass: 'user_fact', textOrigin: 'structured_summary',
  clientRef: 'i1', sourceExcerpt: null, relatedSourceIds: ['TEST-LIFE-001'],
  importedAt: NOW,
};

// Owner review 5228662919: многослойный claimClasses + несколько ссылок на
// источники с СОБСТВЕННЫМИ module/chatId. Именно это и обязано пережить
// зашифрованную копию без потерь — иначе provenance теряется при переносе.
const PROV_MULTI = {
  format: 'architect-external-work-v1', packageHash: HASH, sessionRef: 'sess-2',
  sourceSystem: 'google_drive', sourceModule: 'PARA-MODULE', sourceChatId: 'chat-para',
  sourceLabel: 'Синтетические практики', sourceId: 'TEST-PARA-500', sourceDate: '2026-02-20',
  sourceDateRange: null,
  claimClass: 'practice_action',
  claimClasses: ['practice_action', 'user_experience', 'symbolic_interpretation'],
  textOrigin: 'user_words', clientRef: 'p1', sourceExcerpt: null,
  sourceRefs: [
    { sourceId: 'TEST-PARA-500', role: 'primary', sourceSystem: 'google_drive', sourceModule: 'PARA-MODULE', sourceChatId: 'chat-para', sourceLabel: 'Синтетические практики', sourceDate: '2026-02-20', note: null },
    { sourceId: 'TEST-LIFE-500', role: 'alias', sourceSystem: 'chatgpt', sourceModule: 'LIFE-MODULE', sourceChatId: 'chat-life', sourceLabel: 'Дневник', sourceDate: '2026-02-20', note: 'тот же эпизод из дневника' },
  ],
  relatedSourceIds: [], importedAt: NOW,
};
const LEDGER = [{
  id: 'externalWork:msku8fyb-xc0cakcc8t6o',
  source: 'chatgpt', sourceLabel: 'Синтетическая сессия', sourceModule: 'TEST-MODULE',
  sourceChatId: 'chat-test-1', sessionDate: '2026-03-01', importedAt: NOW,
  formatVersion: 'architect-external-work-v1', contentHash: HASH,
  summary: 'Синтетическое резюме сессии',
  selectedCount: 2, rejectedCount: 0,
  recordRefs: [{ clientRef: 'i1', coll: 'insights', id: 1754654400001 }, { clientRef: 'd1', coll: 'dreams', id: 1754654400002 }],
  linkRefs: [{ id: 'psyLink:msku8fyb-a1b2c3d4e5f' }],
  status: 'imported', privacyClass: 'sensitive',
  createdAt: NOW, day: '2026-08-08', sv: 6, _u: 1754654400000,
}];
const INSIGHTS = [{
  id: 1754654400001, tag: 'personal', w: 3, title: 'Синтетический вывод',
  body: 'Синтетический текст инсайта для теста.', date: '01.03.2026',
  createdAt: NOW, day: '2026-08-08', sv: 6, src: 'Внешняя работа', links: [], media: [],
  ext: PROV,
}];

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      insights: INSIGHTS,
      dreams: [{ id: 1754654400002, title: 'Синтетический сон', body: 'Оригинальный рассказ сна — синтетический.', tone: 'тревожный', arch: 'Синтетическая трактовка', createdAt: NOW, day: '2026-08-08', sv: 6, media: [], ext: { ...PROV, clientRef: 'd1', sourceId: 'TEST-DREAM-001', claimClass: 'user_experience', textOrigin: 'user_words' } }],
      psyLinks: [{ id: 'psyLink:msku8fyb-a1b2c3d4e5f', fromColl: 'insights', fromId: 1754654400001, toColl: 'patterns', toId: 1754654400003, relation: 'insight_to_pattern', createdAt: NOW, day: '2026-08-08', sv: 6, _u: 1754654400000, source: 'user', acceptedAt: NOW, confidenceLabel: null }],
      patterns: [{ id: 1754654400003, text: 'Синтетический повторяющийся паттерн', type: 'behavior', createdAt: NOW, day: '2026-08-08', sv: 6 }],
      spiritual: [{ id: 1754654400004, type: 'практика', date: '20 февраля 2026 г.', text: 'Синтетическая практика с несколькими источниками.', createdAt: NOW, day: '2026-08-08', sv: 6, ext: PROV_MULTI }],
      externalWorkSessions: LEDGER,
      __ts: 123,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга', aiModel: 'claude-opus-4-8' }),
  });
  return { storage, media: makeMedia() };
}

async function main() {
  const { storage, media } = seed();
  const adapter = createBackupAdapter({ storage, media, now: () => NOW });

  // 1) data-only bundle несёт журнал и provenance без изменений: у моста нет
  //    собственного экспортного пути, коллекция подхватывается генерически.
  const { payload: dataOnly } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(JSON.stringify(dataOnly.db.externalWorkSessions) === JSON.stringify(LEDGER),
    'data-only bundle: журнал externalWorkSessions byte-identical');
  ok(JSON.stringify(dataOnly.db.insights[0].ext) === JSON.stringify(PROV),
    'data-only bundle: provenance ext на canonical-записи byte-identical');

  // 2) complete bundle — то же самое. У журнала нет медиа-ссылок, поэтому
  //    media-раздел остаётся пустым (журнал не тянет вложения).
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'complete' });
  ok(JSON.stringify(payload.db.externalWorkSessions) === JSON.stringify(LEDGER),
    'complete bundle: журнал byte-identical');
  ok(Array.isArray(payload.media) && payload.media.length === 0,
    'complete bundle: журнал не тянет за собой медиа');

  // 3) Шифрование PBKDF2 600k + AES-GCM-256 → расшифровка без потерь.
  const password = 'test-passphrase-wave6';
  const env = await encryptPayload(payload, password);
  const decrypted = await decryptEnvelope(env, password);
  ok(JSON.stringify(decrypted.db.externalWorkSessions) === JSON.stringify(payload.db.externalWorkSessions),
    'encrypted roundtrip: журнал byte-identical после расшифровки');
  ok(JSON.stringify(decrypted.db.insights[0].ext) === JSON.stringify(PROV),
    'encrypted roundtrip: provenance byte-identical после расшифровки');
  ok(decrypted.db.externalWorkSessions[0].contentHash === HASH,
    'encrypted roundtrip: contentHash сохранён — идемпотентность импорта переживает копию');

  // 4) Журнал приватный: он попадает ТОЛЬКО в шифрованную полезную нагрузку.
  //    Проверяем обе половины утверждения: (а) открытые метаданные конверта —
  //    это ровно format/версия/параметры KDF и шифра, ничего из содержимого;
  //    (б) во ВСЁМ файле целиком нет ни резюме сессии, ни sourceId, ни chatId.
  {
    const serialized = serializeEnvelope(env);
    const parsed = JSON.parse(serialized);
    const { ciphertext, ...clear } = parsed;
    ok(typeof ciphertext === 'string' && ciphertext.length > 0, 'конверт содержит шифротекст');
    ok(JSON.stringify(Object.keys(clear).sort()) === JSON.stringify(['cipher', 'envelopeVersion', 'format', 'kdf']),
      `открытые метаданные конверта — только format/версия/KDF/шифр (${Object.keys(clear).sort().join(',')})`);
    const secrets = ['Синтетическое резюме', 'TEST-LIFE-003', 'chat-test-1', HASH, LEDGER[0].id];
    const leaked = secrets.filter(s => serialized.includes(s));
    ok(leaked.length === 0,
      `в файле копии целиком нет резюме сессии, sourceId, chatId, contentHash и id журнала (${leaked.join(',') || 'нет утечек'})`);
  }

  // 5) Построение bundle не мутирует живой профиль (экспорт read-only).
  const liveDb = JSON.parse(storage.getItem(KEYS.db('pA')));
  ok(JSON.stringify(liveDb.externalWorkSessions) === JSON.stringify(LEDGER),
    'buildBundle не мутирует живой журнал в хранилище');

  // 6) Production restore (restoreBackup + createBackupAdapter), mode="new":
  //    журнал, provenance и ссылки recordRefs/linkRefs приезжают целиком, и
  //    id, на которые ссылается журнал, реально существуют в профиле.
  {
    const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    const result = await restoreBackup({
      adapter: destAdapter, file, password, mode: 'new',
      genProfileId: () => 'pNew1', now: () => NOW,
    });
    ok(result.ok && result.activated && result.committed, 'production restore (mode=new): commit успешен');

    const db = JSON.parse(dest.storage.getItem(KEYS.db('pNew1')));
    ok(JSON.stringify(db.externalWorkSessions) === JSON.stringify(LEDGER),
      'production restore: журнал в восстановленном профиле byte-identical');
    ok(JSON.stringify(db.insights[0].ext) === JSON.stringify(PROV),
      'production restore: provenance на canonical-записи byte-identical');

    // Owner review 5228662919: полный путь import → sync → encrypted backup →
    // restore для многослойного claim и нескольких ссылок на источники.
    const mp = db.spiritual[0].ext;
    ok(JSON.stringify(mp) === JSON.stringify(PROV_MULTI),
      'production restore: многослойный provenance byte-identical целиком');
    ok(JSON.stringify(mp.claimClasses) === JSON.stringify(['practice_action', 'user_experience', 'symbolic_interpretation']),
      'production restore: все три claim class пережили шифрованную копию');
    ok(mp.claimClass === 'practice_action' && mp.claimClasses.includes(mp.claimClass),
      'production restore: primary claim сохранён и остаётся частью набора');
    ok(mp.sourceRefs.length === 2 &&
       mp.sourceRefs[0].sourceModule === 'PARA-MODULE' && mp.sourceRefs[0].sourceChatId === 'chat-para' &&
       mp.sourceRefs[1].sourceModule === 'LIFE-MODULE' && mp.sourceRefs[1].sourceChatId === 'chat-life',
      'production restore: per-reference module/chatId не схлопнулись в один источник');
    ok(mp.sourceRefs.filter(r => r.role === 'primary').length === 1 &&
       mp.sourceRefs.filter(r => r.role === 'alias').length === 1,
      'production restore: роли primary/alias сохранены');

    const s = db.externalWorkSessions[0];
    const recsOk = s.recordRefs.every(r => (db[r.coll] || []).some(x => x.id === r.id));
    const linksOk = s.linkRefs.every(l => (db.psyLinks || []).some(x => x.id === l.id));
    ok(recsOk, 'production restore: все recordRefs журнала указывают на реально существующие записи');
    ok(linksOk, 'production restore: все linkRefs журнала указывают на реально существующие связи');
    ok(/^externalWork:/.test(s.id),
      'production restore: namespaced id журнала сохранён (общий tombstone-механизм остаётся безопасным)');
  }

  // 7) Неверный пароль — fail closed до любой мутации: существующий профиль
  //    со своим журналом не тронут и «осиротевший» профиль не создан.
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld',
        [KEYS.db('pOld')]: JSON.stringify({ externalWorkSessions: [{ id: 'externalWork:old-1', contentHash: 'ff'.repeat(32), status: 'imported' }] }),
        [KEYS.cfg('pOld')]: JSON.stringify({ userName: 'Old' }),
      }),
      media: makeMedia(),
    };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const beforeDb = dest.storage.getItem(KEYS.db('pOld'));
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    await throwsCode(
      () => restoreBackup({ adapter: destAdapter, file, password: 'WRONG-password', mode: 'new', now: () => NOW }),
      'DECRYPT_FAILED',
      'production restore: неверный пароль — DECRYPT_FAILED до любой мутации',
    );
    ok(beforeDb === dest.storage.getItem(KEYS.db('pOld')),
      'production restore: неудачный restore не изменил журнал существующего профиля');
    const profiles = JSON.parse(dest.storage.getItem(KEYS.PKEY));
    ok(profiles.length === 1 && profiles[0].id === 'pOld',
      'production restore: «осиротевший» профиль после ошибки не создан');
  }

  console.log(out.join('\n'));
  console.log(`\nWave 6 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
