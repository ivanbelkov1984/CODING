import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');
const files = {
  app: await readFile(resolve(root, 'app.js'), 'utf8'),
  index: await readFile(resolve(root, 'index.html'), 'utf8'),
  styles: await readFile(resolve(root, 'styles.css'), 'utf8'),
  feedback: await readFile(resolve(root, 'backend/feedback.js'), 'utf8'),
};

function windows(source, patterns, before = 8, after = 16) {
  const lines = source.split('\n');
  const out = [];
  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      if (!pattern.test(lines[i])) continue;
      const start = Math.max(0, i - before);
      const end = Math.min(lines.length, i + after + 1);
      out.push(`### ${String(pattern)} · line ${i + 1}\n${lines.slice(start, end).map((line, j) => `${start + j + 1}: ${line}`).join('\n')}`);
    }
  }
  return out.join('\n\n');
}

const report = [
  '# P1-C Privacy / Feedback Boundary Inventory',
  '',
  '## INDEX',
  windows(files.index, [/id="pg-sys"/, /О приложении/, /Конфигурац/, /data-metadata\.js/, /ai-policy\.js/, /app\.js/], 10, 26),
  '',
  '## APP',
  windows(files.app, [/function initAll\s*\(/, /function api\s*\(/, /async function api\s*\(/, /addEventListener\(['"]online/, /function openOv\s*\(/, /function closeOv\s*\(/, /function persistLocal\s*\(/, /function exportData\s*\(/], 10, 30),
  '',
  '## BACKEND FEEDBACK',
  files.feedback,
  '',
  '## EXISTING TOKENS',
  `feedbackTokens=${(files.app.match(/arch5_fb_|feedback|errorBuffer|errbuf/gi) || []).length}`,
  `indexFeedbackTokens=${(files.index.match(/feedback|обратн(?:ая|ой) связ/gi) || []).length}`,
  '',
].join('\n');

const outDir = resolve(root, 'test-results', 'p1c-inventory');
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'p1c-boundaries.txt'), report);
console.log('P1C_PRIVACY_BOUNDARY_INVENTORY_COMPLETE');
