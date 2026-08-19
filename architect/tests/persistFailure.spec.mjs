// P1-01 — ОТКАЗ ЗАПИСИ ОБЯЗАН БЫТЬ ВИДЕН.
//
// Найдено финальным аудитом и воспроизведено на production-коде: переполнение
// хранилища человеку показывалось, а любой другой отказ записи — нет.
// persistLocal возвращал false молча, и 83 из 103 вызовов persist() результат
// не проверяют. Владелец видел запись на экране, в хранилище её не было, после
// перезагрузки она исчезала. На iPhone/iPad это не гипотеза: заблокированное
// хранилище даёт SecurityError, а не QuotaExceededError.
//
// Здесь проверяется контракт границы записи, а не отдельные вызовы:
//   • обычное сохранение молчит;
//   • отказ по квоте идёт прежним путём и НЕ дублируется новым сообщением;
//   • любой другой отказ виден человеку;
//   • сам уведомитель ничего не пишет в хранилище (иначе рекурсия);
//   • серия ошибок даёт ОДНО сообщение, а успех снова взводит предупреждение;
//   • намеренные guard'ы (recovery-блокировка, защита от пустой записи) НЕ
//     выдаются за отказ устройства.
//
// Всё синтетическое (TEST-P1-*). Гоняет РЕАЛЬНЫЙ собранный бандл в Chromium.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const FILE = 'file://' + (process.env.PERSIST_BUNDLE || join(ROOT, 'dist', 'app.html'));

let pass = 0, fail = 0;
const errors = [];
const ok = (c, m, d) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m); if (d) console.log('      ' + String(d).split('\n').join('\n      ')); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
await page.goto(FILE);
await page.waitForSelector('#nsh-tabbar', { state: 'attached' });
await page.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });

// Единый стенд: подменяет setItem заданной ошибкой, считает записи в хранилище
// во время уведомления и возвращает то, что реально увидел пользователь.
const trial = (errName, times = 1) => page.evaluate(({ errName, times }) => {
  const orig = localStorage.setItem.bind(localStorage);
  const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
  let writesDuringFailure = 0;
  if (errName) {
    localStorage.setItem = (...a) => {
      writesDuringFailure++;
      const e = new Error(errName); e.name = errName; throw e;
    };
  }
  const results = [];
  for (let i = 0; i < times; i++) {
    DB.insights.push({ id: Date.now() + i, title: 'TEST-P1-' + i, createdAt: nowISO(), sv: SCHEMA_VERSION });
    results.push(persist());
  }
  localStorage.setItem = orig;
  const el = document.getElementById('toasts');
  return {
    results,
    toastCount: el ? el.children.length : 0,
    text: el ? (el.textContent || '').trim() : '',
    err: JSON.parse(JSON.stringify(lastPersistError() || null)),
    writesDuringFailure,
  };
}, { errName, times });

// Сброс между сценариями. Коллекция намеренно НЕ опустошается: persistLocal
// защищает хранилище от записи пустого состояния (защита данных), вернул бы
// false и эпизод бы не закрылся — стенд молча измерял бы не то.
const reset = () => page.evaluate(() => {
  DB.insights = [{ id: 1, title: 'TEST-P1-KEEP', createdAt: nowISO(), sv: SCHEMA_VERSION }];
  DB._del = {};
  const okWrite = persist();       // успех закрывает эпизод
  const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
  if (!okWrite) throw new Error('стенд: подготовительная запись не прошла');
});

console.log('\n── § 1. Обычное сохранение: тихо и успешно ──');
await reset();
const normal = await trial(null);
ok(normal.results[0] === true, 'persist() вернул true');
ok(normal.toastCount === 0, 'никакого предупреждения не показано', normal.text);
ok(normal.err === null, '_lastPersistError очищен', JSON.stringify(normal.err));
const stored = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem(dbKey(activeId())) || 'null');
  return ((raw || {}).insights || []).some(i => i && String(i.title || '').startsWith('TEST-P1-'));
});
ok(stored, 'запись реально попала в хранилище');

console.log('\n── § 2. Квота: прежний путь, без дублирования ──');
await reset();
const quota = await trial('QuotaExceededError');
ok(quota.results[0] === false, 'persist() вернул false');
ok(/переполнено/.test(quota.text), 'показано существующее сообщение о переполнении', quota.text);
ok(!/Не удалось сохранить изменения на устройстве/.test(quota.text),
  'новое generic-предупреждение НЕ дублирует сообщение о квоте', quota.text);
ok(quota.toastCount === 1, 'ровно одно сообщение, а не два', String(quota.toastCount));

console.log('\n── § 3. SecurityError: отказ виден ──');
await reset();
const sec = await trial('SecurityError');
ok(sec.results[0] === false, 'persist() вернул false');
ok(sec.err && sec.err.name === 'SecurityError' && sec.err.quota === false,
  '_lastPersistError сохранён для диагностики', JSON.stringify(sec.err));
ok(/Не удалось сохранить изменения на устройстве/.test(sec.text),
  'человек предупреждён явным текстом', sec.text);
ok(!/сохранено/i.test(sec.text), 'в сообщении нет слова «сохранено»', sec.text);
ok(sec.toastCount === 1, 'ровно одно сообщение', String(sec.toastCount));
ok(errors.length === 0, 'никакой рекурсии и необработанных ошибок', errors.slice(0, 3).join('\n'));
// Сам уведомитель не должен писать НИЧЕГО. Число попыток здесь детерминировано
// и равно ровно одной: транзакция _txWrite обрывает фазу записи на первом
// throw, а откатывать нечего — ни один ключ не записался. Любая ДОПОЛНИТЕЛЬНАЯ
// попытка означает, что писать начал обработчик отказа, а на закрытом
// хранилище это путь к рекурсии.
ok(sec.writesDuringFailure === 1,
  `уведомитель не порождает новых записей в хранилище (попыток ровно 1, получено ${sec.writesDuringFailure})`,
  String(sec.writesDuringFailure));

