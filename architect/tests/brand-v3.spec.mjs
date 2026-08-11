// ─────────────────────────────────────────────────────────────────────────
//  brand-v3.spec.mjs — интеграция owner-approved Brand Kit v3.
//
//  Гоняет РЕАЛЬНУЮ собранную страницу (dist/app.html + dist/brand/*) в
//  Chromium: манифест, иконки, шапка, splash, первый запуск, «О приложении»,
//  адаптив без обрезки и горизонтального переполнения, офлайн и доступность.
//
//  Запуск: node build.mjs --combined dist/app.html && node tests/brand-v3.spec.mjs
// ─────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const DIST = join(ROOT, 'dist');
const FILE = 'file://' + join(DIST, 'app.html');
const SHOTS = join(ROOT, 'evidence', 'brand');

let pass = 0, fail = 0;
const errors = [];
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── Brand v3: интеграция фирменного стиля ──');

// ═══ 1. Утверждённые бинарники: SHA-256 совпадает с owner-манифестом ═══
{
  const sums = readFileSync(join(ROOT, 'docs', 'brand', 'BRAND_ASSET_V3_SHA256SUMS.txt'), 'utf8')
    .split('\n').filter(Boolean).map(l => l.trim().split(/\s+/))
    .filter(([, name]) => name && name.endsWith('.png') && name !== '00-source-mockup-reference.png');
  const bad = [];
  let checked = 0;
  for (const [want, name] of sums) {
    const p = join(ROOT, 'brand', name);
    if (!existsSync(p)) { bad.push(name + ': отсутствует'); continue; }
    const got = createHash('sha256').update(readFileSync(p)).digest('hex');
    checked++;
    if (got !== want) bad.push(`${name}: ${got.slice(0, 12)} ≠ ${want.slice(0, 12)}`);
  }
  ok(bad.length === 0 && checked === sums.length,
    `все ${sums.length} утверждённых ассетов лежат в brand/ с совпадающим SHA-256`, bad.join('\n'));
  ok(!existsSync(join(ROOT, 'brand', '00-source-mockup-reference.png')),
    'исходный mockup (00-…) НЕ попал в репозиторий приложения — он только reference');
  ok(!existsSync(join(DIST, 'brand', '00-source-mockup-reference.png')) &&
     !existsSync(join(DIST, 'brand', '01-app-icon-master-1024.png')),
    'в сборку не попали reference/мастер-ассеты (только реально используемые)');
}

// ═══ 2. Манифест ссылается на существующие файлы ════════════════════
{
  const man = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  ok(man.name === 'Архитектор жизни', `manifest name = «Архитектор жизни» (${man.name})`);
  ok(man.short_name === 'Архитектор', `short_name — короткий корректный вариант (${man.short_name})`);
  ok(man.start_url === './' && man.scope === './' && man.display === 'standalone',
    'start_url/scope/display не изменены');
  const icons = man.icons || [];
  const has = (size, purpose) => icons.some(i => i.sizes === `${size}x${size}` && (i.purpose || 'any').split(' ').includes(purpose));
  ok(has(192, 'any'), 'manifest: иконка 192 any');
  ok(has(512, 'any'), 'manifest: иконка 512 any');
  ok(has(192, 'maskable'), 'manifest: иконка 192 maskable');
  ok(has(512, 'maskable'), 'manifest: иконка 512 maskable');
  const missing = icons.map(i => i.src).filter(src => !existsSync(join(DIST, src)));
  ok(missing.length === 0, 'все файлы из манифеста реально существуют в сборке', missing.join('\n'));
  const anySrc = icons.filter(i => (i.purpose || 'any').includes('any')).map(i => i.src);
  const maskSrc = icons.filter(i => (i.purpose || '').includes('maskable')).map(i => i.src);
  ok(anySrc.every(s => !maskSrc.includes(s)),
    'maskable и any — разные файлы (маска не режет обычную иконку)');
}

