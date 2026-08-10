// ─────────────────────────────────────────────────────────────────────────
//  wave8-backup-roundtrip.test.mjs — Wave 8 (issue #163): роундтрип
//  зашифрованной переносимой копии для psyAdaptivePlans / psyExperiments
//  и скаляра psyAdaptiveSettings.
//
//  У адаптивного движка нет собственного backup/sync-кода: если планы,
//  эксперименты (включая версионируемую историю и план рандомизации) и
//  настройки переживают production adapter → шифрование → production restore
//  без единой Wave-8-специфичной строки, копия покрывает их генерически.
//
//  Только синтетические данные. Запуск: node tests/wave8-backup-roundtrip.test.mjs
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
const NOW = '2026-08-10T12:00:00.000Z';

const GOAL = {
  id: 'psyGoal:w8-1', createdAt: NOW, day: '2026-08-10', sv: 8, _u: 1, privacyClass: 'sensitive',
  label: 'TEST-W8 цель', targetMechanism: 'руминация', status: 'active',
  startedAt: NOW, reviewAt: null, proximalOutcome: 'наблюдаемый шаг', distalOutcome: 'долгосрочный итог',
  measureRefs: [], sourceRefs: [],
};
const PLAN = {
  id: 'psyPlan:w8-1', createdAt: NOW, day: '2026-08-10', sv: 8, _u: 1, privacyClass: 'sensitive',
  goalId: 'psyGoal:w8-1', distalOutcome: 'долгосрочный итог', proximalOutcome: 'наблюдаемый шаг',
  decisionPoints: ['при появлении триггера'],
  tailoringVariables: [{ varId: 'arousal' }, { varId: 'triggerType' }],
  interventionOptions: ['opposite_action', 'NO_INTERVENTION'],
  decisionRules: [
    { id: 'r-1', if: { triggerType: 'TEST-W8', mechanism: null, contextTag: null, arousalMin: 4, arousalMax: null }, then: { methodId: 'opposite_action' } },
    { id: 'r-2', if: { triggerType: null, mechanism: null, contextTag: null, arousalMin: null, arousalMax: null }, then: { methodId: 'NO_INTERVENTION' } },
  ],
  safetyGateId: 'psy-safety-gate-v1', enabled: true, sourceRefs: [],
};
const EXPERIMENT = {
  id: 'psyExperiment:w8-1', createdAt: NOW, day: '2026-08-10', sv: 8, _u: 1, privacyClass: 'sensitive',
  question: 'TEST-W8: помогает ли практика при руминации?', methodId: 'self_compassion_break',
  targetOutcomeMetricIds: ['TEST-W8-METRIC'], conditions: ['A-обычно', 'B-практика'],
  designType: 'randomized_crossover',
  baselinePlan: { plannedPoints: 3, rationale: 'три повторных замера на фазу' },
  randomizationPlan: { seed: 777, cycles: 2, sequence: [1, 0, 0, 1] },
  washoutPlan: 'день без практики между фазами',
  measurementSchedule: 'ежевечерний замер', fidelityPlan: 'отметка полноты выполнения',
  stopRules: ['ухудшение два дня подряд — стоп'], safetyGateId: 'psy-safety-gate-v1',
  consentAt: NOW, status: 'completed',
  history: [
    { at: NOW, from: null, to: 'draft', note: 'эксперимент создан' },
    { at: NOW, from: 'draft', to: 'active', note: 'старт' },
    { at: NOW, from: 'active', to: 'completed', note: 'итог зафиксирован' },
  ],
  analysisPlan: 'описательное сравнение по условиям',
  resultSummary: { text: 'в фазах B меньше руминации', causalStatus: 'supported_within_design', limitations: ['короткие фазы', 'возможен carryover'] },
  limitations: ['короткие фазы', 'возможен carryover'], sourceRefs: [],
};
const SETTINGS = {
  promptsEnabled: true, maxPromptsPerDay: 3,
  promptLog: [{ day: '2026-08-10', at: NOW, action: 'skipped' }],
  methodExclusions: { cognitive_restructuring: { at: NOW, note: 'пользовательское исключение' } },
  _u: 2,
};

function seed() {
  const storage = makeStorage({
    [KEYS.PKEY]: JSON.stringify([{ id: 'pA', name: 'Alice', color: '#1056CC' }]),
    [KEYS.AKEY]: 'pA',
    [KEYS.db('pA')]: JSON.stringify({
      psyGoals: [GOAL], psyAdaptivePlans: [PLAN], psyExperiments: [EXPERIMENT],
      psyAdaptiveSettings: SETTINGS,
      __ts: 42,
    }),
    [KEYS.cfg('pA')]: JSON.stringify({ userName: 'Alice', domainLabel: 'Книга' }),
  });
  return { storage, media: makeMedia() };
}
const W8 = ['psyAdaptivePlans', 'psyExperiments'];

