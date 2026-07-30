import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Wave 1 (issue #148) — доказательная цепочка Момент→«Зачем?»→Инсайт→Паттерн→
// Действие→Выполнение. Гоняет собранное приложение (dist/app.html) в реальном
// браузере, тем же стилем, что и остальные tests/*.spec.mjs.

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(DIR, '..', 'dist', 'app.html');
let pass = 0;
let fail = 0;
const errors = [];
const ok = (condition, message) => {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.log('  ✗ ' + message); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

async function boot(width = 390, height = 844) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', error => errors.push(error.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  await p.waitForTimeout(650); // clear the 500ms onboarding timer
  await p.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(element => element.classList.remove('on'));
    document.body.style.overflow = '';
  });
  return p;
}

const page = await boot();

// ── 1) Migration: свежий профиль уже несёт новые коллекции ──────────
const fresh = await page.evaluate(() => ({
  hasPsyLinks: Array.isArray(DB.psyLinks) && DB.psyLinks.length === 0,
  hasRelCtx: Array.isArray(DB.relationshipContexts) && DB.relationshipContexts.length === 0,
  psyAiConsentDefault: DB.psyAiConsent === null,
}));
ok(fresh.hasPsyLinks && fresh.hasRelCtx && fresh.psyAiConsentDefault, 'свежий профиль: psyLinks=[]/relationshipContexts=[]/psyAiConsent=null по умолчанию');

// ── 2) Migration от pre-Wave-1 профиля: старые записи не теряются, новые
//    коллекции инициализируются, повторная миграция ничего не меняет.
const migration = await page.evaluate(() => {
  const id = activeId();
  const oldDb = {
    insights: [{ id: 1, tag: 'personal', title: 'старый инсайт', body: 'текст', createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 2 }],
    whys: [{ id: 2, symptom: 'старый симптом', action: 'старое действие', createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 2 }],
    moments: [{ id: 3, valence: 50, activation: 50, createdAt: '2026-01-01T00:00:00.000Z', day: '2026-01-01', sv: 2 }],
    __ts: 111,
    // намеренно НЕТ psyLinks/relationshipContexts/psyAiConsent — pre-Wave-1 форма
  };
  localStorage.setItem('arch5_db_' + id, JSON.stringify(oldDb));
  hydrate();
  const afterFirst = {
    insightIntact: DB.insights.length === 1 && DB.insights[0].title === 'старый инсайт',
    whyIntact: DB.whys.length === 1 && DB.whys[0].symptom === 'старый симптом',
    momentIntact: DB.moments.length === 1 && DB.moments[0].id === 3,
    psyLinksInit: Array.isArray(DB.psyLinks) && DB.psyLinks.length === 0,
    relCtxInit: Array.isArray(DB.relationshipContexts) && DB.relationshipContexts.length === 0,
  };
  const snap1 = JSON.stringify(DB);
  migrateRecords(); migrateRecords();   // повторный вызов — идемпотентность
  const snap2 = JSON.stringify(DB);
  return { afterFirst, idempotent: snap1 === snap2 };
});
ok(migration.afterFirst.insightIntact && migration.afterFirst.whyIntact && migration.afterFirst.momentIntact,
  'миграция pre-Wave-1: старые записи (инсайт/why/момент) не потеряны и не переписаны');
ok(migration.afterFirst.psyLinksInit && migration.afterFirst.relCtxInit,
  'миграция pre-Wave-1: psyLinks/relationshipContexts инициализированы пустыми, без ошибок');
ok(migration.idempotent, 'повторный migrateRecords() не меняет DB (идемпотентность)');

// Восстановим чистое состояние для остальных тестов.
await page.evaluate(() => { localStorage.removeItem('arch5_db_' + activeId()); hydrate(); });

// ── 3) Валидация связей: invalid relation / orphan / self-link / missing id ──
const validation = await page.evaluate(() => {
  DB.moments = [{ id: 9001, valence: 50, activation: 50, createdAt: nowISO(), day: todayKey() }];
  DB.whys = [{ id: 9002, symptom: 'x', createdAt: nowISO(), day: todayKey() }];
  DB.insights = [{ id: 9003, title: 't', body: 'b', createdAt: nowISO(), day: todayKey() }];
  DB.patterns = [{ id: 9004, type: 'Поведенческий', text: 'p', cnt: 1 }];
  DB.psyLinks = []; DB.relationshipContexts = [];
  return {
    invalidRelation: validatePsyLink({ fromColl: 'moments', fromId: 9001, toColl: 'whys', toId: 9002, relation: 'bogus' }),
    wrongPair: validatePsyLink({ fromColl: 'whys', fromId: 9002, toColl: 'moments', toId: 9001, relation: 'moment_to_why' }),
    missingId: validatePsyLink({ fromColl: 'moments', fromId: null, toColl: 'whys', toId: 9002, relation: 'moment_to_why' }),
    // Ни одна из фиксированных пар коллекций (moment_to_why/why_to_insight/
    // insight_to_pattern) структурно не допускает fromColl===toColl, поэтому
    // self-link для них ловится ещё раньше как invalid_collection_pair —
    // это даже строже, чем отдельная self-link проверка. Сама self-link-защита
    // в validatePsyLink() остаётся defense-in-depth на случай будущих
    // однотипных отношений и проверяется здесь на паре, где имена коллекций
    // совпадают само по себе (record_to_relationship c fromColl не из списка
    // допустимых — ловится как invalid_from_collection, что тоже безопасно).
    selfLinkPairRejected: validatePsyLink({ fromColl: 'whys', fromId: 9002, toColl: 'whys', toId: 9002, relation: 'why_to_insight' }),
    orphanFrom: validatePsyLink({ fromColl: 'moments', fromId: 99999, toColl: 'whys', toId: 9002, relation: 'moment_to_why' }),
    orphanTo: validatePsyLink({ fromColl: 'moments', fromId: 9001, toColl: 'whys', toId: 99999, relation: 'moment_to_why' }),
    valid: validatePsyLink({ fromColl: 'moments', fromId: 9001, toColl: 'whys', toId: 9002, relation: 'moment_to_why' }),
  };
});
ok(validation.invalidRelation === 'invalid_relation', 'валидация: неизвестное отношение отклонено');
ok(validation.wrongPair === 'invalid_collection_pair', 'валидация: неверная пара коллекций для отношения отклонена');
ok(validation.missingId === 'missing_id', 'валидация: отсутствующий id отклонён');
ok(validation.selfLinkPairRejected === 'invalid_collection_pair', 'валидация: попытка одинаковых коллекций (self-link) отклонена (fail-safe раньше, чем до self-link-проверки)');
ok(validation.orphanFrom === 'orphan_from', 'валидация: несуществующая исходная запись (orphan) отклонена');
ok(validation.orphanTo === 'orphan_to', 'валидация: несуществующая целевая запись (orphan) отклонена');
ok(validation.valid === null, 'валидация: корректная связь проходит без ошибки');

