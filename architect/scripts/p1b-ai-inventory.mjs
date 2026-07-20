import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');
const source = await readFile(resolve(root, 'app.js'), 'utf8');
const lines = source.split('\n');

const windows = [];
function collect(label, regex, before = 8, after = 14) {
  for (let i = 0; i < lines.length; i++) {
    if (!regex.test(lines[i])) continue;
    const start = Math.max(0, i - before);
    const end = Math.min(lines.length, i + after + 1);
    windows.push(`## ${label} · line ${i + 1}\n${lines.slice(start, end).map((line, j) => `${start + j + 1}: ${line}`).join('\n')}`);
  }
}

collect('callClaude invocation', /\bcallClaude\s*\(\s*\{/);
collect('AI result JSON parse', /JSON\.parse\s*\(\s*(text|raw|res|result|out|answer)\b/);
collect('schema declaration', /\b(const|let)\s+schema\s*=|json_schema|output_config/);
collect('AI system or prompt constant', /\bAI_SYSTEM\b|\bsystem\s*:/, 3, 6);
collect('provider fetch', /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/, 8, 12);
collect('AI error path', /\.noKey|\.budget|AbortError|stop_reason|refusal|пустой ответ/i, 4, 8);

const callCount = (source.match(/\bcallClaude\s*\(\s*\{/g) || []).length;
const parseCount = (source.match(/JSON\.parse\s*\(/g) || []).length;
const taskNames = [...source.matchAll(/task\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
const uniqueTasks = [...new Set(taskNames)].sort();

const report = [
  '# P1-B AI Boundary Inventory',
  '',
  `callClaudeInvocations=${callCount}`,
  `allJsonParseCalls=${parseCount}`,
  `tasks=${uniqueTasks.join(',')}`,
  '',
  ...windows,
  '',
].join('\n');

const outDir = resolve(root, 'test-results', 'p1b-inventory');
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'p1b-ai-inventory.txt'), report);
console.log(`P1B_CALLS=${callCount}`);
console.log(`P1B_TASKS=${uniqueTasks.length}`);
console.log('P1B_AI_INVENTORY_COMPLETE');
