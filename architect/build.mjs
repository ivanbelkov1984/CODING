// ═══════════════════════════════════════════════════════════════
//  Архитектор — сборка для GitHub Pages.
//  Инлайнит styles.css и app.js в index.html, проставляет версию
//  кэша в sw.js и собирает всё в dist/ (файлы, которые кладутся в
//  ветку gh-pages). Раньше этот шаг жил вне репозитория — теперь
//  сборка воспроизводима и её видно.
//
//  Использование:
//    node build.mjs               → dist/, версия = текущий timestamp
//    node build.mjs v202607061500 → dist/, версия задана явно
//    node build.mjs --combined out.html → только инлайн-HTML (для тестов)
// ═══════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const DIR = dirname(fileURLToPath(import.meta.url));
// lucide.js — самохостинг иконок (без внешнего CDN); копируется рядом с HTML.
const STATIC = ['lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon-180.png'];
// ESM-модули зашифрованного backup — копируются рядом с HTML в dist/backup/,
// грузятся приложением по HTTP (без CDN, без Node-рантайма). index.html делает
// import('./backup/backup-boot.mjs'); sw.js кэширует их в app shell.
const BACKUP_MODULES = ['backup-core.mjs', 'backup-adapter.mjs', 'backup-restore.mjs', 'backup-ui.mjs', 'backup-boot.mjs'];
async function copyBackup(outDir) {
  await mkdir(join(outDir, 'backup'), { recursive: true });
  for (const f of BACKUP_MODULES) await copyFile(join(DIR, 'backup', f), join(outDir, 'backup', f));
}

// Версия сборки = короткий хеш контента (детерминированно): одинаковый код →
// одинаковая версия → SW не «обновляется» зря, а изменённый код всегда даёт
// новую версию кэша. Гармонично с уже работающим механизмом sw.js.
async function contentVersion() {
  const h = createHash('sha256');
  for (const f of ['index.html', 'styles.css', 'app.js', 'sw.js', 'lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2']) h.update(await readFile(join(DIR, f)));
  // Изменение любого backup-модуля тоже должно давать новую версию кэша.
  for (const f of BACKUP_MODULES) h.update(await readFile(join(DIR, 'backup', f)));
  return 'v' + h.digest('hex').slice(0, 10);
}

// Инлайн CSS/JS в HTML. Замена через функцию — чтобы `$` в коде трактовался
// буквально (в строке-замене `$&`, `$1` и т.п. — специальные).
export async function buildCombined() {
  let html = await readFile(join(DIR, 'index.html'), 'utf8');
  const css = await readFile(join(DIR, 'styles.css'), 'utf8');
  const js  = await readFile(join(DIR, 'app.js'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + css + '\n</style>');
  html = html.replace('<script src="app.js"></script>', () => '<script>\n' + js + '\n</script>');
  if (/href="styles\.css"|src="app\.js"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');
  if (!html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');
  return html;
}

async function main() {
  const args = process.argv.slice(2);
  // Режим «только combined» — для тестов.
  const ci = args.indexOf('--combined');
  if (ci !== -1) {
    const out = args[ci + 1] || join(DIR, 'dist', 'index.html');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, await buildCombined());
    // рядом с HTML — для локальных ссылок (иконки + шрифт) + ESM-модули backup,
    // чтобы combined-артефакт реально грузил backup по HTTP (не только собирался).
    for (const f of ['lucide.js', 'inter-latin.woff2', 'inter-cyrillic.woff2']) await copyFile(join(DIR, f), join(dirname(out), f));
    await copyBackup(dirname(out));
    console.log('combined →', out);
    return;
  }
  const build = args[0] || await contentVersion();
  const dist = join(DIR, 'dist');
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'index.html'), await buildCombined());
  const sw = await readFile(join(DIR, 'sw.js'), 'utf8');
  if (!sw.includes('__BUILD__')) throw new Error('в sw.js нет плейсхолдера __BUILD__');
  await writeFile(join(dist, 'sw.js'), sw.replaceAll('__BUILD__', build));
  for (const f of STATIC) await copyFile(join(DIR, f), join(dist, f));
  await copyBackup(dist);
  console.log(`✓ dist/ собран · версия arch-${build} · файлов: ${STATIC.length + 2 + BACKUP_MODULES.length}`);
}

main().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
