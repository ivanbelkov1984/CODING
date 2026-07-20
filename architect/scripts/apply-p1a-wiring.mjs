import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');

async function edit(path, transform) {
  const file = resolve(root, path);
  const before = await readFile(file, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`no change produced for ${path}`);
  await writeFile(file, after);
  console.log(`updated ${path}`);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

await edit('app.js', source => {
  source = replaceOnce(
    source,
    "function touch(rec) { if (rec && typeof rec === 'object') rec._u = Date.now(); return rec; }",
    `function touch(rec, collection = '') {
  if (rec && typeof rec === 'object') {
    rec._u = Date.now();
    const metadata = typeof globalThis !== 'undefined' ? globalThis.ARCH_METADATA : null;
    if (metadata) {
      const resolvedCollection = collection || metadata.ID_COLLECTIONS.find(c => Array.isArray(DB[c]) && DB[c].includes(rec)) || '';
      if (resolvedCollection) metadata.touchRecord(rec, { collection: resolvedCollection, at: new Date(rec._u).toISOString() });
    }
  }
  return rec;
}`,
    'touch definition',
  );

  source = replaceOnce(
    source,
    "      const data = JSON.parse(e.target.result);",
    `      const data = JSON.parse(e.target.result);
      const metadata = typeof globalThis !== 'undefined' ? globalThis.ARCH_METADATA : null;
      if (metadata) {
        const importOptions = {
          exportVersion: Number(data.exportVersion || data.version || 1),
          importedAt: nowISO(),
        };
        if (data.db && typeof data.db === 'object') metadata.markImportedDB(data.db, importOptions);
        else if (Array.isArray(data.insights)) metadata.markImportedDB({ insights: data.insights }, importOptions);
      }`,
    'JSON import parse boundary',
  );

  source = replaceOnce(
    source,
    "      DB.dreams.push(touch({ id: ++uid, date: dateStr, createdAt: iso, day: dayK, sv: SCHEMA_VERSION, title: titleFrom(body).slice(0, 52), body, tone: null, arch: null, src: 'ChatGPT' }));",
    "      DB.dreams.push(touch({ id: ++uid, date: dateStr, createdAt: iso, day: dayK, sv: SCHEMA_VERSION, title: titleFrom(body).slice(0, 52), body, tone: null, arch: null, src: 'ChatGPT' }, 'dreams'));",
    'ChatGPT dream touch hint',
  );

  source = replaceOnce(
    source,
    "    DB.insights.push(touch({ id: ++uid, tag: dream ? 'dream' : 'personal', w: 1, title: titleFrom(body), body, date: dateStr, createdAt: iso, day: dayK, sv: SCHEMA_VERSION, src: 'ChatGPT', links: [] }));",
    "    DB.insights.push(touch({ id: ++uid, tag: dream ? 'dream' : 'personal', w: 1, title: titleFrom(body), body, date: dateStr, createdAt: iso, day: dayK, sv: SCHEMA_VERSION, src: 'ChatGPT', links: [] }, 'insights'));",
    'ChatGPT insight touch hint',
  );
  return source;
});

await edit('index.html', source => replaceOnce(
  source,
  '<script src="app.js"></script>',
  '<script src="data-metadata.js"></script>\n<script src="app.js"></script>',
  'runtime script order',
));

await edit('build.mjs', source => {
  source = replaceOnce(
    source,
    "for (const f of ['index.html', 'styles.css', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2'])",
    "for (const f of ['index.html', 'styles.css', 'data-metadata.js', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2'])",
    'content hash inputs',
  );
  source = replaceOnce(
    source,
    "  const css = await readFile(join(DIR, 'styles.css'), 'utf8');\n  const js  = await readFile(join(DIR, 'app.js'), 'utf8');",
    "  const css = await readFile(join(DIR, 'styles.css'), 'utf8');\n  const metadata = await readFile(join(DIR, 'data-metadata.js'), 'utf8');\n  const js  = await readFile(join(DIR, 'app.js'), 'utf8');",
    'build metadata read',
  );
  source = replaceOnce(
    source,
    "  html = html.replace('<link rel=\"stylesheet\" href=\"styles.css\">', () => '<style>\\n' + css + '\\n</style>');\n  html = html.replace('<script src=\"app.js\"></script>', () => '<script>\\n' + js + '\\n</script>');\n  if (/href=\"styles\\.css\"|src=\"app\\.js\"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');\n  if (!html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');",
    "  html = html.replace('<link rel=\"stylesheet\" href=\"styles.css\">', () => '<style>\\n' + css + '\\n</style>');\n  html = html.replace('<script src=\"data-metadata.js\"></script>', () => '<script>\\n' + metadata + '\\n</script>');\n  html = html.replace('<script src=\"app.js\"></script>', () => '<script>\\n' + js + '\\n</script>');\n  if (/href=\"styles\\.css\"|src=\"data-metadata\\.js\"|src=\"app\\.js\"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');\n  if (!html.includes(metadata.slice(0, 80)) || !html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');",
    'combined build inline order',
  );
  return source;
});

await edit('package.json', source => {
  const pkg = JSON.parse(source);
  const focused = 'node tests/evidence/additive_schema_metadata_regression.mjs';
  if (String(pkg.scripts?.['test:data'] || '').includes(focused)) throw new Error('metadata regression command already present');
  pkg.scripts['test:data'] = `${pkg.scripts['test:data']} && ${focused}`;
  return JSON.stringify(pkg, null, 2) + '\n';
});

await edit('tests/evidence/additive_schema_metadata_regression.mjs', source => {
  const marker = "console.log(`ADDITIVE_SCHEMA_METADATA_TESTS=${passed}`);";
  const integration = `const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const buildSource = await readFile(new URL('../../build.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('runtime touch boundary attaches metadata without eager hydration backfill', () => {
  assert.match(appSource, /function touch\\(rec, collection = ''\\)/);
  assert.match(appSource, /metadata\\.touchRecord\\(rec, \\{ collection: resolvedCollection/);
  assert.doesNotMatch(appSource, /migrateRecords[\\s\\S]{0,500}markImportedDB/);
});

test('JSON import marks only incoming records before assignment', () => {
  const parseAt = appSource.indexOf('const data = JSON.parse(e.target.result);');
  const assignAt = appSource.indexOf('if (data.db)  DB', parseAt);
  const markAt = appSource.indexOf('metadata.markImportedDB(data.db, importOptions)', parseAt);
  assert.ok(parseAt >= 0 && markAt > parseAt && assignAt > markAt);
  assert.match(appSource, /else if \\(Array\\.isArray\\(data\\.insights\\)\\) metadata\\.markImportedDB\\(\\{ insights: data\\.insights \\}, importOptions\\)/);
});

test('metadata adapter loads before app runtime and is inlined by the build', () => {
  assert.ok(indexSource.indexOf('<script src="data-metadata.js"></script>') < indexSource.indexOf('<script src="app.js"></script>'));
  assert.match(buildSource, /readFile\\(join\\(DIR, 'data-metadata\\.js'\\)/);
  assert.match(buildSource, /src="data-metadata\\\\.js"/);
});

test('focused metadata regression is part of the ordinary data gate', () => {
  assert.match(packageJson.scripts['test:data'], /additive_schema_metadata_regression\\.mjs/);
});

`;
  return replaceOnce(source, marker, integration + marker, 'focused integration test marker');
});

console.log('P1A_WIRING_APPLIED');
