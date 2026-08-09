// ─────────────────────────────────────────────────────────────────────────
//  wave7-backup-roundtrip.test.mjs — Wave 7 (issue #162): роундтрип
//  зашифрованной переносимой копии для ПЯТИ новых психологических коллекций.
//
//  Смысл: у Psychology Workspace нет и не должно быть собственного backup/sync
//  движка. Если пять коллекций и их provenance переживают production-адаптер,
//  шифрование и production restore без единой строки Wave-7-специфичного кода,
//  значит копия покрывает их генерически.
//
//  Использует ТЕ ЖЕ production adapter/core/restore, что Волны 1/2/4/6.
//  Только синтетические данные. Запуск: node tests/wave7-backup-roundtrip.test.mjs
// ─────────────────────────────────────────────────────────────────────────

import { BackupError, decryptEnvelope, encryptPayload, serializeEnvelope } from '../backup/backup-core.mjs';
import { createBackupAdapter, KEYS } from '../backup/backup-adapter.mjs';
import { restoreBackup } from '../backup/backup-restore.mjs';

let pass = 0, fail = 0; const out = [];
function ok(c, n) { if (c) { pass++; out.push('  ✓ ' + n); } else { fail++; out.push('  ✗ ' + n); } }
async function throwsCode(fn, code, n) {
  try { await fn(); ok(false, n + ' (не бросил, ожидался ' + code + ')'); return null; }
  catch (e) { ok(e instanceof BackupError && e.code === code, n + (e && e.code !== code ? ' (код ' + (e && e.code) + ')' : '')); return e; }
}
function makeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] };
}
function makeMedia() {
  const m = new Map();
  return { get: async id => (m.has(id) ? m.get(id) : undefined), put: async (id, v) => { m.set(id, v); }, del: async id => { m.delete(id); }, keys: async () => [...m.keys()] };
}
const NOW = '2026-08-09T12:00:00.000Z';
const HASH = 'b7c2d1e0a9f8473625140fedcba98765432100abcdef1234567890abcdef1234';

// Provenance формы Волны 6 на психологической записи Волны 7.
const PROV = {
  format: 'architect-external-work-v2', packageHash: HASH, sessionRef: 'TEST-PSY-SESSION-1',
  sourceSystem: 'chatgpt', sourceModule: 'TEST-PSY-MODULE', sourceChatId: 'chat-psy-1',
  sourceLabel: 'Синтетическая сессия', sourceId: 'TEST-INT-001', sourceDate: '2026-03-02',
  sourceDateRange: null, claimClass: 'practice_action',
  claimClasses: ['practice_action', 'user_experience', 'symbolic_interpretation'],
  textOrigin: 'user_words', clientRef: 'e1', sourceExcerpt: null,
  sourceRefs: [
    { sourceId: 'TEST-INT-001', role: 'primary', sourceSystem: 'chatgpt', sourceModule: 'TEST-PSY-MODULE', sourceChatId: 'chat-psy-1', sourceLabel: 'Синтетическая сессия', sourceDate: '2026-03-02', note: null },
    { sourceId: 'TEST-PSY-ALIAS-1', role: 'alias', sourceSystem: 'google_drive', sourceModule: 'TEST-DRIVE', sourceChatId: null, sourceLabel: 'Диск', sourceDate: '2026-03-02', note: 'тот же эпизод из журнала' },
  ],
  relatedSourceIds: [], importedAt: NOW,
};

