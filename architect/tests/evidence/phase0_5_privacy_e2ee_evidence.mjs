import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const results = [];
const test = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
};

const has = (pattern, message) => assert.match(source, pattern, message);

test('profile DB keys are namespaced', () => has(/const dbKey\s*=\s*id\s*=>\s*'arch5_db_'\s*\+\s*id/, 'dbKey namespace missing'));
test('profile CFG keys are namespaced', () => has(/const cfgKey\s*=\s*id\s*=>\s*'arch5_cfg_'\s*\+\s*id/, 'cfgKey namespace missing'));
test('profile passphrase slots are namespaced separately', () => has(/const passKey\s*=\s*id\s*=>\s*'arch5_pass_'\s*\+\s*id/, 'passKey namespace missing'));
test('legacy flat passphrase is migrated into a profile slot', () => has(/localStorage\.getItem\('arch5_pass'\)/, 'legacy passphrase migration source missing'));
test('legacy flat secret slots are removed after migration', () => has(/removeItem\('arch5_pass'\)/, 'legacy passphrase cleanup missing'));
test('configuration contains spaceKey metadata', () => has(/spaceKey:\s*''/, 'spaceKey field missing'));
test('configuration is persisted separately from DB', () => has(/localStorage\.setItem\(cfgKey\(id\),\s*JSON\.stringify\(CFG\)\)/, 'CFG persistence path missing'));
test('encryption function exists', () => has(/(?:async\s+)?function\s+encryptPayload\s*\(/, 'encryptPayload missing'));
test('payload packing function exists', () => has(/(?:async\s+)?function\s+packPayload\s*\(/, 'packPayload missing'));
test('payload unpacking function exists', () => has(/(?:async\s+)?function\s+unpackPayload\s*\(/, 'unpackPayload missing'));
test('Web Crypto is used by the encryption path', () => has(/crypto\.subtle/, 'Web Crypto usage missing'));
test('media blobs use IndexedDB separation', () => {
  has(/indexedDB/i, 'IndexedDB usage missing');
  has(/media/i, 'media boundary missing');
});

test('feedback context is opt-in at send time', () => has(/fb-ctx/, 'feedback context control missing'));
test('error buffer is localStorage-backed and bounded', () => {
  has(/ERRBUF_KEY\s*=\s*'arch5_errbuf'/, 'error buffer key missing');
  has(/while\s*\(b\.length\s*>\s*10\)\s*b\.shift\(\)/, 'error buffer bound missing');
});

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
console.log(`\n${results.length - failed.length} passed / ${failed.length} failed / ${results.length} total`);
if (failed.length) process.exitCode = 1;
