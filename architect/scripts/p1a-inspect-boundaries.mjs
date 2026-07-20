import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');
const source = await readFile(resolve(root, 'app.js'), 'utf8');
const lines = source.split('\n');

function extractBalanced(startIndex) {
  const open = source.indexOf('{', startIndex);
  if (open < 0) return 'NO_OPEN_BRACE';
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return 'UNBALANCED';
}

function indexFor(patterns) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match.index;
  }
  return -1;
}

const touchIndex = indexFor([
  /function\s+touch\s*\(/,
  /(?:const|let|var)\s+touch\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/,
]);
const importIndex = indexFor([/function\s+handleImport\s*\(/]);

const touchCalls = [];
for (let i = 0; i < lines.length; i++) {
  if (/\btouch\s*\(/.test(lines[i])) {
    touchCalls.push(`${i + 1}: ${lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join('\n')}`);
  }
}

const output = [
  '# TOUCH DEFINITION',
  touchIndex >= 0 ? extractBalanced(touchIndex) : 'NOT_FOUND',
  '',
  '# HANDLE IMPORT',
  importIndex >= 0 ? extractBalanced(importIndex) : 'NOT_FOUND',
  '',
  '# TOUCH CALLS',
  touchCalls.join('\n---\n'),
  '',
].join('\n');

const outDir = resolve(root, 'test-results', 'p1a-inspect');
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'p1a-boundaries.txt'), output);
console.log('P1A_BOUNDARY_INSPECTION_COMPLETE');