// ── 4) create/read/unlink + защита от дублей ─────────────────────────
const crud = await page.evaluate(() => {
  const r1 = createPsyLink({ fromColl: 'moments', fromId: 9001, toColl: 'whys', toId: 9002, relation: 'moment_to_why', source: 'user' });
  const r2 = createPsyLink({ fromColl: 'moments', fromId: 9001, toColl: 'whys', toId: 9002, relation: 'moment_to_why', source: 'user' }); // дубль
  const readFrom = psyLinksFrom('moments', 9001, 'moment_to_why');
  const readTo = psyLinksTo('whys', 9002, 'moment_to_why');
  const linkId = r1.link.id;
  return { created: !!r1.ok, dupRejected: r2.error === 'duplicate', readFromLen: readFrom.length, readToLen: readTo.length, linkId };
});
ok(crud.created, 'создание связи moment_to_why успешно');
ok(crud.dupRejected, 'повторное создание идентичной связи отклонено как duplicate');
ok(crud.readFromLen === 1 && crud.readToLen === 1, 'psyLinksFrom/psyLinksTo находят созданную связь с обеих сторон');

const unlinked = await page.evaluate((linkId) => {
  unlinkPsyLink(linkId, () => {});
  const stillMoment = DB.moments.some(m => m && m.id === 9001);
  const stillWhy = DB.whys.some(w => w && w.id === 9002);
  const linkGone = !(DB.psyLinks || []).some(l => l && l.id === linkId);
  const tombstoned = DB._del && DB._del[linkId] != null;
  return { stillMoment, stillWhy, linkGone, tombstoned };
}, crud.linkId);
ok(unlinked.linkGone && unlinked.tombstoned, 'unlinkPsyLink снимает связь и оставляет надгробие для синка');
ok(unlinked.stillMoment && unlinked.stillWhy, 'отвязка НЕ удаляет исходные записи (Момент и «Зачем?» целы)');

// ── 5) Полный UI-путь: Момент → «Зачем?» → Инсайт → Паттерн ──────────
const workflow = await page.evaluate(() => {
  DB.moments = []; DB.whys = []; DB.insights = []; DB.patterns = []; DB.psyLinks = [];
  const m = { id: 8001, valence: 20, activation: 30, emo: 'тревога', note: 'заметка пользователя', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() };
  DB.moments.push(m);
  openMoment(8001);
  const momentOpen = document.getElementById('ov-moment-det').classList.contains('on');
  openWhyFromMoment(8001);
  const whyFormOpen = document.getElementById('ov-why').classList.contains('on');
  const prefill = (document.getElementById('why-symptom') || {}).value || '';
  document.getElementById('why-action').value = 'сделать паузу';
  saveWhy();
  const why = DB.whys[DB.whys.length - 1];
  const momentToWhy = psyLinksFrom('moments', 8001, 'moment_to_why');
  openWhy(why.id);
  const whyDetailOpen = document.getElementById('ov-why-det').classList.contains('on');
  startWhyToInsight(why.id);
  const addFormOpen = document.getElementById('ov-add').classList.contains('on');
  const insightPrefill = document.getElementById('add-tx').value;
  saveIns();
  const insight = DB.insights[0];
  const whyToInsight = psyLinksFrom('whys', why.id, 'why_to_insight');
  showDet(insight.id);
  const insightDetailOpen = document.getElementById('ov-det').classList.contains('on');
  startPatternFromInsight(insight.id);
  const patFormOpen = document.getElementById('ov-pat-add').classList.contains('on');
  document.getElementById('pat-tx').value = 'повторяющийся паттерн избегания';
  savePat();
  const pattern = DB.patterns[0];
  const insightToPattern = psyLinksFrom('insights', insight.id, 'insight_to_pattern');
  return {
    momentOpen, whyFormOpen, prefillHasNote: prefill.includes('заметка пользователя') && prefill.includes('тревога'),
    momentToWhyOk: momentToWhy.length === 1 && momentToWhy[0].toId === why.id,
    whyDetailOpen, addFormOpen, insightPrefillHasAction: insightPrefill.includes('сделать паузу'),
    whyToInsightOk: whyToInsight.length === 1 && whyToInsight[0].toId === insight.id,
    insightDetailOpen, patFormOpen,
    insightToPatternOk: insightToPattern.length === 1 && insightToPattern[0].toId === pattern.id,
  };
});
ok(workflow.momentOpen, 'шаг 1: деталь Момента открывается');
ok(workflow.whyFormOpen && workflow.prefillHasNote, '«Разобрать через «Зачем?»» открывает форму, переносит ТОЛЬКО заметку/эмоцию (не valence/activation)');
ok(workflow.momentToWhyOk, 'сохранение разбора создаёт moment_to_why');
ok(workflow.whyDetailOpen, 'шаг 2: деталь «Зачем?» открывается, показывает связанный момент');
ok(workflow.addFormOpen && workflow.insightPrefillHasAction, '«Создать связанный инсайт» открывает форму «Новый инсайт» с редактируемым превью');
ok(workflow.whyToInsightOk, 'сохранение инсайта создаёт why_to_insight');
ok(workflow.insightDetailOpen, 'шаг 3: деталь Инсайта открывается');
ok(workflow.patFormOpen, '«Создать новый паттерн» открывает существующую форму паттерна');
ok(workflow.insightToPatternOk, 'сохранение паттерна создаёт insight_to_pattern');