const FORMULATION = {
  id: 'psyFormulation:test-1', createdAt: NOW, day: '2026-08-09', sv: 7, _u: 1, privacyClass: 'sensitive',
  supersedesId: null, status: 'active', focus: 'Синтетический фокус',
  formulation: 'Синтетическое описание рабочей модели.',
  hypotheses: [{ text: 'синтетическая гипотеза', claimClass: 'working_hypothesis', confidenceLabel: 'низкая', userStance: 'disputed', sourceRefs: [] }],
  protectiveFactors: ['синтетическая опора'], maintainingFactors: ['синтетический поддерживающий фактор'],
  sourceRefs: [{ coll: 'insights', id: 1 }],
};
const GOAL = {
  id: 'psyGoal:test-1', createdAt: NOW, day: '2026-08-09', sv: 7, _u: 1, privacyClass: 'sensitive',
  label: 'Синтетическая цель', targetMechanism: 'избегание', status: 'active',
  startedAt: NOW, reviewAt: '2026-09-01T00:00:00.000Z',
  proximalOutcome: 'наблюдаемый ближайший результат', distalOutcome: 'долгосрочный результат',
  measureRefs: [], sourceRefs: [],
};
const EPISODE = {
  id: 'psyIntervention:test-1', createdAt: NOW, day: '2026-08-09', sv: 7, _u: 1, privacyClass: 'sensitive',
  dateTime: '2026-03-02T10:00:00.000Z', targetProblem: 'синтетическая проблема', targetMechanism: 'избегание',
  methodId: 'behavioral_activation', methodFamily: 'BEHAVIORAL',
  interventionSummary: 'синтетическое применение метода', rationale: 'синтетическое обоснование',
  intendedProximalOutcome: 'ожидаемый результат',
  preObservationRefs: [], postObservationRefs: [{ coll: 'psyObservations', id: 'psyObservation:test-1' }], followUpRefs: [],
  adherence: 'done', fidelityNote: '', acceptability: 'irritating',
  adverseEffects: ['синтетический нежелательный эффект'], confounders: ['синтетический смешивающий фактор'],
  outcomeClass: 'helpful_in_context', sourceRefs: [], ext: PROV,
};
const OBSERVATION = {
  id: 'psyObservation:test-1', createdAt: NOW, day: '2026-08-09', sv: 7, _u: 1, privacyClass: 'sensitive',
  timestamp: '2026-03-02T12:00:00.000Z', metricId: 'TEST-PSY-METRIC',
  valueNumber: null, valueText: 'качественное наблюдение без числа', unit: null,
  contextTag: 'дом', triggerRef: null, entryMode: 'event_based', source: 'user',
  naturalistic: true, sourceRefs: [],
};
const REVIEW = {
  id: 'psyReview:test-1', createdAt: NOW, day: '2026-08-09', sv: 7, _u: 1, privacyClass: 'sensitive',
  periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-07T23:59:59.000Z',
  goalRefs: ['psyGoal:test-1'], formulationRef: 'psyFormulation:test-1',
  interventionEpisodeRefs: ['psyIntervention:test-1'], observationRefs: ['psyObservation:test-1'],
  methodsAppliedSummary: 'синтетическая сводка', adherenceSummary: 'выполнено 1 из 1',
  outcomeSummary: 'синтетический итог', acceptabilitySummary: 'раздражало',
  adverseEffectsSummary: 'один эффект', confoundersSummary: 'один фактор',
  hypothesesStrengthened: ['гипотеза A'], hypothesesWeakened: [],
  decision: 'modify', limitations: ['один эпизод не доказывает эффективность'], sourceRefs: [],
};

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      insights: [{ id: 1, title: 'синтетический инсайт', body: 'текст', sv: 7, media: [] }],
      psyFormulations: [FORMULATION], psyGoals: [GOAL],
      psyInterventionEpisodes: [EPISODE], psyObservations: [OBSERVATION], psyReviews: [REVIEW],
      __ts: 42,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга' }),
  });
  return { storage, media: makeMedia() };
}
const PSY = ['psyFormulations', 'psyGoals', 'psyInterventionEpisodes', 'psyObservations', 'psyReviews'];

