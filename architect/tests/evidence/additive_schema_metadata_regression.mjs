import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../data-metadata.js', import.meta.url), 'utf8');
const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'data-metadata.js' });
const M = context.ARCH_METADATA;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const json = value => JSON.parse(JSON.stringify(value));

console.log('Additive schema metadata regression');

test('adapter exposes a frozen versioned API', () => {
  assert.equal(M.METADATA_VERSION, 1);
  assert.equal(Object.isFrozen(M), true);
  assert.equal(M.ID_COLLECTIONS.includes('insights'), true);
});

test('reading an untouched legacy record does not mutate it', () => {
  const legacy = { id: 1, title: 'Legacy', unknownFutureField: { keep: true } };
  const before = JSON.stringify(legacy);
  const view = M.readRecordMetadata(legacy, { collection: 'insights', at: '2026-01-01T00:00:00Z' });
  assert.equal(JSON.stringify(legacy), before);
  assert.equal('_meta' in legacy, false);
  assert.equal(view.metadataVersion, 1);
  assert.equal(view.recordClass, 'UserSelfReport');
});

test('first touch adds optional metadata without changing record payload', () => {
  const record = { id: 'a', title: 'Synthetic', body: 'Synthetic text', custom: 7 };
  M.touchRecord(record, { collection: 'insights', at: '2026-01-02T03:04:05Z' });
  assert.equal(record.id, 'a');
  assert.equal(record.body, 'Synthetic text');
  assert.equal(record.custom, 7);
  assert.equal(record._meta.metadataVersion, 1);
  assert.equal(record._meta.collection, 'insights');
  assert.equal(record._meta.recordClass, 'UserSelfReport');
  assert.equal(record._meta.privacyClass, 'sensitive_personal');
  assert.equal(record._meta.provenance.origin, 'user_local');
  assert.equal(record._meta.correction.revision, 0);
  assert.deepEqual(record._meta.correction.history, []);
});

test('later touch appends a bounded minimal correction event', () => {
  const record = { id: 'a' };
  M.touchRecord(record, { collection: 'insights', at: '2026-01-01T00:00:00Z' });
  M.touchRecord(record, { collection: 'insights', at: '2026-01-02T00:00:00Z', correctionKind: 'user_edit' });
  assert.equal(record._meta.correction.status, 'corrected');
  assert.equal(record._meta.correction.revision, 1);
  assert.deepEqual(json(record._meta.correction.history), [{ at: '2026-01-02T00:00:00.000Z', kind: 'user_edit' }]);
  assert.equal('before' in record._meta.correction.history[0], false);
  assert.equal('content' in record._meta.correction.history[0], false);
});

test('unknown optional metadata fields survive subsequent touches', () => {
  const record = {
    id: 'future',
    _meta: {
      metadataVersion: 99,
      futureTopLevel: { preserve: true },
      provenance: { origin: 'user_local', futureProvenance: 'keep' },
      correction: { revision: 4, status: 'corrected', history: [], futureCorrection: 'keep' },
    },
  };
  M.touchRecord(record, { collection: 'dreams', at: '2026-02-01T00:00:00Z' });
  assert.deepEqual(json(record._meta.futureTopLevel), { preserve: true });
  assert.equal(record._meta.provenance.futureProvenance, 'keep');
  assert.equal(record._meta.correction.futureCorrection, 'keep');
  assert.equal(record._meta.metadataVersion, 1);
  assert.equal(record._meta.correction.revision, 5);
});

test('collection policy distinguishes health-sensitive observations', () => {
  const record = { id: 2 };
  M.touchRecord(record, { collection: 'checkins', at: '2026-01-01T00:00:00Z' });
  assert.equal(record._meta.recordClass, 'ContextObservation');
  assert.equal(record._meta.privacyClass, 'health_sensitive');
});