// Связать с СУЩЕСТВУЮЩИМ паттерном (не создавать новый).
const linkExisting = await page.evaluate(() => {
  const insight2 = { id: 8101, title: 'второй инсайт', body: 'b', createdAt: nowISO(), day: todayKey() };
  DB.insights.push(insight2);
  const pattern = DB.patterns[0];
  showDet(insight2.id);
  const sel = document.getElementById('det-pat-pick');
  if (sel) sel.value = String(pattern.id);
  linkInsightToExistingPattern(insight2.id);
  const link = psyLinksFrom('insights', insight2.id, 'insight_to_pattern');
  return { linked: link.length === 1 && link[0].toId === pattern.id };
});
ok(linkExisting.linked, 'Insight detail: связывание с СУЩЕСТВУЮЩИМ паттерном (без дублирующего создания) работает');

// ── 6) Незавершённые действия: пусто/частично/полно, done/undo, no mutation ──
const actions = await page.evaluate(() => {
  DB.whys = [];
  msub('graph'); setMapView('psy');
  const emptyHtml = document.getElementById('psy-actions').innerHTML;
  DB.whys = [
    { id: 7001, action: 'позвонить другу', createdAt: nowISO(), day: todayKey() },
    { id: 7002, action: 'написать письмо', actionDone: true, createdAt: nowISO(), day: todayKey() },
  ];
  const beforeSnapshot = JSON.stringify(DB.whys);
  rPsyActions();
  const afterRender = JSON.stringify(DB.whys);
  const partialHtml = document.getElementById('psy-actions').innerHTML;
  const showsOpen = partialHtml.includes('позвонить другу');
  const hidesDoneByDefault = !partialHtml.includes('написать письмо');
  togglePsyShowDone();
  const fullHtml = document.getElementById('psy-actions').innerHTML;
  const showsDoneAfterToggle = fullHtml.includes('написать письмо');
  // Отметка идёт через Evidence Kernel (addCorrection) — оригинал DB.whys НЕ
  // мутируется, эффект виден только через projAll (append-only коррекция).
  togglePsyActionDone(7001, true);
  const doneNow = projAll('whys').find(w => w.id === 7001).actionDone === true;
  const originalUntouched = DB.whys.find(w => w.id === 7001).actionDone === undefined;
  togglePsyActionDone(7001, false);
  const undone = projAll('whys').find(w => w.id === 7001).actionDone === false;
  return { emptyHtml: emptyHtml.trim().length === 0 ? false : emptyHtml.includes('Заполни поле'), noMutation: beforeSnapshot === afterRender, showsOpen, hidesDoneByDefault, showsDoneAfterToggle, doneNow, undone, originalUntouched };
});
ok(actions.emptyHtml, 'действия: пустое состояние объясняет, что делать дальше (не пустая декоративная карточка)');
ok(actions.noMutation, 'rPsyActions() не мутирует DB.whys (read-only агрегация)');
ok(actions.showsOpen && actions.hidesDoneByDefault, 'частично: незавершённые показаны, выполненные скрыты по умолчанию');
ok(actions.showsDoneAfterToggle, '«Показать выполненные» раскрывает завершённые действия (остаются в истории)');
ok(actions.doneNow, 'togglePsyActionDone(true) отмечает выполненным (видно через projAll)');
ok(actions.originalUntouched, 'togglePsyActionDone: оригинал DB.whys не мутирован — отметка через append-only коррекцию');
ok(actions.undone, 'togglePsyActionDone(false) отменяет отметку (undo)');

