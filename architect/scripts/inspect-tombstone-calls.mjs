import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const lines = source.split(/\r?\n/);
let count = 0;
for (let i = 0; i < lines.length; i++) {
  if (/\btomb\s*\(/.test(lines[i])) {
    count++;
    const from = Math.max(0, i - 2);
    const to = Math.min(lines.length, i + 3);
    console.log(`\n--- tomb call ${count} at app.js:${i + 1} ---`);
    for (let j = from; j < to; j++) console.log(`${String(j + 1).padStart(5)} | ${lines[j]}`);
  }
}
console.log(`\nTOMB_CALL_COUNT=${count}`);
if (!count) process.exitCode = 1;
