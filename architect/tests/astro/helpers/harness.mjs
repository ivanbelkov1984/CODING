// Wave 3 (issue #154) — общий браузерный харнесс для всех трёх слоёв.
// Гоняет РЕАЛЬНЫЙ собранный production-бандл (dist/app.html) в Chromium, тем
// же способом, что и остальные spec-файлы репозитория. Астродвижок
// (astronomy.min.js) лежит рядом с app.html после `node build.mjs --combined`
// и подгружается штатным production-путём loadAstroEngine().

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', '..', '..', 'dist', 'app.html');

// customFile — абсолютный путь к альтернативной сборке. Используется
// mutation-прогоном (golden/mutation.mjs), который поднимает НАМЕРЕННО
// сломанную копию production, чтобы доказать: golden-проверки её ловят.
export async function bootAstro(customFile) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const pageErrors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(customFile ? 'file://' + customFile : FILE);
  await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await page.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on'));
  });
  // Штатная ленивая загрузка движка — тот же путь, что у пользователя.
  await page.evaluate(() => loadAstroEngine());
  await page.waitForFunction(() => !!window.Astronomy, null, { timeout: 30000 });

  const meta = await page.evaluate(() => ({
    engine: (typeof ASTRO_VERSIONS !== 'undefined' && ASTRO_VERSIONS.engine) || null,
    ruleset: (typeof ASTRO_VERSIONS !== 'undefined' && ASTRO_VERSIONS.ruleset) || null,
    orbPolicy: (typeof ASTRO_VERSIONS !== 'undefined' && ASTRO_VERSIONS.orbPolicy) || null,
    schemaVersion: typeof SCHEMA_VERSION !== 'undefined' ? SCHEMA_VERSION : null,
  }));

  return {
    page, browser, meta, pageErrors,
    // Расчёт натальной карты production-функцией.
    natal: birth => page.evaluate(b => computeNatalChart(b), birth),
    // Произвольное выражение в контексте страницы.
    evalIn: (fn, arg) => page.evaluate(fn, arg),
    close: () => browser.close(),
  };
}

// Стабильный «эталонный» набор данных рождения для повторяемых кейсов.
// Числа выбраны так, чтобы покрыть: известное время, ненулевой offset,
// среднюю широту северного полушария, восточную долготу.
export const REFERENCE_BIRTH = {
  date: '1984-06-15', time: '14:30', timeKnown: true,
  utcOffset: 4, lat: 55.7558, lon: 37.6173,
  houseSystem: 'whole', place: 'reference-case',
};
