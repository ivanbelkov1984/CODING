// ПОЛИТИКА ПОВТОРА МУТАЦИОННОГО ПРОГОНА — одна на все мутационные харнессы.
//
// Зачем отдельный модуль: критерий убийства мутанта — самая тонкая часть
// харнесса, и продублированный в двух файлах он неизбежно разъезжается.
// Здесь он один, и он доказан self-тестом (`selfTestRetryPolicy`), который
// гоняется в КАЖДОМ прогоне харнесса.
//
// Правило (ревью владельца): повтор — это уступка нестабильности раннера, и
// она НЕ имеет права превращать выжившего мутанта в убитого.
//
//   красные строки есть            → результат доказателен, повтор ЗАПРЕЩЁН;
//   code === 0 и красных нет       → мутант ВЫЖИЛ (сюита прошла целиком) —
//                                    это настоящий результат, повтор ЗАПРЕЩЁН:
//                                    флейковый второй прогон иначе «убил» бы
//                                    его ложно и спрятал снятую защиту;
//   code !== 0 и красных нет       → сюита умерла ДО проверок (нехватка
//                                    ресурсов, падение браузера) — вывода нет
//                                    вовсе, судить не о чем: ровно один повтор.
//
// Повтор ограничен одним: второй срыв принимается как есть, бесконечного
// «добьём мутанта» не существует.

export const redLines = (out) => String(out == null ? '' : out)
  .split('\n')
  .filter(l => l.trimStart().startsWith('✗'))
  .map(l => l.trim());

// Решение по ПЕРВОМУ прогону. Три исхода — ровно три ветки правила выше.
export function retryDecision(first) {
  if (redLines(first && first.out).length) return 'accept-assertions';
  if (first && first.code === 0) return 'accept-survivor';
  return 'retry';
}

// Оборачивает одиночный прогон политикой. `runOnce` — любая функция
// (bundle) → Promise<{code, out}>; в тестах это подставной прогон.
export function makeRun(runOnce) {
  return async (bundle) => {
    const first = await runOnce(bundle);
    if (retryDecision(first) !== 'retry') return first;
    return await runOnce(bundle);   // ровно один повтор, результат принимается
  };
}

// Доказательство трёх веток на подставном прогоне: настоящий браузер не нужен,
// проверка стоит доли миллисекунды и поэтому идёт в каждом прогоне харнесса.
// `ok(cond, msg, detail)` — функция утверждения вызывающего харнесса.
export async function selfTestRetryPolicy(ok) {
  const SURVIVOR = { code: 0, out: '  ✓ всё прошло\nСЮИТА: 52 passed, 0 failed' };
  const ASSERTED = { code: 1, out: '  ✗ ожидаемый сценарий покраснел\nСЮИТА: 51 passed, 1 failed' };
  const CRASHED = { code: 1, out: 'node: fatal — сюита умерла до проверок\n' };
  const KILLED = { code: 1, out: '  ✗ ожидаемый сценарий покраснел' };

  const stub = (...results) => {
    const st = { n: 0 };
    st.fn = async () => results[Math.min(st.n++, results.length - 1)];
    return st;
  };

  // 1. НАСТОЯЩИЙ ВЫЖИВШИЙ МУТАНТ. Второй прогон подставлен «убивающим»:
  //    если политика его запросит, мутант ложно зачтётся как убитый.
  {
    const s = stub(SURVIVOR, KILLED);
    const res = await makeRun(s.fn)('bundle');
    ok(retryDecision(SURVIVOR) === 'accept-survivor' && s.n === 1 && res.code === 0 && !redLines(res.out).length,
      '[self-test] выживший мутант (code 0, красных 0) принимается БЕЗ повтора',
      `прогонов: ${s.n} (ожидалось 1), code: ${res.code}, красных: ${redLines(res.out).length}`);
  }
  // 2. Есть assertion-вывод — судить есть по чему, повтор не нужен.
  {
    const s = stub(ASSERTED, SURVIVOR);
    const res = await makeRun(s.fn)('bundle');
    ok(retryDecision(ASSERTED) === 'accept-assertions' && s.n === 1 && redLines(res.out).length === 1,
      '[self-test] упавший сценарий (красные есть) принимается БЕЗ повтора',
      `прогонов: ${s.n} (ожидалось 1), красных: ${redLines(res.out).length}`);
  }
  // 3. Срыв прогона без единой ✗ — ровно один повтор.
  {
    const s = stub(CRASHED, KILLED);
    const res = await makeRun(s.fn)('bundle');
    ok(retryDecision(CRASHED) === 'retry' && s.n === 2 && redLines(res.out).length === 1,
      '[self-test] срыв прогона (code≠0, красных 0) повторяется РОВНО один раз',
      `прогонов: ${s.n} (ожидалось 2), красных: ${redLines(res.out).length}`);
  }
  // 4. Повтор не бесконечен: второй срыв принимается как есть.
  {
    const s = stub(CRASHED, CRASHED, CRASHED);
    const res = await makeRun(s.fn)('bundle');
    ok(s.n === 2 && !redLines(res.out).length,
      '[self-test] повтор ровно один: второй срыв принимается как есть',
      `прогонов: ${s.n} (ожидалось 2)`);
  }
}