async function main() {
  const { storage, media } = seed();
  const adapter = createBackupAdapter({ storage, media, now: () => NOW });

  // 1) data-only: коллекции и скаляр попадают в bundle генерически.
  const { payload: dataOnly } = await adapter.buildBundle({ id: 'pA', mode: 'data-only' });
  ok(W8.every(c => Array.isArray(dataOnly.db[c]) && dataOnly.db[c].length === 1),
    'data-only bundle: psyAdaptivePlans и psyExperiments включены');
  ok(JSON.stringify(dataOnly.db.psyAdaptiveSettings) === JSON.stringify(SETTINGS),
    'data-only: скаляр настроек (исключения методов + prompt burden) включён');
  ok(JSON.stringify(dataOnly.db.psyExperiments[0]) === JSON.stringify(EXPERIMENT),
    'data-only: эксперимент byte-identical (история, рандомизация, ограничения)');

  // 2) Шифрование → расшифровка без потерь.
  const password = 'test-passphrase-wave8';
  const { payload } = await adapter.buildBundle({ id: 'pA', mode: 'complete' });
  const env = await encryptPayload(payload, password);
  const dec = await decryptEnvelope(env, password);
  ok(W8.every(c => JSON.stringify(dec.db[c]) === JSON.stringify(payload.db[c])),
    'encrypted roundtrip: планы и эксперименты byte-identical');
  ok(JSON.stringify(dec.db.psyExperiments[0].history) === JSON.stringify(EXPERIMENT.history),
    'версионируемая история эксперимента пережила копию без переупорядочивания');
  ok(JSON.stringify(dec.db.psyExperiments[0].randomizationPlan) === JSON.stringify(EXPERIMENT.randomizationPlan),
    'план рандомизации (seed + последовательность) воспроизводим после переноса');
  ok(dec.db.psyExperiments[0].resultSummary.causalStatus === 'supported_within_design' &&
     dec.db.psyExperiments[0].resultSummary.limitations.length === 2,
    'итог эксперимента переносится вместе с ограничениями, а не без них');
  ok(JSON.stringify(dec.db.psyAdaptiveSettings.methodExclusions) === JSON.stringify(SETTINGS.methodExclusions),
    'жёсткие исключения методов («не предлагать снова») переживают копию');

  // 3) Приватность файла: ни приватного текста, ни ID в открытом виде.
  {
    const serialized = serializeEnvelope(env);
    const secrets = ['TEST-W8 цель', 'руминация', 'psyPlan:w8-1', 'psyExperiment:w8-1',
      'TEST-W8-METRIC', 'cognitive_restructuring', 'opposite_action'];
    const leaked = secrets.filter(s => serialized.includes(s));
    ok(leaked.length === 0, `в файле копии нет текста планов/экспериментов и ID (${leaked.join(',') || 'нет утечек'})`);
  }

  // 4) Production restore как новый профиль.
  {
    const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const file = { size: 0, text: async () => serializeEnvelope(env) };
    file.size = (await file.text()).length;
    const result = await restoreBackup({ adapter: destAdapter, file, password, mode: 'new', genProfileId: () => 'pNew1', now: () => NOW });
    ok(result.ok && result.committed, 'production restore (mode=new): commit успешен');
    const db = JSON.parse(dest.storage.getItem(KEYS.db('pNew1')));
    ok(W8.every(c => JSON.stringify(db[c]) === JSON.stringify(payload.db[c])),
      'production restore: планы и эксперименты byte-identical');
    // План обязан по-прежнему раскрываться до своей цели.
    ok(db.psyGoals.some(g => g.id === db.psyAdaptivePlans[0].goalId),
      'после восстановления план раскрывается до реально существующей цели');
    ok(db.psyAdaptivePlans[0].privacyClass === 'sensitive' && db.psyExperiments[0].privacyClass === 'sensitive',
      'privacyClass sensitive сохранён');
  }

  // 5) Неверный пароль → fail closed до любой мутации.
  {
    const dest = {
      storage: makeStorage({
        [KEYS.PKEY]: JSON.stringify([{ id: 'pOld', name: 'Old', color: '#1056CC' }]),
        [KEYS.AKEY]: 'pOld',
        [KEYS.db('pOld')]: JSON.stringify({ psyAdaptivePlans: [{ id: 'psyPlan:old' }] }),
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
    ok(before === dest.storage.getItem(KEYS.db('pOld')), 'неудачный restore не изменил существующий профиль');
  }

  // 6) Повреждённый шифротекст → zero mutation.
  {
    const corrupt = (() => { const o = JSON.parse(serializeEnvelope(env)); const b = Buffer.from(o.ciphertext, 'base64'); b[10] ^= 0xff; o.ciphertext = b.toString('base64'); return JSON.stringify(o); })();
    const dest = { storage: makeStorage({ [KEYS.PKEY]: '[]', [KEYS.AKEY]: '' }), media: makeMedia() };
    const destAdapter = createBackupAdapter({ storage: dest.storage, media: dest.media, now: () => NOW });
    const before = JSON.stringify(dest.storage.keys().sort());
    const file = { size: corrupt.length, text: async () => corrupt };
    await throwsCode(() => restoreBackup({ adapter: destAdapter, file, password, mode: 'new', now: () => NOW }),
      'DECRYPT_FAILED', 'повреждённая копия отклонена');
    ok(before === JSON.stringify(dest.storage.keys().sort()), 'повреждённая копия не создала ни одного ключа');
  }

  console.log(out.join('\n'));
  console.log(`\nWave 8 backup roundtrip: ${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