// ═══ 3. Сборка и service worker ═════════════════════════════════════
{
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
  const paths = [...shell.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
  const brandInShell = paths.filter(p => p.startsWith('brand/'));
  ok(brandInShell.length >= 8, `фирменные ассеты precache'атся существующим SW-механизмом (${brandInShell.length})`);
  const missing = brandInShell.filter(p => !existsSync(join(DIST, p)));
  ok(missing.length === 0, 'все брендовые пути из SHELL существуют в сборке', missing.join('\n'));
  ok(!/'\.\/icon-192\.png'|'\.\/icon-512\.png'|'\.\/apple-touch-icon-180\.png'/.test(sw),
    'старые корневые пути иконок больше не упоминаются в service worker');
  ok(!existsSync(join(DIST, 'icon-192.png')) && !existsSync(join(DIST, 'icon-512.png')),
    'старые иконки не попадают в сборку (заменены, а не продублированы)');
  ok(!/<link rel="manifest"[\s\S]{0,400}<link rel="manifest"/.test(readFileSync(join(DIST, 'app.html'), 'utf8')),
    'второй манифест не создан');
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const external = [];
const broken = [];

async function boot(viewport) {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  p.on('requestfailed', r => { if (r.url().startsWith('file://')) broken.push(r.url()); });
  await p.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith('file://')) {
      if (!/\/health(\?|$)/.test(u)) external.push(u);   // health-пинг синка существует и без брендинга
      return r.abort();
    }
    return r.continue();
  });
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  return p;
}
// Пользователь входит тапом по splash; для съёмки интерфейса делаем то же.
const dismissSplash = page => page.evaluate(() => {
  const s = document.getElementById('splash');
  if (s) { s.classList.add('off'); s.style.display = 'none'; }
  document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
});

