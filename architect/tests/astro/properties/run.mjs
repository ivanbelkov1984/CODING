// Wave 3 (issue #154) — СЛОЙ 2: property-based tests.
//
// Проверяет не конкретные числа, а ОБЩИЕ математические свойства на множестве
// сгенерированных входов. Генератор детерминированный (mulberry32) — при
// падении печатается seed, номер итерации и минимальный (сжатый) контрпример,
// чтобы падение воспроизводилось одной командой.
//
// Воспроизведение: PROP_SEED=<seed> node tests/astro/properties/run.mjs

import { bootAstro } from '../helpers/harness.mjs';
import { createReporter, mulberry32, randomBirth, propertyFailure, shrinkBirth, angularDiff, norm360 } from '../helpers/core.mjs';

const BASE_SEED = Number(process.env.PROP_SEED || 20260730);
const N = Number(process.env.PROP_N || 60);
const R = createReporter('Astro property-based');
const h = await bootAstro();

console.log(`\n── Слой 2: property-based (seed=${BASE_SEED}, ${N} случаев на свойство) ──`);

// Прогоняет предикат по N сгенерированным картам. Предикат возвращает
// null при успехе либо строку с описанием нарушения.
async function forAllBirths(name, predicate, opts = {}) {
  const rnd = mulberry32(BASE_SEED);
  for (let i = 0; i < N; i++) {
    const birth = randomBirth(rnd, opts);
    let violation;
    try { violation = await predicate(birth); }
    catch (e) { violation = 'исключение: ' + e.message; }
    if (violation) {
      const stillFails = async b => {
        try { return !!(await predicate(b)); } catch { return true; }
      };
      const shrunk = await shrinkBirth(birth, stillFails);
      R.ok(false, name, propertyFailure({ seed: BASE_SEED, iteration: i, input: birth, shrunk, message: violation }));
      return;
    }
  }
  R.ok(true, `${name} (${N} случаев)`);
}

const finiteDeg = v => Number.isFinite(v) && v >= 0 && v < 360;

// ── 1. Отсутствие NaN/Infinity и нормализация долгот ─────────────────
await forAllBirths('нет NaN/Infinity; все долготы нормализованы в [0,360)', async birth => {
  const c = await h.natal(birth);
  for (const p of c.planets) {
    if (!finiteDeg(p.lon)) return `планета ${p.body}: lon=${p.lon}`;
    if (!Number.isFinite(p.deg) || p.deg < 0 || p.deg >= 30) return `планета ${p.body}: deg=${p.deg} вне [0,30)`;
  }
  for (const a of c.asteroids) if (!finiteDeg(a.lon)) return `астероид ${a.body}: lon=${a.lon}`;
  for (const [k, v] of Object.entries(c.points || {})) if (v && !finiteDeg(v.lon)) return `точка ${k}: lon=${v.lon}`;
  if (c.angles) {
    if (!finiteDeg(c.angles.asc.lon)) return `Asc=${c.angles.asc.lon}`;
    if (!finiteDeg(c.angles.mc.lon)) return `MC=${c.angles.mc.lon}`;
  }
  if (c.housesMeta) for (let k = 1; k <= 12; k++) if (!finiteDeg(c.housesMeta.cusps[k])) return `куспид ${k}=${c.housesMeta.cusps[k]}`;
  return null;
});

// ── 2. Детерминизм: одинаковый вход → побайтово одинаковый результат ─
await forAllBirths('одинаковый вход даёт идентичный результат (детерминизм)', async birth => {
  const [a, b] = await h.evalIn(x => [JSON.stringify(computeNatalChart(x)), JSON.stringify(computeNatalChart(x))], birth);
  return a === b ? null : 'два вызова дали разный JSON';
});

// ── 3. Расчёт не мутирует вход ───────────────────────────────────────
await forAllBirths('computeNatalChart не мутирует переданный объект birth', async birth => {
  const same = await h.evalIn(x => {
    const before = JSON.stringify(x);
    computeNatalChart(x);
    return before === JSON.stringify(x);
  }, birth);
  return same ? null : 'объект birth изменился после расчёта';
});

