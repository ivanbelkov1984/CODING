// Wave 6 (issue #160) — MUTATION SANITY для External Work Bridge.
//
// Зелёная сюита сама по себе НЕ доказывает, что проверки что-то ловят. Здесь мы
// берём собранный production-бандл, ломаем в нём РОВНО ОДНУ защиту импорта и
// требуем, чтобы упал именно тот сценарий, который эту защиту сторожит.
// Если сценарий остался зелёным — проверка ложная, и этот прогон падает.
//
// Мутанты кладутся прямо в dist/ (production грузит соседние файлы
// относительными путями) и удаляются в конце.

import { readFile, writeFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(DIR, '..', 'dist');
const DIST = join(DIST_DIR, 'app.html');
const SPEC = join(DIR, 'wave6-external-work-bridge.spec.mjs');

const src = await readFile(DIST, 'utf8');

// Каждая мутация — минимальная точечная порча ОДНОЙ защиты.
// `expectFail` — фрагмент сообщения сценария, который обязан покраснеть.
const MUTANTS = [
  {
    id: 'provenance-dedup',
    what: 'снят provenance-дедуп: повторный импорт того же sourceId создаёт дубль',
    find: '      .filter(x => x.key && provIdx.has(x.key))',
    replace: '      .filter(() => false)',
    expectFail: 'один факт остался одним canonical-фактом',
  },
  {
    id: 'transaction-staging',
    what: 'коммит пишет прямо в живой DB вместо клона-кандидата',
    find: '  const candidate = JSON.parse(JSON.stringify(DB));\n  const created = [];',
    replace: '  const candidate = DB;\n  const created = [];',
    expectFail: 'zero mutation',
  },
  {
    id: 'psylink-validation',
    what: 'снята production-валидация связей в предпросмотре',
    find: '    const err = validatePsyLink({ fromColl: from.coll, fromId: from.id, toColl: to.coll, toId: to.id, relation: l.relation }, candidate);',
    replace: '    const err = null;',
    expectFail: 'отбита production-валидатором',
  },
  {
    id: 'ledger-event-source',
    what: 'ledger добавлен в EVENT_SOURCES — импорт начинает порождать двойное evidence',
    find: 'const EVENT_SOURCES = {\n  moments:',
    replace: "const EVENT_SOURCES = {\n  externalWorkSessions: rec => ({ tags: ['externalWork:imported'], importance: 1 }),\n  moments:",
    expectFail: 'EVENT_SOURCES',
  },
  // ── Owner review 5228662919: три новые защиты provenance ──
  {
    id: 'per-entity-source',
    what: 'source записи игнорируется — используется только пакетный',
    find: '  const src = extResolveSource(pkg.source || {}, e.source, null);',
    replace: '  const src = extResolveSource(pkg.source || {}, null, null);',
    expectFail: 'перекрывает пакетный',
  },
  {
    id: 'claim-classes-collapse',
    what: 'многослойный claimClasses схлопнут до одного primary',
    find: '    claimClasses: claims.all,',
    replace: '    claimClasses: [claims.primary],',
    expectFail: 'полный набор claimClasses сохранён',
  },
  {
    id: 'alias-dedup',
    what: 'дедуп смотрит только на основную ссылку, псевдонимы игнорируются',
    find: '    const found = prov.sourceRefs\n      .map(r => ({ ref: r, key: extProvenanceKey(coll, r.sourceId) }))',
    replace: '    const found = prov.sourceRefs.filter(r => r.role === \'primary\')\n      .map(r => ({ ref: r, key: extProvenanceKey(coll, r.sourceId) }))',
    expectFail: 'опознана по СВОЕМУ псевдониму',
  },
  {
    id: 'alias-index',
    what: 'индекс provenance строится только по плоскому sourceId',
    find: '      extRecordSourceIds(r).forEach(sid => {',
    replace: '      [r && r.ext && r.ext.sourceId].filter(Boolean).forEach(sid => {',
    expectFail: 'PARA↔LIFE cross-link',
  },
  // Owner review 5230472460: возврат к collection-scoped ключу обязан
  // уронить кросс-типовые проверки — иначе один эпизод снова смог бы стать
  // двумя canonical-записями разных типов.
  {
    id: 'collection-scoped-identity',
    what: 'ключ идентичности снова ограничен коллекцией (coll|sourceId)',
    find: 'function extProvenanceKey(coll, sourceId) { return sourceId ? String(sourceId) : null; }',
    replace: 'function extProvenanceKey(coll, sourceId) { return sourceId ? coll + \'|\' + sourceId : null; }',
    expectFail: 'помечен как conflict',
  },
  {
    id: 'conflict-commit-gate',
    what: 'коммит перестаёт отклонять пакет с конфликтом идентичности',
    find: '  const conflicts = plan.items.filter(i => i.status === \'conflict\');\n  if (conflicts.length) {',
    replace: '  const conflicts = [];\n  if (false) {',
    expectFail: 'commit отклонён fail-closed',
  },
  {
    id: 'recovery-write-lock',
    what: 'снята Wave-5 блокировка записи: импорт проходит в режиме восстановления',
    find: "  if (isWriteLocked()) return { ok: false, error: 'профиль в режиме восстановления — импорт заблокирован' };",
    replace: '  if (false) return { ok: false, error: null };',
    expectFail: 'recovery-блокировкой',
  },
];

const run = (bundle) => new Promise(res => {
  const p = spawn(process.execPath, [SPEC], {
    cwd: join(DIR, '..'),
    env: { ...process.env, WAVE6_BUNDLE: bundle },
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

console.log('\n── Wave 6 mutation sanity: каждая снятая защита обязана уронить свой сценарий ──');

for (const m of MUTANTS) {
  if (!src.includes(m.find)) {
    ok(false, `[${m.id}] якорь мутации найден в собранном бандле`,
      `не найдено:\n${m.find}\nProduction изменился — мутацию нужно обновить, иначе проверка бессмысленна.`);
    continue;
  }
  const file = join(DIST_DIR, `_wave6-mutant-${m.id}.html`);
  await writeFile(file, src.replace(m.find, m.replace));

  const { code, out } = await run(file);
  await rm(file, { force: true });

  // Красная строка сюиты: '  ✗ <сообщение>'.
  const reds = out.split('\n').filter(l => l.trimStart().startsWith('✗')).map(l => l.trim());
  const hitExpected = reds.some(l => l.includes(m.expectFail));

  ok(code !== 0 && hitExpected,
    `[${m.id}] ${m.what} → сценарий «${m.expectFail}» покраснел (${reds.length} провалов)`,
    code === 0
      ? `ПРОВЕРКА ЛОЖНОЗЕЛЁНАЯ: защита снята, но вся сюита прошла.`
      : hitExpected ? null
        : `Сюита упала, но НЕ на ожидаемом сценарии. Красные:\n${reds.join('\n') || '(нет)'}`);
}

console.log(`\nWave 6 mutation sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
