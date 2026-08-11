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
import { readFile, writeFile, mkdir, copyFile, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const DIR = dirname(fileURLToPath(import.meta.url));
// lucide.js — самохостинг иконок (без внешнего CDN); копируется рядом с HTML.
// astronomy.min.js — vendored MIT-движок астрорасчётов (lazy-load, только при opt-in).
const STATIC = ['lucide.js', 'astronomy.min.js', 'astro_rules.js', 'astro_texts_extra.js', 'astro_texts_natal.js', 'astro_texts_transit.js', 'astro_texts_synastry.js', 'astro_texts_jyotish.js', 'inter-latin.woff2', 'inter-cyrillic.woff2', 'manifest.json'];
// ESM-модули зашифрованного backup — копируются рядом с HTML в dist/backup/,
// грузятся приложением по HTTP (без CDN, без Node-рантайма). index.html делает
// import('./backup/backup-boot.mjs'); sw.js кэширует их в app shell.
const BACKUP_MODULES = ['backup-core.mjs', 'backup-adapter.mjs', 'backup-restore.mjs', 'backup-ui.mjs', 'backup-boot.mjs'];
// Brand v3 (owner-approved kit): в сборку попадают ТОЛЬКО реально используемые
// в рантайме ассеты. Мастер 1024, исходный mockup и неиспользуемые lockup'ы
// остаются в репозитории как источник, но не раздуваются в dist.
const BRAND_RUNTIME = [
  '02-app-icon-512.png', '03-app-icon-192.png', '04-apple-touch-icon-180.png',
  '05-favicon-64.png', '06-favicon-32.png', '07-header-brand-icon-96.png',
  '08-header-brand-icon-64.png', '09-about-brand-icon-256.png',
  '10-app-icon-maskable-512.png', '11-app-icon-maskable-192.png',
  '26-brand-lockup-icon-title-subtitle-safe.png',
];
async function copyBrand(outDir) {
  await mkdir(join(outDir, 'brand'), { recursive: true });
  for (const f of BRAND_RUNTIME) await copyFile(join(DIR, 'brand', f), join(outDir, 'brand', f));
}
async function copyBackup(outDir) {
  await mkdir(join(outDir, 'backup'), { recursive: true });
  for (const f of BACKUP_MODULES) await copyFile(join(DIR, 'backup', f), join(outDir, 'backup', f));
}

// Версия сборки = короткий хеш контента (детерминированно): одинаковый код →
// одинаковая версия → SW не «обновляется» зря, а изменённый код всегда даёт
// новую версию кэша. Гармонично с уже работающим механизмом sw.js.
async function contentVersion() {
  const h = createHash('sha256');
  for (const f of ['index.html', 'styles.css', 'app.js', 'context-action-dock.css', 'context-action-dock.js', 'sw.js', 'lucide.js', 'astronomy.min.js', 'astro_rules.js', 'inter-latin.woff2', 'inter-cyrillic.woff2']) h.update(await readFile(join(DIR, f)));
  // Изменение любого backup-модуля тоже должно давать новую версию кэша.
  for (const f of BACKUP_MODULES) h.update(await readFile(join(DIR, 'backup', f)));
  // …как и замена фирменных ассетов: иначе SW отдал бы старые иконки.
  for (const f of BRAND_RUNTIME) h.update(await readFile(join(DIR, 'brand', f)));
  h.update(await readFile(join(DIR, 'manifest.json')));
  return 'v' + h.digest('hex').slice(0, 10);
}

// ── Release metadata (Wave 5, issue #158) ──────────────────────────
// Версия/SHA/время сборки проставляются ЗДЕСЬ и больше нигде: раньше их
// пришлось бы поддерживать руками в нескольких местах, и они неизбежно
// разъехались бы. app.js содержит только плейсхолдеры.
function releaseMeta(build) {
  // GITHUB_SHA есть в CI; локально — короткий git-хеш недоступен без вызова
  // git, поэтому честно пишем 'local' вместо выдуманного значения.
  const sha = process.env.GITHUB_SHA || 'local';
  return {
    build: build || 'dev',
    sha: sha.slice(0, 40),
    // SOURCE_DATE_EPOCH позволяет получить воспроизводимую сборку.
    builtAt: new Date(process.env.SOURCE_DATE_EPOCH ? +process.env.SOURCE_DATE_EPOCH * 1000 : Date.now()).toISOString(),
  };
}
function injectRelease(html, meta) {
  const out = html
    .replaceAll('__ARCH_BUILD__', meta.build)
    .replaceAll('__ARCH_SHA__', meta.sha)
    .replaceAll('__ARCH_BUILT_AT__', meta.builtAt);
  if (out.includes('__ARCH_BUILD__') || out.includes('__ARCH_SHA__') || out.includes('__ARCH_BUILT_AT__'))
    throw new Error('release metadata: остались незаменённые плейсхолдеры');
  return out;
}

// Инлайн CSS/JS в HTML. Замена через функцию — чтобы `$` в коде трактовался
// буквально (в строке-замене `$&`, `$1` и т.п. — специальные).
export async function buildCombined(build) {
  let html = await readFile(join(DIR, 'index.html'), 'utf8');
  const css = await readFile(join(DIR, 'styles.css'), 'utf8');
  const contextCss = await readFile(join(DIR, 'context-action-dock.css'), 'utf8');
  const js = await readFile(join(DIR, 'app.js'), 'utf8');
  const contextJs = await readFile(join(DIR, 'context-action-dock.js'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + css + '\n' + contextCss + '\n</style>');
  html = html.replace('<script src="app.js"></script>', () => '<script>\n' + js + '\n</script>\n<script>\n' + contextJs + '\n</script>');
  if (/href="styles\.css"|src="app\.js"/.test(html)) throw new Error('не удалось заинлайнить (осталась ссылка)');
  if (!html.includes(js.slice(0, 80))) throw new Error('JS не вставился дословно');
  if (!html.includes('Context action dock — issue #138')) throw new Error('context action dock JS не вставился');
  if (!html.includes('Context action dock — actions of the current section')) throw new Error('context action dock CSS не вставился');
  if (!html.includes('__ARCH_BUILD__')) throw new Error('в app.js нет плейсхолдера __ARCH_BUILD__');
  return injectRelease(html, releaseMeta(build));
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
    for (const f of ['lucide.js', 'astronomy.min.js', 'astro_rules.js', 'astro_texts_extra.js', 'astro_texts_natal.js', 'astro_texts_transit.js', 'astro_texts_synastry.js', 'astro_texts_jyotish.js', 'inter-latin.woff2', 'inter-cyrillic.woff2']) await copyFile(join(DIR, f), join(dirname(out), f));
    await copyBackup(dirname(out));
    await copyBrand(dirname(out));
    console.log('combined →', out);
    return;
  }
  const build = args[0] || await contentVersion();
  const dist = join(DIR, 'dist');
  // Полная сборка начинается с чистого dist: иначе файлы прошлых версий
  // (например заменённые иконки) остались бы в артефакте и уехали в деплой.
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'index.html'), await buildCombined(build));
  const sw = await readFile(join(DIR, 'sw.js'), 'utf8');
  if (!sw.includes('__BUILD__')) throw new Error('в sw.js нет плейсхолдера __BUILD__');
  await writeFile(join(dist, 'sw.js'), sw.replaceAll('__BUILD__', build));
  for (const f of STATIC) await copyFile(join(DIR, f), join(dist, f));
  await copyBackup(dist);
  await copyBrand(dist);
  console.log(`✓ dist/ собран · версия arch-${build} · файлов: ${STATIC.length + 2 + BACKUP_MODULES.length + BRAND_RUNTIME.length}`);
}

main().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