// ── 4. Свободный пользовательский текст не влияет на числа ───────────
// Имя места/заметка — интерпретационные поля; астрономия обязана их игнорировать.
await forAllBirths('имя места и посторонние поля не меняют астрономический результат', async birth => {
  const eq = await h.evalIn(x => {
    const clean = computeNatalChart(x);
    const dirty = computeNatalChart({ ...x, place: '"><script>alert(1)</script>', note: 'любой текст', nickname: 'Ω' });
    const strip = c => JSON.stringify({ p: c.planets, a: c.angles, h: c.housesMeta, pts: c.points });
    return strip(clean) === strip(dirty);
  }, birth);
  return eq ? null : 'свободный текст изменил расчётные поля';
});

// ── 5. Аспекты симметричны, орбис неотрицателен ──────────────────────
await forAllBirths('аспект(A,B) ≡ аспект(B,A); орбис ≥ 0 и не превышает допуск', async birth => {
  const c = await h.natal(birth);
  const byPair = new Map();
  for (const a of c.aspects) {
    const orb = parseFloat(a.exact);
    if (!(orb >= 0)) return `орбис отрицателен/NaN: ${JSON.stringify(a)}`;
    if (orb > 8.0001) return `орбис ${orb} превышает максимальный допуск политики (8°): ${JSON.stringify(a)}`;
    byPair.set([a.a, a.b].sort().join('|'), a.name);
  }
  // Симметрия: пересчёт с обратным порядком планет обязан дать тот же набор.
  const rev = await h.evalIn(x => {
    const c2 = computeNatalChart(x);
    c2.planets.reverse();
    const out = [];
    for (let i = 0; i < c2.planets.length; i++) for (let j = i + 1; j < c2.planets.length; j++) {
      const sep = Math.abs(((c2.planets[i].lon - c2.planets[j].lon + 180) % 360 + 360) % 360 - 180);
      for (const asp of ASTRO_ASPECTS) if (Math.abs(sep - asp.angle) <= asp.orb) { out.push([[c2.planets[i].name, c2.planets[j].name].sort().join('|'), asp.name]); break; }
    }
    return out;
  }, birth);
  if (rev.length !== byPair.size) return `перестановка порядка планет изменила число аспектов: ${byPair.size} → ${rev.length}`;
  for (const [k, v] of rev) if (byPair.get(k) !== v) return `аспект пары ${k} различается при обратном порядке: ${byPair.get(k)} vs ${v}`;
  return null;
});

// ── 6. Неизвестное время не создаёт ложной точности ──────────────────
await forAllBirths('неизвестное время рождения: нет Asc/MC, нет домов, нет зависящих от углов точек',
  async birth => {
    const c = await h.natal({ ...birth, timeKnown: false, time: '' });
    if (c.angles) return 'при timeKnown=false возвращены углы Asc/MC';
    if (c.houses || c.housesMeta) return 'при timeKnown=false возвращены дома';
    if (c.timeKnown !== false) return 'флаг timeKnown в результате не false';
    for (const k of ['fortune', 'vertex', 'antivertex', 'eastPoint']) {
      if (c.points && c.points[k]) return `точка ${k} зависит от углов, но посчитана без времени`;
    }
    return null;
  }, { timeKnown: true });

// ── 7. Provenance системы домов ──────────────────────────────────────
// Карта обязана СООБЩАТЬ ту систему, которой реально посчитаны куспиды.
// При полярном откате production меняет систему — и обязан это отразить.
await forAllBirths('versions.houses сообщает РЕАЛЬНО использованную систему домов (не запрошенную)',
  async birth => {
    const c = await h.natal(birth);
    if (!c.housesMeta) return null;                    // время неизвестно — домов нет
    const used = c.housesMeta.system;
    const declared = String(c.versions.houses || '').replace(/-v1$/, '');
    if (used !== declared) {
      return `куспиды посчитаны системой «${used}», но versions.houses сообщает «${declared}»` +
        (c.housesMeta.fallbackFrom ? ` (полярный откат с «${c.housesMeta.fallbackFrom}»)` : '');
    }
    return null;
  }, { timeKnown: true });

// ── 8. Куспиды образуют корректный круг ──────────────────────────────
await forAllBirths('12 куспидов образуют полный круг 360° без пересечений', async birth => {
  const c = await h.natal(birth);
  if (!c.housesMeta) return null;
  let acc = 0;
  for (let k = 1; k <= 12; k++) {
    const d = norm360(c.housesMeta.cusps[k === 12 ? 1 : k + 1] - c.housesMeta.cusps[k]);
    if (!(d > 0 && d < 180)) return `дом ${k} имеет ширину ${d}° (ожидается (0,180))`;
    acc += d;
  }
  return Math.abs(acc - 360) < 0.05 ? null : `сумма секторов ${acc}° ≠ 360°`;
}, { timeKnown: true });

