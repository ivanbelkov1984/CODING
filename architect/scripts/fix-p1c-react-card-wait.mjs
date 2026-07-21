import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const file = resolve(dir, '..', 'tests', 'e2e.mjs');
let source = await readFile(file, 'utf8');
const before = `await page.waitForTimeout(250);
ok(await page.evaluate(() => document.querySelectorAll('#react-card.on .rc-row').length >= 1), 'после сохранения инсайта появляется карточка-отклик');`;
const after = `let reactCardVisible = true;
try { await page.waitForSelector('#react-card.on .rc-row', { state: 'visible', timeout: 3000 }); }
catch (_) { reactCardVisible = false; }
ok(reactCardVisible, 'после сохранения инсайта появляется карточка-отклик');`;
if (!source.includes(before)) throw new Error('react-card fixed wait anchor not found');
if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('react-card fixed wait anchor is not unique');
source = source.replace(before, after);
await writeFile(file, source);
console.log('P1C_REACT_CARD_WAIT_HARDENED');