async function main() {
  const { storage, media } = seed();
  const adapter = createBackupAdapter({ storage, media, now: () => NOW });

  // 1) data-only: все пять коллекций попадают в bundle генерически.
  const { payload: dataOnly } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(PSY.every(c => Array.isArray(dataOnly.db[c]) && dataOnly.db[c].length === 1),
    'data-only bundle: все пять психологических коллекций включены');
  ok(JSON.stringify(dataOnly.db.psyInterventionEpisodes[0]) === JSON.stringify(EPISODE),
    'data-only: эпизод byte-identical (включая adverseEffects и confounders)');

  // 2) complete bundle + отсутствие медиа у психологии.
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'complete' });
  ok(PSY.every(c => payload.db[c].length === 1), 'complete bundle: все пять коллекций на месте');
  ok(Array.isArray(payload.media) && payload.media.length === 0,
    'психологические записи не тянут за собой медиа');

  // 3) Шифрование → расшифровка без потерь.
  const password = 'test-passphrase-wave7';
  const env = await encryptPayload(payload, password);
  const dec = await decryptEnvelope(env, password);
  ok(PSY.every(c => JSON.stringify(dec.db[c]) === JSON.stringify(payload.db[c])),
    'encrypted roundtrip: все пять коллекций byte-identical после расшифровки');
  const e = dec.db.psyInterventionEpisodes[0];
  ok(JSON.stringify(e.ext.claimClasses) === JSON.stringify(['practice_action', 'user_experience', 'symbolic_interpretation']),
    'многослойные claimClasses пережили шифрованную копию');
  ok(e.ext.sourceRefs.length === 2 && e.ext.sourceRefs[1].role === 'alias',
    'sourceRefs Волны 6 (primary + alias) пережили копию');
  ok(dec.db.psyObservations[0].valueNumber === null,
    'отсутствие измерения сохраняется как null, а не превращается в 0 при переносе');
  ok(dec.db.psyFormulations[0].hypotheses[0].userStance === 'disputed',
    'позиция пользователя по гипотезе не теряется');
  ok(dec.db.psyInterventionEpisodes[0].adverseEffects.length === 1,
    'нежелательный эффект переживает копию рядом с положительным исходом');

  // 4) Приватность файла копии: никакого психологического текста в открытом виде.
  {
    const serialized = serializeEnvelope(env);
    const parsed = JSON.parse(serialized);
    const { ciphertext, ...clear } = parsed;
    ok(typeof ciphertext === 'string' && ciphertext.length > 0, 'конверт содержит шифротекст');
    ok(JSON.stringify(Object.keys(clear).sort()) === JSON.stringify(['cipher', 'envelopeVersion', 'format', 'kdf']),
      'открытые метаданные — только format/версия/KDF/шифр');
    const secrets = ['Синтетический фокус', 'синтетическая гипотеза', 'TEST-INT-001',
      'синтетический нежелательный эффект', 'TEST-PSY-METRIC', 'psyFormulation:test-1'];
    const leaked = secrets.filter(s => serialized.includes(s));
    ok(leaked.length === 0, `в файле копии нет психологического текста и ID (${leaked.join(',') || 'нет утечек'})`);
  }

  // 5) Экспорт не мутирует живой профиль.
  const live = JSON.parse(storage.getItem(KEYS.db('pA')));
  ok(JSON.stringify(live.psyReviews) === JSON.stringify([REVIEW]), 'buildBundle не мутирует живые записи');

  // 6) Production restore как новый профиль + целостность ссылок.
  {
    const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    const result = await restoreBackup({ adapter: destAdapter, file, password, mode: 'new', genProfileId: () => 'pNew1', now: () => NOW });
    ok(result.ok && result.committed, 'production restore (mode=new): commit успешен');
    const db = JSON.parse(dest.storage.getItem(KEYS.db('pNew1')));
    ok(PSY.every(c => JSON.stringify(db[c]) === JSON.stringify(payload.db[c])),
      'production restore: все пять коллекций byte-identical');
    // Review обязан по-прежнему раскрываться до существующих записей.
    const r = db.psyReviews[0];
    ok(r.interventionEpisodeRefs.every(id => db.psyInterventionEpisodes.some(x => x.id === id)) &&
       r.observationRefs.every(id => db.psyObservations.some(x => x.id === id)) &&
       r.goalRefs.every(id => db.psyGoals.some(x => x.id === id)) &&
       db.psyFormulations.some(f => f.id === r.formulationRef),
      'после восстановления review раскрывается до реально существующих записей');
    ok(db.psyFormulations[0].privacyClass === 'sensitive' && db.psyGoals[0].privacyClass === 'sensitive',
      'privacyClass sensitive сохранён после восстановления');
    ok(PSY.every(c => /^psy[A-Za-z]+:/.test(db[c][0].id)),
      'namespaced id всех пяти типов сохранены (общий tombstone остаётся безопасным)');
  }

  // 7) Неверный пароль → fail closed до любой мутации.
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld',
        [KEYS.db('pOld')]: JSON.stringify({ psyGoals: [{ id: 'psyGoal:old', label: 'старая цель' }] }),
        [KEYS.cfg('pOld')]: JSON.stringify({ userName: 'Old' }),
      }),
      media: makeMedia(),
    };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const before = dest.storage.getItem(KEYS.db('pOld'));
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    await throwsCode(() => restoreBackup({ adapter: destAdapter, file, password: 'WRONG', mode: 'new', now: () => NOW }),
      'DECRYPT_FAILED', 'production restore: неверный пароль — DECRYPT_FAILED до мутации');
    ok(before === dest.storage.getItem(KEYS.db('pOld')), 'неудачный restore не изменил психологию существующего профиля');
    ok(JSON.parse(dest.storage.getItem(KEYS.PKEY)).length === 1, '«осиротевший» профиль не создан');
  }

  // 8) Повреждённый шифротекст → zero mutation.
  {
    const corrupt = (() => { const o = JSON.parse(serializeEnvelope(env)); const b = Buffer.from(o.ciphertext, 'base64'); b[12] ^= 0xff; o.ciphertext = b.toString('base64'); return JSON.stringify(o); })();
    const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const before = JSON.stringify(dest.storage.keys().sort());
    const file = { size: corrupt.length, text: async () => corrupt };
    await throwsCode(() => restoreBackup({ adapter: destAdapter, file, password, mode: 'new', now: () => NOW }),
      'DECRYPT_FAILED', 'повреждённая копия отклонена');
    ok(before === JSON.stringify(dest.storage.keys().sort()), 'повреждённая копия не создала ни одного ключа');
  }

  console.log(out.join('\n'));
  console.log(`\nWave 7 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