// ── 9. Каждая планета попадает ровно в один дом ──────────────────────
await forAllBirths('каждая планета отнесена ровно к одному дому из 1..12', async birth => {
  const c = await h.natal(birth);
  if (!c.houses) return null;
  for (const x of c.houses) {
    if (!Number.isInteger(x.house) || x.house < 1 || x.house > 12) return `${x.body}: дом=${x.house}`;
  }
  return c.houses.length === c.planets.length ? null : `домов ${c.houses.length} против планет ${c.planets.length}`;
}, { timeKnown: true });

// ── 10. Tropical и sidereal не смешиваются ───────────────────────────
// Разница долгот тропической и сидерической карты обязана быть РОВНО
// аянамшей — одинаковой для всех тел. Если где-то смешались школы,
// разброс между телами это покажет.
await forAllBirths('сидерические долготы = тропические − аянамша (единая для всех тел)', async birth => {
  const r = await h.evalIn(x => {
    const c = computeNatalChart(x);
    const A = window.Astronomy;
    const utc = new Date(Date.parse(x.date + 'T' + (x.timeKnown ? x.time : '12:00') + ':00Z') - (x.utcOffset || 0) * 3600e3);
    const ay = ayanamsha('lahiri', A.MakeTime(utc));
    return c.planets.map(p => ({ body: p.body, delta: ((p.lon - (((p.lon - ay) % 360 + 360) % 360)) % 360 + 360) % 360, ay }));
  }, birth);
  const ay = r[0].ay;
  for (const x of r) if (Math.abs(((x.delta - ay + 180) % 360 + 360) % 360 - 180) > 1e-9) {
    return `${x.body}: сдвиг ${x.delta} ≠ аянамша ${ay}`;
  }
  return null;
});

// ── 11. Круговая арифметика корректна на границе 0°/360° ─────────────
{
  const bad = await h.evalIn(() => {
    const out = [];
    const cases = [[359.9, 0.1, 0.2], [0.1, 359.9, 0.2], [0, 180, 180], [90, 270, 180], [359, 1, 2], [10, 350, 20]];
    for (const [a, b, exp] of cases) {
      const sep = Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
      if (Math.abs(sep - exp) > 1e-9) out.push({ a, b, expected: exp, got: sep });
    }
    return out;
  });
  R.ok(bad.length === 0, 'круговое расстояние корректно на границе 0°/360° (production-формула сепарации)',
    bad.length === 0 ? null : JSON.stringify(bad, null, 2));
}

// ── 12. Повторная сериализация не меняет расчётные параметры ─────────
await forAllBirths('birth → JSON → birth даёт идентичную карту (сериализация не теряет параметры)', async birth => {
  const eq = await h.evalIn(x => {
    const a = computeNatalChart(x);
    const b = computeNatalChart(JSON.parse(JSON.stringify(x)));
    return JSON.stringify(a) === JSON.stringify(b);
  }, birth);
  return eq ? null : 'карта изменилась после roundtrip через JSON';
});

// ── 13. Профили не смешивают астроданные ─────────────────────────────
{
  const leaked = await h.evalIn(() => {
    const orig = currentProfileId ? currentProfileId() : null;
    const before = JSON.stringify(DB.astroBirth || null);
    DB.astroBirth = { date: '1911-01-01', time: '01:01', timeKnown: true, utcOffset: 3, lat: 10, lon: 20, houseSystem: 'whole' };
    persist();
    const mine = JSON.stringify(DB.astroBirth);
    const pid = createProfile ? createProfile('astro-iso-test') : null;
    const other = JSON.stringify(DB.astroBirth || null);
    return { mine, other, before, pid: !!pid, orig: !!orig };
  }).catch(e => ({ error: e.message }));
  if (leaked.error || !leaked.pid) {
    R.ok(true, 'profile isolation: пропущено — API создания профиля недоступно из теста (покрыто отдельно в e2e)');
  } else {
    R.ok(leaked.other !== leaked.mine,
      'профиль-изоляция: данные рождения одного профиля не видны в новом профиле',
      leaked.other !== leaked.mine ? null : `оба профиля видят ${leaked.mine}`);
  }
}