console.log('\n── § 4. InvalidStateError: тот же контракт ──');
await reset();
const inval = await trial('InvalidStateError');
ok(inval.results[0] === false, 'persist() вернул false');
ok(/Не удалось сохранить изменения на устройстве/.test(inval.text),
  'второе реальное DOMException-имя ведёт себя так же', inval.text);
ok(inval.err && inval.err.name === 'InvalidStateError', '_lastPersistError сохранён', JSON.stringify(inval.err));

console.log('\n── § 5. Обычная Error: видно, но без технических подробностей ──');
await reset();
const generic = await trial('Error');
ok(generic.results[0] === false, 'persist() вернул false');
ok(/Не удалось сохранить изменения на устройстве/.test(generic.text), 'отказ виден', generic.text);
ok(!/Error|Exception|stack|undefined|null/i.test(generic.text.replace(/Не удалось[^]*устройстве\./, '')),
  'технический текст ошибки пользователю не показан', generic.text);

console.log('\n── § 6. Защита от шквала: 10 отказов подряд → одно сообщение ──');
await reset();
const storm = await trial('SecurityError', 10);
ok(storm.results.length === 10 && storm.results.every(v => v === false),
  'все 10 попыток честно вернули false');
ok(storm.toastCount === 1, `показано ровно одно предупреждение на весь эпизод (было ${storm.toastCount})`,
  String(storm.toastCount));

console.log('\n── § 7. Восстановление снова взводит предупреждение ──');
await reset();
const rearm = await page.evaluate(() => {
  const orig = localStorage.setItem.bind(localStorage);
  const clear = () => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; };
  const boom = () => { localStorage.setItem = () => { const e = new Error('x'); e.name = 'SecurityError'; throw e; }; };
  const heal = () => { localStorage.setItem = orig; };
  const count = () => (document.getElementById('toasts') || {}).children.length;

  clear(); boom();
  DB.insights.push({ id: 1, title: 'TEST-P1-A', createdAt: nowISO(), sv: SCHEMA_VERSION }); persist();
  const first = count();
  DB.insights.push({ id: 2, title: 'TEST-P1-B', createdAt: nowISO(), sv: SCHEMA_VERSION }); persist();
  const second = count();

  heal(); clear();
  DB.insights.push({ id: 3, title: 'TEST-P1-C', createdAt: nowISO(), sv: SCHEMA_VERSION });
  const healed = persist();

  clear(); boom();
  DB.insights.push({ id: 4, title: 'TEST-P1-D', createdAt: nowISO(), sv: SCHEMA_VERSION }); persist();
  const afterRecovery = count();
  heal();
  return { first, second, healed, afterRecovery };
});
ok(rearm.first === 1, 'первая ошибка эпизода предупредила', String(rearm.first));
ok(rearm.second === 1, 'вторая ошибка того же эпизода промолчала', String(rearm.second));
ok(rearm.healed === true, 'успешная запись прошла (восстановление)');
ok(rearm.afterRecovery === 1, 'ошибка ПОСЛЕ восстановления предупредила снова', String(rearm.afterRecovery));

console.log('\n── § 8. Сценарий реальной потери: то, ради чего всё делалось ──');
const loss = await page.evaluate(() => {
  DB.insights = [{ id: 1, title: 'TEST-P1-KEEP', createdAt: nowISO(), sv: SCHEMA_VERSION }];
  persist();
  const key = dbKey(activeId());
  const orig = localStorage.setItem.bind(localStorage);
  const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
  localStorage.setItem = () => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; };
  DB.insights.push({ id: 999, title: 'TEST-P1-LOST', createdAt: nowISO(), sv: SCHEMA_VERSION });
  const ret = persist();
  const warned = ((document.getElementById('toasts') || {}).textContent || '').trim();
  localStorage.setItem = orig;
  const inUi = DB.insights.some(i => i && i.title === 'TEST-P1-LOST');
  const inStore = (((JSON.parse(localStorage.getItem(key) || 'null')) || {}).insights || [])
    .some(i => i && i.title === 'TEST-P1-LOST');
  hydrate();                                  // production-путь перезагрузки
  const afterReload = (DB.insights || []).some(i => i && i.title === 'TEST-P1-LOST');
  return { ret, warned, inUi, inStore, afterReload };
});
ok(loss.ret === false, 'persist() честно вернул false');
ok(loss.inUi === true, 'изменение присутствует в памяти и на экране');
ok(loss.inStore === false, 'в снимке хранилища его нет');
ok(loss.afterReload === false, 'после перезагрузки (hydrate) оно исчезает — это и есть потеря');
ok(/Не удалось сохранить изменения на устройстве/.test(loss.warned),
  'и именно поэтому человек предупреждён', loss.warned);

console.log('\n── § 9. Приватность и чистота ──');
const canary = await page.evaluate(() => {
  const txt = (DB.insights || []).map(i => i && i.title).filter(Boolean);
  return { txt, allSynthetic: txt.every(t => String(t).startsWith('TEST-P1-')) };
});
ok(canary.allSynthetic, 'все фикстуры синтетические (TEST-P1-*)', JSON.stringify(canary.txt));
ok(errors.length === 0, 'страница не выдала ни одной необработанной ошибки', errors.slice(0, 5).join('\n'));

await browser.close();
console.log(`\nP1-01 (видимый отказ записи): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