// ── 7) Повторяющиеся триггеры: minimum sample gate ───────────────────
const triggers = await page.evaluate(() => {
  DB.whys = [
    { id: 6001, symptom: 'бессонница', createdAt: nowISO(), day: '2026-01-01' },
    { id: 6002, symptom: 'Бессонница', createdAt: nowISO(), day: '2026-01-02' }, // регистр — та же группа
  ];
  rPsyTriggers();
  const belowThreshold = document.getElementById('psy-triggers').innerHTML;
  DB.whys.push({ id: 6003, symptom: ' бессонница ', createdAt: nowISO(), day: '2026-01-03' }); // пробелы — та же группа, 3-е вхождение
  rPsyTriggers();
  const atThreshold = document.getElementById('psy-triggers').innerHTML;
  return { belowThresholdEmpty: belowThreshold.trim() === '', atThresholdShows: atThreshold.includes('бессонница') && atThreshold.includes('3 раз'), revealsSourceLinks: /onclick="openWhy\(6001\)"/.test(atThreshold) };
});
ok(triggers.belowThresholdEmpty, 'триггеры: 2 наблюдения (< минимума) НЕ объявляются повторением');
ok(triggers.atThresholdShows, 'триггеры: 3 наблюдения (порог) — честно показано число повторений');
ok(triggers.revealsSourceLinks, 'триггеры: карточка раскрывает исходные записи (клик → openWhy)');

// ── 8) Контексты отношений: CRUD + archive + привязка к записи ────────
const relctx = await page.evaluate(() => {
  DB.relationshipContexts = [];
  openRelationshipContextAdd();
  const formOpen = document.getElementById('ov-relctx').classList.contains('on');
  document.getElementById('relctx-label').value = 'Мама';
  document.getElementById('relctx-role').value = 'родитель';
  saveRelationshipContext();
  const ctx = DB.relationshipContexts[0];
  const createdActive = ctx.status === 'active' && ctx.privacyClass === 'sensitive';
  toggleArchiveRelationshipContext(ctx.id);
  const archived = DB.relationshipContexts[0].status === 'archived';
  toggleArchiveRelationshipContext(ctx.id);
  const restored = DB.relationshipContexts[0].status === 'active';
  // Привязка к записи, отвязка без удаления записи.
  DB.moments = [{ id: 5001, valence: 50, activation: 50, createdAt: nowISO(), day: todayKey() }];
  assignRelationshipContext('moments', 5001, ctx.id);
  const linked = relationshipContextOf('moments', 5001);
  assignRelationshipContext('moments', 5001, null);
  const unlinked = relationshipContextOf('moments', 5001);
  const momentSurvived = DB.moments.some(m => m.id === 5001);
  return { formOpen, createdActive, archived, restored, linkedOk: linked && linked.id === ctx.id, unlinkedOk: unlinked === null, momentSurvived };
});
ok(relctx.formOpen, 'форма создания контекста отношений открывается');
ok(relctx.createdActive, 'новый контекст создаётся активным, privacyClass=sensitive');
ok(relctx.archived, 'архивирование переводит контекст в статус archived');
ok(relctx.restored, 'повторное нажатие восстанавливает контекст из архива');
ok(relctx.linkedOk, 'привязка контекста к записи (record_to_relationship) работает');
ok(relctx.unlinkedOk && relctx.momentSurvived, 'отвязка контекста НЕ удаляет саму запись');

// Переименование (через существующий prompt()-паттерн, как в correctMoment()).
page.once('dialog', dialog => dialog.accept('Мама (обновлено)'));
const renamed = await page.evaluate(() => {
  const ctx = DB.relationshipContexts[0];
  renameRelationshipContext(ctx.id);
  return DB.relationshipContexts[0].label;
});
ok(renamed === 'Мама (обновлено)', 'переименование контекста отношений работает');

// ── 9) Profile isolation ──────────────────────────────────────────────
const isolation = await page.evaluate(() => {
  DB.psyLinks = [{ id: 1, fromColl: 'moments', fromId: 1, toColl: 'whys', toId: 2, relation: 'moment_to_why', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: 1, source: 'user', acceptedAt: nowISO() }];
  DB.relationshipContexts = [{ id: 1, label: 'Профиль A контекст', status: 'active', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: 1, privacyClass: 'sensitive' }];
  persist();
  const profiles = loadProfiles();
  const newId = 'pTestWave1_' + Date.now();
  saveProfiles([...profiles, { id: newId, name: 'Профиль B', color: '#000' }]);
  setActiveId(newId);
  hydrate();
  const isolatedEmpty = (DB.psyLinks || []).length === 0 && (DB.relationshipContexts || []).length === 0;
  // Вернуться к исходному профилю.
  setActiveId(profiles[0].id);
  hydrate();
  const restoredIntact = (DB.psyLinks || []).length === 1 && (DB.relationshipContexts || []).length === 1;
  return { isolatedEmpty, restoredIntact };
});
ok(isolation.isolatedEmpty, 'profile isolation: другой профиль не видит psyLinks/relationshipContexts первого');
ok(isolation.restoredIntact, 'profile isolation: возврат к исходному профилю восстанавливает его связи/контексты целиком');