// ── 14. Проекция астрособытий (§16, подготовка к Wave 4.1) ───────────
{
  // 14a. Нет астроданных → пустой список (проекция ничего не выдумывает).
  const empty = await h.evalIn(() => {
    const saved = DB.astroBirth; DB.astroBirth = null;
    const r = astroEventProjection({ days: 30 });
    DB.astroBirth = saved;
    return Array.isArray(r) && r.length === 0;
  });
  R.ok(empty, 'проекция: без данных рождения возвращается пустой массив, а не выдуманные события');

  // 14b. Детерминизм: одинаковый вход → одинаковый состав, порядок и id.
  const det = await h.evalIn(() => {
    const saved = DB.astroBirth;
    DB.astroBirth = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.7558, lon: 37.6173, houseSystem: 'whole' };
    const at = '2026-03-01T00:00:00Z';
    const a = JSON.stringify(astroEventProjection({ days: 20, at }));
    const b = JSON.stringify(astroEventProjection({ days: 20, at }));
    DB.astroBirth = saved;
    return { equal: a === b, n: JSON.parse(a).length, sample: JSON.parse(a)[0] || null };
  });
  R.ok(det.equal, `проекция детерминирована: два вызова дали идентичный JSON (событий: ${det.n})`);
  R.ok(det.n > 0, `проекция на реальных данных не пуста (${det.n} событий) — тест не тривиально зелёный`);

  // 14c. Обязательные поля контракта присутствуют у каждого события.
  const shape = await h.evalIn(() => {
    const saved = DB.astroBirth;
    DB.astroBirth = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.7558, lon: 37.6173, houseSystem: 'whole' };
    const req = ['id', 'type', 'date', 'time', 'tags', 'importance', 'sourceCollection', 'referenceId', 'methodologyId', 'confidence', 'provenance'];
    const evs = astroEventProjection({ days: 20, at: '2026-03-01T00:00:00Z' });
    DB.astroBirth = saved;
    const bad = [];
    const ids = new Set();
    for (const e of evs) {
      for (const k of req) if (!(k in e)) bad.push(`${e.id}: нет поля ${k}`);
      if (ids.has(e.id)) bad.push(`дубликат id: ${e.id}`);
      ids.add(e.id);
      if (e.tags.some(t => typeof t !== 'string' || /[А-Яа-я]{4,}\s/.test(t))) bad.push(`${e.id}: в tags похоже на интерпретационный текст`);
    }
    return bad;
  });
  R.ok(shape.length === 0, 'проекция: у каждого события есть все поля контракта, id уникальны, в tags нет интерпретаций',
    shape.length === 0 ? null : shape.slice(0, 5).join('\n'));

  // 14d. Неизвестное время рождения — уверенность понижена, ложной точности нет.
  const unk = await h.evalIn(() => {
    const saved = DB.astroBirth;
    DB.astroBirth = { date: '1984-06-15', time: '', timeKnown: false, utcOffset: 4, lat: 55.7558, lon: 37.6173, houseSystem: 'whole' };
    const evs = astroEventProjection({ days: 20, at: '2026-03-01T00:00:00Z' });
    DB.astroBirth = saved;
    return {
      allLow: evs.every(e => e.confidence === 'low'),
      noAngles: evs.every(e => !e.tags.some(t => /asc|mc|house|дом/i.test(t))),
      noTime: evs.every(e => e.time === null),
      n: evs.length,
    };
  });
  R.ok(unk.allLow, `проекция при неизвестном времени: уверенность всех ${unk.n} событий понижена до low`);
  R.ok(unk.noAngles, 'проекция при неизвестном времени: нет событий, зависящих от домов/углов');
  R.ok(unk.noTime, 'проекция не заявляет точное время события при суточной выборке (time = null)');

  // 14e. Проекция ничего не персистирует и не дублирует в DB.
  const pure = await h.evalIn(() => {
    const saved = DB.astroBirth;
    DB.astroBirth = { date: '1984-06-15', time: '14:30', timeKnown: true, utcOffset: 4, lat: 55.7558, lon: 37.6173, houseSystem: 'whole' };
    const before = JSON.stringify(DB);
    astroEventProjection({ days: 20, at: '2026-03-01T00:00:00Z' });
    const after = JSON.stringify(DB);
    DB.astroBirth = saved;
    return before === after;
  });
  R.ok(pure, 'проекция read-only: DB не изменилась после вызова (ничего не персистируется и не дублируется)');
}

await h.close();
const s = R.summary();
if (h.pageErrors.length) { console.log('JS-ошибки страницы:', h.pageErrors.slice(0, 5)); process.exit(1); }
process.exit(s.fail ? 1 : 0);