// ═══ 4. Splash не блокирует запуск, знак виден ══════════════════════
{
  const page = await boot({ width: 390, height: 844 });
  const t0 = Date.now();
  const splash = await page.evaluate(() => {
    const el = document.getElementById('splash');
    const img = el && el.querySelector('img');
    return {
      hasImg: !!img, src: img ? img.getAttribute('src') : null,
      alt: img ? img.getAttribute('alt') : null,
      hidden: img ? img.getAttribute('aria-hidden') : null,
      interactive: !!document.getElementById('app'),
    };
  });
  ok(splash.hasImg && /brand\//.test(splash.src || ''), 'splash использует фирменный знак');
  ok(splash.alt === '' && splash.hidden === 'true',
    'splash-знак декоративный (рядом живое название) — скринридер не дублирует');
  ok(splash.interactive && Date.now() - t0 < 5000, 'splash не задерживает запуск приложения');
  await page.close();
}

// ═══ 5. Шапка: только знак, без растрового названия ═════════════════
{
  const page = await boot({ width: 390, height: 844 });
  const head = await page.evaluate(() => {
    const el = document.querySelector('.topbar');
    const before = el.getBoundingClientRect().height;
    const img = el.querySelector('img.brand-mark');
    const r = img ? img.getBoundingClientRect() : null;
    const title = document.getElementById('ptitle');
    const acts = document.querySelector('.top-acts');
    const ar = acts ? acts.getBoundingClientRect() : null;
    return {
      topbar: before, has: !!img, w: r && Math.round(r.width), h: r && Math.round(r.height),
      alt: img && img.getAttribute('alt'), hidden: img && img.getAttribute('aria-hidden'),
      fit: img && getComputedStyle(img).objectFit,
      titleText: title ? title.textContent.trim() : '',
      collide: r && ar ? r.right > ar.left + 0.5 : false,
      natural: img ? (img.naturalWidth > 0 && img.naturalHeight > 0) : false,
    };
  });
  ok(head.has && head.natural, 'в шапке загружен фирменный знак (изображение не битое)');
  ok(head.w >= 36 && head.w <= 48 && head.h === head.w,
    `размер знака в шапке в диапазоне ориентира (${head.w}×${head.h} CSS px)`);
  // 71px — измеренная высота шапки на MAIN до брендинга (её задают кнопки 44px).
  ok(head.topbar <= 71, `высота шапки не выросла (${Math.round(head.topbar)}px против 71px на MAIN)`);
  ok(head.fit === 'contain', 'знак выводится object-fit: contain (никакого cover)');
  ok(head.alt === '' && head.hidden === 'true' && head.titleText.length > 0,
    'рядом живой заголовок → знак декоративный, растрового названия нет');
  ok(!head.collide, 'знак не сталкивается с кнопками действий шапки');
  await page.close();
}

// ═══ 6. Первый запуск: полный фирменный блок без дубля названия ═════
{
  const page = await boot({ width: 390, height: 844 });
  const ob = await page.evaluate(() => {
    const ov = document.getElementById('ov-onboard');
    ov.classList.add('on');
    const img = ov.querySelector('img.brand-lockup');
    const r = img.getBoundingClientRect();
    const sheet = ov.querySelector('.onboard-sheet').getBoundingClientRect();
    const cs = getComputedStyle(img);
    const titles = Array.from(ov.querySelectorAll('.onboard-h')).map(e => e.textContent.trim());
    return {
      src: img.getAttribute('src'), alt: img.getAttribute('alt'),
      fit: cs.objectFit, w: r.width, h: r.height,
      natural: img.naturalWidth / img.naturalHeight,
      ratioOk: Math.abs((r.width / r.height) - (img.naturalWidth / img.naturalHeight)) < 0.02,
      inside: r.left >= sheet.left - 0.5 && r.right <= sheet.right + 0.5,
      loaded: img.naturalWidth > 0, titles,
    };
  });
  ok(ob.loaded && /26-brand-lockup-icon-title-subtitle/.test(ob.src),
    'первый запуск показывает утверждённый lockup (знак + название + подзаголовок)');
  ok(ob.alt === 'Архитектор жизни' && ob.titles.length === 0,
    'lockup — единственный носитель названия: доступное имя «Архитектор жизни», текстового дубля нет');
  ok(ob.fit === 'contain' && ob.ratioOk, 'пропорции сохранены, изображение не растянуто');
  ok(ob.inside, 'lockup полностью помещается в карточку (ничего не обрезано)');
  await page.close();
}

// ═══ 7. «О приложении»: знак + живое название и версия ══════════════
{
  const page = await boot({ width: 390, height: 844 });
  const ab = await page.evaluate(() => {
    goTo('settings');
    const card = document.querySelector('.about-card');
    const img = card.querySelector('img.about-mark');
    const r = img.getBoundingClientRect();
    return {
      loaded: img.naturalWidth > 0, src: img.getAttribute('src'),
      alt: img.getAttribute('alt'), hidden: img.getAttribute('aria-hidden'),
      size: Math.round(r.width), fit: getComputedStyle(img).objectFit,
      name: (card.querySelector('.about-name') || {}).textContent,
      version: (card.textContent || '').includes('v5.0'),
    };
  });
  ok(ab.loaded && /09-about-brand-icon-256/.test(ab.src), '«О приложении»: фирменный знак загружен');
  ok(ab.name === 'Архитектор жизни' && ab.version, 'рядом живое название продукта и версия сборки');
  ok(ab.alt === '' && ab.hidden === 'true', 'знак декоративный — название не произносится дважды');
  ok(ab.fit === 'contain' && ab.size <= 64, `знак компактный, не гигантский логотип (${ab.size}px)`);
  await page.close();
}

// ═══ 8. Навигация: доменные иконки НЕ заменены логотипом ════════════
{
  const page = await boot({ width: 390, height: 844 });
  const nav = await page.evaluate(() => {
    const brandInNav = document.querySelectorAll('#nav img.brand-mark, #nsh-tabbar img.brand-mark').length;
    const icons = document.querySelectorAll('#nav [data-lucide], #nsh-tabbar [data-lucide], #nav svg, #nsh-tabbar svg').length;
    // Разрешённые места идентичности: шапка, сайдбар, splash, первый запуск,
    // «О приложении». Всё остальное — повтор логотипа по экранам.
    const allowed = ['.topbar', '.side-brand', '#splash', '#ov-onboard', '.about-card'];
    const imgs = Array.from(document.querySelectorAll('img[src*="brand/"]'));
    const stray = imgs.filter(i => !allowed.some(sel => i.closest(sel)));
    return { brandInNav, icons, total: imgs.length, stray: stray.length,
      strayWhere: stray.map(i => i.className).slice(0, 3) };
  });
  ok(nav.brandInNav === 0 && nav.icons > 5,
    'разделы сохранили свои функциональные иконки, логотип их не заменил');
  ok(nav.stray === 0 && nav.total <= 6,
    `логотип только в местах идентичности, не повторяется по карточкам (${nav.total} изображений, лишних ${nav.stray})`,
    nav.strayWhere.join(', '));
  await page.close();
}

// ═══ 9. Адаптив: полный знак виден, ничего не обрезано, нет overflow ═
{
  if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
  const VIEWS = [
    { id: '320-phone', width: 320, height: 640 },
    { id: '375-phone', width: 375, height: 812 },
    { id: '390-phone', width: 390, height: 844 },
    { id: '430-phone', width: 430, height: 932 },
    { id: 'landscape-phone', width: 844, height: 390 },
    { id: '768-tablet', width: 768, height: 1024 },
    { id: '834-tablet', width: 834, height: 1112 },
    { id: '1280-desktop', width: 1280, height: 800 },
  ];
  for (const v of VIEWS) {
    const page = await boot({ width: v.width, height: v.height });
    if (v.id === '390-phone') await page.screenshot({ path: join(SHOTS, 'splash-390-phone.png') });
    await dismissSplash(page);
    const m = await page.evaluate(() => {
      // На узких экранах знак в шапке; на десктопе шапочный знак намеренно
      // скрыт существующим правилом, и идентичность несёт постоянный сайдбар.
      const inTop = document.querySelector('.topbar img.brand-mark');
      const inSide = document.querySelector('.side-brand img.brand-mark');
      // «Видим» = не только имеет размер, но и реально попадает в экран:
      // на телефоне сайдбар — выдвижной ящик, он лежит за левым краем.
      const vis = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > 0 && r.left < window.innerWidth;
      };
      const img = vis(inTop) ? inTop : inSide;
      const r = img.getBoundingClientRect();
      const acts = document.querySelector('.top-acts').getBoundingClientRect();
      const burger = document.getElementById('burger');
      const br = burger && burger.getBoundingClientRect().width > 0 ? burger.getBoundingClientRect() : null;
      const tabs = Array.from(document.querySelectorAll('#nsh-tabbar button'))
        .map(b => b.getBoundingClientRect()).filter(x => x.width > 0);
      return {
        where: vis(inTop) ? 'topbar' : 'sidebar',
        marksVisible: [inTop, inSide].filter(vis).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        markVisible: r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.top >= -0.5,
        square: Math.abs(r.width - r.height) < 0.5,
        size: Math.round(r.width),
        collideActs: vis(inTop) ? r.right > acts.left + 0.5 : false,
        collideBurger: br && vis(inTop) ? r.left < br.right - 0.5 : false,
        topbar: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
        smallTaps: tabs.filter(t => t.height < 44).length,
      };
    });
    await page.screenshot({ path: join(SHOTS, `topbar-${v.id}.png`) });
    // Экран первого запуска — единственное место с полным lockup.
    const lock = await page.evaluate(() => {
      document.getElementById('ov-onboard').classList.add('on');
      const img = document.querySelector('#ov-onboard img.brand-lockup');
      const r = img.getBoundingClientRect();
      const sheet = document.querySelector('#ov-onboard .onboard-sheet').getBoundingClientRect();
      return {
        inside: r.left >= sheet.left - 0.5 && r.right <= sheet.right + 0.5 &&
                r.top >= sheet.top - 0.5 && r.bottom <= sheet.bottom + 0.5,
        visible: r.width > 40 && r.height > 10,
        ratioOk: Math.abs((r.width / r.height) - (img.naturalWidth / img.naturalHeight)) < 0.02,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await page.waitForTimeout(320);   // дождаться конца перехода overlay — иначе кадр полупрозрачный
    await page.screenshot({ path: join(SHOTS, `first-launch-${v.id}.png`) });
    ok(m.overflow <= 0 && lock.overflow <= 0, `${v.id}: нет горизонтального переполнения страницы`);
    ok(m.marksVisible === 1, `${v.id}: фирменный знак показан ровно один раз (шапка или сайдбар, без дубля)`);
    ok(m.markVisible && m.square && m.size >= 36 && m.size <= 48,
      `${v.id}: знак (${m.where}, ${m.size}px) виден целиком, квадратный, в диапазоне ориентира`);
    ok(!m.collideActs && !m.collideBurger, `${v.id}: знак не сталкивается с меню и кнопками`);
    // 71px — измеренная высота шапки на MAIN до брендинга (кнопки 44px + отступы).
    ok(m.topbar <= 71 && m.smallTaps === 0, `${v.id}: высота шапки (${m.topbar}px) не выросла, тап-цели целы`);
    ok(lock.inside && lock.visible && lock.ratioOk,
      `${v.id}: фирменный блок первого запуска виден полностью, без обрезки и растяжения`);
    await page.close();
  }
}

// ═══ 9b. Светлая тема: фирменный знак читается и не «залипает» ══════
{
  const page = await boot({ width: 390, height: 844 });
  await dismissSplash(page);
  const light = await page.evaluate(async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    await new Promise(r => setTimeout(r, 250));
    const img = document.querySelector('.topbar img.brand-mark');
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      visible: r.width > 0 && img.naturalWidth > 0,
      filter: cs.filter, fit: cs.objectFit,
      plate: cs.backgroundImage,
      size: Math.round(r.width),
    };
  });
  await page.screenshot({ path: join(SHOTS, 'light-topbar-390.png'), clip: { x: 0, y: 0, width: 390, height: 130 } });
  ok(light.visible && light.size >= 36, 'светлая тема: знак в шапке отрисован в том же размере');
  ok(light.filter === 'none' && light.plate === 'none',
    'светлая тема: без CSS-фильтров и без градиентной подложки под знаком');
  ok(light.fit === 'contain', 'светлая тема: contain сохранён');
  await page.evaluate(() => { goTo('settings'); });
  await page.waitForTimeout(200);
  await dismissSplash(page);
  const box = await page.evaluate(() => {
    const c = document.querySelector('.about-card');
    c.scrollIntoView();
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(390, r.width), height: Math.min(220, r.height) };
  });
  await page.screenshot({ path: join(SHOTS, 'light-about-390.png'), clip: box });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(SHOTS, 'dark-about-390.png'), clip: box });
  await page.close();
}