// ── 10) Sync merge/conflict/tombstone для новых коллекций ─────────────
const sync = await page.evaluate(() => {
  // ВАЖНО: timestamp'ы должны быть реалистичными (близкими к Date.now()) —
  // mergeDB() чистит tombstone-надгробия старше 120 дней (cutoff = Date.now()
  // - 120*864e5); маленькие фиктивные числа вроде 100/200/300 читаются как
  // эпоха 1970 года и немедленно удаляются как «устаревшее надгробие».
  const now = Date.now();
  const base = { ...DEFAULT_DB };
  const local = { ...base, psyLinks: [{ id: 1, fromColl: 'moments', fromId: 1, toColl: 'whys', toId: 2, relation: 'moment_to_why', createdAt: nowISO(), day: todayKey(), sv: 3, _u: now - 2000, source: 'user', acceptedAt: nowISO() }],
    relationshipContexts: [{ id: 10, label: 'локальная версия', status: 'active', sv: 3, _u: now - 2000, privacyClass: 'sensitive', createdAt: nowISO() }], _del: {}, __ts: now - 2000 };
  const remote = { ...base, psyLinks: [{ id: 2, fromColl: 'whys', fromId: 2, toColl: 'insights', toId: 3, relation: 'why_to_insight', createdAt: nowISO(), day: todayKey(), sv: 3, _u: now - 1000, source: 'user', acceptedAt: nowISO() }],
    relationshipContexts: [{ id: 10, label: 'удалённая версия (новее)', status: 'active', sv: 3, _u: now - 1000, privacyClass: 'sensitive', createdAt: nowISO() }], _del: {}, __ts: now - 1000 };
  const merged = mergeDB(local, remote);
  const unionOk = merged.psyLinks.length === 2 && merged.psyLinks.some(l => l.id === 1) && merged.psyLinks.some(l => l.id === 2);
  const newestWins = merged.relationshipContexts.find(c => c.id === 10).label === 'удалённая версия (новее)';
  // Tombstone: удалённая сторона удаляет связь → merge должен убрать её с обеих сторон.
  const remoteWithDel = { ...remote, _del: { 1: now } };
  const mergedWithTomb = mergeDB(local, remoteWithDel);
  const tombstoneWins = !mergedWithTomb.psyLinks.some(l => l.id === 1);
  return { unionOk, newestWins, tombstoneWins };
});
ok(sync.unionOk, 'sync merge: psyLinks объединяются union по id между устройствами');
ok(sync.newestWins, 'sync merge: relationshipContexts — новейшая версия по _u побеждает');
ok(sync.tombstoneWins, 'sync merge: надгробие (_del) удаляет psyLink на обеих сторонах после слияния');

// ── 10b) Cross-collection tombstone collision (owner review, PR #149) ──
// `DB._del` — ОДИН общий tombstone-объект, применяемый mergeDB()/mergeById()
// одинаково ко ВСЕМ коллекциям IDCOLS по сырому id. Если бы psyLinks/
// relationshipContexts генерировались голым Date.now() (как остальные
// legacy-коллекции), удаление/отвязка psyLink с id=X могло бы при синке
// удалить ЧУЖУЮ запись другой коллекции с тем же числовым id=X. Фикс —
// namespaced строковый id (psyUid()): структурно не может совпасть ни с одним
// числовым id ни в одной другой коллекции. Тесты ниже используют РЕАЛЬНЫЙ
// createPsyLink()/psyUid() и реальный mergeDB(), не переписывают tombstone-
// архитектуру остальных (legacy) коллекций.
const collision = await page.evaluate(() => {
  const now = Date.now();
  const sharedNumericId = 777777777777;   // «круглый» id, который БЫ мог совпасть при голом Date.now()
  DB.moments = [{ id: sharedNumericId, valence: 50, activation: 50, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: now - 5000 }];
  DB.whys = [{ id: sharedNumericId + 1, action: 'test', createdAt: nowISO(), day: todayKey() }];
  DB.psyLinks = [];
  const r = createPsyLink({ fromColl: 'moments', fromId: sharedNumericId, toColl: 'whys', toId: sharedNumericId + 1, relation: 'moment_to_why', source: 'user' });
  const realLinkId = r.link.id;
  const idsNeverCollide = typeof realLinkId === 'string' && realLinkId !== sharedNumericId && realLinkId !== String(sharedNumericId);
  const local = { ...DEFAULT_DB, moments: DB.moments, whys: DB.whys, psyLinks: [{ ...r.link }], _del: {}, __ts: now - 3000 };
  // Удалённая сторона тombstone'ит именно psyLink (по его реальному id) — НЕ Момент/«Зачем?».
  // Метка надгробия обязана быть НЕ РАНЬШЕ создания связи: mergeById удаляет
  // запись только при `dt >= record._u` (корректное LWW — надгробие старше
  // записи её не убивает). `now` захвачен ДО createPsyLink(), поэтому на
  // загруженном раннере link._u попадал в следующую миллисекунду, надгробие
  // становилось «старее» связи и тест падал через раз. Сценарий теста —
  // «связь удалили ПОСЛЕ того, как она появилась», поэтому берём момент
  // строго позже её _u.
  const tombAt = Math.max(now, r.link._u || 0) + 1;
  const remote = { ...DEFAULT_DB, moments: DB.moments, whys: DB.whys, psyLinks: [{ ...r.link }], _del: { [realLinkId]: tombAt }, __ts: now - 1000 };
  const merged = mergeDB(local, remote);
  const linkDeleted = !merged.psyLinks.some(l => l.id === realLinkId);
  const momentSurvived = merged.moments.some(m => m.id === sharedNumericId);
  const whySurvived = merged.whys.some(w => w.id === sharedNumericId + 1);
  return { idsNeverCollide, linkDeleted, momentSurvived, whySurvived };
});
ok(collision.idsNeverCollide, 'psyLink id (namespaced строка psyUid()) структурно не может совпасть с числовым id другой коллекции');
ok(collision.linkDeleted, 'tombstone удаляет ИМЕННО psyLink...');
ok(collision.momentSurvived && collision.whySurvived, '...и НЕ задевает Момент/«Зачем?» с «похожим» числовым id — общий _del между коллекциями больше не опасен');

