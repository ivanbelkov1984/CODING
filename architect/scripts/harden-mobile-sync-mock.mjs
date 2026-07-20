import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../tests/mobile-evidence.mjs', import.meta.url);
let source = await readFile(file, 'utf8');
const localSync = '2000-01-01T00:00:00.000Z';

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing patch anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique patch anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

if (source.includes("updated_at: '2000-01-01T00:00:00.000Z'")) {
  console.log('backend-shaped mobile mock already applied');
  process.exit(0);
}

replaceOnce(
`    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ok: true, synthetic: true, data: null, payload: null }),
    });`,
`    const response = requestUrl.pathname.includes('/api/space/LOCAL-SPACE-KEY')
      ? { db: {}, cfg: {}, updated_at: '${localSync}' }
      : { ok: true, synthetic: true };
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(response),
    });`,
'backend-shaped route response');

replaceOnce("CFG.lastSync = 'LOCAL-SYNC';", `CFG.lastSync = '${localSync}';`, 'local lastSync sentinel');
replaceOnce(
"record(engine, scenario.name, 'browser import preserves local connection identity and rejects file sync metadata', transfer.localApi === 'https://local-device.invalid' && transfer.localSpace === 'LOCAL-SPACE-KEY' && transfer.localSync !== 'FILE-SYNC', `lastSync=${transfer.localSync}`);",
`record(engine, scenario.name, 'browser import preserves local connection and service timestamp', transfer.localApi === 'https://local-device.invalid' && transfer.localSpace === 'LOCAL-SPACE-KEY' && transfer.localSync === '${localSync}', \`lastSync=\${transfer.localSync}\`);`,
'exact local connection assertion');

await writeFile(file, source);
console.log('applied backend-shaped mobile sync mock');
