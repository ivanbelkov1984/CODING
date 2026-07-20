import fs from 'node:fs';
import assert from 'node:assert/strict';

const ci = fs.readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const e2e = fs.readFileSync(new URL('../e2e.mjs', import.meta.url), 'utf8');
const results = [];
const test = (name, fn) => { try { fn(); results.push({name, ok:true}); } catch (e) { results.push({name, ok:false, error:e.message}); } };

test('CI runs on pull requests touching architect', () => assert.match(ci, /pull_request:[\s\S]*architect\/\*\*/));
test('CI uses Node 22', () => assert.match(ci, /node-version:\s*["']22["']/));
test('CI installs Chromium', () => assert.match(ci, /playwright install --with-deps chromium/));
test('CI runs npm test', () => assert.match(ci, /run:\s*npm test/));
test('E2E launches Chromium', () => assert.match(e2e, /chromium\.launch/));
test('E2E uses a mobile-sized viewport', () => assert.match(e2e, /viewport:\s*\{\s*width:\s*390,\s*height:\s*900\s*\}/));
test('E2E uses high device scale factor', () => assert.match(e2e, /deviceScaleFactor:\s*2/));
test('E2E does not configure iPhone/iPad device profiles', () => assert.doesNotMatch(e2e, /devices\s*\[/));
test('CI does not upload artifacts', () => assert.doesNotMatch(ci, /upload-artifact/));
test('CI does not publish a preview', () => assert.doesNotMatch(ci, /deploy|pages|preview/i));
test('CI does not define a viewport matrix', () => assert.doesNotMatch(ci, /matrix:[\s\S]*viewport/i));

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
console.log(`\n${results.length - failed.length} passed / ${failed.length} failed / ${results.length} total`);
if (failed.length) process.exitCode = 1;