const collisionCtx = await page.evaluate(() => {
  const now = Date.now();
  const sharedNumericId = 888888888888;
  DB.insights = [{ id: sharedNumericId, title: 't', body: 'b', createdAt: nowISO(), day: todayKey() }];
  DB.relationshipContexts = [{ id: psyUid('relctx'), label: 'X', status: 'active', privacyClass: 'sensitive', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: now - 4000 }];
  const ctxId = DB.relationshipContexts[0].id;
  const idsNeverCollide = typeof ctxId === 'string' && ctxId !== sharedNumericId && ctxId !== String(sharedNumericId);
  const local = { ...DEFAULT_DB, insights: DB.insights, relationshipContexts: [{ ...DB.relationshipContexts[0] }], _del: {}, __ts: now - 3000 };
  const remote = { ...DEFAULT_DB, insights: DB.insights, relationshipContexts: [{ ...DB.relationshipContexts[0] }], _del: { [ctxId]: now }, __ts: now - 1000 };
  const merged = mergeDB(local, remote);
  const ctxDeleted = !merged.relationshipContexts.some(c => c.id === ctxId);
  const insightSurvived = merged.insights.some(i => i.id === sharedNumericId);
  return { idsNeverCollide, ctxDeleted, insightSurvived };
});
ok(collisionCtx.idsNeverCollide, 'relationshipContext id (namespaced строка) структурно не может совпасть с числовым id другой коллекции');
ok(collisionCtx.ctxDeleted && collisionCtx.insightSurvived, 'tombstone удаляет ИМЕННО relationshipContext, не задевает Инсайт с «похожим» числовым id');

// «Два устройства создают запись в ОДНУ и ту же миллисекунду» — не должно
// давать одинаковый id (иначе одна запись молча перекрыла бы другую при merge).
const uniqueness = await page.evaluate(() => {
  const linkIds = new Set(), ctxIds = new Set();
  for (let i = 0; i < 300; i++) { linkIds.add(psyUid('psyLink')); ctxIds.add(psyUid('relctx')); }
  return { linksUnique: linkIds.size === 300, ctxUnique: ctxIds.size === 300 };
});
ok(uniqueness.linksUnique && uniqueness.ctxUnique, 'psyUid(): 300 id подряд (в т.ч. в одну и ту же миллисекунду, симулируя два устройства) — все уникальны');

// Регрессия конкретно на parseInt()-баг из ревью: пикер контекста через
// РЕАЛЬНЫЙ <select onchange="..."> (не прямой JS-вызов) не должен терять
// строковый id relationshipContext.
const pickerUi = await page.evaluate(() => {
  DB.moments = [{ id: 6101, valence: 50, activation: 50, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.relationshipContexts = [{ id: psyUid('relctx'), label: 'UI-тест', status: 'active', privacyClass: 'sensitive', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now() }];
  const ctxId = DB.relationshipContexts[0].id;
  const wrap = document.createElement('div');
  wrap.innerHTML = relContextPickerHTML('moments', 6101);
  document.body.appendChild(wrap);
  const sel = wrap.querySelector('select');
  sel.value = ctxId;
  sel.dispatchEvent(new Event('change'));
  const linked = relationshipContextOf('moments', 6101);
  wrap.remove();
  return { linkedOk: !!linked && linked.id === ctxId };
});
ok(pickerUi.linkedOk, 'пикер контекста через реальный <select onchange>: строковый id relationshipContext не теряется (parseInt-регрессия из ревью)');

// ── 11) Обычный (plain) export/import roundtrip ───────────────────────
const plainRoundtrip = await page.evaluate(() => {
  DB.psyLinks = [{ id: 1, fromColl: 'moments', fromId: 1, toColl: 'whys', toId: 2, relation: 'moment_to_why', createdAt: nowISO(), day: todayKey(), sv: 3, _u: 1, source: 'user', acceptedAt: nowISO() }];
  DB.relationshipContexts = [{ id: 1, label: 'Экспорт-тест', status: 'active', sv: 3, _u: 1, privacyClass: 'sensitive', createdAt: nowISO() }];
  const exported = JSON.parse(JSON.stringify({ exportedAt: new Date().toISOString(), db: DB, cfg: CFG }));
  // Симулируем handleImport() без реального File API.
  DB = { ...DEFAULT_DB, ...exported.db };
  return { psyLinksRestored: DB.psyLinks.length === 1 && DB.psyLinks[0].relation === 'moment_to_why', relCtxRestored: DB.relationshipContexts.length === 1 && DB.relationshipContexts[0].label === 'Экспорт-тест' };
});
ok(plainRoundtrip.psyLinksRestored, 'обычный export/import (JSON): psyLinks восстанавливаются полностью');
ok(plainRoundtrip.relCtxRestored, 'обычный export/import (JSON): relationshipContexts восстанавливаются полностью');

// ── 12) AI: consent off/on/revoked, structured suggestion requires acceptance ──
// Другие фичи приложения (напр. reactToInsight() внутри saveIns()) тоже
// зовут callClaude на тот же endpoint — перехватчик должен отвечать
// осмысленно ТОЛЬКО на запрос AI-подсказки «Зачем?»→Инсайт (по наличию
// whyId в теле user-сообщения), а на всё остальное — безопасным нейтральным
// текстом, не роняя тест.
await page.route('https://api.anthropic.com/v1/messages', async route => {
  const req = route.request().postDataJSON();
  let body = null;
  try { body = JSON.parse(req.messages[0].content); } catch (e) {}
  if (body && body.whyId != null) {
    const reply = { hypothesis: 'Гипотеза на основе разбора от ' + body.day, sources: ['why:' + body.whyId + '@' + body.day], limitations: 'Основано только на введённом тексте, не диагноз.' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 42, output_tokens: 17 } }) });
  } else {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }) });
  }
});
const aiConsentOff = await page.evaluate(() => {
  DB.psyAiConsent = null;
  DB.whys = [{ id: 4001, symptom: 'обычный текст без кризисных слов', createdAt: nowISO(), day: todayKey() }];
  setAiKeyFor('anthropic', 'fake-test-key');
  aiSuggestInsightFromWhy(4001);
  return { consentOpened: document.getElementById('ov-psy-ai-consent').classList.contains('on') };
});
ok(aiConsentOff.consentOpened, 'AI-подсказка: без согласия открывает экран согласия, вызов НЕ выполняется');

