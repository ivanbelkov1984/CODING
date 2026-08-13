// ИМПОРТ ПОСТАВКИ (.zip) — MUTATION SANITY.
//
// Ломается РОВНО ОДНА защита ZIP-слоя в собранном бандле — обязан упасть
// именно тот сценарий importZip.spec.mjs, который её сторожит. Смысл:
// доказать, что сюита ловит возврат к небезопасному поведению, а не
// просто «зелёная».

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'importZip.spec.mjs');

const src = await readFile(DIST, 'utf8');

const MUTANTS = [
  {
    // Проверка контрольных сумм тихо выключается — подменённая поставка
    // проходит как целая.
    id: 'sha-verify-skipped',
    what: 'SHA256SUMS перестаёт проверяться',
    find: '        if (got !== want) return { ok: false, errors: [`контрольная сумма не совпала: «${path.slice(0, 60)}» — архив повреждён или подменён`] };',
    replace: '        if (false) return { ok: false, errors: [`контрольная сумма не совпала: «${path.slice(0, 60)}» — архив повреждён или подменён`] };',
    expectFail: 'несовпавшая SHA256 отклонена',
  },
  {
    // Порядок пакетов откатывается на имена файлов — зависимые пакеты
    // применяются в неверной последовательности.
    id: 'manifest-order-ignored',
    what: 'порядок манифеста игнорируется (сортировка по именам)',
    find: "    if (!ordered) ordered = feedEntries.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));",
    replace: "    ordered = feedEntries.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));",
    expectFail: 'порядок манифеста применён',
  },
  {
    // Защита от выхода из архива снимается.
    id: 'traversal-allowed',
    what: 'path traversal в именах записей перестаёт отклоняться',
    find: '    if (!extZipSafeName(name)) return { ok: false, errors: [`небезопасное имя файла в архиве: «${String(name).slice(0, 60)}»`] };',
    replace: '    if (false) return { ok: false, errors: [`небезопасное имя файла в архиве: «${String(name).slice(0, 60)}»`] };',
    expectFail: 'path traversal отклонён',
  },
  {
    // Лимит числа файлов снимается — защита от бомбы-архива ослаблена.
    id: 'entry-limit-removed',
    what: 'лимит числа файлов в архиве перестаёт действовать',
    find: '  if (count > EXT_ZIP_LIMITS.maxEntries) return { ok: false, errors: [`слишком много файлов в архиве: ${count} (максимум ${EXT_ZIP_LIMITS.maxEntries})`] };',
    replace: '  if (false) return { ok: false, errors: [`слишком много файлов в архиве: ${count} (максимум ${EXT_ZIP_LIMITS.maxEntries})`] };',
    expectFail: 'лимит числа файлов работает',
  },
  {
    // Дубль одинакового пакета в двух файлах молча пропускается.
    id: 'duplicate-package-accepted',
    what: 'двойная поставка одного пакета перестаёт отклоняться',
    find: '        if (seenPkg.has(key)) return { ok: false, errors: [`«${extZipBase(e.name).slice(0, 60)}»: этот пакет уже есть в архиве в другом файле — двойная поставка запрещена`] };',
    replace: '        if (false) return { ok: false, errors: [`«${extZipBase(e.name).slice(0, 60)}»: этот пакет уже есть в архиве в другом файле — двойная поставка запрещена`] };',
    expectFail: 'дубль пакета в двух файлах отклонён',
  },
  {
    // Проверка CRC распакованных данных снимается — битые байты проходят.
    id: 'crc-check-removed',
    what: 'CRC распакованной записи перестаёт проверяться',
    find: '  if (extCrc32(data) !== e.crc) throw new Error(`«${e.name.slice(0, 60)}»: контрольная сумма CRC не совпала`);',
    replace: '  if (false) throw new Error(`«${e.name.slice(0, 60)}»: контрольная сумма CRC не совпала`);',
    expectFail: 'повреждённые данные записи отклонены (CRC)',
  },
  {
    // BOM перестаёт срезаться при декодировании — реальный корпус владельца
    // (файлы с BOM) снова бился бы о JSON.parse.
    id: 'bom-strip-removed',
    what: 'UTF-8 BOM перестаёт срезаться при декодировании записей архива',
    find: "const extZipText = bytes => new TextDecoder('utf-8').decode(bytes);",
    replace: "const extZipText = bytes => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);",
    // …и подстраховка в парсере тоже отключается (двойная защита — одна мутация).
    extra: {
      find: "  const raw = String(text || '').replace(/^\\uFEFF/, '');",
      replace: "  const raw = String(text || '');",
    },
    expectFail: 'файл с UTF-8 BOM импортируется',
  },
  {
    // Разбивка по разделам исчезает из предпросмотра поставки.
    id: 'breakdown-removed',
    what: 'предпросмотр перестаёт показывать разбивку по разделам',
    find: "  const collRows = Object.entries(byColl).map(([c, n]) => `<div class=\"ext-sum\"><span>${esc(extCollRu(c))}</span><b>${n}</b></div>`).join('');",
    replace: "  const collRows = '';",
    expectFail: 'разбивка по разделам приложения в предпросмотре',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, IMPORTZIP_BUNDLE: bundle },
  });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out }));
});

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); if (detail) console.log('      ' + String(detail).split('\n').join('\n      ')); }
};

console.log('\n── ZIP mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить.`);
    continue;
  }
  let mutated = src.replace(m.find, m.replace);
  if (m.extra) {
    if (!mutated.includes(m.extra.find)) {
      ok(false, `[${m.id}] второй якорь мутации найден в бандле`, `не найдено:\n${m.extra.find}`);
      continue;
    }
    mutated = mutated.replace(m.extra.find, m.extra.replace);
  }
  const file = join(DIST_DIR, `_zip-mutant-${m.id}.html`);
  await writeFile(file, mutated);
  const { code, out } = await run(file);
  await rm(file, { force: true });
  const reds = out.split('\n').filter(l => l.trimStart().startsWith('✗')).map(l => l.trim());
  const hitExpected = reds.some(l => l.includes(m.expectFail));
  ok(code !== 0 && hitExpected,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0 ? 'ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но вся сюита прошла.'
      : hitExpected ? null
        : `Сюита упала, но НЕ на ожидаемом сценарии. Красные:\n${reds.slice(0, 6).join('\n') || '(нет)'}`);
}

console.log(`\nZIP mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