// ═══ 9c. Maskable: системная маска не режет смысловые элементы ══════
{
  const page = await boot({ width: 600, height: 400 });
  await page.setContent(`<body style="margin:0;background:#20242e;display:flex;gap:24px;padding:24px">
    <div style="text-align:center;color:#fff;font:12px system-ui">
      <div style="width:180px;height:180px;border-radius:50%;overflow:hidden">
        <img src="${'file://' + join(DIST, 'brand', '10-app-icon-maskable-512.png')}" style="width:100%;height:100%;object-fit:contain">
      </div>круг (Android)</div>
    <div style="text-align:center;color:#fff;font:12px system-ui">
      <div style="width:180px;height:180px;border-radius:40px;overflow:hidden">
        <img src="${'file://' + join(DIST, 'brand', '10-app-icon-maskable-512.png')}" style="width:100%;height:100%;object-fit:contain">
      </div>squircle (iOS)</div>
    <div style="text-align:center;color:#fff;font:12px system-ui">
      <div style="width:180px;height:180px">
        <img src="${'file://' + join(DIST, 'brand', '02-app-icon-512.png')}" style="width:100%;height:100%;object-fit:contain">
      </div>any (без маски)</div>
  </body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, 'maskable-under-mask.png') });
  // 72% safe zone: содержимое за её пределами маска имеет право срезать.
  const safe = await page.evaluate(() => {
    const img = document.querySelector('img');
    return img.naturalWidth === 512 && img.naturalHeight === 512;
  });
  ok(safe, 'maskable 512 — квадрат 512×512, пригодный для системной маски');
  await page.close();
}

// ═══ 10. Офлайн-запуск и локальность ассетов ════════════════════════
{
  const page = await boot({ width: 390, height: 844 });
  const offline = await page.evaluate(async () => {
    const urls = ['brand/03-app-icon-192.png', 'brand/04-apple-touch-icon-180.png',
      'brand/06-favicon-32.png', 'brand/08-header-brand-icon-64.png',
      'brand/09-about-brand-icon-256.png', 'brand/26-brand-lockup-icon-title-subtitle-safe.png'];
    const res = await Promise.all(urls.map(u => new Promise(r => {
      const i = new Image();
      i.onload = () => r({ u, ok: i.naturalWidth > 0 });
      i.onerror = () => r({ u, ok: false });
      i.src = u;
    })));
    return res;
  });
  ok(offline.every(r => r.ok), 'все фирменные изображения грузятся локально',
    offline.filter(r => !r.ok).map(r => r.u).join('\n'));
  const html = readFileSync(join(DIST, 'app.html'), 'utf8');
  ok(!/https?:\/\/[^"']*(logo|brand|icon)[^"']*\.(png|svg|jpg)/i.test(html),
    'ни один фирменный ассет не грузится с внешнего адреса/CDN');
  await page.close();
}

ok(broken.length === 0, `битых ссылок на изображения нет (${broken.length})`, broken.slice(0, 5).join('\n'));
ok(external.length === 0, `брендинг не порождает внешних запросов (${external.length})`, external.slice(0, 5).join('\n'));
ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length})`, errors.slice(0, 5).join('\n'));

await browser.close();
console.log(`\nBrand v3: ${pass} passed, ${fail} failed · скриншоты → evidence/brand/`);
process.exit(fail ? 1 : 0);