const aiConsentOn = await page.evaluate(async () => {
  document.getElementById('psy-aic-on').classList.add('on');
  savePsyAiConsent();
  const consentSaved = DB.psyAiConsent && DB.psyAiConsent.on === true;
  await aiSuggestInsightFromWhy(4001);
  const out = document.getElementById('why-ai-out').innerHTML;
  const showsLabels = out.includes('AI-гипотеза') && out.includes('Источники') && out.includes('Ограничения');
  const notYetSaved = !(DB.psyLinks || []).some(l => l.relation === 'why_to_insight' && l.fromId === 4001);
  return { consentSaved, showsLabels, notYetSaved };
});
ok(aiConsentOn.consentSaved, 'согласие можно включить (savePsyAiConsent)');
ok(aiConsentOn.showsLabels, 'AI-подсказка показывает «AI-гипотеза»/«Источники»/«Ограничения» — не сохранена автоматически');
ok(aiConsentOn.notYetSaved, 'AI-предложение НЕ создаёт связь/инсайт до явного принятия пользователем');

const aiAccept = await page.evaluate(() => {
  acceptPsyAiSuggestion();
  const addOpen = document.getElementById('ov-add').classList.contains('on');
  const prefillHasHypothesis = document.getElementById('add-tx').value.includes('Гипотеза на основе разбора');
  saveIns();
  const linked = psyLinksFrom('whys', 4001, 'why_to_insight');
  return { addOpen, prefillHasHypothesis, linkedAfterExplicitSave: linked.length === 1 };
});
ok(aiAccept.addOpen && aiAccept.prefillHasHypothesis, '«Использовать как черновик» вставляет текст в РЕДАКТИРУЕМУЮ форму «Новый инсайт»');
ok(aiAccept.linkedAfterExplicitSave, 'связь создаётся только ПОСЛЕ явного сохранения через существующую форму (saveIns)');

const aiRevoked = await page.evaluate(() => {
  document.getElementById('psy-aic-on').classList.remove('on');
  savePsyAiConsent();
  DB.whys.push({ id: 4002, symptom: 'ещё текст', createdAt: nowISO(), day: todayKey() });
  aiSuggestInsightFromWhy(4002);
  return { consentOpenedAgain: document.getElementById('ov-psy-ai-consent').classList.contains('on'), revoked: DB.psyAiConsent.on === false };
});
ok(aiRevoked.revoked && aiRevoked.consentOpenedAgain, 'отзыв согласия немедленно возвращает к экрану согласия при следующей попытке');

// ── 13) Кризисный гейт: явный кризисный текст останавливает обычный AI-анализ ──
const crisis = await page.evaluate(() => {
  document.getElementById('psy-aic-on').classList.add('on');
  savePsyAiConsent();
  DB.whys.push({ id: 4003, symptom: 'не хочу жить, думаю о том чтобы покончить с собой', createdAt: nowISO(), day: todayKey() });
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  aiSuggestInsightFromWhy(4003);
  return { safetyPanelOpen: document.getElementById('ov-crisis-safety').classList.contains('on'), aiOverlayNotOpen: !document.getElementById('ov-add').classList.contains('on') };
});
ok(crisis.safetyPanelOpen, 'кризисный текст открывает безопасную панель вместо обычного AI-анализа');
ok(crisis.aiOverlayNotOpen, 'при срабатывании кризисного гейта форма инсайта/связь НЕ создаются');
await page.evaluate(() => closeOv('ov-crisis-safety'));

// ── 14) Ledger: только токены/модель/задача, без приватного текста ────
const ledger = await page.evaluate(() => {
  const l = aiLedger();
  const last = l[l.length - 1];
  const keysOk = last && Object.keys(last).sort().join(',') === ['model', 'task', 'ti', 'to', 'ts'].sort().join(',');
  const noPrivateText = !JSON.stringify(l).includes('обычный текст без кризисных слов') && !JSON.stringify(l).includes('fake-test-key');
  return { keysOk, noPrivateText, hasEntries: l.length > 0 };
});
ok(ledger.hasEntries && ledger.keysOk, 'ledger хранит только {ts,task,model,ti,to} — без содержимого записей');
ok(ledger.noPrivateText, 'ledger не содержит текста разбора «Зачем?» и не содержит API-ключ');
await page.close();