test('v2 portable import marks all ID collections without changing timestamps', () => {
  const db = {
    insights: [{ id: 'i', _u: 100, title: 'Imported insight' }],
    checkins: [{ id: 'c', _u: 200, sl: 7 }],
    dreams: [], patterns: [], evolution: [], spiritual: [], bots: [], digests: [], spheres: [], sphereLogs: [], chats: [], cravings: [],
  };
  const count = M.markImportedDB(db, { exportVersion: 2, importedAt: '2026-03-01T00:00:00Z' });
  assert.equal(count, 2);
  assert.equal(db.insights[0]._u, 100);
  assert.equal(db.checkins[0]._u, 200);
  assert.equal(db.insights[0]._meta.provenance.origin, 'portable_import');
  assert.equal(db.insights[0]._meta.provenance.sourceFormat, 'architect-json-v2');
  assert.equal(db.checkins[0]._meta.privacyClass, 'health_sensitive');
});

test('legacy import is explicit and idempotent', () => {
  const db = {
    insights: [{ id: 'legacy' }],
    dreams: [], patterns: [], evolution: [], spiritual: [], checkins: [], bots: [], digests: [], spheres: [], sphereLogs: [], chats: [], cravings: [],
  };
  M.markImportedDB(db, { exportVersion: 1, importedAt: '2026-03-01T00:00:00Z' });
  const once = JSON.stringify(db);
  M.markImportedDB(db, { exportVersion: 1, importedAt: '2026-03-01T00:00:00Z' });
  assert.equal(JSON.stringify(db), once);
  assert.equal(db.insights[0]._meta.provenance.origin, 'legacy_import');
  assert.equal(db.insights[0]._meta.provenance.sourceFormat, 'architect-json-legacy');
});

test('existing provenance origin survives re-import', () => {
  const record = { id: 'r' };
  M.touchRecord(record, { collection: 'insights', at: '2026-01-01T00:00:00Z' });
  M.markImportedRecord(record, { collection: 'insights', exportVersion: 2, importedAt: '2026-04-01T00:00:00Z' });
  assert.equal(record._meta.provenance.origin, 'user_local');
  assert.equal(record._meta.provenance.importedAt, '2026-04-01T00:00:00.000Z');
});

test('old and new records roundtrip together through JSON', () => {
  const oldRecord = { id: 'old', title: 'Old record' };
  const newRecord = { id: 'new', title: 'New record' };
  M.touchRecord(newRecord, { collection: 'insights', at: '2026-05-01T00:00:00Z' });
  const restored = JSON.parse(JSON.stringify({ insights: [oldRecord, newRecord] }));
  assert.equal('_meta' in restored.insights[0], false);
  assert.equal(restored.insights[1]._meta.metadataVersion, 1);
  assert.equal(restored.insights[1].title, 'New record');
});

test('rollback consumer can ignore optional metadata and read all records', () => {
  const record = { id: 'rollback', title: 'Readable', extra: 'preserved' };
  M.touchRecord(record, { collection: 'insights', at: '2026-06-01T00:00:00Z' });
  const legacyProjection = (({ _meta, ...payload }) => payload)(json(record));
  assert.deepEqual(legacyProjection, { id: 'rollback', title: 'Readable', extra: 'preserved' });
});

test('metadata contains no credential-shaped fields or secret sentinel', () => {
  const record = { id: 'safe', body: 'Synthetic' };
  M.touchRecord(record, { collection: 'chats', at: '2026-07-01T00:00:00Z' });
  const serialized = JSON.stringify(record._meta);
  assert.equal(/spaceKey|apiUrl|passphrase|recovery|apiKey|token/i.test(serialized), false);
  assert.equal(serialized.includes('SECRET-SENTINEL'), false);
});

test('correction history is bounded to the documented limit', () => {
  const record = { id: 'bounded' };
  M.touchRecord(record, { collection: 'insights', at: '2026-01-01T00:00:00Z' });
  for (let i = 1; i <= 30; i++) M.touchRecord(record, { collection: 'insights', at: `2026-02-${String((i % 27) + 1).padStart(2, '0')}T00:00:00Z` });
  assert.equal(record._meta.correction.history.length, M.HISTORY_LIMIT);
  assert.equal(record._meta.correction.revision, 30);
});

console.log(`ADDITIVE_SCHEMA_METADATA_TESTS=${passed}`);
console.log('PHASE_1_ADDITIVE_SCHEMA_METADATA_REGRESSION_PASS');
