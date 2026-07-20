import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
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

const DEFAULT_CFG = {
  userName: '', domainLabel: 'Книга', apiUrl: '', spaceKey: '', lastSync: '',
  axes: { vitality: { lbl: 'Здоровье', s: 7, c: '#1A7F3C' } },
};
function exportSafeCfg(cfg = {}) {
  const { spaceKey, apiUrl, lastSync, _ts, ...portable } = cfg || {};
  return portable;
}
function importPortableCfg(current, fileCfg) {
  const localConnection = {
    apiUrl: current.apiUrl || '',
    spaceKey: current.spaceKey || '',
    lastSync: current.lastSync || '',
  };
  const { spaceKey, apiUrl, lastSync, _ts, ...portableCfg } = fileCfg || {};
  return {
    ...DEFAULT_CFG,
    ...portableCfg,
    axes: { ...DEFAULT_CFG.axes, ...(portableCfg.axes || {}) },
    ...localConnection,
  };
}

console.log('Portable export privacy regression');

test('production source exports a versioned portable policy', () => {
  assert.match(app, /function exportSafeCfg\(cfg = CFG\)/);
  assert.match(app, /exportVersion:2/);
  assert.match(app, /exportPolicy:'portable-no-connection-secrets'/);
  assert.match(app, /cfg:exportSafeCfg\(CFG\)/);
});

test('connection fields and service timestamp are excluded', () => {
  const safe = exportSafeCfg({
    userName: 'Synthetic User', domainLabel: 'Synthetic Book',
    spaceKey: 'SPACE-SECRET-SENTINEL', apiUrl: 'https://private.invalid',
    lastSync: '2099-01-01T00:00:00Z', _ts: 999,
  });
  assert.equal('spaceKey' in safe, false);
  assert.equal('apiUrl' in safe, false);
  assert.equal('lastSync' in safe, false);
  assert.equal('_ts' in safe, false);
});

test('portable user settings remain in the export', () => {
  const cfg = {
    userName: 'Synthetic User', domainLabel: 'Synthetic Book',
    axes: { work: { lbl: 'Work', s: 6, c: '#000000' } },
    trustedContact: 'Synthetic Contact', newAxColor: '#123456',
    spaceKey: 'hidden', apiUrl: 'hidden', lastSync: 'hidden', _ts: 1,
  };
  assert.deepEqual(exportSafeCfg(cfg), {
    userName: 'Synthetic User', domainLabel: 'Synthetic Book',
    axes: cfg.axes, trustedContact: 'Synthetic Contact', newAxColor: '#123456',
  });
});

test('serialized portable payload contains no connection secret sentinels', () => {
  const cfg = {
    userName: 'Synthetic User', spaceKey: 'SPACE-SECRET-SENTINEL',
    apiUrl: 'API-URL-SENTINEL', lastSync: 'LAST-SYNC-SENTINEL', _ts: 123,
  };
  const json = JSON.stringify({ exportVersion: 2, db: { insights: [] }, cfg: exportSafeCfg(cfg) });
  for (const sentinel of ['SPACE-SECRET-SENTINEL','API-URL-SENTINEL','LAST-SYNC-SENTINEL']) {
    assert.equal(json.includes(sentinel), false);
  }
});

test('safe import preserves the current device connection', () => {
  const current = { apiUrl: 'https://local.invalid', spaceKey: 'LOCAL-SPACE', lastSync: 'LOCAL-SYNC' };
  const imported = importPortableCfg(current, { userName: 'Imported', domainLabel: 'Imported Book' });
  assert.equal(imported.userName, 'Imported');
  assert.equal(imported.domainLabel, 'Imported Book');
  assert.equal(imported.apiUrl, current.apiUrl);
  assert.equal(imported.spaceKey, current.spaceKey);
  assert.equal(imported.lastSync, current.lastSync);
});

test('legacy file connection fields cannot overwrite the local device', () => {
  const current = { apiUrl: 'https://local.invalid', spaceKey: 'LOCAL-SPACE', lastSync: 'LOCAL-SYNC' };
  const legacyFile = {
    userName: 'Legacy Imported', apiUrl: 'https://attacker.invalid',
    spaceKey: 'FILE-SPACE', lastSync: 'FILE-SYNC', _ts: 123,
  };
  const imported = importPortableCfg(current, legacyFile);
  assert.equal(imported.apiUrl, 'https://local.invalid');
  assert.equal(imported.spaceKey, 'LOCAL-SPACE');
  assert.equal(imported.lastSync, 'LOCAL-SYNC');
  assert.equal(imported._ts, undefined);
});

test('portable axes merge with required defaults', () => {
  const imported = importPortableCfg({}, { axes: { work: { lbl: 'Work', s: 5, c: '#111111' } } });
  assert.equal(imported.axes.vitality.lbl, 'Здоровье');
  assert.equal(imported.axes.work.lbl, 'Work');
});

test('production import explicitly strips legacy connection fields', () => {
  assert.match(app, /const \{spaceKey:_fileSpaceKey, apiUrl:_fileApiUrl, lastSync:_fileLastSync, _ts:_fileTs, \.\.\.portableCfg\} = data\.cfg;/);
  assert.match(app, /\.\.\.localConnection\};/);
});

test('ordinary export does not reference passphrase or recovery storage', () => {
  const exportBlock = app.slice(app.indexOf('function exportSafeCfg'), app.indexOf('// Экспорт в Markdown'));
  assert.doesNotMatch(exportBlock, /passKey|recovery|arch5_pass|AI_KEY|apiKey/i);
});

console.log(`EXPORT_PRIVACY_REGRESSION_TESTS=${passed}`);
console.log('EXPORT_PRIVACY_REGRESSION_PASS');