// ── 15) Мобильные вьюпорты + a11y + клавиатура + тема + offline reload ──
async function bootAt(width, height) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(FILE);
  await p.waitForSelector('#nsh-tabbar', { state: 'attached' });
  await p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')); });
  await p.waitForTimeout(650);
  await p.evaluate(() => document.querySelectorAll('.ov.on').forEach(e => e.classList.remove('on')));
  return p;
}
for (const [w, h, name] of [[375, 667, 'iPhone SE'], [390, 844, 'iPhone standard'], [430, 932, 'iPhone Pro Max'], [820, 1180, 'iPad portrait']]) {
  const dp = await bootAt(w, h);
  const geo = await dp.evaluate((viewportWidth) => {
    DB.moments = [{ id: 3001, valence: 40, activation: 60, emo: 'усталость', note: 'долгий день', createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
    DB.whys = [{ id: 3002, action: 'лечь пораньше', createdAt: nowISO(), day: todayKey() }];
    goTo('map'); msub('graph'); setMapView('psy');
    const btn = document.getElementById('psy-actions').querySelector('button');
    const r = btn.getBoundingClientRect();
    const inViewport = r.right <= viewportWidth + 1 && r.left >= -1;
    return { tapOk: r.width >= 44 && r.height >= 44, inViewport, isButton: btn.tagName === 'BUTTON' && btn.getAttribute('type') === 'button' };
  }, w);
  ok(geo.tapOk && geo.inViewport && geo.isButton, `${name}: действие в психологии — настоящий button, tap ≥44×44, не выходит за экран`);
  await dp.close();
}

// Light/dark + keyboard (focus-visible/Enter активация) + safe-area padding.
const themePage = await bootAt(390, 844);
const themeCheck = await themePage.evaluate(() => {
  DB.whys = [{ id: 3101, action: 'позвонить врачу', createdAt: nowISO(), day: todayKey() }];
  goTo('map'); msub('graph'); setMapView('psy');
  document.documentElement.setAttribute('data-theme', 'dark');
  const darkVisible = getComputedStyle(document.getElementById('psy-actions')).display !== 'none';
  document.documentElement.setAttribute('data-theme', 'light');
  const lightVisible = getComputedStyle(document.getElementById('psy-actions')).display !== 'none';
  return { darkVisible, lightVisible };
});
ok(themeCheck.darkVisible && themeCheck.lightVisible, 'психология: секция действий рендерится и в тёмной, и в светлой теме');
const actionBtn = themePage.locator('#psy-actions button').first();
await actionBtn.focus();
await themePage.keyboard.press('Enter');
const kbOpened = await themePage.evaluate(() => document.getElementById('ov-why-det').classList.contains('on'));
ok(kbOpened, 'клавиатура: Enter на строке действия открывает деталь «Зачем?»');
await themePage.close();

// Offline reload: связи/контексты, созданные online, переживают offline-reload.
const offlinePage = await bootAt(390, 844);
await offlinePage.evaluate(() => {
  DB.moments = [{ id: 3201, valence: 50, activation: 50, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }];
  DB.whys = [{ id: 3202, action: 'test', createdAt: nowISO(), day: todayKey() }];
  createPsyLink({ fromColl: 'moments', fromId: 3201, toColl: 'whys', toId: 3202, relation: 'moment_to_why', source: 'user' });
  DB.relationshipContexts = [{ id: 3203, label: 'Offline-тест', status: 'active', privacyClass: 'sensitive', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now() }];
  persist();
});
await offlinePage.context().setOffline(true);
await offlinePage.reload();
await offlinePage.waitForSelector('#nsh-tabbar', { state: 'attached' });
await offlinePage.evaluate(() => { const s = document.getElementById('splash'); if (s) s.style.display = 'none'; });
await offlinePage.waitForTimeout(650);
const offlineResult = await offlinePage.evaluate(() => ({
  linkSurvived: psyLinksFrom('moments', 3201, 'moment_to_why').length === 1,
  ctxSurvived: (DB.relationshipContexts || []).some(c => c.id === 3203),
}));
ok(offlineResult.linkSurvived && offlineResult.ctxSurvived, 'offline reload: psyLinks/relationshipContexts переживают перезагрузку без сети');
await offlinePage.context().setOffline(false);
await offlinePage.close();

// Большой synthetic dataset: детерминированные агрегаторы не падают и не виснут.
const bigPage = await bootAt(390, 844);
const bigResult = await bigPage.evaluate(() => {
  const N = 500;
  DB.whys = Array.from({ length: N }, (_, i) => ({ id: 20000 + i, symptom: 'триггер ' + (i % 20), action: i % 3 === 0 ? ('действие ' + i) : '', actionDone: i % 7 === 0, createdAt: nowISO(), day: todayKey() }));
  DB.moments = Array.from({ length: N }, (_, i) => ({ id: 30000 + i, valence: i % 100, activation: (i * 3) % 100, createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() }));
  DB.psyLinks = [];
  goTo('map');
  const t0 = Date.now();
  msub('graph'); setMapView('psy');
  const elapsedMs = Date.now() - t0;
  const rendered = document.getElementById('psy-actions').innerHTML.length > 0 && document.getElementById('psy-triggers').innerHTML.length > 0;
  return { elapsedMs, rendered };
});
ok(bigResult.rendered && bigResult.elapsedMs < 5000, `большой synthetic dataset (500 whys + 500 momentов): рендер без сбоев за ${bigResult.elapsedMs}мс`);
await bigPage.close();

ok(errors.length === 0, `JS-ошибок нет за весь прогон (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);
await browser.close();
console.log(`\nWave 1 (psych linked workflow): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
