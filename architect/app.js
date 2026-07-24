'use strict';

// ─── УТИЛИТЫ ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
// Безопасный вызов иконок — не падаем, если CDN lucide ещё не загрузился
const icons = (opt) => { try { if (typeof lucide !== 'undefined') lucide.createIcons(opt); } catch(e) {} };
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const hpt = () => navigator.vibrate?.([8]);
const hptMed = () => navigator.vibrate?.([15]);
const dateRU = (d=new Date()) => d.toLocaleDateString('ru',{day:'numeric',month:'short'});
const dateFullRU = (d=new Date()) => d.toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'});
const todayKey = () => new Date().toISOString().slice(0,10);
const nowISO = () => new Date().toISOString();            // UTC ISO 8601 — источник истины для времени
const SCHEMA_VERSION = 2;
// Красивая дата из ISO createdAt (с откатом на legacy-строку date/dt)
const dispDate = (rec, full=false) => {
  if (rec && rec.createdAt) return (full?dateFullRU:dateRU)(new Date(rec.createdAt));
  return (rec && (rec.date || rec.dt)) || '';
};
// «День» записи (локальная дата, устойчива к смене часовых поясов при отображении)
const isoDay = iso => (iso||'').slice(0,10);
const daysAgoISO = n => new Date(Date.now()-n*864e5).toISOString();

// ─── КОНФИГУРАЦИЯ ПО УМОЛЧАНИЮ ──────────────────────────────────
const DEFAULT_CFG = {
  userName: '',
  domainLabel: 'Книга',
  apiUrl: '',
  spaceKey: '',
  lastSync: '',
  aiModel: 'claude-opus-4-8',
  trustedContact: '',   // близкий человек — под рукой в кризисном протоколе
  newAxColor: '#1056CC',
  axes: {
    vitality:   {lbl:'Здоровье',   s:7,   c:'#1A7F3C'},
    money:      {lbl:'Деньги',     s:5.8, c:'#92400E'},
    work:       {lbl:'Работа',     s:7.5, c:'#1056CC'},
    creativity: {lbl:'Творчество', s:8.1, c:'#6B21A8'},
    circle:     {lbl:'Окружение',  s:6.3, c:'#0E7490'},
    psychology: {lbl:'Психология', s:6.8, c:'#B45309'},
    spiritual:  {lbl:'Духовное',   s:7.9, c:'#6B21A8'},
    domain:     {lbl:'Книга',      s:7.0, c:'#1056CC'},
  },
  weekFocuses: [
    {t:'Сделай первый check-in', c:'var(--blue-btn)'},
    {t:'Запиши первый инсайт',   c:'var(--green)'},
    {t:'Настрой оси под себя',   c:'var(--orange)'},
  ],
};

// ─── ДАННЫЕ ПО УМОЛЧАНИЮ ────────────────────────────────────────
const DEFAULT_DB = {
  insights: [],
  dreams: [],
  patterns: [],
  evolution: [],
  spiritual: [],
  checkins: [],
  moments: [],        // Momentary State: быстрый двухосевой ввод «здесь и сейчас» (valence×activation)
  whys: [],           // метод «Зачем?»: симптом→функция→выгода→потребность→цена→альтернатива→действие
  corrections: [],    // Evidence Kernel: append-only исправления записей (оригинал неизменен)
  meds: [],           // Health Organizer: ПЛАН приёма лекарств/витаминов (задан пользователем)
  medIntakes: [],     // Health Organizer: ФАКТ приёма (отдельный класс — план ≠ факт)
  symptoms: [],       // Health Organizer: симптомы как отдельные события (наблюдение, не диагноз)
  measures: [],       // Health Organizer: измерения (вес/давление/пульс… — ручной ввод)
  astroBirth: null,   // Астрология: OriginalBirthEvidence (immutable; правки — коррекциями)
  astroCharts: [],    // Астрология: SymbolicAstrologyAnnotation — рассчитанные карты (versioned)
  astroTexts: [],     // Астрология: кэш собранных текстов (ruleIds+promptVersion для аудита)
  astroAiConsent: null, // Астрология, режим 2: согласие по категориям {diary,health,habits,acceptedAt,version}; отзыв в любой момент
  astroPartners: [],  // Синастрия: сохранённые карты партнёров (label + birth + chart; sensitive, только локально)
  spheres: [],        // пользовательские сферы жизни (тип трекера у каждой)
  sphereLogs: [],     // дневные записи по сферам: {sphereId, date, value, note}
  bots: [
    {id:1, title:'Первая задача — добавь свою', prio:'high', done:false},
  ],
  chapters: [
    {n:1, title:'Глава 1', st:'todo', flags:[]},
    {n:2, title:'Глава 2', st:'todo', flags:[]},
    {n:3, title:'Глава 3', st:'todo', flags:[]},
  ],
  digests: [],
  chats: [],          // диалоги вглубь с AI: {id, insightId, title, msgs:[{r,t,ts}]}
  cravings: [],       // «Здоровье»: тяга/импульс — {id, kind, intensity, trigger, outcome, note}
  oq: [
    'Что самое важное прямо сейчас?',
    'Что мешает двигаться вперёд?',
  ],
  vit: {sl:7, sq:7, cl:7, st:4, mv:7, nic:false, caf:true, alc:false, sugar:false, act:'нет', tone:'нейтрально', note:'', ci:false, date:''},
  env: {noSweetsHome:false, noCigsHome:false, ritual:false},   // «Среда»: реструктуризация окружения (BCTTv1)
  _del: {},   // «надгробия» удалённых записей: { id: timestamp }
  __ts: 0,    // метка времени документа (для слияния скалярных полей)
};

// ─── СОСТОЯНИЕ ──────────────────────────────────────────────────
let CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));
let DB  = JSON.parse(JSON.stringify(DEFAULT_DB));
let STATE = {
  flt: 'all',
  sort: 'date',
  addTag: 'book', addW: 1,
  editTag: 'book', editW: 1,
  ciAct: 'нет', ciTone: 'заряжен', drmTone: 'нейтрально',
  patType: 'Поведенческий',
  spiType: 'Медитация',
  evoLv: 2,
  newAxColor: '#1056CC',
  detId: null,
};

// ═════════════════════════════════════════════════════════════════
//  ПРОФИЛИ  (перенос концепции profiles из TMCManager)
//  Каждый профиль — независимый набор данных: своя БД, своя
//  конфигурация (URL/ключ пространства) и своя парольная фраза.
//  Ключи в localStorage неймспейсятся по id профиля.
// ═════════════════════════════════════════════════════════════════
const PKEY = 'arch5_profiles', AKEY = 'arch5_active';
const PROFILE_COLORS = ['#1056CC','#1A7F3C','#6B21A8','#B45309','#0E7490','#92400E'];
const dbKey   = id => 'arch5_db_'   + id;
const cfgKey  = id => 'arch5_cfg_'  + id;
const passKey = id => 'arch5_pass_' + id;

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PKEY) || 'null') || []; } catch(e) { return []; }
}
function saveProfiles(list) { try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch(e) {} }
function activeId()      { try { return localStorage.getItem(AKEY) || ''; } catch(e) { return ''; } }
function setActiveId(id) { try { localStorage.setItem(AKEY, id); } catch(e) {} }
function activeProfile() { const id = activeId(); return loadProfiles().find(p => p.id === id) || null; }

// Гарантирует наличие хотя бы одного профиля; мигрирует старые
// «плоские» ключи (arch5_db/arch5_cfg/arch5_pass) в профиль по умолчанию.
function ensureProfiles() {
  let list = loadProfiles();
  if (!list.length) {
    const id = 'p' + Date.now();
    const oldDb = localStorage.getItem('arch5_db');
    const oldCfg = localStorage.getItem('arch5_cfg');
    const oldPass = localStorage.getItem('arch5_pass');
    if (oldDb)   localStorage.setItem(dbKey(id), oldDb);
    if (oldCfg)  localStorage.setItem(cfgKey(id), oldCfg);
    if (oldPass) localStorage.setItem(passKey(id), oldPass);
    let name = 'Основной';
    try { const c = JSON.parse(oldCfg || 'null'); if (c && c.userName) name = c.userName; } catch(e) {}
    list = [{ id, name, color: PROFILE_COLORS[0] }];
    saveProfiles(list); setActiveId(id);
    try { localStorage.removeItem('arch5_db'); localStorage.removeItem('arch5_cfg'); localStorage.removeItem('arch5_pass'); } catch(e) {}
  }
  if (!activeId() || !list.find(p => p.id === activeId())) setActiveId(list[0].id);
  return list;
}

// ─── PERSIST / HYDRATE (профиль-зависимые) ──────────────────────
// persistLocal — «тихая» запись в localStorage (без авто-синка),
// используется движком синхронизации, чтобы не зациклиться.
const bakKey = id => 'arch5_bak_' + id;
// Считает ПОЛЬЗОВАТЕЛЬСКИЕ записи — для защиты от перезаписи данных пустотой.
// Исключены bots/chapters/oq (они не пусты в DEFAULT_DB, иначе защита не сработает).
function dbCount(db) {
  if (!db || typeof db !== 'object') return 0;
  let n = 0;
  ['insights','checkins','moments','whys','corrections','meds','medIntakes','symptoms','measures','astroCharts','spheres','sphereLogs','dreams','patterns','evolution','spiritual','digests','chats','cravings']
    .forEach(c => { if (Array.isArray(db[c])) n += db[c].length; });
  return n;
}
let _allowEmptyWrite = false;   // выставляется только при намеренном сбросе
function persistLocal() {
  const id = activeId();
  try {
    const key = dbKey(id), cur = dbCount(DB);
    // ЗАЩИТА ДАННЫХ: не затираем непустое (или повреждённое) хранилище пустым
    // состоянием — иначе сбой парсинга/памяти уничтожал бы данные.
    if (cur === 0 && !_allowEmptyWrite) {
      let prev = 0;
      try { prev = dbCount(JSON.parse(localStorage.getItem(key) || 'null')); }
      catch (e) { prev = 1; }   // повреждено → считаем, что данные были, не трогаем
      if (prev > 0) { if (typeof log === 'function') log('warn', 'persist: запись пустого состояния заблокирована (защита данных)'); return; }
    }
    const json = JSON.stringify(DB);
    localStorage.setItem(key, json);
    localStorage.setItem(cfgKey(id), JSON.stringify(CFG));
    if (cur > 0) { try { localStorage.setItem(bakKey(id), json); } catch (e) {} }  // резервная копия
  } catch(e) {}
}
// persist — вызывается после любой правки пользователя: помечает
// документ меткой времени, пишет локально и планирует фоновый синк.
function persist() {
  const now = Date.now();
  DB.__ts = now; CFG._ts = now;
  persistLocal();
  if (typeof scheduleSync === 'function') scheduleSync();
}
// Загружает данные активного профиля (или дефолты, если пусто).
function hydrate() {
  ensureProfiles();
  const id = activeId();
  // undefined = слот повреждён (JSON не распарсился); null = пусто
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return undefined; } };
  let db = read(dbKey(id)), recovered = false;
  // Восстановление: основной слот повреждён/пуст, но есть бэкап с данными.
  if (db === undefined || dbCount(db) === 0) {
    const bak = read(bakKey(id));
    if (bak && dbCount(bak) > 0) { db = bak; recovered = true; }
    else if (db === undefined) db = null;   // повреждён без бэкапа — стартуем чисто, persistLocal НЕ затрёт слот
  }
  let cfg = null; try { cfg = JSON.parse(localStorage.getItem(cfgKey(id)) || 'null'); } catch (e) {}
  DB  = db  ? {...DEFAULT_DB,  ...db} : JSON.parse(JSON.stringify(DEFAULT_DB));
  CFG = cfg ? {...DEFAULT_CFG, ...cfg, axes: {...DEFAULT_CFG.axes, ...(cfg.axes||{})}}
            : JSON.parse(JSON.stringify(DEFAULT_CFG));
  try { migrateRecords(); } catch (e) {}     // миграция не должна ронять загрузку
  if (recovered) {
    try { persistLocal(); } catch (e) {}
    setTimeout(() => { if (typeof toast === 'function') toast('Данные восстановлены из резервной копии', 'ok'); }, 900);
  }
}

// ─── СНИМКИ (авто-бэкап с глубиной) ─────────────────────────────
// Ежедневный снимок данных, хранится последние 7 дней. Даёт возможность
// откатиться, даже если что-то удалил или данные повредились.
const snapPrefix = id => 'arch5_snap_' + id + '_';
function snapshotDaily() {
  const id = activeId(); if (dbCount(DB) === 0) return;
  const key = snapPrefix(id) + todayKey();
  try {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(DB));
    const keys = Object.keys(localStorage).filter(k => k.startsWith(snapPrefix(id))).sort();
    while (keys.length > 7) { const k = keys.shift(); try { localStorage.removeItem(k); } catch (e) {} }
  } catch (e) {}
}
function listSnapshots() {
  const id = activeId(), pre = snapPrefix(id);
  return Object.keys(localStorage).filter(k => k.startsWith(pre))
    .map(k => { let n = 0; try { n = dbCount(JSON.parse(localStorage.getItem(k))); } catch (e) {} return { key: k, date: k.slice(pre.length), n }; })
    .sort((a, b) => a.date < b.date ? 1 : -1);
}
function restoreSnapshot(key) {
  let snap = null; try { snap = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
  if (!snap || dbCount(snap) === 0) { toast('Копия пуста или повреждена', 'warn'); return; }
  if (!confirm(`Восстановить копию от ${key.split('_').pop()}? Текущие данные заменятся (записей в копии: ${dbCount(snap)}).`)) return;
  DB = { ...DEFAULT_DB, ...snap };
  persist();
  if (typeof renderAfterSync === 'function') renderAfterSync(); else rHome();
  closeOv('ov-backups');
  hptMed && hptMed(); toast('Данные восстановлены из копии', 'ok');
}
function openBackups() { rBackups(); openOv('ov-backups'); }
function rBackups() {
  const el = $('backups-list'); if (!el) return;
  const snaps = listSnapshots();
  const cur = dbCount(DB);
  let html = `<div class="bk-cur">Сейчас в приложении: <b>${cur}</b> ${pl(cur,'запись','записи','записей')}</div>`;
  html += snaps.length
    ? snaps.map(s => `<div class="srow"><div class="bk-info"><span class="sl2">${s.date === todayKey() ? 'Сегодня' : s.date}</span><span class="sv2">${s.n} ${pl(s.n,'запись','записи','записей')}</span></div>
        <button class="btn btn-s btn-xs" onclick="restoreSnapshot('${s.key}')">Восстановить</button></div>`).join('')
    : `<div class="bk-empty">Снимки появятся автоматически по мере пользования (хранятся 7 дней).</div>`;
  html += `<div style="padding-top:var(--s3)"><button class="btn btn-p btn-sm btn-full" onclick="exportData()"><i data-lucide="download"></i>Скачать копию на устройство (JSON)</button></div>`;
  el.innerHTML = html;
}

// Идемпотентная миграция: бэкфилл ISO-меток в старые записи.
// id создавался как Date.now(), поэтому служит надёжным источником createdAt.
function migrateRecords() {
  let changed = false;
  IDCOLS.forEach(c => {
    (DB[c] || []).forEach(r => {
      if (r && !r.createdAt) {
        const ms = typeof r.id === 'number' ? r.id : Date.parse(r.id) || Date.now();
        r.createdAt = new Date(ms).toISOString();
        r.day = r.day || isoDay(r.createdAt);
        r.sv = SCHEMA_VERSION;
        changed = true;
      }
      // Evidence Kernel: backfill «паспорта данных» (идемпотентно, без потерь).
      // Старые записи без пометки читаются как непроверенные и действующие.
      if (r && typeof r === 'object' && !r.verif) { r.verif = 'unverified'; r.life = r.life || 'current'; changed = true; }
    });
  });
  // Заголовки, начинавшиеся с вопроса-промпта, переименовываем в суть ответа
  // (иначе половина записей называется одинаково — «Что самое важное…»).
  (DB.insights || []).forEach(i => {
    const lines = String(i.body || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length > 1 && /\?$/.test(lines[0]) && String(i.title || '').slice(0, 20) === lines[0].slice(0, 20)) {
      const t = lines.slice(1).join(' ');
      if (t.length >= 3) { i.title = t.slice(0, 80) + (t.length > 80 ? '…' : ''); changed = true; }
    }
  });
  if (changed) persistLocal();
}

// ─── ПЕРЕКЛЮЧЕНИЕ / УПРАВЛЕНИЕ ПРОФИЛЯМИ ────────────────────────
function resetSyncState() { clearTimeout(_syncTimer); _syncing = false; _dirty = false; }
function switchProfile(id) {
  if (id === activeId()) { closeOv('ov-profiles'); return; }
  resetSyncState();
  setActiveId(id);
  hydrate();
  closeOv('ov-profiles');
  initAll();
  const p = activeProfile();
  hptMed(); toast('Профиль: ' + (p ? p.name : ''), 'ok');
}
// Гидратация ПОСЛЕ восстановления backup. Транзакция restore уже переключила
// активный профиль (arch5_active = profileId) и записала DB/CFG/bak. Выполняем
// безопасный эквивалент переключения профиля БЕЗ повторной активации и БЕЗ
// дополнительного синка до завершения гидратации: сброс sync-состояния, hydrate()
// (перечитывает DB/CFG активного слота в память), полный re-render. Так следующий
// persist() запишет уже восстановленный DB, а не старый in-memory профиль.
// Вызывается из backup-boot.mjs как window.onRestoreActivated(profileId, mode).
async function onRestoreActivated(profileId, mode) {
  resetSyncState();
  if (activeId() !== profileId) setActiveId(profileId);   // страховка идентичности
  hydrate();
  if (typeof initAll === 'function') initAll();
  if (typeof rProfileRow === 'function') rProfileRow();
  if (typeof hptMed === 'function') hptMed();
}
try { window.onRestoreActivated = onRestoreActivated; } catch (e) {}
function createProfile() {
  const name = ($('prof-new-name')?.value || '').trim();
  if (!name) { toast('Введи название профиля', 'warn'); return; }
  const list = loadProfiles();
  const id = 'p' + Date.now();
  list.push({ id, name, color: PROFILE_COLORS[list.length % PROFILE_COLORS.length] });
  saveProfiles(list); setActiveId(id);
  DB  = JSON.parse(JSON.stringify(DEFAULT_DB));
  CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));
  CFG.userName = name; CFG.axes.domain.lbl = CFG.domainLabel;
  persistLocal(); resetSyncState();
  if ($('prof-new-name')) $('prof-new-name').value = '';
  closeOv('ov-add-profile'); closeOv('ov-profiles');
  initAll();
  hptMed(); toast('Профиль «' + name + '» создан', 'ok');
}
function renameProfile(id) {
  const list = loadProfiles();
  const p = list.find(x => x.id === id); if (!p) return;
  const name = prompt('Название профиля', p.name);
  if (name == null) return;
  const t = name.trim(); if (!t) { toast('Пустое название', 'warn'); return; }
  p.name = t; saveProfiles(list);
  rProfiles(); rProfileRow(); toast('Профиль переименован', 'ok');
}
function deleteProfile(id) {
  const list = loadProfiles();
  if (list.length <= 1) { toast('Нужен хотя бы один профиль', 'warn'); return; }
  if (!confirm('Удалить профиль и все его данные на ЭТОМ устройстве? На сервере пространство останется — его можно вернуть по ключу.')) return;
  try { localStorage.removeItem(dbKey(id)); localStorage.removeItem(cfgKey(id)); localStorage.removeItem(passKey(id)); } catch(e) {}
  const rest = list.filter(p => p.id !== id);
  saveProfiles(rest);
  if (activeId() === id) { resetSyncState(); setActiveId(rest[0].id); hydrate(); initAll(); }
  rProfiles(); toast('Профиль удалён');
}

// ─── ПРОФИЛИ: РЕНДЕР ─────────────────────────────────────────────
function rProfiles() {
  const el = $('prof-list'); if (!el) return;
  const cur = activeId();
  el.innerHTML = loadProfiles().map(p => {
    const on = p.id === cur;
    return `<div class="prof-row${on ? ' on' : ''}" onclick="switchProfile('${p.id}')">
      <div class="prof-ava" style="background:${p.color}">${esc((p.name[0] || '?').toUpperCase())}</div>
      <div class="prof-info">
        <div class="prof-name">${esc(p.name)}</div>
        <div class="prof-sub">${on ? 'Активный' : 'Нажми, чтобы переключиться'}</div>
      </div>
      <button class="prof-act" onclick="event.stopPropagation();renameProfile('${p.id}')" aria-label="Переименовать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;color:var(--t3)"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="prof-act" onclick="event.stopPropagation();deleteProfile('${p.id}')" aria-label="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px;color:var(--red)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
    </div>`;
  }).join('');
}
function rProfileRow() {
  const el = $('prof-current'); if (!el) return;
  const p = activeProfile();
  el.textContent = p ? p.name : '—';
}
function openProfiles() { openOv('ov-profiles'); rProfiles(); }

// ─── TOAST ──────────────────────────────────────────────────────
function toast(msg, tp='') {
  const el = document.createElement('div');
  el.className = 'toast' + (tp ? ' t-'+tp : '');
  if (tp==='ok')   el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>' + esc(msg);
  else if (tp==='warn') el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' + esc(msg);
  else el.textContent = msg;
  $('toasts').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); }, 2600);
}

// ─── АНИМАЦИЯ ЧИСЛА ─────────────────────────────────────────────
function animN(el, v, d=700) {
  if (!el) return;
  let t = null;
  const s = ts => {
    if (!t) t = ts;
    const p = Math.min((ts-t)/d, 1);
    const e = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(v * e);
    if (p < 1) requestAnimationFrame(s);
  };
  requestAnimationFrame(s);
}

// ─── PIPS (уровень инсайта) ──────────────────────────────────────
function pips(w) {
  return Array.from({length:5}, (_,i) =>
    `<span class="pip${i<w?' on':''}"></span>`
  ).join('');
}

// ─── TAG HELPERS ─────────────────────────────────────────────────
const TL = {book:'Книга',bot:'Бот',personal:'Личное',project:'Проект',vitality:'Vitality',dream:'Сон',pattern:'Паттерн',spirit:'Духовное'};
const TC = {book:'tg-book',bot:'tg-bot',personal:'tg-personal',project:'tg-project',vitality:'tg-vitality',dream:'tg-dream',pattern:'tg-pattern',spirit:'tg-spirit'};
const SC = {book:'var(--c-book,#6B21A8)',bot:'var(--c-bot,#1056CC)',personal:'var(--c-personal,#92400E)',project:'var(--c-project,#B45309)',vitality:'var(--c-vitality,#1A7F3C)',dream:'var(--c-dream,#6B21A8)',pattern:'var(--c-pattern,#0E7490)',spirit:'var(--c-spirit,#92400E)'};

// ─── СПЛЭШ ──────────────────────────────────────────────────────
function initSplash() {
  const now = new Date();
  const wn = Math.ceil(((now - new Date(now.getFullYear(),0,1)) / 864e5 + 1) / 7);
  $('sp-wn').textContent = 'Неделя ' + wn;
  $('sp-list').innerHTML = CFG.weekFocuses.map(f =>
    `<div class="sp-item"><div class="sp-dot" style="background:${f.c}"></div><div class="sp-txt">${esc(f.t)}</div></div>`
  ).join('');
  const sp = $('splash');
  sp.addEventListener('click', dimSplash);
  setTimeout(dimSplash, 6000);
}
function dimSplash() {
  $('splash').classList.add('out');
  setTimeout(() => $('splash').style.display='none', 420);
}

// ─── ОНБОРДИНГ ──────────────────────────────────────────────────
function checkOnboard() {
  if (!CFG.userName) {
    setTimeout(() => openOv('ov-onboard'), 500);
  }
}
function finishOnboard() {
  const name   = $('ob-name').value.trim();
  const domain = $('ob-domain').value.trim() || 'Книга';
  if (!name) { toast('Введи своё имя', 'warn'); return; }
  CFG.userName     = name;
  CFG.domainLabel  = domain;
  CFG.axes.domain.lbl = domain;
  // подхватываем имя в название активного профиля, если он ещё «Основной»
  const list = loadProfiles();
  const p = list.find(x => x.id === activeId());
  if (p && (p.name === 'Основной' || !p.name)) { p.name = name; saveProfiles(list); }
  // Стартовые сферы — чтобы движок работал с первого дня (все удаляемы).
  if (!DB.spheres || !DB.spheres.length) {
    [ { name:'Настроение', icon:'🙂', color:'#1056CC', type:'score' },
      { name:'Сон',        icon:'😴', color:'#6B21A8', type:'score' },
      { name:'Спорт',      icon:'🏃', color:'#1A7F3C', type:'habit' } ].forEach(t => createSphere(t));
  }
  persist();
  closeOv('ov-onboard');
  updateDomainLabel(); rProfileRow();
  openOv('ov-tour'); rTour(0);   // короткий тур по сути приложения
}
// ─── ПЕРВЫЙ ЗАПУСК: тур (ориентация в сути за 3 шага) ────────────
const TOUR = [
  { ic:'🎯', t:'Отмечай день', d:'Быстрый чек-ин: сон, ясность, эмоция. Из этого рождётся твоё состояние и честные выводы — без ручных графиков.' },
  { ic:'🧩', t:'Заведи свои сферы', d:'Спорт, чтение, практики — что угодно. Каждая со своим трекером: балл, привычка, счётчик или цель.' },
  { ic:'💡', t:'Смотри, что помогает', d:'Приложение само найдёт связи: «В дни спорта состояние выше». Честно, по твоим данным, а не общими словами.' },
];
function rTour(i) {
  STATE.tourIdx = i;
  const s = TOUR[i];
  $('tour-slides').innerHTML = `<div class="tour-slide"><div class="tour-ic">${s.ic}</div><div class="tour-t">${esc(s.t)}</div><div class="tour-d">${esc(s.d)}</div></div>`;
  $('tour-dots').innerHTML = TOUR.map((_, k) => `<span class="tour-dot${k===i?' on':''}"></span>`).join('');
  $('tour-btn').textContent = i === TOUR.length - 1 ? 'Сделать первый чек-ин' : 'Далее';
}
function nextTour() { if (STATE.tourIdx < TOUR.length - 1) rTour(STATE.tourIdx + 1); else finishTour(true); }
function finishTour(doCheckin) {
  try { localStorage.setItem('arch5_tour_done', '1'); } catch(e){}
  closeOv('ov-tour');
  if (doCheckin) { openOv('ov-ci'); }
  else toast('Готово — начинай отмечать день', 'ok');
}
function updateDomainLabel() {
  const lbl = CFG.domainLabel || 'Книга';
  const el = $('tab-book-lbl');
  if (el) el.textContent = lbl;
  const bl = $('book-lbl');
  if (bl) bl.textContent = 'Главы · ' + lbl;
}

// ─── НАВИГАЦИЯ ───────────────────────────────────────────────────
const TITLES = {home:'Сегодня', insights:'Инсайты', book:CFG.domainLabel||'Книга', vit:'Сферы', sys:'Итоги', map:'Разум', health:'Здоровье', astro:'Астрология', settings:'Настройки'};
function goTo(tab, el) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  const pg = $('pg-'+tab);
  if (pg) pg.classList.add('on');
  const nb = $('nt-'+tab) || el;
  if (nb) nb.classList.add('on');
  $('ptitle').textContent = TITLES[tab] || tab;
  document.querySelectorAll('.navlink').forEach(n => n.classList.toggle('on', n.dataset.tab === tab));
  if (typeof closeNav === 'function') closeNav();
  if (typeof rSidebar === 'function') rSidebar();
  hpt();
  if (tab==='vit') { rSpheres(); rVit(); }
  if (tab==='sys') { rLivingMap('livingmap-out'); rDig(); rReview(30); }
  if (tab==='map') rIns();
  if (tab==='health') rHealth();
  if (tab==='astro') asub('menu');
  if (tab==='settings') { rProfileRow(); checkApiStatus(); rPushStatus(); const kc=$('keys-cnt'); if (kc) kc.textContent = KEY_SERVICES.filter(s=>getAiKeyFor(s.p)).length + ' из ' + KEY_SERVICES.length; }
}
function msub(tab, el) {
  document.querySelectorAll('[id^="ms-"]').forEach(t => t.style.display='none');
  document.querySelectorAll('#subnav .snpill').forEach(p => p.classList.remove('on'));
  const t = $('ms-'+tab);
  if (t) t.style.display = 'block';
  if (!el) el = document.querySelector(`#subnav .snpill[data-sub="${tab}"]`);  // программный переход тоже подсвечивает
  if (el) el.classList.add('on');
  hpt();
  if (tab==='evolution') rEvoList($('evo-more'));
  if (tab==='insights')  rIns();
  if (tab==='book')      rBook();
  if (tab==='patterns')  rPats();
  if (tab==='dreams')    rDrms();
  if (tab==='spiritual') rSpi();
  if (tab==='graph')     rMap();
  if (tab==='chats')     rChats();
}

// ─── ОВЕРЛЕИ ────────────────────────────────────────────────────
function openOv(id) {
  document.querySelectorAll('.ov').forEach(o => {
    if (o.id !== id && o.id !== 'ov-search') o.classList.remove('on');
  });
  $(id).classList.add('on');
  document.body.style.overflow = 'hidden';
  if (id==='ov-evo')      rEvoList($('evo-sh'));
  if (id==='ov-axis-all') rAxisSliders();
  if (id==='ov-cfg')      rCfgForm();
  if (id==='ov-ci')       rEmoPicker();
  if (id==='ov-moment')   rMomEmo();
  if (id==='ov-why')      resetWhyForm();
  if (id==='ov-history')  rHistory();
  if (id==='ov-add')      { STATE.addMedia = []; rAddMedia(); }
}
// Собрать ВСЕ media-id, на которые ссылается любая запись любой коллекции db.
function collectDbMediaRefs(db, out) {
  if (!db || typeof db !== 'object') return;
  for (const c of Object.keys(db)) {
    const arr = db[c]; if (!Array.isArray(arr)) continue;
    for (const rec of arr) if (rec && Array.isArray(rec.media)) for (const m of rec.media) if (typeof m === 'string') out.add(m);
  }
}
// Сборка мусора медиа: удаляем из IndexedDB медиа, на которые никто не ссылается.
// IndexedDB 'arch5_media' ОБЩИЙ для всех профилей, поэтому ссылки собираем из DB
// КАЖДОГО профиля (ВКЛЮЧАЯ активный — его raw-слот тоже читаем и валидируем, т.к.
// in-memory DB мог подняться из default при повреждённом слоте), из текущего
// in-memory DB и из активных черновиков. Если реестр или ЛЮБОЙ слот профиля
// повреждён/нечитаем — GC ПРЕКРАЩАЕТСЯ без единого удаления (fail-safe: лучше
// оставить лишнее медиа, чем удалить чужое/нужное из-за ошибки чтения).
async function gcMedia() {
  try {
    const ref = new Set(STATE.addMedia || []);
    collectDbMediaRefs(DB, ref);                          // текущий in-memory профиль
    // Реестр профилей: если повреждён — стоп (иначе чужие медиа примем за мусор).
    const rawReg = localStorage.getItem(PKEY);
    let profiles = [];
    if (rawReg != null) {
      try { profiles = JSON.parse(rawReg); } catch (e) { return; }
      if (!Array.isArray(profiles)) return;
    }
    // Активный профиль обязан быть в списке даже если его нет в реестре: его
    // повреждённый raw-слот тоже должен останавливать GC.
    const ids = new Set(profiles.filter(p => p && p.id != null).map(p => String(p.id)));
    const active = activeId();
    if (active && !ids.has(String(active))) { ids.add(String(active)); }
    for (const id of ids) {
      const raw = localStorage.getItem(dbKey(id));
      if (raw == null) continue;                           // пустой слот — нет ссылок, это ок
      let db;
      try { db = JSON.parse(raw); } catch (e) { return; }  // повреждён → стоп, ничего не удаляем
      if (!db || typeof db !== 'object') return;           // нечитаем → стоп
      collectDbMediaRefs(db, ref);
    }
    const keys = await idbKeys();
    for (const k of keys) if (!ref.has(k)) await idbDel(k).catch(() => {});
  } catch (e) { /* IndexedDB недоступен — не критично */ }
}
function closeOv(id) {
  $(id).classList.remove('on');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // Зашифрованный backup-sheet закрываем через контроллер: он чистит пароли/файл/
  // destructive-состояние и не прерывает выполняющуюся операцию (busy).
  const be = document.getElementById('ov-backup-enc');
  if (be && be.classList.contains('on') && window.ArchBackup && typeof window.ArchBackup.requestClose === 'function') {
    window.ArchBackup.requestClose();
    return;
  }
  document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
});

// ─── ТЕМА ───────────────────────────────────────────────────────
function toggleTheme() {
  const h = document.documentElement;
  const dark = h.getAttribute('data-theme') !== 'dark';
  h.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('arch_t', dark ? 'dark' : 'light');
  const tv = $('thv');
  if (tv) tv.textContent = dark ? 'Ночная' : 'Дневная';
  rCompass();
  hpt();
}

// ─── ПОИСК ──────────────────────────────────────────────────────
function runSearch(q) {
  const el = $('search-results');
  if (!q.trim()) { el.innerHTML = '<div class="search-empty">Начни вводить запрос</div>'; return; }
  const lq = q.toLowerCase();
  const results = [];
  DB.insights.forEach(x => {
    if ((x.title+x.body).toLowerCase().includes(lq))
      results.push({type:'insight', item:x});
  });
  DB.dreams.forEach(x => {
    if ((x.title+x.body).toLowerCase().includes(lq))
      results.push({type:'dream', item:x});
  });
  DB.patterns.forEach(x => {
    if (x.text.toLowerCase().includes(lq))
      results.push({type:'pattern', item:x});
  });
  DB.spiritual.forEach(x => {
    if (x.text.toLowerCase().includes(lq))
      results.push({type:'spiritual', item:x});
  });
  if (!results.length) { el.innerHTML = '<div class="search-empty">Ничего не найдено</div>'; return; }
  el.innerHTML = results.slice(0,20).map(r => {
    if (r.type==='insight') {
      return `<div class="ins-row" onclick="closeOv('ov-search');showDet(${r.item.id})">
        <div class="ins-stripe" style="background:${SC[r.item.tag]||'var(--bd2)'}"></div>
        <div class="ins-body">
          <div class="ins-meta"><span class="tag ${TC[r.item.tag]||'tg-personal'}">${TL[r.item.tag]||r.item.tag}</span><span class="ins-date">${r.item.date}</span></div>
          <div class="ins-title">${highlight(r.item.title, q)}</div>
          <div class="ins-text">${highlight(r.item.body.slice(0,100), q)}</div>
        </div></div>`;
    }
    if (r.type==='dream') {
      return `<div class="drm" onclick="closeOv('ov-search');goTo('map')">
        <div class="drm-date">${r.item.date}</div>
        <div class="drm-title">${highlight(r.item.title, q)}</div>
        <div class="drm-body">${highlight(r.item.body.slice(0,100), q)}</div></div>`;
    }
    if (r.type==='pattern') {
      return `<div class="pat" onclick="closeOv('ov-search');goTo('map');msub('patterns')">
        <div class="pat-type">${r.item.type}</div>
        <div class="pat-text">${highlight(r.item.text.slice(0,100), q)}</div></div>`;
    }
    return `<div class="spi" onclick="closeOv('ov-search');goTo('map');msub('spiritual')">
      <div class="spi-type">${r.item.type}</div>
      <div class="spi-text">${highlight(r.item.text.slice(0,100), q)}</div></div>`;
  }).join('');
}
function highlight(text, q) {
  if (!q) return esc(text);
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return esc(text).replace(re, '<mark>$1</mark>');
}
$('search-in')?.addEventListener('keydown', e => { if (e.key==='Escape') closeOv('ov-search'); });

// ─── СТРИК ──────────────────────────────────────────────────────
function calcStreak() {
  const keys = DB.checkins.map(c => c.date).sort().reverse();
  if (!keys.length) return 0;
  let streak = 0, cur = new Date();
  cur.setHours(0,0,0,0);
  for (let k of keys) {
    const d = new Date(k + 'T00:00:00');
    const diff = Math.round((cur - d) / 86400000);
    if (diff === streak) { streak++; cur = d; }
    else break;
  }
  return streak;
}
// Лучший стрик — отдельно от текущего, чтобы пропуск не обнулял мотивацию.
function calcBestStreak() {
  const days = [...new Set(DB.checkins.map(c => c.date))].filter(Boolean).sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]+'T00:00:00') - new Date(days[i-1]+'T00:00:00')) / 86400000);
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}
// «Прощающая» метрика постоянства (0–100) — по запросу пользователей
// категории: пропуск НЕ обнуляет, а лишь слегка снижает. Взвешенная
// приверженность за окно с большим весом свежих дней; один пропуск среди
// многих отметок почти не влияет, восстанавливается по мере отметок.
function calcConsistency(window) {
  window = window || 21;
  const logged = new Set(DB.checkins.map(c => c.date).filter(Boolean));
  let num = 0, den = 0;
  for (let i = 0; i < window; i++) {
    const w = window - i;                 // свежие дни весомее
    den += w;
    if (logged.has(dayAgo(i))) num += w;
  }
  return den ? Math.round(100 * num / den) : 0;
}
function rStreak() {
  const el = $('h-streak-wrap');
  if (!el) return;
  if (!DB.checkins.length) { el.innerHTML = ''; return; }
  const s = calcStreak(), best = calcBestStreak(), cons = calcConsistency(21);
  // Лид — постоянство (не обнуляется); стрик вторичен, без вины за пропуск.
  const tone = cons >= 70 ? 'good' : cons >= 40 ? 'mid' : 'low';
  const lbl  = cons >= 70 ? 'ты в ритме' : cons >= 40 ? 'держишь курс' : 'набираешь ритм';
  const chip = s >= 2 ? `🔥 ${s} подряд` : best >= 3 ? `рекорд ${best}` : '';
  el.innerHTML = `<div class="cons ${tone}">
    <div class="cons-ring" style="--p:${cons}"><b>${cons}</b></div>
    <div class="cons-body"><div class="cons-lbl">Постоянство · ${lbl}</div>
      <div class="cons-sub">за 3 недели${chip ? ' · ' + chip : ''}</div></div>
  </div>`;
}

// ─── АВТОДЕТЕКЦИЯ ПАТТЕРНОВ ──────────────────────────────────────
function detectPatterns() {
  const el = $('pat-suggest-home');
  if (!el) return;
  const counts = {};
  DB.insights.forEach(i => { counts[i.tag] = (counts[i.tag]||0) + 1; });
  const candidate = Object.entries(counts).find(([tag, cnt]) => {
    if (cnt < 3) return false;
    const already = DB.patterns.some(p => p.text.toLowerCase().includes(TL[tag]?.toLowerCase()||tag));
    return !already;
  });
  if (!candidate) { el.innerHTML = ''; return; }
  const [tag, cnt] = candidate;
  el.innerHTML = `<div class="pat-suggest mx mb">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div>
      <div class="pat-suggest-t">Возможный паттерн</div>
      <div class="pat-suggest-d">${cnt} инсайта «${TL[tag]||tag}» — рассмотри как паттерн</div>
      <div class="pat-suggest-btn" onclick="quickPat('${tag}')">Зафиксировать паттерн →</div>
    </div>
  </div>`;
}
function quickPat(tag) {
  DB.patterns.push({id: Date.now(), type:'Поведенческий', text:`Паттерн из инсайтов «${TL[tag]||tag}»`, cnt:1});
  persist(); rPats(); detectPatterns();
  toast('Паттерн создан — уточни в разделе Карта', 'ok');
}

// ─── ГЛАВНАЯ ─────────────────────────────────────────────────────
function rHome() {
  const now = new Date();
  const D2 = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const M  = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  $('h-date').textContent = `${D2[now.getDay()]}, ${now.getDate()} ${M[now.getMonth()]} ${now.getFullYear()}`;
  rHState(); rStreak(); detectPatterns();
  rNudge();
  rStateHero(); rVector(); rAmbient('home-ambient'); rSmartInsights('home-smart'); rHeatmap('home-heatmap', 90); rGraph('home-graph', 190, true);
  rPrompts();
  rOnThisDay();
  rHIns();
  try { rHomeMoments(); } catch (e) {}
  try { rMomentTrend(); } catch (e) {}
  try { rWhys(); } catch (e) {}
  try { rWeekSummary(); } catch (e) {}
  try { rMedReminder(); } catch (e) {}
}
// ─── ПАМЯТЬ НА ГОДЫ: ресёрфейсинг (волна 2, механика Rosebud) ────
// Движок сам поднимает релевантную запись прошлого: похожее состояние /
// годовщина / важная забытая мысль. «Держит в уме на годы» — люди не
// перечитывают старое, а движок делает это за них в нужный момент.
function resurface() {
  const now = Date.now();
  const MIN_AGE = 30 * 864e5;                       // минимум месяц — это «прошлое»
  const v = DB.vit;
  const todayState = (v && v.ci) ? (v.cl + v.mv + (10 - v.st)) / 3 : null;
  const stateOn = {}; DB.checkins.forEach(c => { if (c.date) stateOn[c.date] = dayComposite(c); });
  const cands = (DB.insights || []).filter(i => {
    const t = Date.parse(i.createdAt); return t && (now - t) >= MIN_AGE && (i.body || i.title);
  }).map(i => {
    const t = Date.parse(i.createdAt), ageDays = (now - t) / 864e5, w = i.w || 1;
    const day = i.day || String(i.createdAt || '').slice(0, 10);
    let resonance = 0, reason = 'важная мысль из прошлого';
    const past = stateOn[day];
    if (todayState != null && past != null && Math.abs(todayState - past) <= 1.2) {
      resonance = 2; reason = 'ты был в похожем состоянии';
    }
    const yr = ageDays / 365;                        // годовщина ±4 дня
    if (Math.round(yr) >= 1 && Math.abs(yr - Math.round(yr)) * 365 <= 4) {
      resonance += 1.5; reason = Math.round(yr) === 1 ? 'ровно год назад' : `${Math.round(yr)} года назад`;
    }
    return { ins: i, score: w * (1 + resonance) * Math.log10(ageDays + 10), reason, resonant: resonance > 0, ageDays: Math.round(ageDays) };
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  // Контекстное совпадение (состояние/годовщина) всегда важнее — не ротируем его.
  if (cands[0].resonant) return cands[0];
  // Иначе среди «важных забытых» ротируем по дню, чтобы возвращались разные.
  const top = cands.slice(0, 3);
  const doy = Math.floor((now - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  return top[doy % top.length];
}
function rOnThisDay() {
  const el = $('h-onthisday'); if (!el) return;
  const r = resurface();
  if (!r) { el.innerHTML = ''; return; }
  const i = r.ins;
  el.innerHTML = `<div class="otd mx mb" onclick="showDet(${i.id})" role="button">
    <div class="otd-h">🧠 ${esc(r.reason)}</div>
    <div class="otd-t">${esc(i.title)}</div>
    <div class="otd-b">${esc((i.body||'').slice(0,140))}</div>
  </div>`;
}
// Управляемая рефлексия: тап по вопросу открывает инсайт с этим вопросом.
function reflectOn(i) {
  const q = DB.oq[i]; if (!q) return;
  hpt();
  openOv('ov-add');
  STATE.addTag = 'personal';
  document.querySelectorAll('#add-tags .tp').forEach(x => { x.className='tp'; if (x.dataset.t==='personal') x.className='tp a-personal'; });
  const ta = $('add-tx');
  if (ta) { ta.value = q + '\n\n'; ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch(e){} }
  const sr = $('add-src'); if (sr) sr.value = 'Рефлексия';
}
// ─── ПРОМПТЫ РЕФЛЕКСИИ ПОД СОСТОЯНИЕ (механика Rosebud/Stoic, №5) ──
// Релевантные текущему состоянию вопросы (рамка CBT/ACT), ротация по дням.
const PROMPT_BANK = {
  low: [
    'Что сейчас забирает больше всего сил?',
    'Что помогало тебе в похожий тяжёлый день раньше?',
    'Какая одна маленькая вещь сделает сегодня чуть легче?',
    'Что из этого — факт, а что — мысль о факте?',
  ],
  mid: [
    'Что сегодня стоит внимания, но ускользает?',
    'Где ты был на автопилоте?',
    'Что бы ты хотел, чтобы завтра было иначе?',
    'Какой маленький шаг приблизит к важному?',
  ],
  high: [
    'Что дало тебе энергию — как это повторить?',
    'Что сейчас получается — как закрепить?',
    'За что ты благодарен прямо сейчас?',
    'Кому ты мог бы передать этот подъём?',
  ],
  none: [
    'Что самое важное прямо сейчас?',
    'Что мешает двигаться вперёд?',
    'Что ты хочешь запомнить об этом дне?',
  ],
};
function statePromptBucket() {
  const v = DB.vit;
  if (!v || !v.ci) return 'none';
  const comp = (v.cl + v.mv + (10 - v.st)) / 3;
  return comp < 4.5 ? 'low' : comp <= 6.5 ? 'mid' : 'high';
}
// ─── КОНТЕКСТНЫЙ НАДЖ (напоминания: контекст, не будильник — №4) ──
// Один уместный подсказ по состоянию/пропускам, вопросом, а не командой;
// закрывается на день. (Web Push позже — логика уже здесь.)
// ─── ПСИХИЧЕСКОЕ СОСТОЯНИЕ ПО ДИАЛОГАМ → ЖУРНАЛ ЗДОРОВЬЯ ─────────
// При закрытии чата вывод размечается (chatFinish) и в т.ч. коарс-оценка
// состояния (mood/stress/lonely) кладётся на инсайт как stateNote. Здесь
// эти сигналы собираются за 2 недели в дайджест для «Здоровья» и для
// риск-движка — так психоконтур синхронизируется с журналом здоровья.
function mentalStateDigest() {
  const cutoff = Date.now() - 14 * 864e5;
  const notes = (DB.insights || [])
    .filter(i => i.stateNote && i.stateNote.at && Date.parse(i.stateNote.at) >= cutoff)
    .map(i => i.stateNote)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!notes.length) return null;
  const n = notes.length;
  const moodScore = { low: 1, mid: 2, high: 3 };
  return {
    n, latest: notes[0],
    highStress: notes.filter(s => s.stress === 'high').length,
    lonely: notes.filter(s => s.lonely).length,
    avgMood: notes.reduce((s, x) => s + (moodScore[x.mood] || 2), 0) / n,
  };
}
function todayStateNote() {
  return (DB.insights || []).map(i => i.stateNote).find(s => s && s.day === todayKey()) || null;
}
// ─── ПРИЁМЫ САМОРЕГУЛЯЦИИ (локальный RAG-lite) ──────────────────
// Из разбора RAG-LLM: не хардкод правил, а курируемая база доказательных
// приёмов (CBT/ACT/DBT/соматика) + подбор под состояние. Хостовая
// вектор-БД (Pinecone/Qdrant) для ~12 приёмов избыточна и тянет данные на
// сервер; при таком размере ретрив — локальная функция по стем-тегам.
// Каждый приём: id, заголовок, рамка (когда), шаги, for — стемы состояний.
const REG_TECHNIQUES = [
  { id: 'ground54321', title: 'Заземление 5-4-3-2-1', frame: 'при острой тревоге, панике, наплыве',
    for: ['трев', 'паник', 'страх', 'наплыв', 'накрыв', 'захлёст'],
    steps: ['Назови 5 вещей, что видишь вокруг', '4 — что слышишь', '3 — к чему можешь прикоснуться', '2 — что чувствуешь запахом', '1 — вкус во рту или один медленный вдох'] },
  { id: 'sigh', title: 'Физиологический вздох', frame: 'быстрый сброс напряжения телом',
    for: ['стресс', 'напряж', 'взвинч', 'зл', 'раздраж'],
    steps: ['Два вдоха носом подряд (второй — короткий добор сверху)', 'Долгий медленный выдох ртом', 'Повтори 3–5 раз — тело выходит из «боевого» режима за минуту'] },
  { id: 'urgesurf', title: 'Сёрфинг по тяге', frame: 'ACT — пережить пик, не борясь силой воли',
    for: ['тяг', 'тянет', 'срыв', 'сорв', 'сладк', 'сигарет', 'кур', 'импульс', 'съест', 'торт', 'заед'],
    steps: ['Замечай тягу как волну, а не как приказ', 'Она растёт, достигает пика и спадает за 5–10 минут', 'Наблюдай ощущение в теле — не борись и не корми его', 'Дай волне пройти: ты не обязан на неё отвечать'] },
  { id: 'defusion', title: 'Когнитивное расцепление', frame: 'ACT — отделить себя от навязчивой мысли',
    for: ['навязчив', 'румин', 'мысл', 'самокрит', 'прокруч', 'думаю об'],
    steps: ['Поймай мысль дословно: «…»', 'Скажи про себя: «У меня есть мысль, что …»', 'Потом: «Я замечаю, что у меня есть мысль, что …»', 'Мысль — событие в уме, а не факт и не приказ'] },
  { id: 'decatastroph', title: 'Декатастрофизация', frame: 'CBT — вернуть реализм при тревоге о будущем',
    for: ['катастроф', 'страх', 'будущ', 'бессонниц', 'не усн', 'заснуть', 'встреч'],
    steps: ['Какой самый худший сценарий?', 'А какой самый реалистичный?', 'Если случится плохое — как ты справишься?', 'Что бы ты сказал другу в этой ситуации?'] },
  { id: 'behavact', title: 'Поведенческая активация', frame: 'CBT — действие раньше настроения',
    for: ['упадок', 'апати', 'нет сил', 'подавл', 'лень', 'бессил', 'ничего не хоч'],
    steps: ['Выбери одно крошечное действие на 5 минут', 'Не жди мотивацию — она приходит в процессе, не до него', 'Сделай и отметь, как чуть сдвинулось состояние'] },
  { id: 'selfcompassion', title: 'Пауза самосострадания', frame: 'при стыде, вине, самокритике',
    for: ['стыд', 'вин', 'самокрит', 'провал', 'ничтожеств', 'ненавижу себя'],
    steps: ['Признай честно: «Сейчас мне тяжело»', '«Тяжело бывает всем — я в этом не один»', 'Рука на грудь; скажи себе то, что сказал бы близкому другу'] },
  { id: 'box', title: 'Дыхание по квадрату', frame: 'сфокусировать и успокоить перед сложным',
    for: ['стресс', 'трев', 'взвинч', 'перед', 'волну'],
    steps: ['Вдох на 4 счёта', 'Задержка на 4', 'Выдох на 4', 'Задержка на 4 — и снова, 4 круга'] },
  { id: 'opposite', title: 'Противоположное действие', frame: 'DBT — не идти на поводу у импульса эмоции',
    for: ['зл', 'избега', 'страх', 'импульс', 'обид'],
    steps: ['Назови эмоцию и что она толкает сделать', 'Если это действие не полезно — сделай мягко противоположное', 'Злость → спокойный тон; страх → маленький шаг навстречу'] },
  { id: 'tipp', title: 'Резкое охлаждение (TIPP)', frame: 'DBT — сбить сильный аффект через тело',
    for: ['паник', 'сильн', 'аффект', 'захлёст', 'накрыв', 'трясёт'],
    steps: ['Холодная вода на лицо или холод к запястьям, 30–60 сек', 'Или быстрая физнагрузка пару минут', 'Тело гасит пик возбуждения — ум проясняется'] },
  { id: 'name', title: 'Назвать эмоцию', frame: 'аффект-лейблинг снижает накал',
    for: ['захлёст', 'смятен', 'не понимаю что чувств', 'непонятно', 'трев'],
    steps: ['Назови эмоцию одним словом', 'Где она в теле? Какого она «размера»?', 'Само называние снижает силу эмоции — это доказанный эффект'] },
  { id: 'connect', title: 'Шаг к человеку', frame: 'при одиночестве — корневом триггере тяги',
    for: ['одиночеств', 'один', 'пуст', 'изоляц', 'никто', 'брошен'],
    steps: ['Напиши или позвони одному человеку — даже коротко', 'Или выйди туда, где есть люди, на 10 минут', 'Одиночество усиливает тягу — живой контакт сбивает её'] },
];
// Локальный ретрив: скоринг по вхождению стем-тегов в текст состояния.
function suggestTechniques(text, limit = 2) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return [];
  return REG_TECHNIQUES
    .map(t => ({ t, score: t.for.reduce((n, stem) => n + (s.includes(stem) ? 1 : 0), 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.t);
}
// ─── КРИЗИСНЫЙ ПРОТОКОЛ (safety fallback) ───────────────────────
// Из разбора: при признаках острого кризиса приложение НЕ должно выдавать
// «приёмчик», а мягко направить к живому человеку. Это ЛОКАЛЬНЫЙ слой
// защиты — регекс по явным И частым косвенным формулировкам (второй
// разбор особо просил ловить непрямые сигналы: «всем лучше без меня»,
// «хочется исчезнуть», «не вижу смысла ни в чём»). Честная граница: сильно
// завуалированные/ироничные сигналы регекс не гарантирует — их ловит
// второй слой (флаг crisis от ИИ в techGenerate). Это страховка, не
// клинический скрининг; «Архитектор» прямо говорит, что он не терапевт.
const CRISIS_RE = new RegExp([
  'не хочу жить', 'жить не хочется', 'незачем жить', 'устал[аи]? жить', 'больше так жить не могу', 'не могу больше так жить',
  'нет смысла жить', 'не вижу смысла жить', 'не вижу смысла ни в ч[её]м', 'нет смысла ни в ч[её]м',
  'покончить с собой', 'свести сч[её]ты с жизнью', 'убить себя', 'наложить на себя руки',
  'причинить себе вред', 'причиню себе', 'порезать себя',
  'лучше бы (я )?(не жил|умер)', '(хочу|хочется) умереть(?! со смеху| от смеха)',
  '(хочу|хочется) (просто )?исчезнуть', 'исчезнуть навсегда',
  'всем( бы)? (было бы |будет |станет )?лучше без меня', 'если бы меня не было', 'никому( бы)? не (будет|станет|стало) хуже без меня',
  'не хочу просыпаться', 'не проснуться бы', 'чтобы (вс[её]|это) (прекрат|законч|выключ|кончил)',
  'сил( больше)? нет жить', 'нет сил жить',
].join('|'), 'i');
function crisisScreen(text) { return CRISIS_RE.test(String(text || '')); }
function openCrisisCard() {
  const el = $('crisis-contact');
  if (el) {
    const c = (CFG.trustedContact || '').trim();
    el.innerHTML = c
      ? `<div class="card" style="padding:1rem;margin:.5rem 0"><div class="si-text" style="font-weight:600;margin-bottom:.35rem">Напиши или позвони близкому:</div><div class="si-text">${esc(c)}</div></div>`
      : `<div class="card" style="padding:1rem;margin:.5rem 0"><div class="si-text">Добавь близкого человека в Настройках — чтобы в такой момент он был на один тап.</div><button class="btn btn-s btn-sm" style="margin-top:.5rem" onclick="closeOv('ov-crisis');goTo('settings')">Открыть настройки</button></div>`;
  }
  openOv('ov-crisis');
}
// ─── ПЕРСОНАЛЬНЫЙ АДАПТИВНЫЙ РИСК-СКОРИНГ ТЯГИ ───────────────────
// Сердце JITAI, которое реально помогает: движок учится на ТВОЕЙ
// истории (окно суток срывов, пост-срыв, одиночество), а не на данных
// тысяч людей — потому и работает локально, без сервера и без ML-облака.
// Rule-based и полностью объяснимый: у каждого вклада своя причина,
// система никогда не говорит «риск высокий» без «потому что». Честность
// как в smartInsights: персональные паттерны включаются только когда
// данных хватает, иначе остаётся только сегодняшнее состояние.
// atHour — необязательный час «как будто сейчас» (для тестов/прогноза).
function cravingRisk(atHour) {
  const v = DB.vit, crav = DB.cravings || [];
  const hour = atHour == null ? new Date().getHours() : atHour;
  const hasCi = !!(v && v.ci && v.date === todayKey());
  const F = [];  // {w, why, tag}
  // 1. Сегодняшнее состояние — доступно сразу после чек-ина. Стресс —
  //    корневой триггер (см. разбор JITAI), сам по себе весомый.
  if (hasCi) {
    if (v.st >= 7) F.push({ w: 0.3,  why: 'высокий стресс сегодня', tag: 'stress' });
    if (v.sl < 6)  F.push({ w: 0.15, why: 'сна меньше нормы — самоконтроль слабее', tag: 'sleep' });
  }
  // 2. Пост-срыв окно (AVE): первые ~48ч после срыва держаться труднее.
  const lastFall = crav.find(c => c.outcome === 'gave_in' && c.createdAt);
  if (lastFall) {
    const hrs = (Date.now() - new Date(lastFall.createdAt).getTime()) / 36e5;
    if (hrs >= 0 && hrs < 48) F.push({ w: 0.2, why: 'недавний срыв — первые двое суток самые уязвимые', tag: 'recent' });
  }
  // 3. Твоё уязвимое ОКНО суток — учится из истории собственных срывов.
  const falls = crav.filter(c => c.outcome === 'gave_in' && c.createdAt);
  if (falls.length >= 5) {
    const band = h => h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
    const names = ['ночью', 'по утрам', 'днём', 'по вечерам'];
    const cnt = [0, 0, 0, 0];
    falls.forEach(c => cnt[band(new Date(c.createdAt).getHours())]++);
    const cur = band(hour), share = cnt[cur] / falls.length;
    if (share >= 0.4) F.push({ w: 0.2, why: `${names[cur]} у тебя срывы случаются чаще всего`, tag: 'window' });
  }
  // 4. Одиночество как персональный триггер — учится из контекста тяги.
  const alone = crav.filter(c => c.alone === 'alone'), withppl = crav.filter(c => c.alone === 'people');
  if (alone.length >= 3 && withppl.length >= 2) {
    const ar = alone.filter(c => c.outcome === 'gave_in').length / alone.length;
    const pr = withppl.filter(c => c.outcome === 'gave_in').length / withppl.length;
    if (ar - pr >= 0.15) F.push({ w: 0.15, why: 'в одиночестве тебе удержаться труднее', tag: 'lonely' });
  }
  // 5. Нарастающая частота — много импульсов за сутки, напряжение копится.
  const last24 = crav.filter(c => c.createdAt && Date.now() - new Date(c.createdAt).getTime() < 864e5);
  if (last24.length >= 3) F.push({ w: 0.15, why: `${last24.length} ${pl(last24.length, 'импульс', 'импульса', 'импульсов')} за сутки — напряжение растёт`, tag: 'freq' });
  // 6. Сигнал из сегодняшнего диалога (психоконтур → журнал здоровья): если
  //    сегодня в чате звучал сильный стресс/одиночество — это тоже риск.
  const note = todayStateNote();
  if (note) {
    if (note.stress === 'high') F.push({ w: 0.15, why: 'по сегодняшнему диалогу — сильное напряжение', tag: 'chat-stress' });
    if (note.lonely)            F.push({ w: 0.12, why: 'сегодняшний разговор был об одиночестве', tag: 'chat-lonely' });
  }
  const score = Math.min(0.95, F.reduce((s, f) => s + f.w, 0));
  F.sort((a, b) => b.w - a.w);
  return { score, factors: F, top: F[0] || null, hasCi };
}
// Совместимость: прежний riskReasons() — тонкая обёртка над движком.
function riskReasons() { return cravingRisk().factors.map(f => f.why); }
function smartNudge() {
  const today = todayKey();
  if (localStorage.getItem('arch5_nudge_dismiss') === today) return null;
  const v = DB.vit, hour = new Date().getHours();
  // 1. Не отмечен день (после полудня)
  if ((!v || !v.ci || v.date !== today) && hour >= 11)
    return { icon:'📝', text:'Хороший момент отметить день?', cta:'Чек-ин', act:"openOv('ov-ci')" };
  // 1.5 Предиктивный риск срыва — персональный движок: окно суток срывов,
  // пост-срыв, одиночество, стресс/сон. Проактивно, ДО тяги, с причиной
  // (см. cravingRisk / HEALTH_BRIEF.md). Не требует чек-ина: окно суток и
  // пост-срыв знаемы и без него — потому предупреждение реально опережает.
  {
    const riskCtx = healthSpheres().length > 0 || (DB.cravings || []).length > 0;
    const risk = cravingRisk();
    if (riskCtx && risk.score >= 0.3 && risk.top)
      return { icon: '⚠️', text: `Сейчас риск тяги выше обычного — ${risk.top.why}.`,
        cta: 'Опереться заранее', act: 'openCraving()' };
  }
  // 2. Привычка-сфера давно без отметки
  for (const s of (DB.spheres || [])) {
    if (s.type !== 'habit') continue;
    const logs = DB.sphereLogs.filter(l => l.sphereId === s.id && l.value).map(l => l.date).filter(Boolean).sort();
    if (logs.length < 3) continue;
    const last = logs[logs.length - 1];
    const gap = Math.round((Date.now() - Date.parse(last + 'T00:00:00')) / 864e5);
    if (gap >= 3 && gap < 30)
      return { icon:s.icon||'○', text:`«${s.name}» ждёт ${gap} ${pl(gap,'день','дня','дней')} — отметить сегодня?`, cta:'Отметить', act:`openSphereLog(${s.id})` };
  }
  // 3. Состояние сегодня: рефрейминг спада / закрепление подъёма
  if (v && v.ci && v.date === today) {
    const comp = (v.cl + v.mv + (10 - v.st)) / 3;
    if (comp < 4.5) {
      const r = resurface();
      return { icon:'🌊', text:'Тяжёлый день — это временно. Что помогало раньше?',
        cta: r ? 'Вспомнить' : 'Записать', act: r ? `showDet(${r.ins.id})` : "reflectPromptText('Что помогало мне в похожий день?')" };
    }
    if (comp > 7.5) return { icon:'✨', text:'Ты в ресурсе — зафиксируй, что сработало?', cta:'Записать', act:"reflectPromptText('Что дало мне энергию сегодня?')" };
  }
  return null;
}
function rNudge() {
  const el = $('h-nudge'); if (!el) return;
  const n = smartNudge();
  if (!n) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="nudge"><span class="nudge-ic">${n.icon}</span>
    <span class="nudge-tx">${esc(n.text)}</span>
    <button class="nudge-cta" onclick="${n.act}">${esc(n.cta)}</button>
    <button class="nudge-x" onclick="dismissNudge()" aria-label="Скрыть">✕</button></div>`;
}
function dismissNudge() { localStorage.setItem('arch5_nudge_dismiss', todayKey()); rNudge(); }
function rPrompts() {
  const el = $('h-oq'); if (!el) return;
  const bucket = statePromptBucket();
  const bank = PROMPT_BANK[bucket];
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
  // 2 динамических промпта под состояние (ротация по дню) + свои вопросы пользователя
  const dyn = [bank[doy % bank.length], bank[(doy + 1) % bank.length]];
  const own = (DB.oq || []).slice(0, 3);
  const rows = [];
  dyn.forEach(q => rows.push({ q, dyn: true }));
  own.forEach((q, i) => { if (!dyn.includes(q)) rows.push({ q, dyn: false, i }); });
  el.innerHTML = rows.map(r =>
    `<div class="oqrow" onclick="${r.dyn ? `reflectPromptText(decodeURIComponent('${encodeURIComponent(r.q)}'))` : `reflectOn(${r.i})`}" role="button">
      <div class="oqpulse${r.dyn ? ' oq-dyn' : ''}"></div><span>${esc(r.q)}</span>
      <svg class="oq-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></div>`
  ).join('');
}
function reflectPromptText(q) {
  hpt(); openOv('ov-add'); STATE.addTag = 'personal';
  document.querySelectorAll('#add-tags .tp').forEach(x => { x.className='tp'; if (x.dataset.t==='personal') x.className='tp a-personal'; });
  const ta = $('add-tx');
  if (ta) { ta.value = q + '\n\n'; ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch(e){} }
  const sr = $('add-src'); if (sr) sr.value = 'Рефлексия';
}
// Герой Главной: балл состояния + дельта к базе + разбор contributors.
function moodColorScore(v100) { return moodColor((v100||0)/10); }
function rStateHero() {
  const scoreEl = $('sh-score'); if (!scoreEl) return;
  const deltaEl = $('sh-delta'), cEl = $('sh-contrib'), lblEl = $('sh-caption');
  const s = stateScore();
  if (!s.ok) {
    scoreEl.innerHTML = `<span class="sh-nodata">—</span>`;
    if (deltaEl) deltaEl.innerHTML = '';
    if (lblEl) lblEl.textContent = 'Состояние сегодня';
    const need = 3 - s.n;
    if (cEl) cEl.innerHTML = `<div class="sh-hint">Сделай ещё ${need} ${pl(need,'чек-ин','чек-ина','чек-инов')} — появится балл состояния и разбор, что тянет вверх и вниз</div>`;
    return;
  }
  scoreEl.innerHTML = `<b>${s.score}</b><span>/100</span>`;
  if (deltaEl) {
    deltaEl.className = 'sh-delta ' + (s.delta>0?'up':s.delta<0?'down':'flat');
    deltaEl.innerHTML = s.delta===0 ? 'ровно' : `${s.delta>0?'↑':'↓'} ${Math.abs(s.delta)} за неделю`;
  }
  if (lblEl) lblEl.textContent = s.score>=75?'Ты в ресурсе':s.score>=55?'Ровное состояние':s.score>=40?'Нужно бережнее':'Восстановление в приоритете';
  if (cEl) cEl.innerHTML = s.contributors.map(c => {
    const d = c.delta, arr = d>3?'↑':d<-3?'↓':'·', ac = d>3?'up':d<-3?'down':'';
    return `<div class="cbar"><div class="cbar-h"><span>${c.label}</span><span class="cbar-a ${ac}">${arr} ${d>0?'+':''}${d}</span></div>
      <div class="cbar-t"><div class="cbar-f" style="width:${c.score}%;background:${moodColorScore(c.score)}"></div></div></div>`;
  }).join('');
}
// Заголовок героя — приветствие по времени суток, а не статус check-in
// (раньше «Система «+статус давало сломанные фразы вроде «Система пусто» —
// статус и так виден на карточке состояния ниже, дублировать не нужно).
function rHState() {
  const el = $('h-hl'); if (!el) return;
  const h = new Date().getHours();
  const [pre, em] = h < 5 ? ['Доброй', 'ночи'] : h < 12 ? ['Доброе', 'утро'] : h < 18 ? ['Добрый', 'день'] : ['Добрый', 'вечер'];
  const name = String(CFG.userName || '').trim();
  el.innerHTML = `${esc(pre)} <em>${esc(em)}</em>${name ? ', ' + esc(name) : ''}`;
}
function toggleHomeMore() {
  const el = $('h-more'), btn = $('h-more-btn'); if (!el || !btn) return;
  const open = el.classList.toggle('on');
  btn.textContent = open ? 'Скрыть подробности ↑' : 'Показать больше ↓';
  if (typeof hpt === 'function') hpt();
}
function rHIns() {
  $('h-ins').innerHTML = DB.insights.slice(0,4).map(iRow).join('');
}

// ─── KPI ────────────────────────────────────────────────────────
function rKPIs() {
  animN($('kn-i'), DB.insights.length);
  animN($('kn-d'), DB.dreams.length);
  animN($('kn-p'), DB.patterns.length);
  animN($('kn-c'), DB.chapters.filter(c=>c.st==='done').length);
  const today = dateRU();
  const rc = DB.insights.filter(i => i.date===today).length;
  const b = $('tbadge');
  if (b) { if (rc>0) { b.style.display='flex'; b.textContent=rc; } else b.style.display='none'; }
}

// ─── ИНСАЙТ ROW ──────────────────────────────────────────────────
function iRow(ins) {
  const stripe = SC[ins.tag] || 'var(--bd2)';
  return `<div class="ins-wrap">
    <div class="ins-del-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></div>
    <div class="ins-row" id="ir-${ins.id}" onclick="showDet(${ins.id})">
      <div class="ins-stripe" style="background:${stripe}"></div>
      <div class="ins-body">
        <div class="ins-meta"><span class="tag ${TC[ins.tag]||'tg-personal'}">${TL[ins.tag]||ins.tag}</span><span class="pips">${pips(ins.w||1)}</span><span class="ins-date">${esc(ins.date || dispDate(ins) || '')}</span></div>
        <div class="ins-title">${esc(ins.title)}</div>
        <div class="ins-text">${esc(ins.body)}</div>
      </div>
      <div class="ins-actions" onclick="event.stopPropagation()">
        <button class="ins-act-btn" onclick="openEdit(${ins.id})" aria-label="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="ins-act-btn" onclick="deleteIns(${ins.id})" aria-label="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--red)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

// ─── ИНСАЙТЫ (CRUD) ──────────────────────────────────────────────
function getSortedInsights() {
  let list = STATE.flt==='all' ? [...DB.insights] : DB.insights.filter(x=>x.tag===STATE.flt);
  if (STATE.sort==='weight') list.sort((a,b) => (b.w||1)-(a.w||1));
  else if (STATE.sort==='tag') list.sort((a,b) => (a.tag||'').localeCompare(b.tag||''));
  else list.sort((a,b) => (Date.parse(b.createdAt)||b.id||0) - (Date.parse(a.createdAt)||a.id||0)); // date: новые сверху
  return list;
}
function rIns() {
  const el = $('ins-list');
  const list = getSortedInsights();
  if (!list.length) {
    el.innerHTML = `<div class="empty">
      <div class="em-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--t3)"><path d="M5 3l14 9-14 9V3z"/></svg></div>
      <div class="em-t">Нет инсайтов</div>
      <div class="em-d">Добавь через + в шапке</div>
      <button class="btn btn-p" style="margin-top:.75rem" onclick="openOv('ov-add')">Добавить</button>
    </div>`;
    return;
  }
  // Группировка по датам (референс Claude Code): СЕГОДНЯ / ВЧЕРА / РАНЕЕ.
  // Только при сортировке по дате; иначе — плоский список.
  if (STATE.sort === 'date') {
    const today = todayKey(), yest = dayAgo(1);
    const dayOf = i => (i.day || String(i.createdAt || '').slice(0, 10));
    const g = { t: [], y: [], e: [] };
    list.forEach(i => { const d = dayOf(i); (d === today ? g.t : d === yest ? g.y : g.e).push(i); });
    const sec = (lbl, arr) => arr.length ? `<div class="grp-lbl">${lbl} · ${arr.length}</div>` + arr.map(iRow).join('') : '';
    el.innerHTML = sec('Сегодня', g.t) + sec('Вчера', g.y) + sec('Ранее', g.e);
  } else {
    el.innerHTML = list.map(iRow).join('');
  }
  icons({nodes:[el]});
}
function flt(tag, el) {
  STATE.flt = tag;
  document.querySelectorAll('#iflt .fpill').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  rIns();
}
function setSort(s, el) {
  STATE.sort = s;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  rIns();
}
// ═════════════════════════════════════════════════════════════════
//  МЕДИА (фото в записях) — локально через IndexedDB (приватно, до ~ГБ).
//  Изображения сжимаются на канвасе; в инсайте хранятся только id-ссылки.
// ═════════════════════════════════════════════════════════════════
const IDB_NAME = 'arch5_media', IDB_STORE = 'media';
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(key) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readonly'); const rq = tx.objectStore(IDB_STORE).get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
async function idbDel(key) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbKeys() { const db = await idbOpen(); return new Promise((res, rej) => { const rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
// Медиа-примитив для модуля зашифрованного backup (backup-boot.mjs). Это тот же
// IndexedDB-store, что и у приложения — не копия логики backup, а storage-примитив.
try { window.__archMedia = { get: idbGet, put: idbPut, del: idbDel, keys: idbKeys }; } catch (e) {}
// Точка входа зашифрованной резервной копии (UI живёт в модуле, см. index.html).
function openEncBackup() { if (window.ArchBackup && typeof window.ArchBackup.open === 'function') window.ArchBackup.open(); else toast('Модуль резервной копии ещё загружается', 'warn'); }
function compressImage(file, maxDim = 1280, q = 0.82) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w >= h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      try { res(cv.toDataURL('image/jpeg', q)); } catch (e) { rej(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
async function addPhoto(input) {
  const file = input.files && input.files[0]; input.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Можно только изображения', 'warn'); return; }
  try {
    const data = await compressImage(file);
    const key = 'm' + uid();
    await idbPut(key, { data, type: 'image', createdAt: nowISO() });
    STATE.addMedia = STATE.addMedia || []; STATE.addMedia.push(key);
    rAddMedia();
  } catch (e) { toast('Не удалось добавить фото', 'warn'); }
}
async function rAddMedia() {
  const el = $('add-media'); if (!el) return;
  const ids = STATE.addMedia || [];
  if (!ids.length) { el.innerHTML = ''; return; }
  const items = await Promise.all(ids.map(async id => {
    const m = await idbGet(id).catch(() => null);
    if (!m) return '';
    const inner = m.type === 'audio' ? `<span class="mth-a-ic">🎤</span>` : `<img src="${m.data}" alt="">`;
    return `<div class="mth${m.type==='audio'?' mth-a':''}">${inner}<button class="mth-x" onclick="removeAddMedia('${id}')" aria-label="Убрать">✕</button></div>`;
  }));
  el.innerHTML = items.join('');
}
async function removeAddMedia(id) { STATE.addMedia = (STATE.addMedia || []).filter(x => x !== id); await idbDel(id).catch(() => {}); rAddMedia(); }
async function rDetMedia(ins) {
  const el = $('det-media'); if (!el) return;
  const ids = (ins && ins.media) || [];
  if (!ids.length) { el.innerHTML = ''; return; }
  const items = await Promise.all(ids.map(async id => {
    const m = await idbGet(id).catch(() => null);
    if (!m) return '';
    return m.type === 'audio' ? `<audio class="det-audio" controls src="${m.data}"></audio>` : `<img class="det-photo" src="${m.data}" alt="">`;
  }));
  el.innerHTML = items.join('');
}
// ── Голосовые заметки (MediaRecorder → IndexedDB) ──
let _rec = null, _recChunks = [];
function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
async function storeAudioBlob(blob) {
  const data = await blobToDataURL(blob);
  const key = 'm' + uid();
  await idbPut(key, { data, type: 'audio', createdAt: nowISO() });
  STATE.addMedia = STATE.addMedia || []; STATE.addMedia.push(key);
  rAddMedia();
}
async function toggleRec(btn) {
  if (_rec && _rec.state === 'recording') { _rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Запись не поддерживается браузером', 'warn'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { toast('Нет доступа к микрофону', 'warn'); return; }
  try {
    _rec = new MediaRecorder(stream); _recChunks = [];
    _rec.ondataavailable = e => { if (e.data && e.data.size) _recChunks.push(e.data); };
    _rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (btn) { btn.classList.remove('rec'); const l = btn.querySelector('.rec-lbl'); if (l) l.textContent = 'Голос'; }
      try { await storeAudioBlob(new Blob(_recChunks, { type: _rec.mimeType || 'audio/webm' })); }
      catch (e) { toast('Не удалось сохранить запись', 'warn'); }
    };
    _rec.start(); btn && btn.classList.add('rec');
    const l = btn && btn.querySelector('.rec-lbl'); if (l) l.textContent = 'Стоп ●';
  } catch (e) { stream.getTracks().forEach(t => t.stop()); toast('Ошибка записи', 'warn'); }
}
// Заголовок из текста: если запись начинается с вопроса-промпта, заголовок —
// суть ответа, а не вопрос (иначе все записи из рефлексии называются одинаково).
function titleFrom(tx) {
  const lines = String(tx || '').split('\n').map(s => s.trim()).filter(Boolean);
  const t = (lines.length > 1 && /\?$/.test(lines[0]))
    ? lines.slice(1).join(' ')
    : String(tx || '').replace(/\s+/g, ' ').trim();
  return t.slice(0, 80) + (t.length > 80 ? '…' : '');
}
function saveIns() {
  const tx = $('add-tx').value.trim();
  if (!tx) { toast('Введи текст инсайта', 'warn'); return; }
  const src = $('add-src').value.trim();
  DB.insights.unshift({
    id: Date.now(), tag: STATE.addTag, w: STATE.addW,
    title: titleFrom(tx), body: tx,
    date: dateRU(), createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION,
    src: src||'Вручную', links: extractLinks(tx), media: STATE.addMedia || [],
  });
  STATE.addMedia = []; const am = $('add-media'); if (am) am.innerHTML = '';
  $('add-tx').value=''; $('add-src').value='';
  closeOv('ov-add'); persist(); rIns(); rHIns(); rKPIs(); detectPatterns();
  hptMed(); toast('Инсайт сохранён', 'ok');
  reactToInsight(DB.insights[0]);          // живой отклик вместо молчания
  try { rVector(); } catch (e) {}
}
function openEdit(id) {
  const ins = DB.insights.find(x=>x.id==id);
  if (!ins) return;
  $('edit-id').value = ins.id;
  $('edit-tx').value  = ins.body;
  $('edit-src').value = ins.src||'';
  STATE.editTag = ins.tag; STATE.editW = ins.w||1;
  document.querySelectorAll('#edit-tags .tp').forEach(b => { b.className='tp'; if(b.dataset.t===ins.tag) b.className='tp a-'+ins.tag; });
  document.querySelectorAll('#edit-wts .wp').forEach(b => { b.classList.toggle('on', parseInt(b.dataset.w)===ins.w); });
  openOv('ov-edit');
}
function saveEdit() {
  const id = parseInt($('edit-id').value);
  const tx = $('edit-tx').value.trim();
  if (!tx) { toast('Введи текст', 'warn'); return; }
  const ins = DB.insights.find(x=>x.id===id);
  if (!ins) return;
  ins.tag = STATE.editTag; ins.w = STATE.editW;
  ins.title = titleFrom(tx);
  ins.body  = tx; ins.src = $('edit-src').value.trim()||ins.src;
  ins.links = extractLinks(tx);
  touch(ins);
  persist(); closeOv('ov-edit'); rIns(); rHIns();
  hptMed(); toast('Инсайт обновлён', 'ok');
}
// ─── УДАЛЕНИЕ С ОТМЕНОЙ (undo) ───────────────────────────────────
let _undo = null, _undoTimer = null;
function delUndo(coll, id, renderFn, label) {
  const idx = DB[coll].findIndex(x => x.id === id);
  if (idx < 0) return;
  const item = DB[coll][idx];
  clearTimeout(_undoTimer);
  _undo = { coll, id, item, idx };
  tomb(id);
  DB[coll].splice(idx, 1);
  persist(); renderFn(); hptMed();
  toastUndo(label);
  _undoTimer = setTimeout(() => { _undo = null; }, 6500);
}
function undoDelete() {
  if (!_undo) return;
  const { coll, id, item, idx } = _undo;
  if (DB._del) delete DB._del[id];
  DB[coll].splice(Math.min(idx, DB[coll].length), 0, item);
  _undo = null; clearTimeout(_undoTimer);
  persist();
  // перерисовать всё, что могло зависеть от удалённой записи
  try { rIns(); rHIns(); rKPIs(); detectPatterns(); rDrms(); rPats(); rSpi(); } catch(e) {}
  hptMed(); toast('Восстановлено', 'ok');
}
function toastUndo(msg) {
  const el = document.createElement('div');
  el.className = 'toast t-undo';
  el.innerHTML = `<span>${esc(msg)}</span><button class="toast-undo" onclick="undoDelete();this.closest('.toast').classList.remove('on');setTimeout(()=>this.closest?.('.toast')?.remove?.(),200)">Отменить</button>`;
  $('toasts').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); }, 6000);
}

function deleteIns(id) {
  delUndo('insights', id, () => { rIns(); rHIns(); rKPIs(); detectPatterns(); }, 'Инсайт удалён');
}
function deleteInsConfirm() {
  const id = parseInt($('edit-id').value);
  deleteIns(id); closeOv('ov-edit');
}
function deleteInsFromDet() {
  if (STATE.detId) { deleteIns(STATE.detId); closeOv('ov-det'); }
}
function openEditFromDet() {
  if (STATE.detId) { closeOv('ov-det'); openEdit(STATE.detId); }
}

// ─── СВЯЗИ [[...]] (бэклинки) ─────────────────────────────────────
function extractLinks(body) {
  return [...new Set((String(body||'').match(/\[\[([^\]]+)\]\]/g) || [])
    .map(s => s.slice(2, -2).trim()).filter(Boolean))];
}
// Лёгкий стем: отсекаем хвостовые гласные/ь/ъ/й, чтобы [[выгорании]]
// находило заголовок «Выгорание…» (устойчивость к падежам).
// Лёгкий стем: сначала отсекаем частые падежные окончания на согласную
// (спортом→спорт, домами→дом), затем хвостовые гласные/ь/ъ/й (устойчивость
// к падежам для тематического сопоставления).
const _STEM_ENDS = ['иями','ями','ами','иях','ях','ах','ов','ев','ем','ом','ам','ям','ых','их','ий','ый','ой','ей'];
const stemRu = w => {
  w = String(w || '').toLowerCase().trim();
  for (const s of _STEM_ENDS) { if (w.length - s.length >= 3 && w.endsWith(s)) { w = w.slice(0, -s.length); break; } }
  return w.replace(/[ауеыоэяиюёйьъ]+$/, '');
};
const matchLink = (term, ins) => {
  const s = stemRu(term);
  return s.length >= 3 && ins.title.toLowerCase().includes(s);
};
function renderBody(body) {
  return esc(body).replace(/\[\[([^\]]+)\]\]/g, (m, p1) => {
    const t = p1.trim();
    return `<span class="wl" onclick="openLink(decodeURIComponent('${encodeURIComponent(t)}'))">${esc(t)}</span>`;
  });
}
function openLink(term) {
  const hit = DB.insights.find(i => matchLink(term, i));
  if (hit) { showDet(hit.id); }
  else { closeOv('ov-det'); openOv('ov-search'); const s=$('search-in'); if (s) { s.value=term; runSearch(term); } }
}

// ─── КАРТА СВЯЗЕЙ (граф [[…]]) ───────────────────────────────────
// Узлы — инсайты, участвующие хотя бы в одной связи; рёбра — [[ссылки]]
// между заголовками (через тот же matchLink, что и бэклинки).
// Живой граф-мешок: узлы — И мысли, И сферы; рёбра — темы, упоминания,
// корреляции. «Всё одной сетью», наполняется сам (AI в ДНК).
function buildGraph() {
  const ins = DB.insights || [];
  const sph = DB.spheres || [];
  const nm = {};                    // key → node
  const edges = []; const seen = new Set();
  const iK = id => 'i' + id, sK = id => 's' + id;
  const addIns = i => { const k = iK(i.id); if (!nm[k]) nm[k] = { key:k, type:'insight', eid:i.id, title:i.title, color:SC[i.tag]||'var(--t3)', deg:0 }; return k; };
  const addSph = s => { const k = sK(s.id); if (!nm[k]) nm[k] = { key:k, type:'sphere', eid:s.id, title:(s.icon?s.icon+' ':'')+s.name, color:s.color||'var(--blue-t)', deg:0 }; return k; };
  const addEdge = (a, b) => { if (a === b) return; const key = a < b ? a+'|'+b : b+'|'+a; if (seen.has(key)) return; seen.add(key); edges.push({ a, b }); nm[a].deg++; nm[b].deg++; };
  // мысль ↔ мысль: ручные [[ссылки]] всегда; автосвязи — только сильные
  // (по редким общим темам, tf-idf) и не более 3 на узел, чтобы граф
  // показывал структуру, а не «всё со всем» (опыт Obsidian/Reflect).
  ins.forEach(a => (a.links || []).forEach(l => { const b = ins.find(x => x.id !== a.id && matchLink(l, x)); if (b) { addIns(a); addIns(b); addEdge(iK(a.id), iK(b.id)); } }));
  const T = themeIndex();
  const cand = [];
  for (let i = 0; i < ins.length; i++) for (let j = i + 1; j < ins.length; j++) {
    const { hits, score } = themeOverlap(T.kws.get(ins[i].id), T.kws.get(ins[j].id), T);
    if (hits >= 2) cand.push({ a: ins[i], b: ins[j], score });
  }
  cand.sort((x, y) => y.score - x.score);
  const autoDeg = {};
  cand.forEach(c => {
    const ka = iK(c.a.id), kb = iK(c.b.id);
    if ((autoDeg[ka] || 0) >= 3 || (autoDeg[kb] || 0) >= 3) return;
    const before = edges.length;
    addIns(c.a); addIns(c.b); addEdge(ka, kb);
    if (edges.length > before) { autoDeg[ka] = (autoDeg[ka] || 0) + 1; autoDeg[kb] = (autoDeg[kb] || 0) + 1; }
  });
  // мысль ↔ сфера: текст записи задевает тему сферы
  sph.forEach(s => {
    const skw = new Set(keywords(s.name)); if (!skw.size) return;
    ins.forEach(i => { if ((T.kws.get(i.id) || []).some(w => skw.has(w))) { addSph(s); addIns(i); addEdge(sK(s.id), iK(i.id)); } });
  });
  // сфера ↔ сфера: статистическая связь по дням
  const numSph = sph.filter(s => ['score','counter','goal'].includes(s.type));
  const vbd = s => { const m = {}; DB.sphereLogs.filter(l => l.sphereId === s.id && l.date).forEach(l => { const v = +l.value; if (!Number.isNaN(v)) m[l.date] = v; }); return m; };
  for (let a = 0; a < numSph.length; a++) for (let b = a+1; b < numSph.length; b++) {
    const A = vbd(numSph[a]), B = vbd(numSph[b]); const days = Object.keys(A).filter(d => d in B);
    if (days.length < 5) continue;
    const r = pearson(days.map(d => A[d]), days.map(d => B[d]));
    if (r != null && Math.abs(r) >= 0.4) { addSph(numSph[a]); addSph(numSph[b]); addEdge(sK(numSph[a].id), sK(numSph[b].id)); }
  }
  return { nodes: Object.values(nm), edges };
}
// Детерминированная силовая раскладка. Несвязанные компоненты в FR
// разлетаются по углам, поэтому каждая раскладывается отдельно и
// занимает свою ячейку сетки (так делают Gephi/Obsidian), затем общий
// проход коллизий следит, чтобы узлы и подписи не наезжали.
function layoutGraph(nodes, edges, W, H) {
  const n = nodes.length; if (!n) return;
  const byId = {}; nodes.forEach(nd => byId[nd.key] = nd);
  const adj = {}; nodes.forEach(nd => adj[nd.key] = []);
  edges.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
  const comps = [], compOf = {};
  nodes.forEach(nd => {
    if (compOf[nd.key] != null) return;
    const c = [], st = [nd.key]; compOf[nd.key] = comps.length;
    while (st.length) { const k = st.pop(); c.push(byId[k]); adj[k].forEach(m => { if (compOf[m] == null) { compOf[m] = comps.length; st.push(m); } }); }
    comps.push(c);
  });
  comps.sort((a, b) => b.length - a.length);
  const mx = 30, myT = 26, myB = 42;                 // снизу запас под подписи
  const cols = Math.ceil(Math.sqrt(comps.length)), rows = Math.ceil(comps.length / cols);
  const cw = (W - mx * 2) / cols, ch = (H - myT - myB) / rows;
  comps.forEach((comp, ci) => {
    const bx = mx + (ci % cols) * cw, by = myT + Math.floor(ci / cols) * ch;
    const inC = new Set(comp.map(nd => nd.key));
    fdLayout(comp, edges.filter(e => inC.has(e.a)), byId, cw, ch);
    // нормализуем компоненту в её ячейку (внутренний отступ 16)
    const pad = 16;
    const xs = comp.map(nd => nd.x), ys = comp.map(nd => nd.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    comp.forEach(nd => {
      nd.x = bx + (x1 - x0 > 1 ? pad + (nd.x - x0) / (x1 - x0) * (cw - pad * 2) : cw / 2);
      nd.y = by + (y1 - y0 > 1 ? pad + (nd.y - y0) / (y1 - y0) * (ch - pad * 2) : ch / 2);
    });
  });
  // Финальные проходы коллизий: узлы (с запасом под подпись) не наезжают.
  for (let p = 0; p < 40; p++) {
    let moved = false;
    for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) {
      const A = nodes[i], B = nodes[j];
      const min = (A.r || 10) + (B.r || 10) + 12;
      let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.01;
      if (d < min) {
        const push = (min - d) / 2; dx /= d; dy /= d; moved = true;
        A.x = Math.max(mx, Math.min(W - mx, A.x - dx * push));
        A.y = Math.max(myT, Math.min(H - myB, A.y - dy * push));
        B.x = Math.max(mx, Math.min(W - mx, B.x + dx * push));
        B.y = Math.max(myT, Math.min(H - myB, B.y + dy * push));
      }
    }
    if (!moved) break;
  }
}
// Fruchterman–Reingold для одной компоненты в виртуальном боксе W×H.
function fdLayout(nodes, edges, byId, W, H) {
  const n = nodes.length;
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2;
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2;
    nd.x = cx + Math.cos(a) * R * 0.6;
    nd.y = cy + Math.sin(a) * R * 0.6;
    nd.vx = 0; nd.vy = 0;
  });
  if (n === 1) return;
  const k = Math.max(46, Math.min(W, H) / Math.sqrt(n) * 0.9);   // длина ребра
  const ITER = 180;
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) {
      const A = nodes[i], B = nodes[j];
      let dx = A.x-B.x, dy = A.y-B.y, d = Math.hypot(dx, dy) || 0.01;
      const f = (k*k) / d; dx /= d; dy /= d;
      A.vx += dx*f; A.vy += dy*f; B.vx -= dx*f; B.vy -= dy*f;
    }
    edges.forEach(e => {
      const A = byId[e.a], B = byId[e.b];
      let dx = A.x-B.x, dy = A.y-B.y, d = Math.hypot(dx, dy) || 0.01;
      const f = (d*d) / k; dx /= d; dy /= d;
      A.vx -= dx*f; A.vy -= dy*f; B.vx += dx*f; B.vy += dy*f;
    });
    const t = 0.85 * (1 - it / (ITER + 20));       // остывание
    nodes.forEach(nd => {
      nd.vx += (cx - nd.x) * 0.015; nd.vy += (cy - nd.y) * 0.015;  // к центру
      const vm = Math.hypot(nd.vx, nd.vy) || 0.01;
      const step = Math.min(vm, k) * t;
      nd.x += (nd.vx / vm) * step; nd.y += (nd.vy / vm) * step;
      nd.vx *= 0.5; nd.vy *= 0.5;
    });
  }
}
function rGraph(elId, height, compact) {
  const el = $(elId || 'graph-canvas'); if (!el) return;
  const { nodes, edges } = buildGraph();
  if (!nodes.length) {
    el.innerHTML = `<div class="empty"><div class="em-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--t3)"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg></div><div class="em-t">Сеть пока пуста</div><div class="em-d">Добавляй записи и сферы — связи между ними появятся здесь сами, по общим темам</div></div>`;
    return;
  }
  const W = el.clientWidth || 340, H = height || 380;
  nodes.forEach(nd => { nd.r = 5 + Math.min(nd.deg, 5) * 1.6; });   // компактнее: max ~13
  layoutGraph(nodes, edges, W, H);
  const byId = {}; nodes.forEach(nd => byId[nd.key] = nd);
  // Выбор узла (тап): подсвечиваем окружение, остальное гасим (паттерн Obsidian).
  if (_gSel && !byId[_gSel]) _gSel = null;
  const sel = _gSel ? byId[_gSel] : null;
  const neigh = new Set();
  if (sel) edges.forEach(e => { if (e.a === _gSel) neigh.add(e.b); if (e.b === _gSel) neigh.add(e.a); });
  const lines = edges.map(e => {
    const A = byId[e.a], B = byId[e.b];
    const cls = sel ? (e.a === _gSel || e.b === _gSel ? 'gedge on' : 'gedge dim') : 'gedge';
    return `<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" class="${cls}"/>`;
  }).join('');
  // Подписи: приоритет крупным узлам, жадное размещение без наездов.
  const lblOf = {}, placed = [];
  if (!compact) {
    [...nodes].sort((a, b) => b.deg - a.deg).slice(0, 12).forEach(nd => {
      const short = nd.title.length > 18 ? nd.title.slice(0, 17) + '…' : nd.title;
      const w = short.length * 5.6 + 8, y = nd.y + nd.r + 11;
      const x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, nd.x));   // не за край
      const box = { x1: x - w / 2, x2: x + w / 2, y1: y - 9, y2: y + 3 };
      if (placed.some(b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2))) return;
      placed.push(box); lblOf[nd.key] = { short, y, x };
    });
  }
  const eid = elId || 'graph-canvas';
  const circ = nodes.map(nd => {
    const r = nd.r;
    const lb = lblOf[nd.key];
    const label = lb ? `<text x="${lb.x.toFixed(1)}" y="${lb.y.toFixed(1)}" class="glbl">${esc(lb.short)}</text>` : '';
    const click = compact
      ? (nd.type === 'sphere' ? `openSphereLog(${nd.eid})` : `showDet(${nd.eid})`)
      : `gSelect('${nd.key}','${eid}',${H})`;
    const dim = sel && nd.key !== _gSel && !neigh.has(nd.key) ? ' gdim' : '';
    const ring = nd.key === _gSel ? `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${r + 4}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>` : '';
    // сферы — скруглённый квадрат (узел жизни), мысли — круг
    const shape = nd.type === 'sphere'
      ? `<rect x="${(nd.x-r).toFixed(1)}" y="${(nd.y-r).toFixed(1)}" width="${(r*2)}" height="${(r*2)}" rx="${(r*0.5).toFixed(1)}" fill="${nd.color}"/>`
      : `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${r}" fill="${nd.color}"/>`;
    return `<g class="gnode${dim}" onclick="event.stopPropagation();${click}">${ring}${shape}${label}</g>`;
  }).join('');
  const nIns = nodes.filter(n => n.type === 'insight').length, nSph = nodes.filter(n => n.type === 'sphere').length;
  const meta = [nIns ? nIns + ' ' + pl(nIns,'мысль','мысли','мыслей') : '', nSph ? nSph + ' ' + pl(nSph,'сфера','сферы','сфер') : '']
    .filter(Boolean).join(' + ') + ` · ${edges.length} ${pl(edges.length,'связь','связи','связей')}` + (compact ? ' · открыть карту →' : '');
  // Инфопанель выбранного узла: полный заголовок + переход к записи.
  const info = sel
    ? `<div class="ginfo"><div class="gi-t">${esc(sel.title)}<i>${neigh.size} ${pl(neigh.size,'связь','связи','связей')}</i></div><button class="gi-open" onclick="${sel.type === 'sphere' ? `openSphereLog(${sel.eid})` : `showDet(${sel.eid})`}">Открыть →</button></div>`
    : `<div class="graph-meta">${meta}${compact ? '' : ' · тапни узел'}</div>`;
  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="graph-svg" preserveAspectRatio="xMidYMid meet"${compact ? '' : ` onclick="gSelect(null,'${eid}',${H})"`}>${lines}${circ}</svg>` + info;
}
let _gSel = null;
function gSelect(key, elId, h) {
  _gSel = (key && _gSel !== key) ? key : null;
  hpt(); rGraph(elId, h, false);
}

// ─── ДЕТАЛИ ──────────────────────────────────────────────────────
function showDet(id) {
  const ins = DB.insights.find(x=>x.id==id);
  if (!ins) return;
  STATE.detId = ins.id;
  $('det-meta').innerHTML = `<span class="tag ${TC[ins.tag]||'tg-personal'}">${TL[ins.tag]||ins.tag}</span><span class="pips">${pips(ins.w||1)}</span><span style="font-size:var(--tx2);font-weight:500;color:var(--t3);margin-left:auto">${dispDate(ins)} · ${esc(ins.src||'')}</span>`;
  $('det-title').textContent = ins.title;
  $('det-body').innerHTML    = renderBody(ins.body);
  rDetMedia(ins);
  // Связи находятся АВТОМАТИЧЕСКИ по темам (общие ключевые слова), плюс
  // ручные [[ссылки]]/бэклинки, если есть. Ничего вписывать не нужно.
  const related = relatedByTheme(ins, 5);
  const out  = ins.links || [];
  const back = DB.insights.filter(x => x.id !== ins.id && (x.links||[]).some(l => matchLink(l, ins)));
  let html = '';
  if (related.length) html += `<div class="det-rel"><b>Похожие по теме</b> ${related.map(r => `<span class="wl" onclick="showDet(${r.ins.id})">${esc(r.ins.title)}</span>`).join(' · ')}</div>`;
  if (out.length)  html += `<div class="det-rel"><b>Ссылается на</b> ${out.map(l => `<span class="wl" onclick="openLink(decodeURIComponent('${encodeURIComponent(l)}'))">${esc(l)}</span>`).join(' · ')}</div>`;
  if (back.length) html += `<div class="det-rel"><b>Упоминается в</b> ${back.map(x => `<span class="wl" onclick="showDet(${x.id})">${esc(x.title)}</span>`).join(' · ')}</div>`;
  if (!html) html = `<div class="det-hint">Пересечений с другими записями пока нет — они появятся сами, когда темы начнут повторяться.</div>`;
  // Психологический разбор по методу «Зачем?» (если ИИ уже разметил)
  if (ins.psy && (ins.psy.func || ins.psy.need)) {
    const p = ins.psy;
    const row = (k, v) => v ? `<div class="psy-row"><span>${k}</span><div>${esc(v)}</div></div>` : '';
    const rel = psyRelated(ins, 3);
    html += `<div class="psy-box"><div class="psy-box-t">Разбор по методу «Зачем?»</div>
      ${row('Симптом', p.symptom)}${row('Функция', p.func)}${row('Вторичная выгода', p.gain)}
      ${row('Потребность', p.need)}${row('Состояние Я', p.ego)}${row('Эмоция', p.emotion)}${row('Игра', p.game)}
      ${rel.length ? `<div class="psy-row"><span>Та же потребность</span><div>${rel.map(r => `<span class="wl" onclick="showDet(${r.id})">${esc(r.title.slice(0, 34))}</span>`).join(' · ')}</div></div>` : ''}
    </div>`;
  }
  html += `<div style="margin-top:var(--s3)"><button class="btn btn-s btn-sm" onclick="closeOv('ov-det');openChatFor(${ins.id})">💬 Обсудить глубже</button></div>`;
  $('det-links').innerHTML = html;
  const da = $('det-analysis'); if (da) da.innerHTML = '';
  openOv('ov-det');
}
// ─── АВТОСВЯЗИ ПО ТЕМАМ (без ручных [[…]]) ──────────────────────
// Стоп-слова + лёгкий стем: находим записи с общими значимыми словами.
const RU_STOP = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по ' +
  'только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был ' +
  'него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы ' +
  'тебя их чем была сам чтоб без будто чего раз тоже себе под будет тогда кто этот того потому этого какой ' +
  'совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец ' +
  'два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем ' +
  'хорошо свою этой перед иногда лучше чуть том нельзя такой более всегда конечно всю между это очень нужно ' +
  'этих своей своих свои есть быть меня очень просто').split(/\s+/));
// Второй заслон — на уровне СТЕМОВ: местоимения-прилагательные («которые»),
// модальные («должен», «нужно»), пустые глаголы («думать», «говорить») и
// ультра-общие слова дневника («время», «жизнь», «момент») не несут темы —
// без этого фильтра они становятся ложными «хабами» карты.
const STEM_STOP = new Set(('котор должн должен нужн нужен можн нельз прост стал стан буд был быва действительн наверн возможн кажет например конечн точн правд однак вообщ именн кажд люб так такж тож иногд всегд сегодн завтр вчер сраз дале зат почем зач сколь нескольк немног мног мал боле мене сам сво себ соб мен теб нам вам очен хоч хот хотел дела сдела делаю говор сказа дума поня понима знаю знал вид видел смотр смотрел ид идёт пошл пошел получа получ получил происход произошл явля момент врем времен ден недел месяц год человек люд жизн жизнь дел вещ ситуац вопрос ответ слов текст запис мысл штук притом причём хорош плох нормальн наверно либ пришл сказал скаж виж прям важн сторон постоянн состоян состояни').split(/\s+/));
function keywords(text) {
  return [...new Set(String(text || '').toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ')
    .split(/\s+/).filter(w => w.length >= 4 && !RU_STOP.has(w)).map(stemRu)
    .filter(w => w.length >= 3 && !STEM_STOP.has(w)))];
}
// Вес слова обратен его частоте (tf-idf): слово из вопросов-промптов или
// общеупотребимое встречается почти везде и темой НЕ является. Иначе граф
// связывает «всё со всем» через буллерплейт — каша вместо смысла.
function themeIndex() {
  const list = DB.insights || [];
  const N = list.length, df = {}, kws = new Map();
  list.forEach(i => {
    const kw = keywords((i.title || '') + ' ' + (i.body || ''));
    kws.set(i.id, kw);
    kw.forEach(w => { df[w] = (df[w] || 0) + 1; });
  });
  const cut = Math.max(2, Math.ceil(N * 0.4));       // в ≥40% записей — фон
  return {
    kws, N,
    informative: w => N < 5 || (df[w] || 0) <= cut,
    idf: w => Math.log(1 + N / (df[w] || 1)),
  };
}
function themeOverlap(aKw, bKw, T) {
  const bs = new Set(bKw || []);
  let hits = 0, score = 0;
  (aKw || []).forEach(w => { if (bs.has(w) && T.informative(w)) { hits++; score += T.idf(w); } });
  return { hits, score };
}
function relatedByTheme(ins, limit) {
  const T = themeIndex();
  const mine = T.kws.get(ins.id) || keywords((ins.title || '') + ' ' + (ins.body || ''));
  if (mine.length < 2) return [];
  return (DB.insights || []).filter(x => x.id !== ins.id).map(x => {
    const { hits, score } = themeOverlap(mine, T.kws.get(x.id), T);
    return { ins: x, overlap: hits, score };
  }).filter(s => s.overlap >= 2).sort((a, b) => b.score - a.score).slice(0, limit || 5);
}

// ═════════════════════════════════════════════════════════════════
//  ЖИВАЯ СЕТЬ (AI в ДНК): непрерывно находит кросс-доменные связи
//  между темами записей, чек-инами и сферами. Локально, честно по n.
// ═════════════════════════════════════════════════════════════════
const _mean = a => a.reduce((x, y) => x + y, 0) / a.length;
// Карта «стем → читаемая словоформа» для показа человеку (не стем «выгоран»,
// а «выгорание»). Берём самую короткую встреченную форму — близка к базовой.
function themeForms() {
  const forms = {};
  (DB.insights || []).forEach(i => {
    String((i.title || '') + ' ' + (i.body || '')).toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ')
      .split(/\s+/).filter(w => w.length >= 4 && !RU_STOP.has(w)).forEach(w => {
        const s = stemRu(w); if (s.length < 3 || STEM_STOP.has(s)) return;
        if (!forms[s] || w.length < forms[s].length) forms[s] = w;
      });
  });
  return forms;
}
function livingLinks() {
  const out = [];
  const forms = themeForms();
  const show = s => forms[s] || s;
  const dayState = {}; (DB.checkins || []).forEach(c => { if (c.date) { const v = dayComposite(c); if (v != null) dayState[c.date] = v; } });
  const stateDays = Object.keys(dayState);
  // A) Тема записей ↔ состояние в тот же день (кросс: смысл ↔ самочувствие)
  if (stateDays.length >= 6) {
    const themeDays = {};
    (DB.insights || []).forEach(i => {
      const d = i.day || String(i.createdAt || '').slice(0, 10);
      if (!dayState[d]) return;
      keywords((i.title || '') + ' ' + (i.body || '')).forEach(w => (themeDays[w] || (themeDays[w] = new Set())).add(d));
    });
    Object.keys(themeDays).forEach(w => {
      const inDays = [...themeDays[w]];
      if (inDays.length < 3) return;
      const outDays = stateDays.filter(d => !themeDays[w].has(d));
      if (outDays.length < 3) return;
      const diff = _mean(inDays.map(d => dayState[d])) - _mean(outDays.map(d => dayState[d]));
      if (Math.abs(diff) >= 0.8) out.push({ kind: 'theme-state', theme: w, n: inDays.length, strength: Math.abs(diff),
        text: `Когда всплывает тема «${show(w)}», твоё состояние ${diff > 0 ? 'выше' : 'ниже'} на ${Math.abs(diff).toFixed(1)} балла` });
    });
  }
  // B) Сфера ↔ сфера (кросс: одна область жизни тянет другую)
  const numSph = (DB.spheres || []).filter(s => ['score', 'counter', 'goal'].includes(s.type));
  const valByDate = s => { const m = {}; DB.sphereLogs.filter(l => l.sphereId === s.id && l.date).forEach(l => { const v = +l.value; if (!Number.isNaN(v)) m[l.date] = v; }); return m; };
  for (let i = 0; i < numSph.length; i++) for (let j = i + 1; j < numSph.length; j++) {
    const A = valByDate(numSph[i]), B = valByDate(numSph[j]);
    const days = Object.keys(A).filter(d => d in B);
    if (days.length < 5) continue;
    const r = pearson(days.map(d => A[d]), days.map(d => B[d]));
    if (r != null && Math.abs(r) >= 0.4) out.push({ kind: 'sphere-sphere', n: days.length, strength: Math.abs(r),
      text: `В дни, когда больше «${numSph[i].name}», ${r > 0 ? 'больше' : 'меньше'} и «${numSph[j].name}»` });
  }
  // C) Повтор темы по дню недели (кросс: смысл ↔ время)
  const WD = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
  const themeWd = {};
  (DB.insights || []).forEach(i => {
    const d = i.day || String(i.createdAt || '').slice(0, 10); const t = Date.parse(d + 'T00:00:00'); if (!t) return;
    const wd = new Date(t).getDay();
    keywords((i.title || '') + ' ' + (i.body || '')).forEach(w => { const o = themeWd[w] || (themeWd[w] = { total: 0, wd: {} }); o.total++; o.wd[wd] = (o.wd[wd] || 0) + 1; });
  });
  Object.keys(themeWd).forEach(w => {
    const o = themeWd[w]; if (o.total < 4) return;
    const top = Object.keys(o.wd).sort((a, b) => o.wd[b] - o.wd[a])[0];
    if (o.wd[top] >= 3 && o.wd[top] / o.total >= 0.6) out.push({ kind: 'theme-weekday', n: o.total, strength: 0.6 + o.wd[top] / o.total,
      text: `Тема «${show(w)}» чаще всего всплывает по ${WD[top]} (${o.wd[top]} из ${o.total})` });
  });
  return out.sort((a, b) => b.strength - a.strength);
}
function rAmbient(elId) {
  const el = $(elId); if (!el) return;
  const links = livingLinks();
  if (!links.length) { el.innerHTML = ''; return; }
  // Разные типы связей — чтобы читалось как сеть, а не повтор одной находки.
  const top = [], usedKind = new Set();
  for (const l of links) { if (usedKind.has(l.kind)) continue; usedKind.add(l.kind); top.push(l); if (top.length === 2) break; }
  el.innerHTML = top.map(l => {
    const conf = confLabel(l.n);
    return `<div class="amb" onclick="goTo('map');msub('graph')" role="button">
      <div class="amb-ic">🕸</div>
      <div class="amb-body"><div class="amb-t">${esc(l.text)}</div>
        <div class="amb-sub">Живая связь · <span class="amb-conf ${conf.cls}">${conf.t}</span></div></div>
    </div>`;
  }).join('');
}

// ─── СЛОЙ 2: AI-СИНТЕЗ «ЖИВАЯ КАРТА ЖИЗНИ» ──────────────────────
// Claude читает готовые кросс-доменные сигналы (Слой 1) и пишет связный
// нарратив: как связаны сферы/состояние/темы. Кэш в DB.livingMap,
// обновляется при заметном изменении данных; амбиентно (1 раз за сессию).
function livingMapContext() {
  const links = livingLinks().slice(0, 6).map(l => '— ' + l.text);
  const si = smartInsights(); const helps = (si.items || []).map(i => '— ' + i.text);
  const sph = (DB.spheres || []).map(s => {
    const st = sphereStats(s.id) || {};
    let v = ''; if (s.type === 'habit') v = 'постоянство ' + (st.consistency||0) + '%';
    else if (st.avg != null) v = 'сред. ' + st.avg.toFixed(1);
    else if (st.last != null) v = '' + st.last;
    return `— ${s.name} (${SPHERE_TYPES[s.type]?.lbl || s.type}${v ? ', ' + v : ''})`;
  });
  return 'Связи (сферы/состояние/темы):\n' + (links.length ? links.join('\n') : '— мало данных') +
    '\n\nЧто помогает:\n' + (helps.length ? helps.join('\n') : '— мало данных') +
    '\n\nСферы:\n' + (sph.length ? sph.join('\n') : '— нет');
}
function livingMapSig() { return (DB.insights||[]).length + '-' + (DB.checkins||[]).length + '-' + (DB.sphereLogs||[]).length; }
async function aiLivingMap(force) {
  if (!getAiKey()) { if (force) { toast('Добавь ключ Anthropic в Настройки', 'warn'); goTo('settings'); } return; }
  const el = $('livingmap-out'), btn = $('livingmap-btn');
  if (el && !(DB.livingMap && DB.livingMap.text)) el.innerHTML = `<div class="deeper deeper-load">Claude собирает живую карту…</div>`;
  if (btn) btn.disabled = true;
  try {
    const user = livingMapContext() +
      '\n\nНапиши тёплый связный текст (4–6 предложений): как СЕЙЧАС связана моя жизнь — покажи, как темы, состояние и сферы влияют друг на друга; назови 1–2 глубоких паттерна через разные области. По-русски, на «ты», без клише и морализаторства. Заверши одним мягким вопросом.';
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 420, task: 'map' });
    const t = (text || '').trim(); if (!t) throw new Error('пустой ответ');
    DB.livingMap = { text: t, ts: Date.now(), sig: livingMapSig() };
    persist(); rLivingMap('livingmap-out'); if (typeof hptMed === 'function') hptMed();
  } catch (e) {
    if (e.noKey) goTo('settings');
    toast('AI: ' + e.message, 'warn');
    if (el && !(DB.livingMap && DB.livingMap.text)) el.innerHTML = '';
  } finally { if (btn) btn.disabled = false; }
}
let _livingMapTried = false;
function rLivingMap(elId) {
  const el = $(elId); if (!el) return;
  const lm = DB.livingMap, stale = !lm || lm.sig !== livingMapSig();
  if (lm && lm.text) {
    const age = Math.round((Date.now() - lm.ts) / 864e5);
    el.innerHTML = `<div class="lmap-t">${esc(lm.text)}</div>` +
      `<div class="lmap-meta">🕸 Живая карта · ${age === 0 ? 'сегодня' : age + ' дн назад'}${stale ? ' · есть новые данные' : ''}</div>`;
  } else {
    el.innerHTML = `<div class="lmap-empty">Живая карта соберётся из связей между твоими записями, состоянием и сферами${getAiKey() ? '' : ' — добавь ключ Anthropic в Настройках'}.</div>`;
  }
  // амбиентно: один раз за сессию дособираем, если ключ есть и данные изменились
  if (stale && getAiKey() && !_livingMapTried && livingLinks().length >= 2) { _livingMapTried = true; aiLivingMap(false); }
}
// AI-разбор сохранённой записи: тёплая интерпретация + мягкий вопрос.
async function aiAnalyzeDet() {
  const ins = DB.insights.find(x => x.id === STATE.detId);
  if (!ins) return;
  if (!getAiKey()) { toast('Добавь ключ Anthropic в Настройки', 'warn'); closeOv('ov-det'); goTo('settings'); return; }
  const slot = $('det-analysis'), btn = $('det-ai-btn');
  if (slot) slot.innerHTML = `<div class="deeper deeper-load">Claude вчитывается…</div>`;
  if (btn) btn.disabled = true;
  try {
    const rel = relatedByTheme(ins, 4).map(r => r.ins.title);
    const user = `Моя запись:\nЗаголовок: ${ins.title}` +
      (ins.body && ins.body !== ins.title ? `\nТекст: ${ins.body}` : '') +
      (rel.length ? `\n\nПохожие мои записи по теме: ${rel.join('; ')}.` : '') +
      `\n\nСделай короткий тёплый разбор (3–4 предложения): что здесь на самом деле про меня — чувство/потребность/паттерн под текстом; если видно повторение с похожими записями — назови его бережно. Заверши одним мягким вопросом. По-русски, без клише и морализаторства.`;
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 320, task: 'analysis' });
    const t = (text || '').trim();
    if (!t) throw new Error('пустой ответ');
    if (slot) slot.innerHTML = `<div class="deeper"><div class="deeper-an">${esc(t)}</div></div>`;
    hpt();
  } catch (e) {
    if (e.noKey) { closeOv('ov-det'); goTo('settings'); }
    if (slot) slot.innerHTML = '';
    toast('AI: ' + e.message, 'warn');
  } finally { if (btn) btn.disabled = false; }
}
function shareIns() {
  const ins = DB.insights.find(x=>x.id===STATE.detId);
  if (!ins) return;
  const text = `${ins.title}\n\n${ins.body}`;
  if (navigator.share) {
    navigator.share({title:'Инсайт', text}).catch(()=>{});
  } else {
    navigator.clipboard?.writeText(text);
    toast('Скопировано в буфер', 'ok');
  }
}

// ─── СЕЛЕКТОРЫ ───────────────────────────────────────────────────
function sTag(b)    { document.querySelectorAll('#add-tags .tp').forEach(x=>x.className='tp'); b.className='tp a-'+b.dataset.t; STATE.addTag=b.dataset.t; }
function sW(b)      { document.querySelectorAll('#add-wts .wp').forEach(x=>x.classList.remove('on')); b.classList.add('on'); STATE.addW=parseInt(b.dataset.w); }
function sTagEdit(b){ document.querySelectorAll('#edit-tags .tp').forEach(x=>x.className='tp'); b.className='tp a-'+b.dataset.t; STATE.editTag=b.dataset.t; }
function sWEdit(b)  { document.querySelectorAll('#edit-wts .wp').forEach(x=>x.classList.remove('on')); b.classList.add('on'); STATE.editW=parseInt(b.dataset.w); }
function sAct(b)    { document.querySelectorAll('#ci-act .tp').forEach(x=>x.className='tp'); b.className='tp a-moss'; STATE.ciAct=b.dataset.a; }
function sTone(b)   { document.querySelectorAll('#ci-tone .tp').forEach(x=>x.className='tp'); b.className='tp a-moss'; STATE.ciTone=b.dataset.to; }
function sDT(b)     { document.querySelectorAll('#drm-tone .tp').forEach(x=>x.className='tp'); b.className='tp a-dream'; STATE.drmTone=b.dataset.dt; }
function sPT(b)     { document.querySelectorAll('#pat-types .tp').forEach(x=>x.className='tp'); b.className='tp a-pattern'; STATE.patType=b.dataset.pt; }
function sSPT(b)    { document.querySelectorAll('#spi-types .tp').forEach(x=>x.className='tp'); b.className='tp a-spirit'; STATE.spiType=b.dataset.spt; }
function sEL(b)     { document.querySelectorAll('#evo-lvls .wp').forEach(x=>x.classList.remove('on')); b.classList.add('on'); STATE.evoLv=parseInt(b.dataset.lv); }
function sAxColor(b){ document.querySelectorAll('#ov-axis-new .tp').forEach(x=>x.classList.remove('on')); b.classList.add('on'); STATE.newAxColor=b.dataset.ac; }

// ─── CHECK-IN ────────────────────────────────────────────────────
// ─── RULER: называние эмоций (механика How We Feel, низкое трение) ──
// Сетка эмоций по квадрантам «энергия × приятность». Повышает
// эмоциональную грамотность; сохраняется в чек-ин как emo.
const EMOTIONS = [
  { c:'#F5B84B', list:['Радость','Воодушевление','Энергичность'] }, // высокая энергия · приятно
  { c:'#FB7185', list:['Злость','Тревога','Раздражение'] },          // высокая энергия · неприятно
  { c:'#34D399', list:['Спокойствие','Умиротворение','Благодарность'] }, // низкая · приятно
  { c:'#4C8DFF', list:['Грусть','Усталость','Опустошённость'] },     // низкая · неприятно
];
function rEmoPicker() {
  const el = $('ci-emo'); if (!el) return;
  STATE.ciEmo = (DB.vit && DB.vit.date === todayKey() && DB.vit.emo) ? DB.vit.emo : '';
  el.innerHTML = EMOTIONS.map(g => g.list.map(e =>
    `<button class="emo${e===STATE.ciEmo?' on':''}" style="--ec:${g.c}" data-e="${esc(e)}" onclick="sEmo(this)">${esc(e)}</button>`
  ).join('')).join('');
}
function sEmo(btn) {
  const wasOn = btn.classList.contains('on');
  document.querySelectorAll('#ci-emo .emo').forEach(x => x.classList.remove('on'));
  if (!wasOn) { btn.classList.add('on'); STATE.ciEmo = btn.dataset.e; } else STATE.ciEmo = '';
  if (typeof hpt === 'function') hpt();
}
function saveCI() {
  const v = {
    sl: parseFloat($('ci-sl').value), sq: parseInt($('ci-sq').value),
    cl: parseInt($('ci-cl').value), st: parseInt($('ci-st').value), mv: parseInt($('ci-mv').value),
    nic: $('tog-nic').classList.contains('on'),
    caf: $('tog-caf').classList.contains('on'),
    alc: $('tog-alc').classList.contains('on'),
    sugar: $('tog-sugar').classList.contains('on'),
    act: STATE.ciAct, tone: STATE.ciTone, emo: STATE.ciEmo || '', note: $('ci-note').value, ci: true, date: todayKey(),
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  };
  DB.vit = v;
  const existing = DB.checkins.findIndex(c=>c.date===v.date);
  const ci = {...v, id: existing>=0 ? DB.checkins[existing].id : Date.now()};
  if (existing>=0) DB.checkins[existing] = ci; else DB.checkins.push(ci);
  closeOv('ov-ci'); persist(); rVit(); rCompass(); rHState(); rStreak();
  // Содержательное — в карточку отклика (не в мимолётный тост, П2 брифа)
  hptMed(); toast('Check-in сохранён', 'ok');
  reactToCheckin((v.cl + v.mv + (10-v.st)) / 3);
  try { rVector(); } catch (e) {}
}

// ─── EVIDENCE KERNEL (ядро «паспорта данных») ────────────────────
// Правило ядра: оригинал записи неизменен (immutable). Исправление — это
// отдельное append-only событие в DB.corrections; «текущее принятое» значение
// вычисляется проекцией при чтении (оригинал ⊕ коррекции по порядку времени).
// Так исправления не теряют историю, синкаются как обычные записи и не могут
// молча подменить факт.
function addCorrection(coll, targetId, patch, reason) {
  if (!coll || targetId == null || !patch || typeof patch !== 'object') return null;
  const c = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    kType: 'correction', coll, targetId, patch: { ...patch }, reason: reason || '',
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  };
  if (!Array.isArray(DB.corrections)) DB.corrections = [];
  DB.corrections.push(c);
  persist();
  return c;
}
// Проекция записи: оригинал + все её коррекции (по времени). Оригинал не мутируется.
function proj(coll, rec) {
  if (!rec || rec.id == null) return rec;
  const cs = (DB.corrections || []).filter(c => c && c.coll === coll && c.targetId === rec.id);
  if (!cs.length) return rec;
  cs.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  const out = { ...rec };
  cs.forEach(c => Object.assign(out, c.patch));
  out._corrected = cs.length;
  return out;
}
const projAll = (coll) => (DB[coll] || []).map(r => proj(coll, r));

// ─── MOMENTARY STATE ─────────────────────────────────────────────
// Быстрый двухосевой ввод состояния «здесь и сейчас»: приятность (valence)
// × энергия (activation), опц. эмоция и заметка. Отдельный от дневного
// чек-ина поток. Каждая запись несёт минимальный «паспорт данных»
// (kType/verif/life) — зачаток Evidence Kernel: это САМООТЧЁТ, а не факт,
// диагноз или причинный вывод. Цвет/эмоция — персональный сигнал, не тест.
function rMomEmo() {
  const el = $('mo-emo'); if (!el) return;
  el.innerHTML = EMOTIONS.map(g => g.list.map(e =>
    `<button class="emo${e===STATE.moEmo?' on':''}" style="--ec:${g.c}" data-e="${esc(e)}" onclick="sMomEmo(this)">${esc(e)}</button>`
  ).join('')).join('');
}
function sMomEmo(btn) {
  const wasOn = btn.classList.contains('on');
  document.querySelectorAll('#mo-emo .emo').forEach(x => x.classList.remove('on'));
  if (!wasOn) { btn.classList.add('on'); STATE.moEmo = btn.dataset.e; } else STATE.moEmo = '';
  if (typeof hpt === 'function') hpt();
}
function saveMoment() {
  const rv = $('mo-val'), ra = $('mo-act');
  const val = rv ? parseInt(rv.value, 10) : 50;
  const act = ra ? parseInt(ra.value, 10) : 50;
  const noteEl = $('mo-note');
  const m = {
    id: Date.now(),
    kType: 'self_report',                 // паспорт: тип знания (самоотчёт)
    valence:   isFinite(val) ? val : 50,  // 0–100 приятность
    activation: isFinite(act) ? act : 50, // 0–100 энергия
    emo: STATE.moEmo || '',
    note: noteEl ? noteEl.value.trim() : '',
    verif: 'unverified',                  // паспорт: степень проверки
    life: 'current',                      // паспорт: current / stale / invalidated
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  };
  if (!Array.isArray(DB.moments)) DB.moments = [];
  DB.moments.push(m);
  STATE.moEmo = '';
  if (noteEl) noteEl.value = '';
  closeOv('ov-moment'); persist();
  try { rHomeMoments(); } catch (e) {}
  hptMed(); toast('Состояние записано', 'ok');
}
function momentLabel(v) { return v >= 75 ? 'высокая' : v >= 50 ? 'средняя' : v >= 25 ? 'ниже средней' : 'низкая'; }
// Просмотр сохранённого «Момента» (полностью) + удаление.
function openMoment(id) {
  const m = projAll('moments').find(x => x && x.id === id); if (!m) return;
  STATE.momDetId = id;
  const t = new Date(m.createdAt);
  const hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  const rows = [
    ['Приятность', momentLabel(m.valence) + ' (' + Math.round(m.valence) + ')'],
    ['Энергия', momentLabel(m.activation) + ' (' + Math.round(m.activation) + ')'],
  ];
  if (m.emo) rows.push(['Эмоция', m.emo]);
  if (m.note) rows.push(['Заметка', m.note]);
  const body = $('mom-det-body');
  if (body) {
    let html = rows.map(([lbl, v]) => `<div style="margin-bottom:.6rem"><div class="f-lbl">${lbl}</div><div class="si-text">${esc(v)}</div></div>`).join('');
    // Паспорт данных: показать, что запись исправлялась (оригинал сохранён).
    if (m._corrected) {
      const orig = (DB.moments || []).find(x => x && x.id === id) || {};
      html += `<div class="si-text" style="color:var(--t3);font-size:.85em">исправлено (${m._corrected}) · оригинал: приятность ${Math.round(orig.valence || 0)}, энергия ${Math.round(orig.activation || 0)}</div>`;
    }
    body.innerHTML = html;
  }
  const dt = $('mom-det-date'); if (dt) dt.textContent = (m.day || '') + ' · ' + hh;
  openOv('ov-moment-det');
}
function deleteMomentDet() {
  const id = STATE.momDetId; if (id == null) return;
  closeOv('ov-moment-det');
  delUndo('moments', id, () => { try { rHomeMoments(); } catch (e) {} try { rMomentTrend(); } catch (e) {} }, 'Момент удалён');
  STATE.momDetId = null;
}
// Динамика «Моментов» за 14 дней: средние приятность/энергия по дню, спарклайн.
// Только описание наблюдаемого окна (DescriptiveState), без прогноза.
function rMomentTrend() {
  const el = $('h-moment-trend'); if (!el) return;
  const moments = projAll('moments');
  const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  const days = []; for (let i = 13; i >= 0; i--) days.push(dayKey(now - i * 864e5));
  const byDay = {};
  moments.forEach(m => { if (m && m.day) (byDay[m.day] = byDay[m.day] || []).push(m); });
  const series = days.map(day => {
    const arr = byDay[day]; if (!arr || !arr.length) return null;
    return {
      v: arr.reduce((s, m) => s + (m.valence || 0), 0) / arr.length,
      a: arr.reduce((s, m) => s + (m.activation || 0), 0) / arr.length,
    };
  });
  const present = []; series.forEach((s, i) => { if (s) present.push({ i, v: s.v, a: s.a }); });
  if (present.length < 2) { el.innerHTML = ''; return; }
  const W = 280, H = 56, n = days.length;
  const x = i => (n === 1 ? 0 : (i / (n - 1)) * W);
  const y = val => H - (Math.max(0, Math.min(100, val)) / 100) * H;
  const poly = key => present.map(p => `${x(p.i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const first = present[0], last = present[present.length - 1];
  const arrow = (cur, prev) => cur > prev + 5 ? '↑' : cur < prev - 5 ? '↓' : '→';
  el.innerHTML = '<div class="sec-lbl">Динамика состояния (2 недели)</div>' +
    '<div class="card mx mb" style="padding:.85rem 1rem">' +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;display:block">` +
        `<polyline points="${poly('v')}" fill="none" stroke="#F5B84B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<polyline points="${poly('a')}" fill="none" stroke="#4C8DFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      '</svg>' +
      `<div class="si-text" style="color:var(--t3);margin-top:.45rem"><span style="color:#F5B84B">●</span> приятность ${arrow(last.v, first.v)}&nbsp;&nbsp;<span style="color:#4C8DFF">●</span> энергия ${arrow(last.a, first.a)}</div>` +
    '</div>';
}
function rHomeMoments() {
  const el = $('h-moments'); if (!el) return;
  const today = todayKey();
  const list = projAll('moments').filter(m => m && m.day === today).slice(-5).reverse();
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="sec-lbl">Моменты сегодня</div><div class="card mx mb">' +
    list.map(m => {
      const t = new Date(m.createdAt);
      const hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      const chip = m.emo ? ` · ${esc(m.emo)}` : '';
      const note = m.note ? `<div class="si-text" style="color:var(--t3);margin-top:.15rem">${esc(m.note)}</div>` : '';
      return `<div class="si-row tap" style="cursor:pointer" onclick="openMoment(${m.id})"><div class="si-body"><div class="si-text"><b>${hh}</b> — приятность ${momentLabel(m.valence)}, энергия ${momentLabel(m.activation)}${chip}</div>${note}</div></div>`;
    }).join('') + '</div>';
}

// ─── МЕТОД «ЗАЧЕМ?» ───────────────────────────────────────────────
// Личная методика Ивана: структурированный разбор состояния/импульса по
// цепочке симптом → функция → вторичная выгода → потребность → цена →
// альтернатива → выбранное действие. Это ТВОЯ рефлексия (самоотчёт), а не
// диагноз и не вывод ИИ. Несёт «паспорт данных» (kType/verif/life). В этой
// версии — без ИИ (заполняешь сам); AI-помощь появится после validator-framework.
const WHY_FIELDS = ['symptom','function','gain','need','cost','alternative','action'];
function resetWhyForm() { WHY_FIELDS.forEach(k => { const el = $('why-' + k); if (el) el.value = ''; }); }
function saveWhy() {
  const rec = { id: Date.now(), kType: 'process_reflection', verif: 'user_confirmed', life: 'current',
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now() };
  let filled = 0;
  WHY_FIELDS.forEach(k => { const el = $('why-' + k); const val = el ? el.value.trim() : ''; rec[k] = val; if (val) filled++; });
  if (filled === 0) { toast('Опиши хотя бы, что происходит', 'warn'); return; }
  if (!Array.isArray(DB.whys)) DB.whys = [];
  DB.whys.push(rec);
  closeOv('ov-why'); persist();
  try { rWhys(); } catch (e) {}
  hptMed(); toast('Разбор сохранён', 'ok');
}
function rWhys() {
  const el = $('h-whys'); if (!el) return;
  const list = projAll('whys').slice(-3).reverse();
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="sec-lbl">Разборы «Зачем?»</div><div class="card mx mb">' +
    list.map(w => {
      const d = (w.day || '').slice(5);
      const head = esc(w.symptom || w.need || w.action || 'Разбор');
      const mk = w.actionDone === true ? '<span style="color:var(--green)">✓</span> ' : '';
      const act = w.action ? `<div class="si-text" style="color:var(--t3);margin-top:.15rem">→ ${esc(w.action)}</div>` : '';
      return `<div class="si-row tap" style="cursor:pointer" onclick="openWhy(${w.id})"><div class="si-body"><div class="si-text"><b>${d}</b> ${mk}— ${head}</div>${act}</div></div>`;
    }).join('') + '</div>';
}
// Просмотр сохранённого разбора «Зачем?» (полная цепочка) + удаление.
const WHY_LABELS = { symptom:'Симптом', function:'Функция', gain:'Вторичная выгода', need:'Потребность', cost:'Цена', alternative:'Альтернатива', action:'Действие' };
function openWhy(id) {
  const w = projAll('whys').find(x => x && x.id === id); if (!w) return;
  STATE.whyDetId = id;
  const rows = WHY_FIELDS.map(k => [WHY_LABELS[k], w[k]]).filter(([, v]) => v && String(v).trim());
  const body = $('why-det-body');
  let html = rows.length
    ? rows.map(([lbl, v]) => `<div style="margin-bottom:.7rem"><div class="f-lbl">${lbl}</div><div class="si-text">${esc(v)}</div></div>`).join('')
    : '<div class="si-text" style="color:var(--t3)">Пусто</div>';
  // Проверка результата: если есть выбранное действие — дать отметить, сделал ли.
  if (w.action && String(w.action).trim()) {
    html += '<div class="side-div"></div><div class="f-lbl">Проверка: ты сделал это?</div>';
    if (w.actionDone == null) {
      html += '<div style="display:flex;gap:var(--s2);margin-top:.4rem">' +
        '<button class="btn btn-s" style="flex:1" onclick="markWhyAction(true)">Да, сделал</button>' +
        '<button class="btn btn-s" style="flex:1" onclick="markWhyAction(false)">Пока нет</button></div>';
    } else {
      const st = w.actionDone ? '<span style="color:var(--green)">✓ сделано</span>' : '<span style="color:var(--t3)">пока нет</span>';
      html += `<div class="si-text" style="margin-top:.35rem">${st} · <span style="color:var(--accent);cursor:pointer" onclick="markWhyAction(null)">изменить</span></div>`;
    }
  }
  if (body) body.innerHTML = html;
  const dt = $('why-det-date'); if (dt) dt.textContent = w.day || '';
  openOv('ov-why-det');
}
// «За неделю»: детерминированная сводка (без ИИ) по моментам и разборам «Зачем?»
// за 7 дней — понимание с одного взгляда. Только чтение накопленных записей.
function rWeekSummary() {
  const el = $('h-week'); if (!el) return;
  const now = Date.now(), wk = 7 * 864e5;
  const recent = arr => (arr || []).filter(x => x && (now - (Date.parse(x.createdAt) || 0)) <= wk);
  const mo = recent(projAll('moments')), wh = recent(projAll('whys'));
  if (!mo.length && !wh.length) { el.innerHTML = ''; return; }
  const avg = (a, k) => a.length ? Math.round(a.reduce((s, x) => s + (x[k] || 0), 0) / a.length) : 0;
  const done = wh.filter(w => w.actionDone === true).length;
  const parts = [];
  if (mo.length) parts.push(`${mo.length} ${pl(mo.length, 'запись', 'записи', 'записей')} состояния (приятность ${avg(mo, 'valence')}%, энергия ${avg(mo, 'activation')}%)`);
  if (wh.length) parts.push(`${wh.length} ${pl(wh.length, 'разбор', 'разбора', 'разборов')} «Зачем?»` + (done ? `, из них выполнено ${done}` : ''));
  el.innerHTML = '<div class="sec-lbl">За неделю</div><div class="card mx mb" style="padding:.85rem 1rem"><div class="si-text">' + parts.join('. ') + '.</div></div>';
}
// История состояний: моменты + разборы «Зачем?» одним хронологическим списком.
// Только чтение накопленных записей (долговременная память), каждая — в деталь.
function rHistory() {
  const el = $('history-list'); if (!el) return;
  const items = [];
  projAll('moments').forEach(m => { if (m && m.id) items.push({ t: 'moment', at: Date.parse(m.createdAt) || 0, rec: m }); });
  projAll('whys').forEach(w => { if (w && w.id) items.push({ t: 'why', at: Date.parse(w.createdAt) || 0, rec: w }); });
  items.sort((a, b) => b.at - a.at);
  if (!items.length) { el.innerHTML = '<div class="bk-empty" style="padding:1rem">Здесь появятся твои моменты и разборы «Зачем?».</div>'; return; }
  el.innerHTML = items.slice(0, 200).map(it => {
    const day = (it.rec.day || '').slice(5);
    if (it.t === 'moment') {
      const chip = it.rec.emo ? ' · ' + esc(it.rec.emo) : '';
      return `<div class="srow tap" style="cursor:pointer" onclick="closeOv('ov-history');openMoment(${it.rec.id})"><div class="bk-info"><span class="sl2">${day} · момент</span><span class="sv2">приятность ${momentLabel(it.rec.valence)}, энергия ${momentLabel(it.rec.activation)}${chip}</span></div></div>`;
    }
    const done = it.rec.actionDone === true ? '<span style="color:var(--green)">✓</span> ' : '';
    const head = esc(it.rec.symptom || it.rec.need || it.rec.action || 'разбор');
    return `<div class="srow tap" style="cursor:pointer" onclick="closeOv('ov-history');openWhy(${it.rec.id})"><div class="bk-info"><span class="sl2">${day} · «Зачем?»</span><span class="sv2">${done}${head}</span></div></div>`;
  }).join('');
}
// Отметка выполнения выбранного действия из разбора «Зачем?» (проверка результата).
function markWhyAction(done) {
  const id = STATE.whyDetId;
  const w = (DB.whys || []).find(x => x && x.id === id); if (!w) return;
  // Через ядро: оригинал разбора неизменен, отметка — append-only коррекция.
  addCorrection('whys', id, { actionDone: done, checkedAt: (done == null) ? '' : nowISO() }, 'проверка результата');
  openWhy(id); try { rWhys(); } catch (e) {}
  if (done != null) { hptMed(); toast(done ? 'Отмечено: сделано' : 'Отмечено', 'ok'); }
}
// Исправление момента через ядро: оригинал неизменен, правка — коррекция.
function correctMoment() {
  const id = STATE.momDetId; if (id == null) return;
  const cur = projAll('moments').find(x => x && x.id === id); if (!cur) return;
  const val = prompt('Приятность (0–100):', String(Math.round(cur.valence)));
  if (val == null) return;
  const act = prompt('Энергия (0–100):', String(Math.round(cur.activation)));
  if (act == null) return;
  const v = Math.max(0, Math.min(100, parseInt(val, 10)));
  const a = Math.max(0, Math.min(100, parseInt(act, 10)));
  if (!isFinite(v) || !isFinite(a)) { toast('Нужны числа 0–100', 'warn'); return; }
  addCorrection('moments', id, { valence: v, activation: a }, 'исправление пользователем');
  openMoment(id);
  try { rHomeMoments(); rMomentTrend(); rWeekSummary(); } catch (e) {}
  toast('Исправлено (оригинал сохранён в истории)', 'ok');
}
function deleteWhyDet() {
  const id = STATE.whyDetId; if (id == null) return;
  closeOv('ov-why-det');
  delUndo('whys', id, () => { try { rWhys(); } catch (e) {} }, 'Разбор удалён');
  STATE.whyDetId = null;
}

// ─── ЗДОРОВЬЕ: «Тяга» — лог импульса + микро-интервенция ─────────
// Основа (см. HEALTH_BRIEF.md): петля привычки триггер→действие→
// награда; пик тяги держится 3–5 минут — задача не «победить силой
// воли», а пережить пик и honestly зафиксировать данные, не судить.
// Типология тяги (must-have конкретизация из разбора JITAI): внезапная
// «cue-induced» (нужна дистракция/пересидеть пик) и фоновая «tonic»
// (нарастает из-за усталости/голода — нужна физиологическая компенсация,
// не сила воли). Ветвим подсказку по выбору пользователя, не по угадыванию.
// Подсказки помечены ключом (k) и коротким ярлыком (lbl) — чтобы движок
// мог запоминать, что помогло именно тебе, и поднимать это вверх (петля
// обратной связи, см. markHelped/orderedTips).
const CRAVING_TIPS_CUE = [
  { k: 'breath', lbl: '🫁 Дыхание', t: '🫁 4 медленных вдоха через нос, выдох вдвое дольше — 60 секунд.' },
  { k: 'water',  lbl: '💧 Вода',    t: '💧 Стакан воды, медленно, весь до дна.' },
  { k: 'move',   lbl: '🚶 Шаги',    t: '🚶 Встань и пройдись 2–3 минуты — смена позы сбивает автоматизм.' },
];
const CRAVING_TIPS_TONIC = [
  { k: 'protein', lbl: '🍳 Еда+вода', t: '💧 Стакан воды и что-то белковое/сытное — фоновая тяга часто от голода, не от повода.' },
  { k: 'rest',    lbl: '🛌 Покой',    t: '🛌 Если это вечер — усталость съедает волю сильнее, чем кажется. Дай себе 10 минут покоя.' },
  { k: 'breath',  lbl: '🫁 Дыхание',  t: '🫁 Медленное дыхание 4/8, чтобы не «долить» тягу собственным напряжением.' },
];
// Сколько раз каждый приём помог именно тебе (из истории «Тяги»).
function tipHelpCounts() {
  const c = {}; (DB.cravings || []).forEach(r => { if (r.helped && r.helped !== 'wait') c[r.helped] = (c[r.helped] || 0) + 1; });
  return c;
}
// Персонализация: приёмы, что работали у тебя, идут первыми.
function orderedTips(list) {
  const c = tipHelpCounts();
  return list.map((t, i) => ({ t, i })).sort((a, b) => (c[b.t.k] || 0) - (c[a.t.k] || 0) || a.i - b.i).map(x => x.t);
}
// ─── Шит «Приёмы»: подбор доказательного приёма под состояние ────
function openTech(seed) {
  const chips = $('tech-chips'); if (chips) chips.querySelectorAll('.tp').forEach(b => b.classList.remove('a-moss'));
  const tx = $('tech-text'); if (tx) tx.value = '';
  renderTechniques(seed || '');
  openOv('ov-tech');
  if (seed) renderTechniques(seed);
}
function techPick(btn, key) {
  btn.parentElement.querySelectorAll('.tp').forEach(b => b.classList.remove('a-moss'));
  btn.classList.add('a-moss');
  const tx = $('tech-text'); if (tx) tx.value = '';
  renderTechniques(key); hpt();
}
function techFromText() {
  const tx = $('tech-text'); if (!tx) return;
  const val = tx.value;
  // Кризисный протокол — раньше любого приёма (safety fallback).
  if (crisisScreen(val)) { closeOv('ov-tech'); openCrisisCard(); return; }
  const chips = $('tech-chips'); if (chips) chips.querySelectorAll('.tp').forEach(b => b.classList.remove('a-moss'));
  renderTechniques(val);
}
function renderTechniques(q) {
  const out = $('tech-out'); if (!out) return;
  const techs = suggestTechniques(q, 2);
  if (!q || !String(q).trim()) { out.innerHTML = `<div class="ai-sp-empty" style="padding:1rem">Выбери, что ближе, или опиши своими словами — подберу доказательный приём под состояние.</div>`; return; }
  if (!techs.length) { out.innerHTML = `<div class="ai-sp-empty" style="padding:1rem">Не поймал состояние по словам. Попробуй иначе — «тревожно», «тянет сорваться», «нет сил», «злюсь», «пусто и одиноко».</div>`; return; }
  out.innerHTML = techs.map(t => `<div class="card mx" style="padding:1rem;margin-bottom:.6rem">
    <div class="si-text" style="font-weight:700">${esc(t.title)}</div>
    <div class="si-text" style="color:var(--t3);margin:.15rem 0 .5rem">${esc(t.frame)}</div>
    ${t.steps.map(s => `<div class="cr-tip-row">• ${esc(s)}</div>`).join('')}
  </div>`).join('');
}
// ─── Therapeutic Generator (grounded, single-call) ──────────────
// Из второго разбора RAG-LLM: адаптировать метод под слова человека, а не
// выдавать сухую инструкцию. Grounding — ключевой safety-принцип: ИИ НЕ
// придумывает метод, а обязан выбрать method_id из НАШЕЙ базы (enum по
// ASCII-id, плоский string — учли enum-баг). Кризис — двумя слоями: локальный
// crisisScreen ДО вызова + флаг crisis от ИИ + crisisScreen на сам ответ.
// Без ключа/сети — тихий откат на локальные приёмы (offline-first).
async function techGenerate() {
  const tx = $('tech-text'); const val = tx ? tx.value.trim() : '';
  if (!val) { toast('Опиши, что происходит'); return; }
  if (crisisScreen(val)) { closeOv('ov-tech'); openCrisisCard(); return; }
  if (!getAiKey() || !navigator.onLine) { renderTechniques(val); toast(getAiKey() ? 'Нет сети — базовые приёмы' : 'Без ИИ-ключа — базовые приёмы'); return; }
  const out = $('tech-out'); if (out) out.innerHTML = `<div class="ai-sp-empty" style="padding:1rem">Разбираю бережно…</div>`;
  try {
    const schema = { type: 'object', additionalProperties: false, required: ['crisis', 'craving_detected', 'method_id', 'message'],
      properties: {
        crisis: { type: 'boolean' },
        craving_detected: { type: 'boolean' },
        method_id: { type: 'string', enum: [...REG_TECHNIQUES.map(t => t.id), 'none'] },
        message: { type: 'string' },
      } };
    const catalog = REG_TECHNIQUES.map(t => `${t.id}: ${t.title} — ${t.frame}`).join('\n');
    const sys = 'Ты — бережный психологический ассистент приложения «Архитектор». По свободному тексту человека:\n'
      + '— НЕ ставь диагнозов, не используй клинические термины, не выдавай себя за терапевта;\n'
      + '— опирайся только на текст, не додумывай переживаний, которых там нет;\n'
      + '— если есть признаки острого кризиса (мысли о смерти/самоповреждении, безысходность «всем лучше без меня», «не вижу смысла жить») — поставь crisis=true, method_id="none", message="" и НЕ давай советов;\n'
      + '— иначе выбери ОДИН метод строго из списка ниже (method_id — только оттуда) под состояние и напиши короткое (2–4 предложения) бережное, неосуждающее сообщение на «ты»: сначала валидируй чувство, потом мягко, приглашающим тоном предложи этот метод под конкретную ситуацию. Без лекций и морали;\n'
      + '— craving_detected=true, если в тексте есть тяга к курению/сладкому/алкоголю.\n\nМетоды (method_id выбирай только отсюда):\n' + catalog;
    const raw = await callClaude({ system: sys, user: val, maxTokens: 400, schema, task: 'analysis' });
    let p; try { p = JSON.parse(raw); } catch (e) { renderTechniques(val); return; }
    if (p.crisis || crisisScreen(p.message)) { closeOv('ov-tech'); openCrisisCard(); return; }
    const method = REG_TECHNIQUES.find(t => t.id === p.method_id) || null;
    techRenderGenerated(p.message, method, !!p.craving_detected);
  } catch (e) { renderTechniques(val); toast('Не вышло разобрать — вот базовые приёмы'); }
}
function techRenderGenerated(message, method, craving) {
  const out = $('tech-out'); if (!out) return;
  if (!message && !method) { const tx = $('tech-text'); renderTechniques(tx ? tx.value : ''); return; }
  let html = '';
  if (message) html += `<div class="card mx" style="padding:1rem;margin-bottom:.6rem"><div class="si-text">${esc(message)}</div></div>`;
  if (method) html += `<div class="card mx" style="padding:1rem;margin-bottom:.6rem"><div class="si-text" style="font-weight:700">${esc(method.title)}</div><div class="si-text" style="color:var(--t3);margin:.15rem 0 .5rem">${esc(method.frame)}</div>${method.steps.map(s => `<div class="cr-tip-row">• ${esc(s)}</div>`).join('')}</div>`;
  if (craving) html += `<div class="mx"><button class="btn btn-s btn-sm" onclick="closeOv('ov-tech');openCraving()">Записать как тягу →</button></div>`;
  out.innerHTML = html;
}
function openCraving() {
  STATE.crKind = 'сигарета'; STATE.crOnset = null; STATE.crAlone = null;
  const kindRow = $('cr-kind');
  if (kindRow) kindRow.querySelectorAll('.tp').forEach(b => b.classList.toggle('a-moss', b.dataset.k === 'сигарета'));
  const ctxRow = $('cr-ctx'); if (ctxRow) ctxRow.querySelectorAll('.tp').forEach(b => b.classList.remove('a-moss'));
  const trig = $('cr-trigger'); if (trig) trig.value = '';
  const int = $('cr-int'); if (int) int.value = 5;
  crIntChange(5);
  openOv('ov-craving');
}
function sCrKind(btn) {
  btn.parentElement.querySelectorAll('.tp').forEach(b => b.classList.remove('a-moss'));
  btn.classList.add('a-moss'); STATE.crKind = btn.dataset.k;
}
// Оба контекстных вопроса необязательны и независимы друг от друга
// (data-g различает группу), поэтому переключаем активность только
// внутри своей группы — второй вопрос не сбрасывает первый.
function sCrCtx(btn) {
  const g = btn.dataset.g;
  btn.parentElement.querySelectorAll(`.tp[data-g="${g}"]`).forEach(b => b.classList.remove('a-moss'));
  btn.classList.add('a-moss');
  if (g === 'onset') STATE.crOnset = btn.dataset.v; else STATE.crAlone = btn.dataset.v;
  crIntChange(($('cr-int') && $('cr-int').value) || 5);
}
function crIntChange(v) {
  const lbl = $('cr-int-v'); if (lbl) lbl.textContent = v;
  const tip = $('cr-tip'); if (!tip) return;
  const base = STATE.crOnset === 'tonic' ? CRAVING_TIPS_TONIC : CRAVING_TIPS_CUE;
  const tips = orderedTips(base), cnt = tipHelpCounts();
  tip.innerHTML = +v >= 6
    ? `<div class="cr-tip-box"><div class="cr-tip-h">Пик тяги обычно держится 3–5 минут — попробуй пережить его так:</div>${tips.map((t, i) => `<div class="cr-tip-row">${t.t}${i === 0 && (cnt[t.k] || 0) > 0 ? ' <span style="color:var(--green)">· помогало тебе</span>' : ''}</div>`).join('')}<div class="cr-tip-row" style="margin-top:.5rem"><a href="javascript:void 0" onclick="closeOv('ov-craving');openTech('${STATE.crOnset === 'tonic' ? 'тяга пусто вечер' : 'тяга импульс'}')">Ещё приёмы под состояние →</a></div></div>`
    : '';
}
function saveCraving(held) {
  const kind = STATE.crKind || 'сигарета';
  const intensity = +(($('cr-int') && $('cr-int').value) || 5);
  const trigger = (($('cr-trigger') && $('cr-trigger').value) || '').trim();
  const rec = { id: Date.now(), kind, intensity, trigger, outcome: held ? 'held' : 'gave_in',
    onset: STATE.crOnset || null, alone: STATE.crAlone || null,
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION };
  (DB.cravings = DB.cravings || []).unshift(rec);
  persist(); closeOv('ov-craving'); hptMed();
  // Кризисный протокол важнее обычного отклика: если в триггере — острый
  // сигнал, ведём к живому человеку, а не к статистике тяги (safety first).
  if (crisisScreen(trigger)) { try { if (document.getElementById('pg-health').classList.contains('on')) rHealth(); } catch (e) {} openCrisisCard(); return; }
  reactToCraving(rec);
  try { if (document.getElementById('pg-health').classList.contains('on')) rHealth(); } catch (e) {}
}
// Найти ранее сохранённый план «если...то» под конкретный триггер —
// план хранится как обычный инсайт (тег «Личное», src-метка), чтобы не
// плодить новую сущность (см. HEALTH_BRIEF.md, принцип «слой поверх»).
function findPlanFor(trig) {
  const t = (trig || '').trim().toLowerCase(); if (!t) return null;
  return (DB.insights || []).find(i => i.src === 'План (если-то)' && (i.body || '').toLowerCase().includes(t));
}
function planForTrigger(trig) {
  reflectPromptText(`Если «${trig}» — то я:`);
  const sr = $('add-src'); if (sr) sr.value = 'План (если-то)';
}
function planForTriggerIdx(i) {
  const row = (STATE.healthTopTrig || [])[i]; if (row) planForTrigger(row[0]);
}
// Живой отклик на тягу: без осуждения при срыве (метод «Зачем?» —
// честные данные, не провал), с паттерном при накоплении истории.
// Награда за «устоял» — переменная (variable-ratio), не гарантированная
// галочка каждый раз: непредсказуемость сама по себе поддерживает
// вовлечённость (см. разбор JITAI, п. «variable-ratio reinforcement»).
function reactToCraving(rec) {
  const rows = [];
  const list = DB.cravings || [];
  if (rec.outcome === 'held') {
    let streak = 0; for (const c of list) { if (c.outcome !== 'held') break; streak++; }
    rows.push({ html: `💪 Устоял(а)${streak > 1 ? ` — ${streak} раз подряд` : ''}` });
    if (Math.random() < 0.3) {
      const bonuses = ['🌟 Это не просто галочка — паттерн правда меняется.', '🎉 Маленькая победа, но настоящая.', '💎 Месяц назад это было бы сложнее — заметь разницу.'];
      rows.push({ html: bonuses[Math.floor(Math.random() * bonuses.length)] });
    }
  } else {
    rows.push({ html: `Записано честно — это данные, не провал.${rec.trigger ? ` Триггер: «${esc(rec.trigger)}»` : ''}` });
  }
  const sameKind = list.filter(c => c.kind === rec.kind);
  if (sameKind.length >= 3) {
    const heldN = sameKind.filter(c => c.outcome === 'held').length;
    rows.push({ html: `📊 «${esc(rec.kind)}»: устоял в ${heldN} из ${sameKind.length} (${Math.round(heldN / sameKind.length * 100)}%)` });
  }
  const plan = findPlanFor(rec.trigger);
  if (plan) rows.push({ html: `📌 У тебя есть план на этот случай: ${esc(plan.body.replace(/\n+/g, ' ').trim().slice(0, 140))}` });
  // Петля обратной связи: если показывалась микро-интервенция и ты устоял —
  // спросим, ЧТО помогло, чтобы в следующий раз поднять это первым. Это и
  // делает движок адаптивным (JITAI: intervention → outcome → приоритет).
  if (rec.outcome === 'held' && rec.intensity >= 6) {
    const base = rec.onset === 'tonic' ? CRAVING_TIPS_TONIC : CRAVING_TIPS_CUE;
    const btns = base.map(t => `<button class="btn btn-s btn-sm" onclick="markHelped(${rec.id},'${t.k}')">${esc(t.lbl)}</button>`).join(' ')
      + ` <button class="btn btn-s btn-sm" onclick="markHelped(${rec.id},'wait')">просто переждал</button>`;
    rows.push({ html: `<div style="font-weight:500;margin-bottom:.4rem">Что помогло удержаться?</div><div style="display:flex;gap:.4rem;flex-wrap:wrap">${btns}</div>` });
  }
  rows.push({ html: `Открыть «Здоровье» →`, act: `rcClose();goTo('health')` });
  reactCard(rows, 'Тяга');
}
// Запомнить, какой приём помог именно тебе — движок учится и в следующий
// раз поднимет его первым (см. orderedTips). Локально, приватно, на твоих
// данных — это и есть персональная адаптивность вместо серверного ML.
function markHelped(id, key) {
  const rec = (DB.cravings || []).find(c => c.id === id); if (!rec) return;
  rec.helped = key; touch(rec); persist(); hpt();
  toast(key === 'wait' ? 'Записал — просто переждал' : 'Запомнил, что помогло тебе ✓', 'ok');
  rcClose();
}
// Синтез: сферы-привычки со здоровьем в имени (детект по ключевым
// словам — не отдельный флаг, чтобы не плодить новую сущность).
const HEALTH_KEYWORDS = /куре|сигарет|сладк|сахар|алкогол|никотин/i;
function healthSpheres() { return (DB.spheres || []).filter(s => HEALTH_KEYWORDS.test(s.name || '')); }
function addHealthSphere(name, icon) {
  if ((DB.spheres || []).some(s => s.name === name)) { toast('Уже есть на «Сферах»'); goTo('vit'); return; }
  createSphere({ name, icon, type: 'habit', color: '#5e6ad2' });
  rHealth(); toast(`«${name}» добавлена — отмечай на «Сферах»`, 'ok');
}
// «Среда»: реструктуризация окружения (BCTTv1) — три простых переключателя,
// не отдельная сущность, а плоские флаги (см. DEFAULT_DB.env).
function toggleEnvFlag(key) {
  DB.env = DB.env || {}; DB.env[key] = !DB.env[key];
  persist(); rHealth(); hpt();
}
// ─── HEALTH ORGANIZER: лекарства/витамины — ПЛАН и ФАКТ раздельно ─
// Personal Health Organizer (контракт product/12, контур 1): хранение и учёт
// по плану, который задал САМ пользователь. Приложение НЕ проверяет дозы,
// НЕ оценивает взаимодействия и НЕ даёт медицинских рекомендаций (регуляторный
// карантин). План (medication_plan) и фактический приём (medication_intake) —
// разные классы записей, чтобы «назначено» никогда не смешивалось с «принято».
function saveMed() {
  const name = ($('med-name') ? $('med-name').value : '').trim();
  const dose = ($('med-dose') ? $('med-dose').value : '').trim();
  if (!name) { toast('Введи название', 'warn'); return; }
  DB.meds.push({
    id: Date.now(), kType: 'medication_plan', privacyClass: 'sensitive',
    name, dose, active: true,
    verif: 'user_confirmed', life: 'current',
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  });
  if ($('med-name')) $('med-name').value = ''; if ($('med-dose')) $('med-dose').value = '';
  closeOv('ov-med-add'); persist(); rHealth();
  hptMed(); toast('Добавлено в план', 'ok');
}
function logMedIntake(medId) {
  const med = (DB.meds || []).find(m => m && m.id === medId); if (!med) return;
  DB.medIntakes.push({
    id: Date.now() + Math.floor(Math.random() * 1000), kType: 'medication_intake', privacyClass: 'sensitive',
    medId, status: 'taken',
    verif: 'user_confirmed', life: 'current',
    at: nowISO(), createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  });
  persist(); rHealth();
  hptMed(); toast(`${med.name}: приём отмечен`, 'ok');
}
function deleteMed(id) {
  if (!confirm('Убрать из плана? История фактических приёмов сохранится.')) return;
  delUndo('meds', id, () => rHealth(), 'Убрано из плана');
}
function medsSectionHTML() {
  const meds = projAll('meds').filter(m => m && m.active !== false);
  const today = todayKey();
  const takenToday = medId => (DB.medIntakes || []).filter(i => i && i.medId === medId && i.day === today && i.status === 'taken').length;
  let html = `<div class="sec-lbl">Лекарства и витамины</div><div class="card mx mb">`;
  if (!meds.length) {
    html += `<div style="padding:1rem" class="ai-sp-empty">Веди свой план приёма — лекарства, витамины, добавки. Отмечай факт приёма одним тапом.</div>`;
  } else {
    html += meds.map(m => {
      const n = takenToday(m.id);
      return `<div class="srow"><div class="sic" style="background:var(--green-l)"><span>💊</span></div>
        <span class="sl2">${esc(m.name)}${m.dose ? `<div class="sv2" style="display:block">${esc(m.dose)}</div>` : ''}</span>
        <span class="sv2">${n ? `сегодня: ${n} ✓` : ''}</span>
        <button class="btn btn-s btn-xs" onclick="event.stopPropagation();logMedIntake(${m.id})">Принял</button>
        <button class="prof-act" onclick="event.stopPropagation();deleteMed(${m.id})" aria-label="Убрать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;color:var(--t3)"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>`;
    }).join('');
  }
  html += `</div>
    <div class="mx mb"><button class="btn btn-s btn-sm" onclick="openOv('ov-med-add')"><i data-lucide="plus"></i>Добавить в план</button></div>
    <div class="be-note mx mb" style="color:var(--t3)">По плану, заданному тобой. Приложение не проверяет дозы и сочетания — это не медицинская рекомендация.</div>`;
  return html;
}

// ─── HEALTH ORGANIZER: симптомы и измерения (наблюдение, не диагноз) ─
function saveSymptom() {
  const name = ($('sym-name') ? $('sym-name').value : '').trim();
  if (!name) { toast('Опиши симптом', 'warn'); return; }
  const sev = $('sym-sev') ? parseInt($('sym-sev').value, 10) : 5;
  DB.symptoms.push({
    id: Date.now(), kType: 'symptom_observation', privacyClass: 'sensitive',
    name, severity: isFinite(sev) ? sev : 5, note: ($('sym-note') ? $('sym-note').value : '').trim(),
    verif: 'user_confirmed', life: 'current',
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  });
  ['sym-name','sym-note'].forEach(i => { if ($(i)) $(i).value = ''; });
  closeOv('ov-symptom'); persist(); rHealth();
  hptMed(); toast('Симптом записан', 'ok');
}
function saveMeasure() {
  const name = ($('mea-name') ? $('mea-name').value : '').trim();
  const value = ($('mea-value') ? $('mea-value').value : '').trim();
  if (!name || !value) { toast('Нужны показатель и значение', 'warn'); return; }
  DB.measures.push({
    id: Date.now(), kType: 'measurement', privacyClass: 'sensitive',
    name, value, unit: ($('mea-unit') ? $('mea-unit').value : '').trim(),
    verif: 'user_confirmed', life: 'current',
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  });
  ['mea-name','mea-value','mea-unit'].forEach(i => { if ($(i)) $(i).value = ''; });
  closeOv('ov-measure'); persist(); rHealth();
  hptMed(); toast('Измерение записано', 'ok');
}
function bodySectionHTML() {
  const sym = projAll('symptoms').slice(-3).reverse();
  const mea = projAll('measures').slice(-3).reverse();
  let html = `<div class="sec-lbl">Дневник тела</div><div class="card mx mb">`;
  const rows = [];
  sym.forEach(s => rows.push({ at: s.createdAt, txt: `<b>${(s.day || '').slice(5)}</b> симптом: ${esc(s.name)} · ${s.severity}/10${s.note ? ' — ' + esc(s.note) : ''}` }));
  mea.forEach(m => rows.push({ at: m.createdAt, txt: `<b>${(m.day || '').slice(5)}</b> ${esc(m.name)}: ${esc(m.value)}${m.unit ? ' ' + esc(m.unit) : ''}` }));
  rows.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  html += rows.length
    ? rows.slice(0, 5).map(r => `<div class="si-row"><div class="si-body"><div class="si-text">${r.txt}</div></div></div>`).join('')
    : `<div style="padding:1rem" class="ai-sp-empty">Записывай симптомы и измерения (вес, давление, пульс…) — соберётся честная картина для тебя и врача.</div>`;
  html += `</div><div class="mx mb" style="display:flex;gap:.5rem;flex-wrap:wrap">
    <button class="btn btn-s btn-sm" onclick="openOv('ov-symptom')"><i data-lucide="thermometer"></i>Симптом</button>
    <button class="btn btn-s btn-sm" onclick="openOv('ov-measure')"><i data-lucide="ruler"></i>Измерение</button>
    <button class="btn btn-s btn-sm" onclick="openDoctorReport()"><i data-lucide="file-text"></i>Отчёт врачу</button>
  </div>`;
  return html;
}

// ─── АСТРОЛОГИЯ (западная тропическая, MVP по Master Spec) ─────────
// Изолированный СИМВОЛИЧЕСКИЙ домен, explicit opt-in. Расчёт — vendored
// MIT-движок astronomy-engine (lazy-load; Swiss Ephemeris заблокирован до
// лицензии — правило 18 Master Spec). Геоцентрические видимые эклиптические
// долготы of date (tropical). Правила: неизвестное время рождения → БЕЗ
// домов/Asc (полдень не подставляем); UTC-офсет вводится явно (без
// угадывания по Intl); знак — полуоткрытый 30°-интервал по неокруглённому
// значению; каждый расчёт хранит версии движка/правил/орбисов.
// ИЗОЛЯЦИЯ: данные астрологии НЕ участвуют в cravingRisk, health, психологии,
// readiness и прогнозах — только отдельно помеченный символический контекст.
const ASTRO_VERSIONS = { engine: 'astronomy-engine@2.1.19', ruleset: 'western-tropical-v1', orbPolicy: 'orbs-v1(con8,opp8,tri7,sq7,sex5)', houses: 'whole-sign' };
const ZODIAC = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
const ASTRO_BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
const ASTRO_RU = { Sun:'Солнце', Moon:'Луна', Mercury:'Меркурий', Venus:'Венера', Mars:'Марс', Jupiter:'Юпитер', Saturn:'Сатурн', Uranus:'Уран', Neptune:'Нептун', Pluto:'Плутон' };
const ASTRO_ASPECTS = [
  { name: 'соединение', angle: 0, orb: 8 }, { name: 'оппозиция', angle: 180, orb: 8 },
  { name: 'трин', angle: 120, orb: 7 }, { name: 'квадрат', angle: 90, orb: 7 }, { name: 'секстиль', angle: 60, orb: 5 },
];
function zodiacOf(lon) { const L = ((lon % 360) + 360) % 360; return { sign: ZODIAC[Math.floor(L / 30)], deg: L % 30, lon: L }; }
// Ленивая загрузка движка (только при использовании астрологии — opt-in).
let _astroLoad = null;
function loadAstroEngine() {
  if (window.Astronomy) return Promise.resolve();
  if (_astroLoad) return _astroLoad;
  _astroLoad = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'astronomy.min.js';
    sc.onload = () => res();
    sc.onerror = () => { _astroLoad = null; rej(new Error('движок не загрузился')); };
    document.head.appendChild(sc);
  });
  return _astroLoad;
}
// Расчёт натальной карты по birth evidence. Чистая функция от (birth, Astronomy).
function computeNatalChart(birth) {
  const A = window.Astronomy;
  if (!A) throw new Error('движок не загружен');
  // Явный UTC-офсет пользователя; неизвестное время → полдень НЕ подставляем,
  // считаем только долготы планет на дату (суточная погрешность — честно видима).
  const timePart = birth.timeKnown ? birth.time : '12:00';
  const utc = new Date(Date.parse(birth.date + 'T' + timePart + ':00Z') - (birth.utcOffset || 0) * 3600e3);
  const t = A.MakeTime(utc);
  const planets = ASTRO_BODIES.map(b => {
    let lon, speed;
    if (b === 'Sun') { const s = A.SunPosition(t); lon = s.elon; speed = 1; }
    else if (b === 'Moon') { lon = A.EclipticGeoMoon(t).lon; speed = 13; }
    else {
      lon = A.Ecliptic(A.GeoVector(A.Body[b], t, true)).elon;
      const lon2 = A.Ecliptic(A.GeoVector(A.Body[b], A.MakeTime(new Date(utc.getTime() + 864e5)), true)).elon;
      speed = ((lon2 - lon + 540) % 360) - 180;   // градусов/сутки, знак = директность
    }
    const z = zodiacOf(lon);
    return { body: b, name: ASTRO_RU[b], lon: z.lon, sign: z.sign, deg: z.deg, retro: speed < 0 };
  });
  // Asc/MC + дома whole-sign: только при известном времени И координатах.
  let angles = null, houses = null, housesMeta = null;
  if (birth.timeKnown && isFinite(birth.lat) && isFinite(birth.lon)) {
    const obs = new A.Observer(birth.lat, birth.lon, 0);
    const gast = A.SiderealTime(t);                       // Greenwich apparent sidereal time, часы
    const lst = (gast * 15 + birth.lon + 360) % 360;      // местное звёздное время, градусы
    const eps = 23.4392911 * Math.PI / 180;               // наклон эклиптики (достаточно для MVP)
    const ramc = lst * Math.PI / 180;
    // MC: λ = atan2(sin RAMC, cos RAMC · cos ε) — квадрант получается корректно
    // сам (прежний вариант atan2(tan…) с ручным флипом давал MC, смещённый на 180°).
    const mc = ((Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) * 180 / Math.PI) + 360) % 360;
    const phi = birth.lat * Math.PI / 180;
    const ascRad = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)));
    const asc = ((ascRad * 180 / Math.PI) + 360) % 360;
    angles = { asc: zodiacOf(asc), mc: zodiacOf(mc) };
    // Система домов — выбор пользователя (по умолчанию whole-sign).
    const hsys = birth.houseSystem || 'whole';
    const cusps = houseCusps(hsys, { asc: zodiacOf(asc).lon, mc: zodiacOf(mc).lon, ramc: lst, eps: 23.4392911, phi: birth.lat });
    houses = planets.map(p => ({ body: p.body, house: houseOfLon(p.lon, cusps) }));
    houses.system = hsys; houses.cusps = cusps;
    housesMeta = { system: hsys, cusps };   // сериализуемо (свойства массива localStorage не переживают)
  }
  // ── 1.2: астероиды/Хирон (прибл., two-body JPL) + доп. точки ──
  const asteroids = Object.keys(ASTEROID_ELEMENTS).map(k => {
    const a = asteroidLongitude(k, t); const z = zodiacOf(a.lon);
    return { body: k, name: ASTEROID_ELEMENTS[k].ru, lon: z.lon, sign: z.sign, deg: z.deg, approx: true };
  });
  const points = { lilith: zodiacOf(meanLilithLon(t)) };
  if (angles) {
    const sunP = planets.find(p => p.body === 'Sun'), moonP = planets.find(p => p.body === 'Moon');
    // День/ночь: высота Солнца над горизонтом.
    const gast2 = A.SiderealTime(t); const lst2 = (gast2 * 15 + birth.lon + 360) % 360;
    const sunEq = A.Equator(A.Body.Sun, t, new A.Observer(birth.lat, birth.lon, 0), true, true);
    const H = (lst2 - sunEq.ra * 15) * DEG;
    const alt = Math.asin(Math.sin(birth.lat * DEG) * Math.sin(sunEq.dec * DEG) + Math.cos(birth.lat * DEG) * Math.cos(sunEq.dec * DEG) * Math.cos(H));
    const isDay = alt > 0;
    const pofLon = isDay ? norm360(angles.asc.lon + moonP.lon - sunP.lon) : norm360(angles.asc.lon + sunP.lon - moonP.lon);
    points.fortune = zodiacOf(pofLon); points.fortune.isDay = isDay;
    points.vertex = zodiacOf(vertexLon(lst2, 23.4392911, birth.lat));
    points.antivertex = zodiacOf(norm360(points.vertex.lon + 180));
    // Восточная точка: асцендент-формула при φ=0.
    const epRad = Math.atan2(Math.cos(lst2 * DEG), -Math.sin(lst2 * DEG) * Math.cos(23.4392911 * DEG));
    points.eastPoint = zodiacOf(norm360(epRad / DEG));
  }
  const antiscia = planets.map(p => ({ name: p.name, lon: antisciaLon(p.lon), sign: zodiacOf(antisciaLon(p.lon)).sign, deg: zodiacOf(antisciaLon(p.lon)).deg }));
  // Мажорные аспекты между планетами (версионированная orb policy v1).
  const aspects = [];
  for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
    // Угловое расстояние 0..180 (с учётом перехода через 0°/360°).
    const sep = Math.abs(((planets[i].lon - planets[j].lon + 180) % 360 + 360) % 360 - 180);
    for (const asp of ASTRO_ASPECTS) {
      if (Math.abs(sep - asp.angle) <= asp.orb) { aspects.push({ a: planets[i].name, b: planets[j].name, name: asp.name, exact: Math.abs(sep - asp.angle).toFixed(1) }); break; }
    }
  }
  return { planets, asteroids, points, antiscia, angles, houses, housesMeta, aspects, timeKnown: !!birth.timeKnown, versions: { ...ASTRO_VERSIONS, houses: (birth.houseSystem || 'whole') + '-v1', asteroids: 'jpl-sbdb-2body@JD2461200.5' } };
}
// ─── АСТЕРОИДЫ И ДОПОЛНИТЕЛЬНЫЕ ТОЧКИ (очередь 1.2) ─────────────────
// Астероиды/Хирон: кеплеровские элементы JPL Small-Body Database
// (ssd-api.jpl.nasa.gov, public domain), эпоха JD 2461200.5 TDB (2026-09-17),
// получены 2026-07-24. Двухтелая задача БЕЗ пертурбаций: точность ~±0.1–0.5°
// в пределах нескольких лет от эпохи (для символических целей достаточно;
// в UI помечено «прибл.»). Лилит (mean) — формула Ж. Меёса («Astronomical
// Algorithms», средний апогей = средний перигей + 180°). Точка Судьбы,
// Восточная точка, антисции — открытая арифметика. Вертекс — численно:
// корень пересечения эклиптики с первой вертикалью (западная ветвь).
const AST_EPOCH_JD = 2461200.5;
const ASTEROID_ELEMENTS = {
  Chiron: { ru: 'Хирон',   a: 13.68426760850124, e: 0.3797656311453571, i: 6.930574468846328,  om: 209.2961258613147, w: 339.2878326589729, ma: 216.7198966018106 },
  Ceres:  { ru: 'Церера',  a: 2.765552595034094, e: 0.07969229514816586, i: 10.58802780183462, om: 80.24862682043221, w: 73.29421453021587, ma: 274.4193463761342 },
  Pallas: { ru: 'Паллада', a: 2.769559010737709, e: 0.2307000995648547,  i: 34.93279321851542, om: 172.8866193357694, w: 310.9699161652136, ma: 254.2496521742734 },
  Juno:   { ru: 'Юнона',   a: 2.670989527103278, e: 0.2556999836681878,  i: 12.98659236598085, om: 169.8115953492418, w: 247.8950743075613, ma: 262.7322944883855 },
  Vesta:  { ru: 'Веста',   a: 2.361365965127599, e: 0.09020374382834395, i: 7.143925545058711, om: 103.701293265032,  w: 151.4686478221564, ma: 81.19015607686903 },
};
const EPS_J2000 = 23.43928 * Math.PI / 180;
// Гелиоцентрический вектор тела (эклиптика J2000) из кеплеровских элементов.
function keplerHelioVector(el, jd) {
  const D2 = Math.PI / 180;
  const n = 0.9856076686 / Math.pow(el.a, 1.5);            // ср. движение, °/сут (гауссова k)
  const M = ((el.ma + n * (jd - AST_EPOCH_JD)) % 360 + 360) % 360 * D2;
  let E = M;                                                // уравнение Кеплера
  for (let k = 0; k < 60; k++) E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const xv = el.a * (Math.cos(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const nu = Math.atan2(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
  const om = el.om * D2, w = el.w * D2, inc = el.i * D2, u = nu + w;
  return {
    x: r * (Math.cos(om) * Math.cos(u) - Math.sin(om) * Math.sin(u) * Math.cos(inc)),
    y: r * (Math.sin(om) * Math.cos(u) + Math.cos(om) * Math.sin(u) * Math.cos(inc)),
    z: r * (Math.sin(u) * Math.sin(inc)),
    r, kepErr: Math.abs(E - el.e * Math.sin(E) - M),
  };
}
// Геоцентрическая эклиптическая долгота (of date) астероида на момент t.
function asteroidLongitude(key, t) {
  const A = window.Astronomy;
  const el = ASTEROID_ELEMENTS[key];
  const jd = 2451545.0 + t.tt;
  const h = keplerHelioVector(el, jd);
  // эклиптика J2000 → экватор J2000 (поворот вокруг x на ε)
  const eq = { x: h.x, y: h.y * Math.cos(EPS_J2000) - h.z * Math.sin(EPS_J2000), z: h.y * Math.sin(EPS_J2000) + h.z * Math.cos(EPS_J2000) };
  const earth = A.HelioVector(A.Body.Earth, t);            // EQJ
  const geo = new A.Vector(eq.x - earth.x, eq.y - earth.y, eq.z - earth.z, t);
  return { lon: A.Ecliptic(geo).elon, r: h.r, kepErr: h.kepErr };
}
// Лилит (средний апогей Луны) — Меёс: ср. перигей + 180°. T — юл. столетия TT.
function meanLilithLon(t) {
  const T = t.tt / 36525;
  const perigee = 83.3532465 + 4069.0137287 * T - 0.0103200 * T * T - T * T * T / 80053 + T * T * T * T / 18999000;
  return norm360(perigee + 180);
}
// Вертекс: численно — западное пересечение эклиптики с первой вертикалью
// (точка на prime vertical ⇔ скалярное произведение с вектором севера = 0).
function vertexLon(ramcDeg, epsDeg, phiDeg) {
  const th = ramcDeg * DEG, ph = phiDeg * DEG, eps = epsDeg * DEG;
  const N = [-Math.sin(ph) * Math.cos(th), -Math.sin(ph) * Math.sin(th), Math.cos(ph)];
  const Z = [Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)];
  const E = [N[1] * Z[2] - N[2] * Z[1], N[2] * Z[0] - N[0] * Z[2], N[0] * Z[1] - N[1] * Z[0]];
  const ecl = lam => [Math.cos(lam * DEG), Math.sin(lam * DEG) * Math.cos(eps), Math.sin(lam * DEG) * Math.sin(eps)];
  const f = lam => { const e = ecl(lam); return e[0] * N[0] + e[1] * N[1] + e[2] * N[2]; };
  const roots = [];
  let prev = f(0);
  for (let d = 1; d <= 360; d++) { const cur = f(d); if (prev * cur < 0) { let lo = d - 1, hi = d; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? hi = m : lo = m; } roots.push(norm360((lo + hi) / 2)); } prev = cur; }
  const west = roots.filter(r => { const e = ecl(r); return (e[0] * E[0] + e[1] * E[1] + e[2] * E[2]) < 0; });
  return west.length ? west[0] : (roots[0] || 0);
}
// Антисция: зеркало относительно оси 0°Рака–0°Козерога.
const antisciaLon = lon => norm360(180 - lon);

// ─── ПРОГНОСТИКА (очередь 2: прогрессии · дирекции · возвращения) ───
// Все техники — открытые классические формулы (символический тайминг,
// НЕ предсказание событий):
//  · Вторичные прогрессии: день = год (положения на N-й день после рождения).
//  · Третичные: 1 день = 1 тропический лунный месяц (27.321582 сут).
//  · Solar Arc: все точки + дуга прогрессированного Солнца; Найбод: 0.9856°/год.
//  · Профекции (эллинистика): Asc «шагает» на 30°/год, возраст mod 12.
//  · Соляр/лунар: точный момент возвращения Солнца/Луны в натальную долготу
//    (SearchSunLongitude движка / бисекция по Луне).
const TROP_LUNAR_MONTH = 27.321582;   // тропический лунный месяц, сут (открытая константа)
const NAIBOD_DEG_PER_YEAR = 0.985647; // дуга Найбода 59′08″/год
const YEAR_DAYS = 365.2425;
function birthUTCDate(birth) {
  const timePart = birth.timeKnown ? birth.time : '12:00';
  return new Date(Date.parse(birth.date + 'T' + timePart + ':00Z') - (birth.utcOffset || 0) * 3600e3);
}
function bodiesAt(t) {
  const A = window.Astronomy;
  return ASTRO_BODIES.map(b => {
    let lon;
    if (b === 'Sun') lon = A.SunPosition(t).elon;
    else if (b === 'Moon') lon = A.EclipticGeoMoon(t).lon;
    else lon = A.Ecliptic(A.GeoVector(A.Body[b], t, true)).elon;
    const z = zodiacOf(lon);
    return { body: b, name: ASTRO_RU[b], lon: z.lon, sign: z.sign, deg: z.deg };
  });
}
// Прогрессии на момент at. kind: 'secondary' | 'tertiary'.
function computeProgressions(birth, at, kind) {
  const A = window.Astronomy;
  const b0 = birthUTCDate(birth);
  const ageDays = (at.getTime() - b0.getTime()) / 864e5;
  const ageYears = ageDays / YEAR_DAYS;
  const shiftDays = kind === 'tertiary' ? ageDays / TROP_LUNAR_MONTH : ageYears;
  const tProg = A.MakeTime(new Date(b0.getTime() + shiftDays * 864e5));
  const planets = bodiesAt(tProg);
  return { kind, ageYears, planets };
}
// Solar Arc + Найбод + профекция года.
function computeDirections(natalChart, birth, at) {
  const prog = computeProgressions(birth, at, 'secondary');
  const sunN = natalChart.planets.find(p => p.body === 'Sun').lon;
  const sunP = prog.planets.find(p => p.body === 'Sun').lon;
  const arc = norm360(sunP - sunN);
  const naibod = norm360(prog.ageYears * NAIBOD_DEG_PER_YEAR);
  const directed = natalChart.planets.map(p => { const L = norm360(p.lon + arc); const z = zodiacOf(L); return { name: p.name, lon: L, sign: z.sign, deg: z.deg }; });
  let profection = null;
  if (natalChart.angles) {
    const age = Math.floor(prog.ageYears);
    const profLon = norm360(natalChart.angles.asc.lon + (age % 12) * 30);
    profection = { age, sign: zodiacOf(profLon).sign, house: (age % 12) + 1 };
  }
  return { ageYears: prog.ageYears, solarArc: arc, naibod, directed, profection };
}
// Возвращение тела в натальную долготу. Возвращает момент (Date) или null.
function searchReturn(body, targetLon, startDate, windowDays) {
  const A = window.Astronomy;
  if (body === 'Sun') {
    const t = A.SearchSunLongitude(targetLon, A.MakeTime(startDate), windowDays);
    return t ? t.date : null;
  }
  const lonAt = d => body === 'Moon' ? A.EclipticGeoMoon(A.MakeTime(d)).lon : A.Ecliptic(A.GeoVector(A.Body[body], A.MakeTime(d), true)).elon;
  const diff = d => ((lonAt(d) - targetLon + 540) % 360) - 180;   // знаковая разница
  const stepH = body === 'Moon' ? 6 : 24 * 5;
  let prev = diff(startDate);
  for (let h = stepH; h <= windowDays * 24; h += stepH) {
    const d = new Date(startDate.getTime() + h * 3600e3);
    const cur = diff(d);
    if (prev < 0 && cur >= 0) {   // восходящее пересечение (директное движение)
      let lo = new Date(d.getTime() - stepH * 3600e3), hi = d;
      for (let i = 0; i < 60; i++) { const mid = new Date((lo.getTime() + hi.getTime()) / 2); (diff(mid) < 0) ? lo = mid : hi = mid; }
      return new Date((lo.getTime() + hi.getTime()) / 2);
    }
    prev = cur;
  }
  return null;
}
// ─── ДЖЙОТИШ / ВЕДИЧЕСКАЯ (очередь 3) ───────────────────────────────
// Нативная реализация открытых формул (VedAstro/Jyotish — только как
// референс определений; GPL-код НЕ копировался). Сидерическая долгота =
// тропическая − айанамша. Значения айанамш на J2000 — широко публикуемые
// константы; ход — линейная прецессия 50.2888″/год (аппроксимация,
// расхождение с эталонными реализациями — единицы угловых минут; для
// символических целей достаточно, задокументировано).
const AYANAMSHAS = {
  lahiri:  { ru: 'Лахири',        j2000: 23.85306 },
  raman:   { ru: 'Раман',         j2000: 22.49703 },
  kp:      { ru: 'Кришнамурти',   j2000: 23.75210 },
  fagan:   { ru: 'Фаган-Брэдли',  j2000: 24.73631 },
  yukteshwar: { ru: 'Юктешвар',   j2000: 22.74660 },
};
const PRECESSION_DEG_PER_YEAR = 50.2888 / 3600;
function ayanamsha(key, t) { const a = AYANAMSHAS[key] || AYANAMSHAS.lahiri; return a.j2000 + PRECESSION_DEG_PER_YEAR * (t.tt / 365.25); }
// Средний восходящий узел Луны (Раху, mean) — Ж. Меёс.
function meanRahuLon(t) {
  const T = t.tt / 36525;
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441);
}
const NAKSHATRAS = ['Ашвини','Бхарани','Криттика','Рохини','Мригашира','Ардра','Пунарвасу','Пушья','Ашлеша','Магха','Пурва-Пхалгуни','Уттара-Пхалгуни','Хаста','Читра','Свати','Вишакха','Анурадха','Джьештха','Мула','Пурва-Ашадха','Уттара-Ашадха','Шравана','Дхаништха','Шатабхиша','Пурва-Бхадрапада','Уттара-Бхадрапада','Ревати'];
const RASHI = ['Меша (Овен)','Вришабха (Телец)','Митхуна (Близнецы)','Карка (Рак)','Симха (Лев)','Канья (Дева)','Тула (Весы)','Вришчика (Скорпион)','Дхану (Стрелец)','Макара (Козерог)','Кумбха (Водолей)','Мина (Рыбы)'];
// Варги (классические правила Парашары). Реализованы уверенные: D1/D7/D9/D10/D12.
// D16/D20/D24/D30/D60 отложены (правила вариативны) — задокументировано.
function vargaSign(dn, sidLon) {
  const signIdx = Math.floor(sidLon / 30), deg = sidLon % 30;
  if (dn === 1) return signIdx;
  if (dn === 9)  return (signIdx * 9 + Math.floor(deg / (30 / 9))) % 12;                       // навамша
  if (dn === 12) return (signIdx + Math.floor(deg / 2.5)) % 12;                                 // двадашамша: от самого знака
  if (dn === 7)  { const p = Math.floor(deg / (30 / 7)); return ((signIdx % 2 === 0) ? (signIdx + p) : (signIdx + 6 + p)) % 12; }  // саптамша: нечётный знак (0-based чётный) от себя, чётный — от 7-го
  if (dn === 10) { const p = Math.floor(deg / 3); return ((signIdx % 2 === 0) ? (signIdx + p) : (signIdx + 8 + p)) % 12; }          // дашамша: нечётный от себя, чётный от 9-го
  return null;
}
// Вимшоттари-даша: старт от накшатры Луны. 120 лет.
const VIMSHOTTARI = [ ['Кету', 7], ['Венера', 20], ['Солнце', 6], ['Луна', 10], ['Марс', 7], ['Раху', 18], ['Юпитер', 16], ['Сатурн', 19], ['Меркурий', 17] ];
function vimshottariDasha(sidMoonLon, birthDate, now) {
  const nakLen = 360 / 27;
  const nak = Math.floor(sidMoonLon / nakLen);
  const frac = (sidMoonLon % nakLen) / nakLen;                    // пройденная доля накшатры
  const startIdx = nak % 9;
  const seq = [];
  let cursor = birthDate.getTime() - frac * VIMSHOTTARI[startIdx][1] * YEAR_DAYS * 864e5;   // начало текущей махадаши
  for (let i = 0; i < 18; i++) {
    const [lord, yrs] = VIMSHOTTARI[(startIdx + i) % 9];
    const from = cursor, to = cursor + yrs * YEAR_DAYS * 864e5;
    seq.push({ lord, yrs, from: new Date(from), to: new Date(to) });
    cursor = to;
  }
  const cur = seq.find(d => now.getTime() >= d.from.getTime() && now.getTime() < d.to.getTime()) || null;
  let antar = null;
  if (cur) {   // антардаши текущей махи — пропорционально годам лордов от лорда махи
    const maIdx = VIMSHOTTARI.findIndex(v => v[0] === cur.lord);
    let c2 = cur.from.getTime();
    for (let i = 0; i < 9; i++) {
      const [lord, yrs] = VIMSHOTTARI[(maIdx + i) % 9];
      const len = cur.yrs * (yrs / 120) * YEAR_DAYS * 864e5;
      if (now.getTime() >= c2 && now.getTime() < c2 + len) { antar = { lord, from: new Date(c2), to: new Date(c2 + len) }; break; }
      c2 += len;
    }
  }
  return { nakshatra: NAKSHATRAS[nak], pada: Math.floor((sidMoonLon % nakLen) / (nakLen / 4)) + 1, balanceStart: seq[0], current: cur, antar, seq: seq.slice(0, 9) };
}
// Панчанга (на момент рождения). Вара — упрощение: календарный день местного
// времени без коррекции на восход (задокументировано).
const TITHI_NAMES_HALF = ['Пратипада','Двития','Трития','Чатуртхи','Панчами','Шаштхи','Саптами','Аштами','Навами','Дашами','Экадаши','Двадаши','Трайодаши','Чатурдаши'];
const VARA_RU = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const YOGA_COUNT = 27, KARANA_MOVABLE = ['Бава','Балава','Каулава','Тайтила','Гара','Ваниджа','Вишти'];
function panchanga(sidSun, sidMoon, birthLocal) {
  const d = norm360(sidMoon - sidSun);
  const tithiNum = Math.floor(d / 12) + 1;                        // 1..30
  const paksha = tithiNum <= 15 ? 'шукла' : 'кришна';
  const tithiName = (tithiNum === 15) ? 'Пурнима' : (tithiNum === 30) ? 'Амавасья' : TITHI_NAMES_HALF[(tithiNum - 1) % 15];
  const yoga = Math.floor(norm360(sidSun + sidMoon) / (360 / YOGA_COUNT));
  const karanaIdx = Math.floor(d / 6);                            // 0..59
  const karana = (karanaIdx === 0) ? 'Кимстугхна' : (karanaIdx >= 57) ? ['Шакуни','Чатушпада','Нага'][karanaIdx - 57] : KARANA_MOVABLE[(karanaIdx - 1) % 7];
  return { tithi: tithiNum, tithiName, paksha, vara: VARA_RU[birthLocal.getUTCDay()], yoga: yoga + 1, karana };
}
// Классические йоги (базовый проверяемый набор; список не полный).
const EXALT = { Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200 };  // сид. долготы экзальтаций
function jyotishYogas(sid) {
  const L = {}; sid.forEach(p => L[p.body] = p.lon);
  const kendra = (a, b) => [0, 3, 6, 9].includes((Math.floor(L[a] / 30) - Math.floor(L[b] / 30) + 12) % 12);
  const conj = (a, b) => Math.abs(((L[a] - L[b] + 180) % 360 + 360) % 360 - 180) < 12 && Math.floor(L[a] / 30) === Math.floor(L[b] / 30);
  const out = [];
  if (kendra('Jupiter', 'Moon')) out.push('Гаджакесари (Юпитер в кендре от Луны)');
  if (conj('Mercury', 'Sun')) out.push('Будха-Адитья (Меркурий с Солнцем)');
  if (conj('Moon', 'Mars')) out.push('Чандра-Мангала (Луна с Марсом)');
  return out;
}
// Уччабала (сила экзальтации, шаштиамши 0..60) — простейший компонент Шадбалы.
// Полная Шадбала (6 компонентов с поправками) отложена — задокументировано.
function ucchaBala(body, sidLon) {
  if (!(body in EXALT)) return null;
  const deb = norm360(EXALT[body] + 180);
  const dist = Math.abs(((sidLon - deb + 180) % 360 + 360) % 360 - 180);
  return Math.round(dist / 180 * 60 * 10) / 10;
}
// ─── АРАБСКИЕ ТОЧКИ И НЕПОДВИЖНЫЕ ЗВЁЗДЫ (очередь 4) ────────────────
// Арабские точки — классические формулы из арабских трактатов (public domain
// по возрасту). ИСТОРИЧЕСКАЯ техника: подаётся без драматизации, как
// историко-технический слой, не предсказание. Неподвижные звёзды — эклиптические
// долготы J2000 по открытым каталогам (Hipparcos) + прецессия 50.2888″/год.
const FIXED_STARS = [ // эклиптические долготы J2000 (открытые каталоги)
  { name: 'Альгол',      lon: 56.17 }, { name: 'Альциона',   lon: 59.98 },
  { name: 'Альдебаран',  lon: 69.79 }, { name: 'Бетельгейзе', lon: 88.75 },
  { name: 'Сириус',      lon: 104.08 }, { name: 'Регул',      lon: 149.83 },
  { name: 'Спика',       lon: 203.83 }, { name: 'Антарес',    lon: 249.76 },
  { name: 'Вега',        lon: 285.32 }, { name: 'Фомальгаут', lon: 333.87 },
];
const STAR_ORB = 1.0;
function fixedStarLon(starJ2000Lon, t) { return norm360(starJ2000Lon + PRECESSION_DEG_PER_YEAR * (t.tt / 365.25)); }
function computeFixedStarHits(chart, t) {
  const hits = [];
  for (const st of FIXED_STARS) {
    const L = fixedStarLon(st.lon, t);
    for (const p of chart.planets) {
      const sep = Math.abs(((p.lon - L + 180) % 360 + 360) % 360 - 180);
      if (sep <= STAR_ORB) hits.push({ star: st.name, planet: p.name, orb: sep.toFixed(2), starLon: L });
    }
    if (chart.angles) {
      for (const [nm, lon] of [['Asc', chart.angles.asc.lon], ['MC', chart.angles.mc.lon]]) {
        const sep = Math.abs(((lon - L + 180) % 360 + 360) % 360 - 180);
        if (sep <= STAR_ORB) hits.push({ star: st.name, planet: nm, orb: sep.toFixed(2), starLon: L });
      }
    }
  }
  return hits.sort((a, b) => parseFloat(a.orb) - parseFloat(b.orb));
}
// Арабские точки (классика; формула day/night по высоте Солнца как у PoF).
function computeArabicParts(chart) {
  if (!chart.angles || !chart.points || !chart.points.fortune) return null;
  const L = {}; chart.planets.forEach(p => L[p.body] = p.lon);
  const asc = chart.angles.asc.lon, desc = norm360(asc + 180);
  const isDay = chart.points.fortune.isDay;
  const parts = [
    { name: 'Точка Духа',   lon: isDay ? norm360(asc + L.Sun - L.Moon) : norm360(asc + L.Moon - L.Sun) },
    { name: 'Точка Брака',  lon: norm360(asc + desc - L.Venus) },
    { name: 'Точка Болезни (истор.)', lon: isDay ? norm360(asc + L.Mars - L.Saturn) : norm360(asc + L.Saturn - L.Mars) },
  ];
  const cusps = (chart.housesMeta && chart.housesMeta.cusps) || (chart.houses && chart.houses.cusps);
  if (cusps) parts.push({ name: 'Точка Смерти (истор.)', lon: norm360(asc + cusps[8] - L.Moon) });
  return parts.map(p => ({ ...p, sign: zodiacOf(p.lon).sign, deg: zodiacOf(p.lon).deg }));
}
async function rPartsStars() {
  const out = $('astro-parts'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last || !DB.astroBirth) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай натальную карту.</div>'; return; }
  try {
    await loadAstroEngine();
    const t = window.Astronomy.MakeTime(birthUTCDate(DB.astroBirth));
    const parts = computeArabicParts(last.chart);
    const stars = computeFixedStarHits(last.chart, t);
    let html = '';
    if (parts) {
      html += '<div class="f-lbl" style="margin-top:.5rem">Арабские точки <span style="font-weight:500;color:var(--t3)">(историческая техника)</span></div>' +
        parts.map(p => `<div class="si-text" style="color:var(--t3)">${esc(p.name)}: ${esc(p.sign)} ${p.deg.toFixed(1)}°</div>`).join('');
    } else html += '<div class="si-text" style="color:var(--t3)">Арабские точки требуют известного времени рождения.</div>';
    html += '<div class="f-lbl" style="margin-top:.4rem">Неподвижные звёзды (соединения, орб 1°)</div>' +
      (stars.length ? stars.map(s => `<div class="si-text" style="color:var(--t3)">${esc(s.planet)} ∪ ${esc(s.star)} (орб ${s.orb}°)</div>`).join('')
        : '<div class="si-text" style="color:var(--t3)">Нет соединений с ключевыми звёздами в орбе 1°.</div>');
    html += '<div class="be-note" style="color:var(--t3)">Историко-символический слой (классические трактаты; каталог Hipparcos + прецессия). Без драматизации: это не события и не диагнозы. Первичные дирекции и ректификация — research-preview, не реализованы.</div>';
    out.innerHTML = html;
  } catch (e) { out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать.</div>'; }
}

// Сетка South Indian: фиксированные позиции знаков (по часовой от Овна).
// North Indian стиль — отложен (задокументировано в README).
const SOUTH_GRID = [['Рыбы', 'Овен', 'Телец', 'Близнецы'], ['Водолей', null, null, 'Рак'], ['Козерог', null, null, 'Лев'], ['Стрелец', 'Скорпион', 'Весы', 'Дева']];
const JYO_ABBR = { Sun: 'Сл', Moon: 'Лн', Mercury: 'Ме', Venus: 'Ве', Mars: 'Ма', Jupiter: 'Юп', Saturn: 'Са', Uranus: 'Ур', Neptune: 'Не', Pluto: 'Пл' };
const DASHA_THEMES = { 'Кету': 'отпускание и глубинный опыт', 'Венера': 'отношения и чувство ценного', 'Солнце': 'ясность и самовыражение', 'Луна': 'чувства и забота', 'Марс': 'энергия и решимость', 'Раху': 'новизна и сильные желания', 'Юпитер': 'рост и смысл', 'Сатурн': 'структура и зрелость', 'Меркурий': 'учёба и связи' };
function jyoGrid(placed) {   // placed: { 'Овен': ['Сл','Лн'], … }
  return '<div class="jyo-grid">' + SOUTH_GRID.map(row => row.map(sign => {
    if (!sign) return '<div class="jyo-cell jyo-empty"></div>';
    const items = placed[sign] || [];
    return `<div class="jyo-cell"><div class="jyo-sign">${esc(sign.slice(0, 3))}</div><div class="jyo-pl">${items.map(esc).join(' ')}</div></div>`;
  }).join('')).join('') + '</div>';
}
function jtab(t) { STATE.jyoTab = t;
  document.querySelectorAll('#astro-jtabs .snpill').forEach(p => p.classList.toggle('on', p.dataset.jt === t));
  rJyotish();
}
async function rJyotish() {
  const out = $('astro-jyo'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last || !DB.astroBirth) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай натальную карту.</div>'; return; }
  out.innerHTML = '<div class="ai-sp-empty">Считаю джйотиш…</div>';
  try {
    await loadAstroEngine();
    const A = window.Astronomy;
    const b0 = birthUTCDate(DB.astroBirth);
    const t = A.MakeTime(b0);
    const ayaKey = ($('astro-aya') && $('astro-aya').value) || 'lahiri';
    const aya = ayanamsha(ayaKey, t);
    const sid = last.chart.planets.map(p => { const L = norm360(p.lon - aya); return { body: p.body, name: p.name, lon: L, sign: RASHI[Math.floor(L / 30)], deg: L % 30 }; });
    const rahu = norm360(meanRahuLon(t) - aya), ketu = norm360(rahu + 180);
    const moon = sid.find(p => p.body === 'Moon'), sun = sid.find(p => p.body === 'Sun');
    const dasha = vimshottariDasha(moon.lon, b0, new Date());
    const tab = STATE.jyoTab || 'rashi';
    let html = '';
    if (tab === 'rashi') {
      // Сетка индексируется западными именами знаков (SOUTH_GRID) — кладём по индексу.
      const placed = {};
      const put = (idx, abbr, first) => { const k = ZODIAC[idx]; placed[k] = placed[k] || []; first ? placed[k].unshift(abbr) : placed[k].push(abbr); };
      sid.forEach(p => put(Math.floor(p.lon / 30), JYO_ABBR[p.body] || p.name[0]));
      put(Math.floor(rahu / 30), 'Ра'); put(Math.floor(ketu / 30), 'Ке');
      if (last.chart.angles) put(Math.floor(norm360(last.chart.angles.asc.lon - aya) / 30), 'Лг', true);
      html = `<div class="f-lbl">Раши D1 · South Indian (${esc(AYANAMSHAS[ayaKey].ru)}, айанамша ${aya.toFixed(2)}°)</div>` + jyoGrid(placed) +
        sid.map(p => `<div class="si-text" style="color:var(--t3)">${esc(p.name)}: ${esc(p.sign)} ${p.deg.toFixed(1)}°${(ucchaBala(p.body, p.lon) != null) ? ' · уччабала ' + ucchaBala(p.body, p.lon) : ''}</div>`).join('') +
        `<div class="si-text" style="color:var(--t3)">Раху (ср.): ${esc(RASHI[Math.floor(rahu / 30)])} ${(rahu % 30).toFixed(1)}° · Кету: ${esc(RASHI[Math.floor(ketu / 30)])} ${(ketu % 30).toFixed(1)}°</div>` +
        `<div class="si-text" style="margin-top:.3rem">Накшатра Луны: <b>${esc(dasha.nakshatra)}</b>, пада ${dasha.pada}</div>`;
    }
    if (tab === 'navamsha') {
      const placed = {};
      sid.forEach(p => { const s = ZODIAC[vargaSign(9, p.lon)]; (placed[s] = placed[s] || []).push(JYO_ABBR[p.body] || p.name[0]); });
      html = '<div class="f-lbl">Навамша D9 · South Indian</div>' + jyoGrid(placed) +
        `<div class="si-text" style="color:var(--t3)">D10 (дашамша): ` + ['Sun', 'Moon'].map(b => { const p = sid.find(x => x.body === b); return `${esc(p.name)} — ${esc(RASHI[vargaSign(10, p.lon)])}`; }).join(' · ') + '</div>' +
        '<div class="si-text" style="color:var(--t3)">Также считаются: D7, D12 (D16–D60 отложены).</div>';
    }
    if (tab === 'dasha') {
      if (dasha.current) {
        const theme = DASHA_THEMES[dasha.current.lord];
        html = `<div class="si-row"><div class="si-body"><div class="si-text"><b>Сейчас — маха-даша ${esc(dasha.current.lord)}</b> (до ${dasha.current.to.toISOString().slice(0, 10)})${theme ? `: большой период, окрашенный темой «${esc(theme)}»` : ''}.${dasha.antar ? ` Внутри — антардаша ${esc(dasha.antar.lord)} (до ${dasha.antar.to.toISOString().slice(0, 10)}).` : ''}</div></div></div>`;
      }
      html += '<div class="f-lbl" style="margin-top:.4rem">Полный цикл Вимшоттари (120 лет)</div>' +
        dasha.seq.map(d => `<div class="si-text" style="color:${d === dasha.current ? 'var(--t1)' : 'var(--t3)'}">${esc(d.lord)}: ${d.from.toISOString().slice(0, 10)} — ${d.to.toISOString().slice(0, 10)}</div>`).join('');
    }
    if (tab === 'panchanga') {
      const pan = panchanga(sun.lon, moon.lon, new Date(b0.getTime() + (DB.astroBirth.utcOffset || 0) * 3600e3));
      const yogas = jyotishYogas(sid);
      html = `<div class="f-lbl">Панчанга рождения</div><div class="si-text" style="color:var(--t3)">Тити: ${esc(pan.tithiName)} (${pan.paksha}, №${pan.tithi}) · Вара: ${esc(pan.vara)} · Йога: №${pan.yoga} · Карана: ${esc(pan.karana)}</div>`;
      if (yogas.length) html += '<div class="f-lbl" style="margin-top:.4rem">Йоги</div>' + yogas.map(y => `<div class="si-text" style="color:var(--t3)">${esc(y)}</div>`).join('');
    }
    html += '<div class="be-note" style="color:var(--t3)">Джйотиш — сидерическая традиция. Символическое; не прогноз и не диагноз. Айанамша — линейная аппроксимация (±минуты дуги); вара без коррекции на восход; North Indian стиль, D16–D60 и полная Шадбала — отложены.</div>';
    out.innerHTML = html;
  } catch (e) { out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать.</div>'; }
}

// Темы домов (для профекций и текстов; краткие, без предписаний).
const HOUSE_THEMES = { 1: 'личность и начинания', 2: 'ресурсы и самоценность', 3: 'общение и учёба', 4: 'дом и корни', 5: 'творчество и радость', 6: 'уклад и мастерство', 7: 'партнёрство', 8: 'глубокие перемены', 9: 'смысл и горизонты', 10: 'призвание', 11: 'друзья и планы', 12: 'внутренний мир' };
function psub(seg) { STATE.progSeg = seg;
  document.querySelectorAll('#astro-ptabs .snpill').forEach(p => p.classList.toggle('on', p.dataset.ps === seg));
  rPrognostics();
}
async function rPrognostics() {
  const out = $('astro-prog'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last || !DB.astroBirth) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай натальную карту.</div>'; return; }
  out.innerHTML = '<div class="ai-sp-empty">Считаю прогностику…</div>';
  try {
    await loadAstroEngine();
    try { await loadAstroRules(); } catch (e) {}
    const seg = STATE.progSeg || 'secondary';
    // Возраст на момент расчёта: поле (лет) или текущий.
    const ageIn = parseFloat($('astro-prog-age') && $('astro-prog-age').value);
    const b0 = birthUTCDate(DB.astroBirth);
    const at = isFinite(ageIn) && ageIn >= 0 ? new Date(b0.getTime() + ageIn * YEAR_DAYS * 864e5) : new Date();
    const dir = computeDirections(last.chart, DB.astroBirth, at);
    const wheelEl = $('astro-prog-wheel');
    const R = window.ASTRO_RULES;
    let html = '';
    if (seg === 'secondary') {
      const sec = computeProgressions(DB.astroBirth, at, 'secondary');
      const ter = computeProgressions(DB.astroBirth, at, 'tertiary');
      if (wheelEl) wheelEl.innerHTML = renderChartWheel(last.chart, { size: 340, static: true, transits: sec.planets });
      html = `<div class="f-lbl">Вторичные прогрессии (возраст ${dir.ageYears.toFixed(1)}; снаружи колеса)</div>` +
        sec.planets.map(p => `<div class="si-text" style="color:var(--t3)">${esc(p.name)}: ${esc(p.sign)} ${p.deg.toFixed(1)}°</div>`).join('');
      const ps = sec.planets.find(p => p.body === 'Sun');
      if (R && ps && R.planetInSign.Sun[ps.sign]) html += `<div class="si-row" style="margin-top:.4rem"><div class="si-body"><div class="si-text"><b>Сейчас по символическому таймингу звучит тема (${esc(ps.sign)}):</b> ${esc(R.planetInSign.Sun[ps.sign])}</div></div></div>`;
      html += `<div class="f-lbl" style="margin-top:.4rem">Третичные (1 день = 1 лунный месяц)</div>` +
        ter.planets.slice(0, 3).map(p => `<div class="si-text" style="color:var(--t3)">${esc(p.name)}: ${esc(p.sign)} ${p.deg.toFixed(1)}°</div>`).join('');
    }
    if (seg === 'solararc') {
      if (wheelEl) wheelEl.innerHTML = renderChartWheel(last.chart, { size: 340, static: true, transits: dir.directed });
      html = `<div class="f-lbl">Солнечная дуга (возраст ${dir.ageYears.toFixed(1)}; снаружи колеса)</div>
        <div class="si-text" style="color:var(--t3)">Дуга: ${dir.solarArc.toFixed(2)}° · Найбод: ${dir.naibod.toFixed(2)}°</div>` +
        dir.directed.map(p => `<div class="si-text" style="color:var(--t3)">SA ${esc(p.name)}: ${esc(p.sign)} ${p.deg.toFixed(1)}°</div>`).join('');
    }
    if (seg === 'profection') {
      if (wheelEl) wheelEl.innerHTML = '';
      if (dir.profection) {
        html = `<div class="f-lbl">Годовые профекции</div>
          <div class="si-row"><div class="si-body"><div class="si-text"><b>Возраст ${dir.profection.age}: год ${dir.profection.house}-го дома (${esc(dir.profection.sign)}).</b> В фокусе года — ${esc(HOUSE_THEMES[dir.profection.house] || '')}. Хозяин года ведётся по знаку ${esc(dir.profection.sign)}.</div></div></div>`;
      } else html = '<div class="ai-sp-empty">Профекции требуют известного времени рождения (нужен Асцендент).</div>';
    }
    html += '<div class="be-note" style="color:var(--t3)">Символический тайминг (день=год; Найбод; эллинистические профекции). Не событие и не прогноз.</div>';
    out.innerHTML = html;
  } catch (e) { out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать.</div>'; }
}
async function rReturns() {
  const out = $('astro-ret'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last || !DB.astroBirth) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай натальную карту.</div>'; return; }
  out.innerHTML = '<div class="ai-sp-empty">Ищу возвращение…</div>';
  try {
    await loadAstroEngine();
    try { await loadAstroRules(); } catch (e) {}
    const natal = last.chart;
    const type = ($('astro-ret-type') && $('astro-ret-type').value) || 'solar';
    const plbl = $('astro-ret-plbl'); if (plbl) plbl.textContent = type === 'solar' ? 'Год' : 'Дата (ГГГГ-ММ-ДД)';
    const period = ($('astro-ret-period') && $('astro-ret-period').value.trim()) || '';
    const sunN = natal.planets.find(p => p.body === 'Sun').lon;
    const moonN = natal.planets.find(p => p.body === 'Moon').lon;
    let ret = null, title = '';
    if (type === 'solar') {
      // Год: соляр ищется вокруг дня рождения выбранного года.
      const y = /^\d{4}$/.test(period) ? parseInt(period, 10) : new Date().getFullYear();
      const [, bm, bd] = (DB.astroBirth.date || '2000-01-01').split('-').map(Number);
      ret = searchReturn('Sun', sunN, new Date(Date.UTC(y, bm - 1, bd - 10)), 30);   // отрицательный день корректно уходит в прошлый месяц
      title = `Соляр ${y}`;
    } else {
      const near = /^\d{4}-\d{2}-\d{2}$/.test(period) ? new Date(period + 'T00:00:00Z') : new Date();
      ret = searchReturn('Moon', moonN, new Date(near.getTime() - 15 * 864e5), 30);
      title = 'Лунар';
    }
    const wheelEl = $('astro-ret-wheel');
    if (!ret) { if (wheelEl) wheelEl.innerHTML = ''; out.innerHTML = '<div class="ai-sp-empty">Возвращение не найдено в окне поиска.</div>'; return; }
    const pl = bodiesAt(window.Astronomy.MakeTime(ret));
    if (wheelEl) wheelEl.innerHTML = renderChartWheel(natal, { size: 340, static: true, transits: pl });
    let html = `<div class="f-lbl">${esc(title)}: ${ret.toISOString().slice(0, 16).replace('T', ' ')} UTC</div>` +
      pl.map(p => `<div class="si-text" style="color:var(--t3)">${esc(p.name)}: ${esc(p.sign)} ${p.deg.toFixed(1)}°</div>`).join('');
    // Ключевые аспекты карты возврата к наталу (карточки, по силе).
    const tr = computeTransits(natal, ret);
    const hits = [...tr.hits].sort((a, b) => parseFloat(a.exact) - parseFloat(b.exact)).slice(0, 6);
    if (hits.length) html += '<div class="f-lbl" style="margin-top:.4rem">Ключевые аспекты к наталу</div>' +
      hits.map(h => { const tx = transitHitText(h);
        return `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(h.transit)} → ваш ${esc(h.natal)}.</b> ${tx ? esc(tx.text) : esc(h.aspect)}</div>
          <div class="si-text" style="color:var(--t4);font-size:.72rem">${esc(h.aspect)} · точность ${h.exact}°</div></div></div>`; }).join('');
    html += '<div class="be-note" style="color:var(--t3)">Момент точного возвращения светила в натальную долготу — символическая карта периода, не прогноз.</div>';
    out.innerHTML = html;
  } catch (e) { out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать.</div>'; }
}
// Мидпоинты — классическая уранская астрология (Витте/Эбертин), формула
// общеизвестна: середина КОРОТКОЙ дуги между двумя долготами. Дерево
// мидпоинтов: какие натальные точки стоят в ЖЁСТКОМ аспекте (0/45/90/135/180°)
// к мидпоинту пары — орб 1.5° (версия midpoints-v1). Гармоники — техника
// Джона Аддея: долгота × N (mod 360). Обе техники — открытая арифметика.
function midpointLon(a, b) {
  const m = norm360((a + b) / 2);
  // Выбираем середину короткой дуги: если m дальше 90° от a — берём m+180.
  const sep = Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  const dm = Math.abs(((m - a + 180) % 360 + 360) % 360 - 180);
  return (Math.abs(dm - sep / 2) < 1e-9) ? m : norm360(m + 180);
}
const MIDPOINT_ORB = 1.5;
const HARD_ANGLES = [0, 45, 90, 135, 180];
// Дерево мидпоинтов: точки карты (планеты + Asc/MC) в жёстком аспекте к
// мидпоинтам пар планет. Возвращает [{point, pair, angle, orb}].
function computeMidpointTree(chart) {
  const pts = chart.planets.map(p => ({ name: p.name, lon: p.lon }));
  if (chart.angles) { pts.push({ name: 'Asc', lon: chart.angles.asc.lon }); pts.push({ name: 'MC', lon: chart.angles.mc.lon }); }
  const hits = [];
  for (let i = 0; i < chart.planets.length; i++) for (let j = i + 1; j < chart.planets.length; j++) {
    const A1 = chart.planets[i], B1 = chart.planets[j];
    const m = midpointLon(A1.lon, B1.lon);
    for (const pt of pts) {
      if (pt.name === A1.name || pt.name === B1.name) continue;
      const sep = Math.abs(((pt.lon - m + 180) % 360 + 360) % 360 - 180);
      for (const ang of HARD_ANGLES) {
        if (Math.abs(sep - ang) <= MIDPOINT_ORB) { hits.push({ point: pt.name, pair: A1.name + '/' + B1.name, angle: ang, orb: Math.abs(sep - ang).toFixed(2) }); break; }
      }
    }
  }
  hits.sort((x, y) => parseFloat(x.orb) - parseFloat(y.orb));
  return hits;
}
// Гармоническая карта: долготы × n (mod 360) + соединения в гармонике (орб 6°).
function computeHarmonic(chart, n) {
  const planets = chart.planets.map(p => { const L = norm360(p.lon * n); const z = zodiacOf(L); return { name: p.name, lon: L, sign: z.sign, deg: z.deg }; });
  const conj = [];
  for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
    const sep = Math.abs(((planets[i].lon - planets[j].lon + 180) % 360 + 360) % 360 - 180);
    if (sep <= 6) conj.push({ a: planets[i].name, b: planets[j].name, orb: sep.toFixed(1) });
  }
  return { n, planets, conj, versions: { harmonic: 'addey-v1(orb6)' } };
}
function rMidpoints() {
  const out = $('astro-mid'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай натальную карту.</div>'; return; }
  const hits = computeMidpointTree(last.chart);
  out.innerHTML = '<div class="f-lbl" style="margin-top:.5rem">Дерево мидпоинтов <span style="font-weight:500;color:var(--t3)">(жёсткие аспекты, орб 1.5°)</span></div>' +
    (hits.length ? hits.slice(0, 15).map(h => `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(h.point)}</b> = ${esc(h.pair)} (${h.angle}°, орб ${h.orb}°)</div></div></div>`).join('')
      : '<div class="si-text" style="color:var(--t3)">Нет попаданий в орб 1.5°.</div>') +
    '<div class="be-note" style="color:var(--t3)">Уранская техника (Витте/Эбертин). Символическое, не прогноз.</div>';
}
function rHarmonic() {
  const out = $('astro-harm'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай натальную карту.</div>'; return; }
  const n = Math.max(2, Math.min(64, parseInt(($('astro-harm-n') && $('astro-harm-n').value) || '5', 10) || 5));
  const h = computeHarmonic(last.chart, n);
  out.innerHTML = `<div class="f-lbl" style="margin-top:.5rem">Гармоника H${n}</div>` +
    h.planets.map(p => `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(p.name)}</b> — ${esc(p.sign)} ${p.deg.toFixed(1)}°</div></div></div>`).join('') +
    (h.conj.length ? '<div class="f-lbl" style="margin-top:.4rem">Соединения в гармонике</div>' + h.conj.map(c => `<div class="si-text" style="color:var(--t3)">${esc(c.a)} ∪ ${esc(c.b)} (орб ${c.orb}°)</div>`).join('') : '') +
    '<div class="be-note" style="color:var(--t3)">Техника Дж. Аддея: долгота × N. Символическое.</div>';
}

// ─── СИСТЕМЫ ДОМОВ (очередь 1.1) ────────────────────────────────────
// Формулы — открытая сферическая астрономия (public domain):
//  · Equal — Asc + 30°·k; Whole-sign — знаковые границы от знака Asc.
//  · Placidus — классическая итерация полудуговых долей через ascensional
//    difference (AD = asin(tan φ · tan δ)).
//  · Campanus — деление первой вертикали на 30°-сектора; куспид = пересечение
//    эклиптики с большим кругом через северную точку горизонта (численно).
//  · Regiomontanus — то же, но делится небесный экватор.
//  Инварианты (golden): куспид 1 = Asc; куспид 10 = MC (квадрантные);
//  противоположные куспиды отличаются на 180°; при φ=0 все квадрантные
//  системы совпадают (AD=0 → равные деления экватора).
//  Koch НЕ реализован сознательно: открытой формулы с достаточной
//  уверенностью нет — отложен, вместо тихой неточности (см. README).
const DEG = Math.PI / 180;
const norm360 = x => ((x % 360) + 360) % 360;
// Точка эклиптики (β=0) с данной RA → эклиптическая долгота.
function raToEclLon(ra, eps) { return norm360(Math.atan2(Math.sin(ra * DEG), Math.cos(ra * DEG) * Math.cos(eps * DEG)) / DEG); }
function placidusCusp(fr, nocturnal, ramc, eps, phi) {
  let RA = ramc + (nocturnal ? 180 - fr * 90 : fr * 90);
  for (let i = 0; i < 40; i++) {
    const lam = raToEclLon(RA, eps);
    const dec = Math.asin(Math.sin(eps * DEG) * Math.sin(lam * DEG));
    const x = Math.max(-1, Math.min(1, Math.tan(phi * DEG) * Math.tan(dec)));
    const AD = Math.asin(x) / DEG;
    RA = nocturnal ? ramc + 180 - fr * (90 - AD) : ramc + fr * (90 + AD);
  }
  return raToEclLon(RA, eps);
}
// Численное пересечение эклиптики с кругом дома (Campanus/Regiomontanus).
// Базис горизонта в экваториальных координатах: Z (зенит), N (север), E=N×Z.
function circleCusp(system, k, ramc, eps, phi) {
  const th = ramc * DEG, ph = phi * DEG;
  const Z = [Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)];
  const N = [-Math.sin(ph) * Math.cos(th), -Math.sin(ph) * Math.sin(th), Math.cos(ph)];
  const E = [N[1] * Z[2] - N[2] * Z[1], N[2] * Z[0] - N[0] * Z[2], N[0] * Z[1] - N[1] * Z[0]];
  const a = (k - 1) * 30 * DEG;   // домовый угол вниз от восточной точки
  let p;
  if (system === 'campanus') p = [Math.cos(a) * E[0] - Math.sin(a) * Z[0], Math.cos(a) * E[1] - Math.sin(a) * Z[1], Math.cos(a) * E[2] - Math.sin(a) * Z[2]];
  else { const ra = th + Math.PI / 2 + a; p = [Math.cos(ra), Math.sin(ra), 0]; }   // regiomontanus: деление экватора
  const w = [N[1] * p[2] - N[2] * p[1], N[2] * p[0] - N[0] * p[2], N[0] * p[1] - N[1] * p[0]];
  const ecl = lam => [Math.cos(lam * DEG), Math.sin(lam * DEG) * Math.cos(eps * DEG), Math.sin(lam * DEG) * Math.sin(eps * DEG)];
  const f = lam => { const e = ecl(lam); return w[0] * e[0] + w[1] * e[1] + w[2] * e[2]; };
  const dotp = lam => { const e = ecl(lam); return e[0] * p[0] + e[1] * p[1] + e[2] * p[2]; };
  const roots = [];
  let prev = f(0);
  for (let d = 1; d <= 360; d++) {
    const cur = f(d);
    if (prev === 0 || prev * cur < 0) {
      let lo = d - 1, hi = d;
      for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; (f(lo) * f(mid) <= 0) ? hi = mid : lo = mid; }
      roots.push(norm360((lo + hi) / 2));
    }
    prev = cur;
  }
  const good = roots.filter(r => dotp(r) > 0);
  return good.length ? good[0] : (roots[0] || 0);
}
// 12 куспидов для системы. ctx: { asc, mc, ramc, eps, phi } в градусах.
function houseCusps(system, ctx) {
  const c = new Array(13).fill(0);
  if (system === 'whole') { const s = Math.floor(ctx.asc / 30) * 30; for (let k = 1; k <= 12; k++) c[k] = norm360(s + (k - 1) * 30); return c; }
  if (system === 'equal') { for (let k = 1; k <= 12; k++) c[k] = norm360(ctx.asc + (k - 1) * 30); return c; }
  c[1] = ctx.asc; c[10] = ctx.mc; c[4] = norm360(ctx.mc + 180); c[7] = norm360(ctx.asc + 180);
  if (system === 'placidus') {
    c[11] = placidusCusp(1 / 3, false, ctx.ramc, ctx.eps, ctx.phi);
    c[12] = placidusCusp(2 / 3, false, ctx.ramc, ctx.eps, ctx.phi);
    c[2]  = placidusCusp(2 / 3, true,  ctx.ramc, ctx.eps, ctx.phi);
    c[3]  = placidusCusp(1 / 3, true,  ctx.ramc, ctx.eps, ctx.phi);
  } else {   // campanus | regiomontanus
    for (const k of [11, 12, 2, 3]) c[k] = circleCusp(system, k, ctx.ramc, ctx.eps, ctx.phi);
  }
  c[5] = norm360(c[11] + 180); c[6] = norm360(c[12] + 180); c[8] = norm360(c[2] + 180); c[9] = norm360(c[3] + 180);
  return c;
}
// Дом планеты по куспидам: k, если долгота лежит в [cusp_k, cusp_{k+1}) по ходу.
function houseOfLon(lon, cusps) {
  for (let k = 1; k <= 12; k++) {
    const a = cusps[k], b = cusps[k === 12 ? 1 : k + 1];
    const span = norm360(b - a), off = norm360(lon - a);
    if (off < span || span === 0) return k;
  }
  return 12;
}

// Транзиты: положения планет на момент времени + аспекты транзит→натал.
// Орб-политика транзитов (уже натальной) версионирована отдельно.
const TRANSIT_ORB = 3; // transit-orbs-v1: все мажорные аспекты, орб 3°
function computeTransits(natalChart, at) {
  const A = window.Astronomy;
  if (!A) throw new Error('движок не загружен');
  const t = A.MakeTime(at || new Date());
  const current = ASTRO_BODIES.map(b => {
    let lon;
    if (b === 'Sun') lon = A.SunPosition(t).elon;
    else if (b === 'Moon') lon = A.EclipticGeoMoon(t).lon;
    else lon = A.Ecliptic(A.GeoVector(A.Body[b], t, true)).elon;
    const z = zodiacOf(lon);
    return { body: b, name: ASTRO_RU[b], lon: z.lon, sign: z.sign, deg: z.deg };
  });
  const hits = [];
  if (natalChart && natalChart.planets) {
    for (const tr of current) for (const na of natalChart.planets) {
      const sep = Math.abs(((tr.lon - na.lon + 180) % 360 + 360) % 360 - 180);
      for (const asp of ASTRO_ASPECTS) {
        if (Math.abs(sep - asp.angle) <= TRANSIT_ORB) { hits.push({ transit: tr.name, aspect: asp.name, natal: na.name, exact: Math.abs(sep - asp.angle).toFixed(1) }); break; }
      }
    }
  }
  return { current, hits, versions: { ...ASTRO_VERSIONS, transitOrbPolicy: 'transit-orbs-v1(3)' }, at: (at || new Date()).toISOString() };
}
// Текстовая карточка транзитного аспекта (Слой 1: transitGift/Verb + темы).
function transitHitText(h) {
  const R = window.ASTRO_RULES; if (!R || !R.transitGift) return null;
  const byRu = {}; Object.keys(ASTRO_RU).forEach(b => byRu[ASTRO_RU[b]] = b);
  const trB = byRu[h.transit], naB = byRu[h.natal];
  const gift = trB && R.transitGift[trB], verb = R.transitVerb[h.aspect], theme = naB && R.planetTheme[naB];
  if (!gift || !verb || !theme) return null;
  const strong = parseFloat(h.exact) < 1;
  const g = strong ? gift.charAt(0).toLowerCase() + gift.slice(1) : gift;
  return { text: `${strong ? 'Особенно ощутимо: ' : ''}${g} ${verb} «${theme}».`,
    ruleId: `transit.${trB}.${h.aspect}.${naB}` };
}
async function runTransits() {
  const out = $('astro-transits'); if (out) out.innerHTML = '<div class="ai-sp-empty">Считаю транзиты…</div>';
  try {
    await loadAstroEngine();
    try { await loadAstroRules(); } catch (e) {}   // тексты опциональны, расчёт важнее
    // Календарь: любая дата, не только «сегодня» (полдень выбранного дня).
    const di = $('astro-tr-date');
    const dv = (di && di.value.trim()) || '';
    let at = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dv)) at = new Date(dv + 'T12:00:00');
    else if (di) di.value = todayKey();
    const isToday = !dv || dv === todayKey();
    const last = (DB.astroCharts || []).slice(-1)[0];
    const tr = computeTransits(last && last.chart, at);
    const wheelEl = $('astro-tr-wheel');
    if (wheelEl) wheelEl.innerHTML = last ? renderChartWheel(last.chart, { size: 340, static: true, transits: tr.current }) : '';
    // «Небо сейчас» — свёрнуто по умолчанию.
    let html = `<button class="btn btn-s btn-full" onclick="const d=$('astro-sky');d.style.display=d.style.display==='none'?'block':'none'">Небо ${isToday ? 'сейчас' : 'на ' + esc(dv)} — показать/скрыть</button>` +
      '<div id="astro-sky" style="display:none">' +
      tr.current.map(p => `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(p.name)}</b> — ${esc(p.sign)} ${p.deg.toFixed(1)}°</div></div></div>`).join('') + '</div>';
    // Активные аспекты: карточки с текстом, сортировка по силе (меньший орб первым).
    const hits = [...tr.hits].sort((a, b) => parseFloat(a.exact) - parseFloat(b.exact));
    if (hits.length) {
      html += '<div class="f-lbl" style="margin-top:.5rem">Активные аспекты к вашей карте</div>' +
        hits.slice(0, 12).map(h => {
          const tx = transitHitText(h);
          return `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(h.transit)} → ваш ${esc(h.natal)}.</b> ${tx ? esc(tx.text) : esc(h.aspect)}</div>
            <div class="si-text" style="color:var(--t4);font-size:.72rem"${tx ? ` data-rule="${esc(tx.ruleId)}"` : ''}>${esc(h.aspect)} · точность ${h.exact}°</div></div></div>`;
        }).join('');
    } else if (last) {
      html += `<div class="si-text" style="color:var(--t3);margin:.4rem 0">${isToday ? 'Сейчас' : 'В этот день'} нет точных мажорных аспектов к натальной карте (в пределах 3°).</div>`;
    } else {
      html += '<div class="si-text" style="color:var(--t3);margin:.4rem 0">Рассчитай натальную карту, чтобы видеть аспекты к ней.</div>';
    }
    if (last && getAiKey()) html += `<button class="btn btn-s btn-full" onclick="aiDeepFromTransits()">🔮 Глубокий анализ (с учётом моих данных)</button>`;
    html += `<div class="be-note" style="margin-top:.6rem;color:var(--t3)">Символический снимок момента в западной традиции. Не событие и не прогноз.</div>`;
    if (out) out.innerHTML = html;
  } catch (e) {
    if (out) out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать. Попробуй ещё раз.</div>';
  }
}
// Режим 2 с экрана транзитов: результат показывается на экране карты.
async function aiDeepFromTransits() { await aiDeepAstroAnalysis(); asub('natal'); }
function saveAstroBirth() {
  const date = ($('ab-date') ? $('ab-date').value : '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Дата в формате ГГГГ-ММ-ДД', 'warn'); return; }
  const timeKnown = $('ab-time-known') ? $('ab-time-known').classList.contains('on') : false;
  const time = ($('ab-time') ? $('ab-time').value : '').trim();
  if (timeKnown && !/^\d{2}:\d{2}$/.test(time)) { toast('Время в формате ЧЧ:ММ', 'warn'); return; }
  const utcOffset = parseFloat($('ab-utc') ? $('ab-utc').value : '0') || 0;
  const lat = parseFloat($('ab-lat') ? $('ab-lat').value : ''); const lon = parseFloat($('ab-lon') ? $('ab-lon').value : '');
  DB.astroBirth = {
    kType: 'birth_evidence', privacyClass: 'sensitive',
    date, time: timeKnown ? time : '', timeKnown, utcOffset,
    place: ($('ab-place') ? $('ab-place').value : '').trim(),
    houseSystem: ($('ab-houses') ? $('ab-houses').value : 'whole') || 'whole',
    lat: isFinite(lat) ? lat : null, lon: isFinite(lon) ? lon : null,
    verif: 'user_confirmed', life: 'current', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now(),
  };
  persist(); toast('Данные рождения сохранены', 'ok');
  runNatalChart();
}
async function runNatalChart() {
  const b = DB.astroBirth;
  if (!b) { toast('Сначала заполни данные рождения', 'warn'); return; }
  const out = $('astro-out'); if (out) out.innerHTML = '<div class="ai-sp-empty">Считаю карту…</div>';
  try {
    await loadAstroEngine();
    const chart = computeNatalChart(b);
    DB.astroCharts.push({
      id: Date.now(), kType: 'symbolic_astrology_annotation', privacyClass: 'sensitive',
      chart, verif: 'user_confirmed', life: 'current',
      createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
    });
    persist(); rAstroChart(chart);
  } catch (e) {
    if (out) out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать (нет сети для загрузки движка?). Попробуй ещё раз.</div>';
  }
}
function rAstroChart(chart) {
  const out = $('astro-out'); if (!out) return;
  if (!chart) { const last = (DB.astroCharts || []).slice(-1)[0]; chart = last && last.chart; }
  if (!chart) { out.innerHTML = ''; return; }
  let html = '<div class="f-lbl" style="margin-top:.5rem">Планеты в знаках</div>';
  html += chart.planets.map(p => {
    const h = chart.houses ? (chart.houses.find(x => x.body === p.body) || {}).house : null;
    return `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(p.name)}</b> — ${esc(p.sign)} ${p.deg.toFixed(1)}°${p.retro ? ' ℞' : ''}${h ? ` · ${h}-й дом` : ''}</div></div></div>`;
  }).join('');
  if (chart.angles) {
    html += `<div class="f-lbl" style="margin-top:.5rem">Углы</div>
      <div class="si-row"><div class="si-body"><div class="si-text">Асцендент — ${esc(chart.angles.asc.sign)} ${chart.angles.asc.deg.toFixed(1)}° · MC — ${esc(chart.angles.mc.sign)} ${chart.angles.mc.deg.toFixed(1)}°</div></div></div>`;
  } else if (!chart.timeKnown) {
    html += `<div class="si-text" style="color:var(--t3);margin:.4rem 0">Время рождения не указано — асцендент и дома не рассчитываются (полдень не подставляем; позиции планет даны на дату, Луна может отличаться в пределах суток).</div>`;
  }
  if (chart.asteroids && chart.asteroids.length) {
    html += '<div class="f-lbl" style="margin-top:.5rem">Астероиды и Хирон <span style="font-weight:500;color:var(--t3)">(прибл.)</span></div>' +
      chart.asteroids.map(p => `<div class="si-row"><div class="si-body"><div class="si-text"><b>${esc(p.name)}</b> — ${esc(p.sign)} ${p.deg.toFixed(1)}°</div></div></div>`).join('');
  }
  if (chart.points && chart.points.lilith) {
    html += '<div class="f-lbl" style="margin-top:.5rem">Дополнительные точки</div>';
    html += `<div class="si-row"><div class="si-body"><div class="si-text"><b>Лилит</b> (ср. апогей) — ${esc(chart.points.lilith.sign)} ${chart.points.lilith.deg.toFixed(1)}°</div></div></div>`;
    if (chart.points.fortune) html += `<div class="si-row"><div class="si-body"><div class="si-text"><b>Точка Судьбы</b> (${chart.points.fortune.isDay ? 'дневная' : 'ночная'} формула) — ${esc(chart.points.fortune.sign)} ${chart.points.fortune.deg.toFixed(1)}°</div></div></div>`;
    if (chart.points.vertex) html += `<div class="si-row"><div class="si-body"><div class="si-text"><b>Вертекс</b> — ${esc(chart.points.vertex.sign)} ${chart.points.vertex.deg.toFixed(1)}° · <b>Восточная точка</b> — ${esc(chart.points.eastPoint.sign)} ${chart.points.eastPoint.deg.toFixed(1)}°</div></div></div>`;
  }
  if (chart.antiscia && chart.antiscia.length) {
    html += '<div class="f-lbl" style="margin-top:.5rem">Антисции <span style="font-weight:500;color:var(--t3)">(зеркало оси Рак–Козерог)</span></div>' +
      `<div class="si-text" style="color:var(--t3);line-height:1.7">${chart.antiscia.map(a => `${esc(a.name)}: ${esc(a.sign)} ${a.deg.toFixed(1)}°`).join(' · ')}</div>`;
  }
  if (chart.aspects.length) {
    html += '<div class="f-lbl" style="margin-top:.5rem">Мажорные аспекты</div>' +
      chart.aspects.slice(0, 12).map(a => `<div class="si-row"><div class="si-body"><div class="si-text">${esc(a.a)} ${esc(a.name)} ${esc(a.b)} (орб ${a.exact}°)</div></div></div>`).join('');
  }
  html += `<div class="be-note" style="margin-top:.6rem;color:var(--t3)">Символическая интерпретация в западной тропической традиции. Не прогноз, не диагноз, не влияет на остальные разделы. ${esc(chart.versions.engine)} · ${esc(chart.versions.ruleset)}</div>`;
  out.innerHTML = html;
}
// ─── АСТРОЛОГИЯ: РАЗДЕЛ НАВИГАЦИИ, МЕНЮ-КАРТОЧКИ И КОЛЕСО КАРТЫ ─────
// Самостоятельный пункт навигации (не в Настройках): меню выбора экранов,
// SVG-колесо гороскопа, табы деталей. Расчёты не меняются — только подача.
const SIGN_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const PLANET_GLYPHS = { Sun:'☉', Moon:'☽', Mercury:'☿', Venus:'♀', Mars:'♂', Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇' };
const ASPECT_COLOR = { 'соединение':'var(--t3)', 'оппозиция':'var(--red)', 'квадрат':'var(--red)', 'трин':'var(--green)', 'секстиль':'var(--accent)' };

function openAstro() { goTo('astro'); }

// Переключение под-экранов раздела (as-menu, as-natal, as-transits, …).
function asub(name) {
  document.querySelectorAll('#pg-astro .asub').forEach(d => d.style.display = 'none');
  const t = $('as-' + name); if (t) t.style.display = 'block';
  if (typeof hpt === 'function') hpt();
  if (name === 'menu') rAstroHome();
  if (name === 'natal') rNatalScreen();
  if (name === 'transits') runTransits();
  if (name === 'prog') rPrognostics();
  if (name === 'ret') rReturns();
  if (name === 'mid') rMidpoints();
  if (name === 'jyo') rJyotish();
  if (name === 'parts') rPartsStars();
  if (name === 'points') rPointsScreen();
  if (name === 'syn') rSynastry();
  if (name === 'setup') fillAstroForm();
}

// Главный экран раздела: превью-колесо (или пустое состояние) + сетка карточек.
function rAstroHome() {
  const hero = $('astro-hero'); if (!hero) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!DB.astroBirth) {
    hero.innerHTML = `<div class="card mx mb tap" style="padding:1.1rem;cursor:pointer" onclick="asub('setup')" role="button">
      <div class="si-text" style="font-weight:600">✦ Введите дату и время рождения</div>
      <div class="si-text" style="color:var(--t3);margin-top:.25rem">…чтобы построить натальную карту. Расчёт локальный — данные не покидают устройство.</div></div>`;
    return;
  }
  if (last) {
    hero.innerHTML = `<div class="astro-preview" onclick="asub('natal')" role="button" aria-label="Открыть натальную карту">${renderChartWheel(last.chart, { size: 240, static: true })}
      <div class="si-text" style="text-align:center;color:var(--t3)">Тап — полная карта</div></div>`;
  } else {
    hero.innerHTML = `<div class="card mx mb tap" style="padding:1.1rem;cursor:pointer" onclick="asub('setup')" role="button">
      <div class="si-text">Данные рождения сохранены — рассчитай карту в «Настройках расчёта».</div></div>`;
  }
}

// SVG-колесо гороскопа. Классическая ориентация: Асцендент слева, зодиак
// против часовой стрелки; без известного времени — 0° Овна слева.
function renderChartWheel(chart, o = {}) {
  const S = o.size || 340, cx = S / 2, cy = S / 2;
  const rot = chart.angles ? chart.angles.asc.lon : 0;
  const xy = (lon, r) => { const a = (180 + (lon - rot)) * Math.PI / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const F = n => n.toFixed(1);
  const line = (lon, r1, r2, cls, stroke) => { const [x1, y1] = xy(lon, r1), [x2, y2] = xy(lon, r2);
    return `<line x1="${F(x1)}" y1="${F(y1)}" x2="${F(x2)}" y2="${F(y2)}" class="${cls}"${stroke ? ` stroke="${stroke}"` : ''}/>`; };
  const rZo = S * .47, rZi = S * .385, rPl = S * .315, rHub = S * .245, rNum = S * .195;
  const pad = S * .05;   // поля, чтобы метки Asc/MC у внешнего кольца не обрезались
  let s = `<svg viewBox="${F(-pad)} ${F(-pad)} ${F(S + 2 * pad)} ${F(S + 2 * pad)}" class="astro-wheel-svg" role="img" aria-label="Колесо натальной карты">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${F(rZo)}" class="aw-ring"/><circle cx="${cx}" cy="${cy}" r="${F(rZi)}" class="aw-ring"/><circle cx="${cx}" cy="${cy}" r="${F(rHub)}" class="aw-ring aw-thin"/>`;
  for (let k = 0; k < 12; k++) {
    s += line(k * 30, rZi, rZo, 'aw-sect');
    const [gx, gy] = xy(k * 30 + 15, (rZo + rZi) / 2);
    s += `<text x="${F(gx)}" y="${F(gy)}" class="aw-sign">${SIGN_GLYPHS[k]}</text>`;
  }
  const cusps = (chart.housesMeta && chart.housesMeta.cusps) || null;
  if (cusps) for (let k = 1; k <= 12; k++) {
    s += line(cusps[k], rHub, rZi, 'aw-house' + (k === 1 || k === 10 ? ' aw-axis' : ''));
    const next = cusps[k === 12 ? 1 : k + 1];
    const mid = norm360(cusps[k] + norm360(next - cusps[k]) / 2);
    const [hx, hy] = xy(mid, rNum);
    s += `<text x="${F(hx)}" y="${F(hy)}" class="aw-hnum">${k}</text>`;
  }
  const lonOf = {}; chart.planets.forEach(p => lonOf[p.name] = p.lon);
  for (const a of (chart.aspects || [])) {
    if (!(a.a in lonOf) || !(a.b in lonOf)) continue;
    const [x1, y1] = xy(lonOf[a.a], rHub), [x2, y2] = xy(lonOf[a.b], rHub);
    s += `<line x1="${F(x1)}" y1="${F(y1)}" x2="${F(x2)}" y2="${F(y2)}" class="aw-asp" stroke="${ASPECT_COLOR[a.name] || 'var(--t4)'}"/>`;
  }
  // Планеты: при скучивании (< 8°) чередуем радиус, чтобы глифы не слипались.
  const sorted = [...chart.planets].sort((a, b) => a.lon - b.lon);
  let prevLon = -999, flip = false;
  for (const p of sorted) {
    const near = prevLon > -999 && Math.abs(((p.lon - prevLon + 180) % 360 + 360) % 360 - 180) < 8;
    flip = near ? !flip : false;
    prevLon = p.lon;
    const [px, py] = xy(p.lon, flip ? rPl - S * .052 : rPl);
    s += line(p.lon, rZi, rZi - S * .014, 'aw-tick');
    s += `<text x="${F(px)}" y="${F(py)}" class="aw-planet${p.retro ? ' aw-retro' : ''}"${o.static ? '' : ` onclick="astroPlanetTap('${p.body}')"`}>${PLANET_GLYPHS[p.body] || '•'}</text>`;
  }
  if (chart.angles) {
    const [ax, ay] = xy(chart.angles.asc.lon, rZo + S * .022), [mx, my] = xy(chart.angles.mc.lon, rZo + S * .022);
    s += `<text x="${F(ax)}" y="${F(ay)}" class="aw-axlbl">Asc</text><text x="${F(mx)}" y="${F(my)}" class="aw-axlbl">MC</text>`;
  }
  // Bi-wheel: транзитные планеты снаружи зодиакального кольца (натал внутри).
  if (o.transits) for (const p of o.transits) {
    const [px, py] = xy(p.lon, rZo + S * .045);
    s += line(p.lon, rZo, rZo + S * .016, 'aw-tick');
    s += `<text x="${F(px)}" y="${F(py)}" class="aw-planet aw-transit">${PLANET_GLYPHS[p.body] || '•'}</text>`;
  }
  return s + '</svg>';
}

// Тап по планете на колесе → карточка деталей под колесом.
function astroPlanetTap(body) {
  const last = (DB.astroCharts || []).slice(-1)[0]; if (!last) return;
  const p = last.chart.planets.find(x => x.body === body); if (!p) return;
  const h = last.chart.houses ? (last.chart.houses.find(x => x.body === body) || {}).house : null;
  const asp = (last.chart.aspects || []).filter(a => a.a === p.name || a.b === p.name);
  const el = $('astro-planet-info'); if (!el) return;
  el.innerHTML = `<div class="card mx" style="padding:.7rem 1rem;margin-top:.5rem">
    <div class="si-text"><b>${PLANET_GLYPHS[body] || ''} ${esc(p.name)}</b> — ${esc(p.sign)} ${p.deg.toFixed(1)}°${p.retro ? ' ℞ (ретро)' : ''}${h ? ` · ${h}-й дом` : ''}</div>
    ${asp.slice(0, 6).map(a => `<div class="si-text" style="color:var(--t3)">${esc(a.a)} ${esc(a.name)} ${esc(a.b)} (орб ${a.exact}°)</div>`).join('')}
  </div>`;
}

// Экран «Натальная карта»: колесо + табы [Планеты][Дома][Аспекты][Точки][Мидпоинты].
function rNatalScreen() {
  const wrap = $('astro-wheel'); if (!wrap) return;
  const info = $('astro-planet-info'), out = $('astro-ntab-out');
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last) {
    wrap.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай карту в «Настройках расчёта».</div>';
    if (info) info.innerHTML = ''; if (out) out.innerHTML = '';
    return;
  }
  wrap.innerHTML = renderChartWheel(last.chart, { size: 340 });
  if (info) info.innerHTML = '';
  antab(STATE.astroTab || 'planets');
  rChartSummary();   // человеческое резюме — первым блоком экрана (3.1a)
}

function antab(t) {
  STATE.astroTab = t;
  document.querySelectorAll('#astro-ntabs .snpill').forEach(p => p.classList.toggle('on', p.dataset.at === t));
  const out = $('astro-ntab-out'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0]; if (!last) { out.innerHTML = ''; return; }
  const c = last.chart;
  const row = txt => `<div class="si-row"><div class="si-body"><div class="si-text">${txt}</div></div></div>`;
  let html = '';
  if (t === 'planets') {
    html = c.planets.map(p => {
      const h = c.houses ? (c.houses.find(x => x.body === p.body) || {}).house : null;
      return row(`<b>${PLANET_GLYPHS[p.body] || ''} ${esc(p.name)}</b> — ${esc(p.sign)} ${p.deg.toFixed(1)}°${p.retro ? ' ℞' : ''}${h ? ` · ${h}-й дом` : ''}`);
    }).join('');
    if (c.angles) html += row(`<b>Асцендент</b> — ${esc(c.angles.asc.sign)} ${c.angles.asc.deg.toFixed(1)}°`) + row(`<b>MC</b> — ${esc(c.angles.mc.sign)} ${c.angles.mc.deg.toFixed(1)}°`);
  }
  if (t === 'houses') {
    if (!c.angles) html = '<div class="ai-sp-empty">Дома считаются только при известном времени рождения.</div>';
    else if (c.housesMeta && c.housesMeta.cusps) {
      const names = { whole: 'Whole-sign', placidus: 'Плацидус', equal: 'Равнодомная', campanus: 'Кампанус', regiomontanus: 'Региомонтанус' };
      html = `<div class="f-lbl">Система: ${esc(names[c.housesMeta.system] || c.housesMeta.system)}</div>` +
        Array.from({ length: 12 }, (_, i) => {
          const z = zodiacOf(c.housesMeta.cusps[i + 1]);
          const tx = houseCuspText(i + 1, z.sign);
          return row(`<b>${i + 1}-й дом</b> — ${esc(z.sign)} ${z.deg.toFixed(1)}°${tx ? `<div style="color:var(--t3)" data-rule="${esc(tx.ruleId)}">${esc(tx.text)}</div>` : ''}`);
        }).join('');
    } else html = '<div class="ai-sp-empty">Куспиды не сохранены в этой карте — пересчитай её в «Настройках расчёта».</div>';
  }
  if (t === 'aspects') {
    const bodyOf = nm => (c.planets.find(p => p.name === nm) || {}).body;
    html = (c.aspects || []).map(a => {
      const tx = aspectMeaningText(bodyOf(a.a), bodyOf(a.b), a.name);
      return row(`<span style="color:${ASPECT_COLOR[a.name] || 'var(--t2)'}">●</span> ${esc(a.a)} ${esc(a.name)} ${esc(a.b)} (орб ${a.exact}°)${tx ? `<div style="color:var(--t3)" data-rule="${esc(tx.ruleId)}">${esc(tx.text)}</div>` : ''}`);
    }).join('') || '<div class="ai-sp-empty">Мажорных аспектов нет.</div>';
  }
  if (t === 'points') {
    const P = c.points || {};
    const pr = (nm, z, extra) => z ? row(`<b>${nm}</b> — ${esc(z.sign)} ${z.deg.toFixed(1)}°${extra || ''}`) : '';
    html = pr('Точка Судьбы', P.fortune, P.fortune && (P.fortune.isDay ? ' (дневная)' : ' (ночная)')) + pr('Лилит (ср.)', P.lilith)
      + pr('Вертекс', P.vertex) + pr('Антивертекс', P.antivertex) + pr('Восточная точка', P.eastPoint);
    if ((c.asteroids || []).length) html += `<div class="f-lbl" style="margin-top:.4rem">Астероиды (прибл.)</div>`
      + c.asteroids.map(a => row(`<b>${esc(a.name)}</b> — ${esc(a.sign)} ${a.deg.toFixed(1)}°`)).join('');
    if (!html) html = '<div class="ai-sp-empty">Точки требуют известного времени рождения.</div>';
  }
  if (t === 'mid') {
    const tree = computeMidpointTree(c).slice(0, 14);
    html = tree.length ? tree.map(x => row(`<b>${esc(x.point)}</b> = ${esc(x.pair)} (${x.angle}°, орб ${x.orb}°)`)).join('')
      : '<div class="ai-sp-empty">Нет точных контактов с мидпоинтами (орб 1.5°).</div>';
  }
  out.innerHTML = html + '<div class="be-note" style="margin-top:.6rem;color:var(--t3)">Символическое, не прогноз и не диагноз.</div>';
}

// ─── ИНТЕРПРЕТАЦИИ (Слой 1: база правил · Слой 2: сборка) ───────────
// База правил — architect/astro_rules.js (собственные тексты, лениво).
// Сборка детерминированная: только lookup по фактам карты + связки;
// каждый блок несёт source_rule_id для аудита. ИИ-полировка — по кнопке,
// строго без новых фактов, с кэшем (пересчёт при смене данных рождения).
let _rulesLoad = null;
function loadAstroRules() {
  if (window.ASTRO_RULES) return Promise.resolve();
  if (_rulesLoad) return _rulesLoad;
  _rulesLoad = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'astro_rules.js';
    sc.onload = () => res();
    sc.onerror = () => { _rulesLoad = null; rej(new Error('база интерпретаций не загрузилась')); };
    document.head.appendChild(sc);
  });
  return _rulesLoad;
}

// Текст аспекта личных планет (приоритет 2). Порядок пары фиксирован.
const PERSONAL_ORDER = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'];
function aspectMeaningText(aBody, bBody, aspect) {
  const R = window.ASTRO_RULES; if (!R || !R.aspectMeaning) return null;
  const ia = PERSONAL_ORDER.indexOf(aBody), ib = PERSONAL_ORDER.indexOf(bBody);
  if (ia < 0 || ib < 0) return null;
  const key = ia <= ib ? aBody + '-' + bBody : bBody + '-' + aBody;
  const t = (R.aspectMeaning[key] || {})[aspect];
  return t ? { text: t, ruleId: 'aspectMeaning.' + key + '.' + aspect } : null;
}
// Текст знака на куспиде дома (приоритет 2): сфера дома + стиль знака.
function houseCuspText(houseN, sign) {
  const R = window.ASTRO_RULES; if (!R || !R.houseCuspSphere) return null;
  const sp = R.houseCuspSphere[houseN], st = R.houseCuspStyle[sign];
  return (sp && st) ? { text: `${sp} ${st}.`, ruleId: `houseCusp.${houseN}.${sign}` } : null;
}

// «Кто вы по карте»: блоки по 3.1a. Возвращает { blocks, ruleIds, version }.
function buildChartSummary(chart) {
  const R = window.ASTRO_RULES; if (!R) return null;
  const get = b => chart.planets.find(p => p.body === b);
  const houseOf = b => chart.houses ? (chart.houses.find(x => x.body === b) || {}).house : null;
  const blocks = [], ruleIds = [];
  const add = (title, text, ids) => { if (text && text.trim()) { blocks.push({ title, text: text.trim(), ruleIds: ids }); ruleIds.push(...ids); } };
  const sun = get('Sun'), moon = get('Moon');
  // 1. Солнце: кто вы в основе (+дом, если известен).
  let tx = R.planetInSign.Sun[sun.sign] || ''; let ids = ['planetInSign.Sun.' + sun.sign];
  const sh = houseOf('Sun');
  if (sh && R.planetInHouse.Sun[sh]) { tx += ' ' + R.planetInHouse.Sun[sh]; ids.push('planetInHouse.Sun.' + sh); }
  add(`Ваше Солнце в знаке ${sun.sign}`, tx, ids);
  // 2. Луна: как вы себя чувствуете внутри.
  tx = R.planetInSign.Moon[moon.sign] || ''; ids = ['planetInSign.Moon.' + moon.sign];
  const mh = houseOf('Moon');
  if (mh && R.planetInHouse.Moon[mh]) { tx += ' ' + R.planetInHouse.Moon[mh]; ids.push('planetInHouse.Moon.' + mh); }
  add('Как вы себя чувствуете внутри', tx, ids);
  // 3. Как вас видят другие — только при известном времени (Asc).
  if (chart.angles) {
    const ascSign = chart.angles.asc.sign;
    add('Как вас видят другие', R.ascInSign[ascSign] || '', ['ascInSign.' + ascSign]);
  }
  // 4–5. Сильная сторона и внутренний вызов — по самым точным аспектам.
  const byOrb = kind => (chart.aspects || []).filter(a => kind.includes(a.name))
    .sort((a, b) => parseFloat(a.exact) - parseFloat(b.exact))[0];
  const bodyByName = nm => (chart.planets.find(p => p.name === nm) || {}).body;
  const harm = byOrb(['трин', 'секстиль']);
  if (harm) {
    const exact = aspectMeaningText(bodyByName(harm.a), bodyByName(harm.b), harm.name);
    if (exact) add('Ваша сильная сторона', exact.text, [exact.ruleId]);
    else {
      const A = R.planetTheme[bodyByName(harm.a)], B = R.planetTheme[bodyByName(harm.b)];
      if (A && B) add('Ваша сильная сторона',
        `В вас легко дружат две стороны: ${A} — и ${B}. Одна естественно поддерживает другую, и на это можно опираться.`,
        ['aspect.harmonious.' + harm.a + '-' + harm.b]);
    }
  }
  const tense = byOrb(['квадрат', 'оппозиция']);
  if (tense) {
    const exact = aspectMeaningText(bodyByName(tense.a), bodyByName(tense.b), tense.name);
    if (exact) add('Ваш внутренний вызов', exact.text, [exact.ruleId]);
    else {
      const A = R.planetTheme[bodyByName(tense.a)], B = R.planetTheme[bodyByName(tense.b)];
      if (A && B) add('Ваш внутренний вызов',
        `Иногда две стороны — ${A} и, с другой стороны, ${B} — тянут вас в разные направления. Это не недостаток, а зона роста: учась давать место обеим, вы становитесь целостнее.`,
        ['aspect.tense.' + tense.a + '-' + tense.b]);
    }
  }
  return { blocks, ruleIds, version: R.version + '+summary-v1' };
}

// Рендер резюме на экране натальной карты (первым, до колеса — по 3.1a).
async function rChartSummary() {
  const out = $('astro-summary'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last) { out.innerHTML = ''; return; }
  try { await loadAstroRules(); } catch (e) { out.innerHTML = ''; return; }
  const sum = buildChartSummary(last.chart);
  if (!sum || !sum.blocks.length) { out.innerHTML = ''; return; }
  const key = ['summary', last.id, sum.version, 'astro-summary-v1'].join('|');
  const cached = (DB.astroTexts || []).find(t => t && t.key === key);
  const deepCached = (DB.astroTexts || []).filter(t => t && t.mode === 'deep' && String(t.key || '').includes('|' + last.id + '|')).slice(-1)[0];
  const blockHtml = (b, i) => `<div class="si-row"${i > 1 ? ' data-more="1" style="display:none"' : ''}><div class="si-body">
      <div class="si-text" data-rules="${esc(b.ruleIds.join(','))}"><b>${esc(b.title)}.</b> ${esc(b.text)}</div></div></div>`;
  let html = '<div class="f-lbl">Кто вы по карте</div>';
  if (cached) html += `<div class="si-row"><div class="si-body"><div class="si-text">${esc(cached.text)}</div></div></div>`;
  else {
    html += sum.blocks.map(blockHtml).join('');
    if (sum.blocks.length > 2) html += `<button class="btn btn-s btn-full" onclick="this.parentElement.querySelectorAll('[data-more]').forEach(d=>d.style.display='block');this.remove()">Развернуть подробнее</button>`;
    if (getAiKey()) html += `<button class="btn btn-s btn-full" onclick="aiPolishChartSummary()">⚡ Быстрый разбор (ИИ)</button>
      <button class="btn btn-s btn-full" onclick="aiDeepAstroAnalysis()">🔮 Глубокий анализ (с учётом моих данных)</button>`;
  }
  if (deepCached) html += `<div class="f-lbl" style="margin-top:.5rem">Глубокий анализ <span style="font-weight:500;color:var(--t3)">(категории: ${esc((deepCached.categories || []).join(', ') || 'только карта')})</span></div>
    <div class="si-row"><div class="si-body"><div class="si-text">${esc(deepCached.text)}</div></div></div>`;
  html += '<div class="be-note" style="color:var(--t3)">Символическое описание в западной традиции — не прогноз, не диагноз и не оценка личности.</div>';
  out.innerHTML = html;
}

// Слой 2, ИИ-полировка: связать факты, ничего не добавляя. С кэшем.
async function aiPolishChartSummary() {
  const out = $('astro-summary');
  const last = (DB.astroCharts || []).slice(-1)[0]; if (!last) return;
  await loadAstroRules();
  const sum = buildChartSummary(last.chart); if (!sum) return;
  const key = ['summary', last.id, sum.version, 'astro-summary-v1'].join('|');
  if ((DB.astroTexts || []).some(t => t && t.key === key)) { rChartSummary(); return; }
  if (out) out.innerHTML = '<div class="ai-sp-empty">Собираю текст…</div>';
  try {
    const facts = sum.blocks.map(b => `- ${b.title}: ${b.text}`).join('\n');
    const text = await callClaude({
      task: 'other', maxTokens: 700, model: ASTRO_AI_MODELS.fast,   // режим 1: быстрый разбор
      system: 'Ты редактор текста в личном дневнике. Свяжи данные факты в тёплый, понятный текст на русском языке, 150–300 слов, обращение на «вы». СТРОГО: не добавляй ни одного нового астрологического утверждения — только переданные факты, их можно лишь связать и смягчить. Без специальных терминов и градусов. Тон описательный, не судьбоносный: без предсказаний, диагнозов и оценок. Закончи одной короткой фразой о том, что это символическое описание, а не прогноз.',
      user: facts,
    });
    DB.astroTexts = DB.astroTexts || [];
    DB.astroTexts.push({
      id: Date.now(), key, text, ruleIds: sum.ruleIds, promptVersion: 'astro-summary-v1',
      kType: 'symbolic_astrology_annotation', privacyClass: 'sensitive',
      createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now(),
    });
    persist();
  } catch (e) { toast(e && e.message ? e.message : 'Не удалось собрать текст', 'warn'); }
  rChartSummary();
}

// ─── ДВА РЕЖИМА ИИ-СИНТЕЗА (Часть 5) ────────────────────────────────
// Режим 1 «⚡ Быстрый разбор»: только факты карты, модель побыстрее.
// Режим 2 «🔮 Глубокий анализ»: + разрешённый МИНИМИЗИРОВАННЫЙ срез данных
// (теги/агрегаты за окно 14–30 дней, БЕЗ сырых текстов и идентификаторов),
// строго после явного согласия по категориям; согласие отзывается в любой
// момент. Лимит запросов режима 2 в день. Каждый отчёт сохраняется с меткой
// использованных категорий и версией промпта (аудит).
const ASTRO_AI_MODELS = { fast: 'claude-haiku-4-5-20251001', deep: 'claude-sonnet-5' };
const ASTRO_DEEP_DAILY_LIMIT = 5;

// Минимизация: из дневника — только теги и количества; из здоровья — только
// названия симптомов с частотой и средние чек-ин осей; из привычек — только
// название сферы и процент выполнения. Никаких текстов записей, доз, имён.
function buildAstroAiContext(consent, windowDays = 30) {
  const c = consent || DB.astroAiConsent || {};
  const from = Date.now() - windowDays * 864e5;
  const inWin = r => r && (Date.parse(r.createdAt || r.date || 0) || 0) >= from;
  const ctx = { window_days: windowDays, categories: [] };
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (last) {
    ctx.natal = {
      planets: last.chart.planets.map(p => `${p.name}: ${p.sign}${p.retro ? ' (ретро)' : ''}`),
      asc: last.chart.angles ? last.chart.angles.asc.sign : null,
      aspects: (last.chart.aspects || []).slice(0, 8).map(a => `${a.a} ${a.name} ${a.b}`),
    };
    // Текущие транзиты к наталу (эфемеридные данные, не личные).
    try { const tr = computeTransits(last.chart, new Date()); ctx.transits_today = tr.hits.slice(0, 5).map(h => `транзитный ${h.transit} ${h.aspect} натальный ${h.natal}`); } catch (e) {}
  }
  if (c.diary) {
    ctx.categories.push('diary');
    const ins = (DB.insights || []).filter(inWin);
    const tags = {};
    ins.forEach(i => { if (i.tag) tags[i.tag] = (tags[i.tag] || 0) + 1; });
    ctx.diary = { insight_count: ins.length, tags, dream_count: (DB.dreams || []).filter(inWin).length };
  }
  if (c.health) {
    ctx.categories.push('health');
    const sym = {};
    (DB.symptoms || []).filter(inWin).forEach(s => { if (s.name) sym[s.name] = (sym[s.name] || 0) + 1; });
    const cis = (DB.checkins || []).filter(x => x && (x.date || '') >= new Date(from).toISOString().slice(0, 10));
    const avg = k => cis.length ? +(cis.reduce((s, x) => s + (+x[k] || 0), 0) / cis.length).toFixed(1) : null;
    ctx.health = { symptom_freq: sym, checkin_avg: { сон: avg('sl'), ясность: avg('cl'), движение: avg('mv'), стресс: avg('st') }, checkin_count: cis.length };
  }
  if (c.habits) {
    ctx.categories.push('habits');
    ctx.habits = (DB.spheres || []).slice(0, 8).map(sp => {
      const logs = (DB.sphereLogs || []).filter(l => l && l.sphereId === sp.id && (l.date || '') >= new Date(from).toISOString().slice(0, 10));
      return { name: sp.name, type: sp.type, entries: logs.length };
    });
    ctx.habits_cravings = (DB.cravings || []).filter(inWin).length;
  }
  return ctx;
}

// Согласие режима 2: сохранение/отзыв (чекбоксы), версия текста согласия.
function saveAstroAiConsent() {
  const g = id => { const el = $(id); return !!(el && el.classList.contains('on')); };
  DB.astroAiConsent = {
    diary: g('aic-diary'), health: g('aic-health'), habits: g('aic-habits'),
    acceptedAt: nowISO(), version: 'astro-consent-v1', sv: SCHEMA_VERSION, _u: Date.now(),
  };
  persist(); toast('Настройки согласия сохранены', 'ok');
  closeOv('ov-astro-consent');
}
function openAstroAiConsent() {
  const c = DB.astroAiConsent || {};
  for (const [id, on] of [['aic-diary', c.diary], ['aic-health', c.health], ['aic-habits', c.habits]]) {
    const el = $(id); if (el) el.classList.toggle('on', !!on);
  }
  openOv('ov-astro-consent');
}

// Лимит запросов режима 2 в день (локальный счётчик).
function astroDeepQuota() {
  let q = {}; try { q = JSON.parse(localStorage.getItem('arch5_astro_deep_quota') || '{}'); } catch (e) {}
  if (q.day !== todayKey()) q = { day: todayKey(), n: 0 };
  return q;
}
function astroDeepQuotaBump() {
  const q = astroDeepQuota(); q.n++;
  try { localStorage.setItem('arch5_astro_deep_quota', JSON.stringify(q)); } catch (e) {}
}

// Режим 2: глубокий анализ (вызывается только из UI после согласия).
async function aiDeepAstroAnalysis() {
  const out = $('astro-summary');
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last) { toast('Сначала рассчитай натальную карту', 'warn'); return; }
  const c = DB.astroAiConsent;
  if (!c || !c.acceptedAt) { openAstroAiConsent(); return; }
  const q = astroDeepQuota();
  if (q.n >= ASTRO_DEEP_DAILY_LIMIT) { toast(`Лимит глубокого анализа на сегодня (${ASTRO_DEEP_DAILY_LIMIT}) исчерпан`, 'warn'); return; }
  try { await loadAstroEngine(); } catch (e) {}   // для транзитов в контексте
  const ctx = buildAstroAiContext(c, 30);
  const key = ['deep', last.id, ctx.categories.join('+') || 'none', 'astro-deep-v1'].join('|');
  const cached = (DB.astroTexts || []).find(t => t && t.key === key);
  if (cached) { rChartSummary(); toast('Показан сохранённый анализ (данные не менялись)', 'ok'); return; }
  if (out) out.innerHTML = '<div class="ai-sp-empty">Глубокий анализ…</div>';
  try {
    const text = await callClaude({
      task: 'other', model: ASTRO_AI_MODELS.deep, maxTokens: 900,
      system: 'Ты — бережный аналитик личного дневника. Тебе даны символические астрологические факты и МИНИМИЗИРОВАННЫЕ агрегаты записей пользователя (только теги/частоты, без текстов). СТРОГО: используй только предоставленные факты; никакой причинности — только «может быть связано с», никогда «вызвано»; никаких диагнозов, предсказаний и оценок личности. Свяжи наблюдения мягко, дай 1–2 конкретные бытовые рекомендации (отдых, разговор, планирование — не медицина). 200–350 слов, русский, на «вы», без астрологических терминов и градусов. Обязательно закончи фразой: «Это символическое описание, а не прогноз и не диагноз».',
      user: JSON.stringify(ctx),
    });
    astroDeepQuotaBump();
    DB.astroTexts = DB.astroTexts || [];
    DB.astroTexts.push({
      id: Date.now(), key, text, mode: 'deep', categories: ctx.categories, windowDays: 30,
      promptVersion: 'astro-deep-v1', kType: 'symbolic_astrology_annotation', privacyClass: 'sensitive',
      createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now(),
    });
    persist();
  } catch (e) { toast(e && e.message ? e.message : 'Не удалось выполнить анализ', 'warn'); }
  rChartSummary();
}

// ─── СИНАСТРИЯ (3.6/4.5): межличностные аспекты двух карт ───────────
// Данные партнёра — sensitive, только локально. Символическое описание
// взаимодействия, не «совместимость в процентах» и не вердикт о паре.
const SYNASTRY_ORB = 4;   // synastry-orbs-v1: мажорные аспекты, орб 4°
function computeSynastry(chartA, chartB) {
  const hits = [];
  for (const a of chartA.planets) for (const b of chartB.planets) {
    const sep = Math.abs(((a.lon - b.lon + 180) % 360 + 360) % 360 - 180);
    for (const asp of ASTRO_ASPECTS) {
      if (Math.abs(sep - asp.angle) <= SYNASTRY_ORB) {
        hits.push({ a: a.name, aBody: a.body, b: b.name, bBody: b.body, aspect: asp.name, exact: Math.abs(sep - asp.angle).toFixed(1) });
        break;
      }
    }
  }
  hits.sort((x, y) => parseFloat(x.exact) - parseFloat(y.exact));
  return { hits, versions: { ...ASTRO_VERSIONS, synastryOrbPolicy: 'synastry-orbs-v1(4)' } };
}
function synastryHitText(h) {
  const R = window.ASTRO_RULES; if (!R || !R.synastryVerb) return null;
  const A = R.planetTheme[h.aBody], B = R.planetTheme[h.bBody], verb = R.synastryVerb[h.aspect];
  if (!A || !B || !verb) return null;
  return { text: `Ваша тема «${A}» и тема партнёра «${B}» ${verb}.`, ruleId: `synastry.${h.aBody}.${h.aspect}.${h.bBody}` };
}
function saveAstroPartner() {
  const date = ($('sp-date') ? $('sp-date').value : '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Дата в формате ГГГГ-ММ-ДД', 'warn'); return; }
  const timeKnown = $('sp-time-known') ? $('sp-time-known').classList.contains('on') : false;
  const time = ($('sp-time') ? $('sp-time').value : '').trim();
  if (timeKnown && !/^\d{2}:\d{2}$/.test(time)) { toast('Время в формате ЧЧ:ММ', 'warn'); return; }
  const lat = parseFloat($('sp-lat') ? $('sp-lat').value : ''); const lon = parseFloat($('sp-lon') ? $('sp-lon').value : '');
  const birth = {
    date, time: timeKnown ? time : '', timeKnown,
    utcOffset: parseFloat($('sp-utc') ? $('sp-utc').value : '0') || 0,
    lat: isFinite(lat) ? lat : null, lon: isFinite(lon) ? lon : null,
    houseSystem: (DB.astroBirth && DB.astroBirth.houseSystem) || 'whole',
  };
  loadAstroEngine().then(() => {
    const chart = computeNatalChart(birth);
    DB.astroPartners = DB.astroPartners || [];
    DB.astroPartners.push({
      id: Date.now(), label: (($('sp-label') && $('sp-label').value) || 'Партнёр').trim().slice(0, 40),
      birth, chart, kType: 'symbolic_astrology_annotation', privacyClass: 'sensitive',
      createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now(),
    });
    persist(); toast('Карта партнёра сохранена', 'ok');
    rSynastry();
  }).catch(() => toast('Движок не загрузился', 'warn'));
}
async function rSynastry() {
  const out = $('astro-syn'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  const sel = $('sp-select');
  const partners = DB.astroPartners || [];
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = partners.map(p => `<option value="${p.id}">${esc(p.label)} (${esc(p.birth.date)})</option>`).join('');
    if (cur && partners.some(p => String(p.id) === cur)) sel.value = cur;
  }
  if (!last || !DB.astroBirth) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай свою натальную карту.</div>'; return; }
  if (!partners.length) { out.innerHTML = '<div class="ai-sp-empty">Добавь карту партнёра выше — данные хранятся только на устройстве.</div>'; const w = $('astro-syn-wheel'); if (w) w.innerHTML = ''; return; }
  try {
    await loadAstroEngine();
    try { await loadAstroRules(); } catch (e) {}
    const partner = partners.find(p => String(p.id) === (sel && sel.value)) || partners[partners.length - 1];
    const syn = computeSynastry(last.chart, partner.chart);
    const wheelEl = $('astro-syn-wheel');
    if (wheelEl) wheelEl.innerHTML = renderChartWheel(last.chart, { size: 340, static: true, transits: partner.chart.planets });
    let html = `<div class="f-lbl">Вы (внутри) и ${esc(partner.label)} (снаружи) — межличностные аспекты</div>`;
    if (syn.hits.length) {
      html += syn.hits.slice(0, 14).map(h => {
        const tx = synastryHitText(h);
        return `<div class="si-row"><div class="si-body"><div class="si-text"><b>Ваш ${esc(h.a)} ↔ ${esc(h.b)} партнёра.</b> ${tx ? esc(tx.text) : esc(h.aspect)}</div>
          <div class="si-text" style="color:var(--t4);font-size:.72rem"${tx ? ` data-rule="${esc(tx.ruleId)}"` : ''}>${esc(h.aspect)} · точность ${h.exact}°</div></div></div>`;
      }).join('');
    } else html += '<div class="si-text" style="color:var(--t3)">Точных мажорных аспектов между картами нет (орб 4°).</div>';
    html += '<div class="be-note" style="color:var(--t3)">Символическое описание взаимодействия двух карт — не «процент совместимости», не вердикт о паре и не совет. Данные партнёра хранятся только на устройстве.</div>';
    out.innerHTML = html;
  } catch (e) { out.innerHTML = '<div class="ai-sp-empty">Не удалось рассчитать.</div>'; }
}

// Экран «Астероиды и точки»: астероиды, Лилит, Вертекс, Точка Судьбы, антисции.
function rPointsScreen() {
  const out = $('astro-points-out'); if (!out) return;
  const last = (DB.astroCharts || []).slice(-1)[0];
  if (!last) { out.innerHTML = '<div class="ai-sp-empty">Сначала рассчитай карту в «Настройках расчёта».</div>'; return; }
  const c = last.chart, P = c.points || {};
  const row = txt => `<div class="si-row"><div class="si-body"><div class="si-text">${txt}</div></div></div>`;
  const pr = (nm, z, extra) => z ? row(`<b>${nm}</b> — ${esc(z.sign)} ${z.deg.toFixed(1)}°${extra || ''}`) : '';
  let html = '';
  if ((c.asteroids || []).length) html += '<div class="f-lbl">Астероиды и Хирон (прибл.)</div>'
    + c.asteroids.map(a => row(`<b>${esc(a.name)}</b> — ${esc(a.sign)} ${a.deg.toFixed(1)}°`)).join('');
  html += '<div class="f-lbl" style="margin-top:.4rem">Точки</div>'
    + pr('Лилит (ср. апогей)', P.lilith)
    + pr('Точка Судьбы', P.fortune, P.fortune && (P.fortune.isDay ? ' (дневная формула)' : ' (ночная формула)'))
    + pr('Вертекс', P.vertex) + pr('Антивертекс', P.antivertex) + pr('Восточная точка', P.eastPoint);
  if (!P.fortune) html += '<div class="si-text" style="color:var(--t3)">Вертекс и Точка Судьбы требуют известного времени рождения.</div>';
  if ((c.antiscia || []).length) html += '<div class="f-lbl" style="margin-top:.4rem">Антисции</div>'
    + c.antiscia.map(a => row(`${esc(a.name)} → ${esc(a.sign)} ${a.deg.toFixed(1)}°`)).join('');
  html += '<div class="be-note" style="margin-top:.6rem;color:var(--t3)">Символическое, не прогноз и не диагноз. Астероиды — двухтелое приближение (JPL).</div>';
  out.innerHTML = html;
}

// Экран «Настройки расчёта»: заполняем форму сохранёнными данными рождения.
function fillAstroForm() {
  const b = DB.astroBirth;
  if (b) {
    if ($('ab-date')) $('ab-date').value = b.date || '';
    if ($('ab-time')) $('ab-time').value = b.time || '';
    const tk = $('ab-time-known'); if (tk) tk.classList.toggle('on', !!b.timeKnown);
    if ($('ab-utc')) $('ab-utc').value = String(b.utcOffset || 0);
    if ($('ab-place')) $('ab-place').value = b.place || '';
    if ($('ab-lat')) $('ab-lat').value = b.lat == null ? '' : String(b.lat);
    if ($('ab-lon')) $('ab-lon').value = b.lon == null ? '' : String(b.lon);
    if ($('ab-houses')) $('ab-houses').value = b.houseSystem || 'whole';
  }
  rAstroChart();
}

// Мягкое напоминание на «Сегодня»: по каким активным планам сегодня ещё не
// отмечен приём. Только по плану, заданному пользователем; не медицина.
function rMedReminder() {
  const el = $('h-med-reminder'); if (!el) return;
  const today = todayKey();
  const meds = projAll('meds').filter(m => m && m.active !== false);
  const pending = meds.filter(m => !(DB.medIntakes || []).some(i => i && i.medId === m.id && i.day === today && i.status === 'taken'));
  if (!pending.length) { el.innerHTML = ''; return; }
  const names = pending.slice(0, 3).map(m => esc(m.name)).join(', ') + (pending.length > 3 ? '…' : '');
  el.innerHTML = `<div class="card mx mb tap" style="padding:.7rem 1rem;cursor:pointer" onclick="goTo('health')" role="button">
    <div class="si-text">💊 Сегодня ещё не отмечено: <b>${names}</b> — <span style="color:var(--accent)">отметить в «Здоровье» →</span></div>
  </div>`;
}

// ─── HEALTH ORGANIZER: «Отчёт врачу» (детерминированная сводка) ─────
// Собирает факты за период БЕЗ интерпретации: план и факт приёма, симптомы
// (частота/выраженность), измерения со значениями. Явно помечен как личный
// дневник пользователя, не медицинский документ.
function buildDoctorReport(days = 30) {
  const now = Date.now(), from = now - days * 864e5;
  const inWin = r => r && (Date.parse(r.createdAt) || 0) >= from;
  const fmtDay = r => (r.day || '').slice(5);
  const L = [];
  L.push(`ОТЧЁТ ДЛЯ ВРАЧА · за ${days} дн. (${new Date(from).toISOString().slice(0, 10)} — ${todayKey()})`);
  L.push('');
  const meds = projAll('meds').filter(m => m && m.active !== false);
  if (meds.length) {
    L.push('ЛЕКАРСТВА / ВИТАМИНЫ (план, заданный пациентом, и фактический приём):');
    meds.forEach(m => {
      const n = (DB.medIntakes || []).filter(i => i && i.medId === m.id && i.status === 'taken' && inWin(i)).length;
      L.push(`• ${m.name}${m.dose ? ' — ' + m.dose : ''} · принято за период: ${n} раз`);
    });
    L.push('');
  }
  const sym = projAll('symptoms').filter(inWin);
  if (sym.length) {
    L.push('СИМПТОМЫ (самонаблюдение):');
    const byName = {};
    sym.forEach(s => { (byName[s.name] = byName[s.name] || []).push(s); });
    Object.entries(byName).forEach(([name, arr]) => {
      const avg = Math.round(arr.reduce((a, s) => a + (s.severity || 0), 0) / arr.length * 10) / 10;
      const dates = arr.map(fmtDay).join(', ');
      L.push(`• ${name}: ${arr.length} раз, средняя выраженность ${avg}/10 (даты: ${dates})`);
      arr.forEach(s => { if (s.note) L.push(`   – ${fmtDay(s)}: ${s.note}`); });
    });
    L.push('');
  }
  const mea = projAll('measures').filter(inWin);
  if (mea.length) {
    L.push('ИЗМЕРЕНИЯ:');
    const byName = {};
    mea.forEach(m => { (byName[m.name] = byName[m.name] || []).push(m); });
    Object.entries(byName).forEach(([name, arr]) => {
      const vals = arr.slice(-10).map(m => `${fmtDay(m)}: ${m.value}${m.unit ? ' ' + m.unit : ''}`).join(' · ');
      L.push(`• ${name}: ${vals}`);
    });
    L.push('');
  }
  if (!meds.length && !sym.length && !mea.length) L.push('За период нет записей плана, симптомов или измерений.');
  L.push('—');
  L.push('Составлено пациентом в личном дневнике «Архитектор». Не является медицинским документом или рекомендацией.');
  return L.join('\n');
}
function openDoctorReport() {
  const txt = buildDoctorReport(30);
  const el = $('doc-report-text'); if (el) el.value = txt;
  openOv('ov-doc-report');
}
function shareDoctorReport() {
  const txt = ($('doc-report-text') && $('doc-report-text').value) || buildDoctorReport(30);
  if (navigator.share) navigator.share({ title: 'Отчёт для врача', text: txt }).catch(() => {});
  else { try { navigator.clipboard.writeText(txt); toast('Скопировано в буфер', 'ok'); } catch (e) { toast('Выдели и скопируй текст', 'warn'); } }
}

function rHealth() {
  const el = $('health-out'); if (!el) return;
  const hs = healthSpheres(), crav = DB.cravings || [];
  // «Риск»: прозрачный объясняющий слой — персональный движок cravingRisk
  // выдаёт уровень + конкретные причины (окно суток, пост-срыв, стресс…),
  // чтобы решение системы никогда не ощущалось произвольным.
  const risk = cravingRisk();
  const lvl = risk.score >= 0.5 ? 'высокий' : risk.score >= 0.3 ? 'повышенный' : 'спокойный';
  let html = `<div class="sec-lbl">Риск сейчас</div>
    <div class="card mx mb" style="padding:1rem">${risk.factors.length
      ? `<div class="si-text" style="margin-bottom:.6rem;font-weight:600">Сейчас риск ${lvl}${risk.score >= 0.3 ? ' — стоит опереться заранее' : ''}.</div>`
        + risk.factors.map(f => `<div class="si-row"><div class="si-dot neg"></div><div class="si-body"><div class="si-text">${esc(f.why)}</div></div></div>`).join('')
      : `<div class="ai-sp-empty">✓ Спокойно. По твоим данным сейчас ничего тревожного.</div>`}</div>`;
  html += `<div class="sec-lbl">Прогресс</div>`;
  if (!hs.length) {
    html += `<div class="card mx mb"><div style="padding:1rem" class="ai-sp-empty">Заведи привычку-трекер — «Без сигарет», «Без сладкого» — и здесь появится стрик и паттерн срывов.
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem">
        <button class="btn btn-s btn-sm" onclick="addHealthSphere('Без сигарет','🚭')">+ Без сигарет</button>
        <button class="btn btn-s btn-sm" onclick="addHealthSphere('Без сладкого','🍬')">+ Без сладкого</button>
        <button class="btn btn-s btn-sm" onclick="addHealthSphere('Без алкоголя','🍺')">+ Без алкоголя</button>
      </div></div></div>`;
  } else {
    html += `<div class="card mx mb">` + hs.map(s => {
      const st = sphereStats(s.id) || {};
      return `<div class="srow" onclick="openSphereLog(${s.id})" role="button"><div class="sic" style="background:${s.color}22"><span>${esc(s.icon || '●')}</span></div><span class="sl2">${esc(s.name)}</span><span class="sv2">${st.consistency || 0}% за 30д</span></div>`;
    }).join('') + `</div>`;
  }
  html += medsSectionHTML();
  html += bodySectionHTML();
  html += `<div class="sec-lbl">Опора</div>
    <div class="mx mb"><button class="btn btn-p btn-full" onclick="openCraving()"><i data-lucide="zap"></i>У меня тяга сейчас</button></div>
    <div class="mx mb"><button class="btn btn-s btn-full" onclick="openTech('')"><i data-lucide="life-buoy"></i>Приёмы под состояние</button></div>`;
  if (crav.length) {
    const held = crav.filter(c => c.outcome === 'held').length;
    const rate = Math.round(held / crav.length * 100);
    const week = crav.filter(c => rcDay(c) > dayAgo(7)).length;
    const trigCount = {};
    crav.forEach(c => { const t = (c.trigger || '').trim().toLowerCase(); if (t) trigCount[t] = (trigCount[t] || 0) + 1; });
    const topTrig = Object.entries(trigCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    STATE.healthTopTrig = topTrig;
    // Одиночество — один из двух корневых триггеров (см. разбор JITAI,
    // раздел «стресс/одиночество»): подсвечиваем связь только если данных
    // хватает для честного вывода, а не одной-двух точек.
    const aloneRecs = crav.filter(c => c.alone === 'alone'), peopleRecs = crav.filter(c => c.alone === 'people');
    let loneRow = '';
    if (aloneRecs.length >= 3 && peopleRecs.length >= 2) {
      const aloneRate = Math.round(aloneRecs.filter(c => c.outcome === 'gave_in').length / aloneRecs.length * 100);
      const peopleRate = Math.round(peopleRecs.filter(c => c.outcome === 'gave_in').length / peopleRecs.length * 100);
      if (aloneRate - peopleRate >= 15)
        loneRow = `<div class="si-row"><div class="si-body"><div class="si-text">Один(на) срывы чаще: ${aloneRate}% против ${peopleRate}% с людьми</div></div></div>`;
    }
    html += `<div class="sec-lbl">Триггеры</div>
    <div class="card mx mb" style="padding:1rem">
      <div class="kgrid" style="margin:0 0 .75rem">
        <div class="kc"><span class="kn">${crav.length}</span><span class="kl">Всего</span></div>
        <div class="kc"><span class="kn">${rate}%</span><span class="kl">Устоял</span></div>
        <div class="kc"><span class="kn">${week}</span><span class="kl">За 7 дней</span></div>
      </div>
      ${topTrig.length ? `<div class="f-lbl">Частые триггеры</div>` + topTrig.map(([t, n], i) => `<div class="si-row"><div class="si-body"><div class="si-text">${esc(t)} — ${n} ${pl(n, 'раз', 'раза', 'раз')}</div>${i === 0 ? `<div class="si-act">${findPlanFor(t) ? '📌 план на этот случай уже есть' : `<a href="javascript:void 0" onclick="planForTriggerIdx(0)">+ план «если...то»</a>`}</div>` : ''}</div></div>`).join('') : ''}
      ${loneRow}
    </div>`;
  }
  const si = smartInsights();
  const healthItems = (si.items || []).filter(it => /кофеин|алкогол|никотин|сладкое/.test(it.text) || hs.some(s => it.text.includes(s.name)));
  html += `<div class="sec-lbl">Что влияет на состояние</div>`;
  html += healthItems.length
    ? `<div class="si-card mx mb">` + healthItems.map(it => `<div class="si-row"><div class="si-dot ${it.pos ? 'pos' : 'neg'}"></div><div class="si-body"><div class="si-text">${esc(it.text)}</div><div class="si-act">→ ${esc(it.action)}</div></div></div>`).join('') + `</div>`
    : `<div class="card mx mb"><div style="padding:1rem" class="ai-sp-empty">Отмечай никотин/алкоголь/сладкое в чек-ине — через несколько дней здесь появится честная связь с твоим состоянием.</div></div>`;
  // Психическое состояние по диалогам — синхронизация психоконтура с
  // журналом здоровья (запрос владельца: ключевые данные о состоянии из
  // чатов распределяются сюда). Честно к малым данным: тренд только при n≥3.
  const md = mentalStateDigest();
  if (md) {
    const moodRu = { low: 'подавленное', mid: 'ровное', high: 'приподнятое' };
    html += `<div class="sec-lbl">Психическое состояние</div><div class="card mx mb" style="padding:1rem">`;
    html += `<div class="si-text"><b>По последнему диалогу:</b> настроение ${moodRu[md.latest.mood] || '—'}${md.latest.emotion ? `, ${esc(md.latest.emotion)}` : ''}.</div>`;
    if (md.n >= 3) {
      const trend = md.avgMood >= 2.4 ? 'скорее в ресурсе' : md.avgMood <= 1.6 ? 'скорее на спаде' : 'ровное';
      html += `<div class="si-row" style="margin-top:.5rem"><div class="si-dot ${md.avgMood >= 2.4 ? 'pos' : 'neg'}"></div><div class="si-body"><div class="si-text">За 2 недели по ${md.n} ${pl(md.n, 'диалогу', 'диалогам', 'диалогам')} — состояние ${trend}.</div></div></div>`;
      if (md.highStress >= 2) html += `<div class="si-row"><div class="si-dot neg"></div><div class="si-body"><div class="si-text">Напряжение звучало в ${md.highStress} из ${md.n} — стоит поберечь ресурс.</div></div></div>`;
      if (md.lonely >= 2) html += `<div class="si-row"><div class="si-dot neg"></div><div class="si-body"><div class="si-text">Тема одиночества всплывала ${md.lonely} ${pl(md.lonely, 'раз', 'раза', 'раз')} — это частый корень тяги.</div></div></div>`;
    } else {
      html += `<div class="si-text" style="color:var(--t3);margin-top:.4rem">Закрывай диалоги с наставником — состояние из них копится здесь, и через несколько разговоров появится тренд.</div>`;
    }
    html += `</div>`;
  }
  const env = DB.env || {};
  html += `<div class="sec-lbl">Среда</div>
    <div class="card mx mb" style="padding:.5rem">
      <div class="srow" onclick="toggleEnvFlag('noSweetsHome')" role="button"><span class="sl2">Дома нет сладкого</span><span class="sv2">${env.noSweetsHome ? '✓' : '—'}</span></div>
      <div class="srow" onclick="toggleEnvFlag('noCigsHome')" role="button"><span class="sl2">Дома нет сигарет</span><span class="sv2">${env.noCigsHome ? '✓' : '—'}</span></div>
      <div class="srow" onclick="toggleEnvFlag('ritual')" role="button"><span class="sl2">Вечерний ритуал заменён</span><span class="sv2">${env.ritual ? '✓' : '—'}</span></div>
    </div>`;
  html += `<div class="sec-lbl">Разбор</div>
    <div class="mx mb"><button class="btn btn-s btn-full" onclick="goTo('map');msub('graph');STATE.mapView='psy';rMap()">Функция, вторичная выгода, потребность →</button></div>`;
  html += `<div class="sec-lbl">Витамины и добавки</div>
    <div class="mx" style="margin-bottom:5rem"><button class="btn btn-s btn-full" onclick="addHealthSphere('Витамины','💊')">+ Отслеживать приём</button></div>`;
  el.innerHTML = html;
}

// ─── СОН ─────────────────────────────────────────────────────────
function saveDrm() {
  const tx = $('drm-tx').value.trim();
  if (!tx) { toast('Опиши сон', 'warn'); return; }
  const arch = $('drm-arch').value.trim();
  const _ts = Date.now();
  DB.dreams.unshift({id:_ts, date:dateFullRU(), createdAt:nowISO(), day:todayKey(), sv:SCHEMA_VERSION, title:tx.slice(0,52)+(tx.length>52?'…':''), body:tx, tone:STATE.drmTone, arch:arch||null});
  DB.insights.unshift({id:_ts+1, tag:'dream', w:1, title:'Сон: '+DB.dreams[0].title, body:tx, date:dateRU(), createdAt:nowISO(), day:todayKey(), sv:SCHEMA_VERSION, src:'Дневник снов', links:[]});
  $('drm-tx').value=''; $('drm-arch').value='';
  closeOv('ov-drm'); persist(); rDrms(); rIns(); rHIns(); rKPIs();
  hptMed(); toast('Сон зафиксирован', 'ok');
  reactToDream(DB.dreams[0], _ts + 1);     // живой отклик + вход в толкование
  try { rVector(); } catch (e) {}
}
function deleteDrm(id) {
  delUndo('dreams', id, rDrms, 'Сон удалён');
}

// ─── ПАТТЕРНЫ ────────────────────────────────────────────────────
function savePat() {
  const tx = $('pat-tx').value.trim();
  if (!tx) { toast('Опиши паттерн', 'warn'); return; }
  DB.patterns.push({id:Date.now(), type:STATE.patType, text:tx, cnt:1});
  $('pat-tx').value='';
  closeOv('ov-pat-add'); persist(); rPats();
  hptMed(); toast('Паттерн зафиксирован', 'ok');
}
function deletePat(id) {
  delUndo('patterns', id, rPats, 'Паттерн удалён');
}

// ─── ДУХОВНОЕ ────────────────────────────────────────────────────
function saveSpi() {
  const tx = $('spi-tx').value.trim();
  if (!tx) { toast('Опиши переживание', 'warn'); return; }
  DB.spiritual.unshift({id:Date.now(), type:STATE.spiType, date:dateFullRU(), createdAt:nowISO(), day:todayKey(), sv:SCHEMA_VERSION, text:tx});
  $('spi-tx').value='';
  closeOv('ov-spi-add'); persist(); rSpi();
  hptMed(); toast('Запись сохранена', 'ok');
  try { reactToSpi(tx); rVector(); } catch (e) {}    // живой отклик и на духовное
}
function reactToSpi(tx) {
  const rows = [];
  const rel = rcRelated(tx, null);
  if (rel) rows.push({ html: `🔗 Перекликается с «${esc(rel.title)}»`, act: `rcClose();showDet(${rel.id})` });
  const n = (DB.spiritual || []).length;
  const m30 = (DB.spiritual || []).filter(s => (s.day || '') > dayAgo(30)).length;
  rows.push({ html: `🕊 ${n}-я духовная запись${m30 >= 2 ? ` · ${m30} за месяц — практика держится` : ''}` });
  reactCard(rows);
}
function deleteSpi(id) {
  delUndo('spiritual', id, rSpi, 'Запись удалена');
}

// ─── ЭВОЛЮЦИЯ ────────────────────────────────────────────────────
function saveEvo() {
  const tx = $('evo-tx').value.trim();
  if (!tx) { toast('Введи текст', 'warn'); return; }
  DB.evolution.unshift({id:Date.now(), lv:STATE.evoLv, text:tx, dt:dateFullRU(), createdAt:nowISO(), day:todayKey(), sv:SCHEMA_VERSION});
  $('evo-tx').value='';
  closeOv('ov-evo-add'); persist(); rEvoList($('evo-more')); rEvoList($('evo-sh'));
  hptMed(); toast('Запись сохранена', 'ok');
}

// ─── COMPASS ─────────────────────────────────────────────────────
function rCompass() {
  const svg = $('compass');
  const cx=140, cy=140, R=98, LR=116;
  const axes = Object.values(CFG.axes);
  const n = axes.length;
  const ang = i => (i/n)*Math.PI*2 - Math.PI/2;
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  const gridC = dark ? '#2C2C2E' : '#E3E2DC';
  const bgC   = dark ? '#1C1C1E' : '#FFFFFF';
  const tx1   = dark ? '#F2F2F7' : '#1A1915';
  const tx3   = dark ? 'rgba(242,242,247,.45)' : '#8C8B84';
  let web='';
  [.25,.5,.75,1].forEach(f => {
    const pts = axes.map((_,i) => { const a=ang(i),r=R*f; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`; }).join(' ');
    web += `<polygon points="${pts}" fill="none" stroke="${gridC}" stroke-width="1"/>`;
  });
  let spks='';
  axes.forEach((_,i) => { const a=ang(i); spks+=`<line x1="${cx}" y1="${cy}" x2="${cx+R*Math.cos(a)}" y2="${cy+R*Math.sin(a)}" stroke="${gridC}" stroke-width="1"/>`; });
  const dpts = axes.map((ax,i) => { const a=ang(i),r=R*(ax.s/10); return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`; }).join(' ');
  const avg = (axes.reduce((s,a)=>s+a.s,0)/axes.length).toFixed(1);
  let lbls='';
  axes.forEach((ax,i) => { const a=ang(i),lx=cx+LR*Math.cos(a),ly=cy+LR*Math.sin(a); lbls+=`<text x="${lx}" y="${ly}" fill="${ax.c}" font-size="8" font-family="Inter,-apple-system,sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.08em">${ax.lbl.toUpperCase()}</text>`; });
  let dots='';
  axes.forEach((ax,i) => { const a=ang(i),r=R*(ax.s/10),dx=cx+r*Math.cos(a),dy=cy+r*Math.sin(a); dots+=`<circle cx="${dx}" cy="${dy}" r="5" fill="${ax.c}" stroke="${bgC}" stroke-width="2.5"/>`; });
  svg.innerHTML = `${web}${spks}<polygon points="${dpts}" fill="rgba(16,86,204,.1)" stroke="rgba(16,86,204,.75)" stroke-width="1.5" stroke-linejoin="round"/>${dots}<text x="${cx}" y="${cy-9}" font-family="Inter,-apple-system,sans-serif" font-size="24" font-weight="700" fill="${tx1}" text-anchor="middle" letter-spacing="-0.03em">${avg}</text><text x="${cx}" y="${cy+10}" font-size="10" fill="${tx3}" text-anchor="middle" font-family="Inter,-apple-system,sans-serif" font-weight="600">из 10</text>${lbls}`;
}
function rAxCells() {
  $('ax-grid').innerHTML = Object.entries(CFG.axes).map(([key,ax]) => {
    const c = ax.s>=7.5?'var(--green)':ax.s>=5?'var(--blue-t)':'var(--orange)';
    return `<div class="acell" onclick="openAxisEdit('${key}')">
      <div class="a-name">${ax.lbl}</div>
      <div class="a-score" style="color:${c}">${ax.s}</div>
      <div class="a-bar"><div class="a-fill" style="width:${ax.s*10}%;background:${c}"></div></div>
      <div class="a-edit-hint">нажми чтобы изменить</div>
    </div>`;
  }).join('');
}
function openAxisEdit(key) {
  STATE._editAxis = key;
  openOv('ov-axis-all');
}
function rAxisSliders() {
  const el = $('axis-sliders-all');
  if (!el) return;
  el.innerHTML = Object.entries(CFG.axes).map(([key,ax]) =>
    `<div class="axis-sl-row">
      <div class="axis-sl-head">
        <span class="axis-sl-lbl" style="color:${ax.c}">${ax.lbl}</span>
        <span class="axis-sl-val" id="axv-${key}">${ax.s}</span>
      </div>
      <div class="sl"><input type="range" id="axr-${key}" min="1" max="10" step=".5" value="${ax.s}" oninput="document.getElementById('axv-${key}').textContent=this.value"></div>
    </div>`
  ).join('');
}
function saveAxesAll() {
  Object.keys(CFG.axes).forEach(key => {
    const v = parseFloat($(`axr-${key}`)?.value || CFG.axes[key].s);
    CFG.axes[key].s = v;
  });
  persist(); closeOv('ov-axis-all'); rCompass(); rAxCells(); rVit();
  hptMed(); toast('Оси обновлены', 'ok');
}

// ─── РАДАР ИЗ ЛОГОВ ──────────────────────────────────────────────
// Производит значения осей «Здоровье»/«Психология» из чек-инов
// (честно — только при ≥3 замерах за 2 недели). Не трогает остальные оси.
function deriveAxes() {
  const list = DB.checkins.filter(c => c.date > dayAgo(14));
  if (list.length < 3) return null;
  const a = checkinAvg(list); if (!a) return null;
  const sleepScore = Math.max(0, Math.min(10, a.sl / 8 * 10)); // 8ч ≈ 10
  const calm = 10 - a.st;
  return {
    vitality:   +((sleepScore + calm) / 2).toFixed(1),          // отдых + низкий стресс
    psychology: +((a.cl + a.mv + calm) / 3).toFixed(1),         // ясность + мотивация + спокойствие
    n: a.n,
  };
}
// Композитный балл состояния 0–100 из чек-инов + сравнение с личной базой
// (механика Oura: последние 3 дня против 14-дневной базы). Каждый contributor
// прозрачен — видно под-балл и отклонение от базы. Честно при малом n.
function stateScore() {
  const win = DB.checkins.filter(c => c.date > dayAgo(14) && c.date);
  if (win.length < 3) return { ok:false, n:win.length };
  // под-баллы 0–100 из одного чек-ина
  const sub = c => ({
    sleep: Math.max(0, Math.min(100, (+c.sl||0) / 8 * 100)),   // 8ч ≈ 100
    calm:  Math.max(0, Math.min(100, (10 - (+c.st||0)) * 10)), // низкий стресс
    clarity: Math.max(0, Math.min(100, (+c.cl||0) * 10)),
    move:  Math.max(0, Math.min(100, (+c.mv||0) * 10)),
  });
  const compOf = c => { const s = sub(c); return (s.sleep + s.calm + s.clarity + s.move) / 4; };
  const avgComp = list => list.reduce((a,c)=>a+compOf(c),0) / list.length;
  const recent = win.filter(c => c.date > dayAgo(3));
  const cur = recent.length ? avgComp(recent) : compOf(win[win.length-1]);
  const base = avgComp(win);
  // усреднённые contributors по недавнему окну для разбора
  const avgSub = list => {
    const acc = {sleep:0,calm:0,clarity:0,move:0};
    list.forEach(c => { const s = sub(c); for (const k in acc) acc[k]+=s[k]; });
    for (const k in acc) acc[k] = Math.round(acc[k]/list.length);
    return acc;
  };
  const rs = avgSub(recent.length?recent:[win[win.length-1]]);
  const bs = avgSub(win);
  const CN = { sleep:'Сон', calm:'Спокойствие', clarity:'Ясность', move:'Движение' };
  const contributors = Object.keys(CN).map(k => ({ key:k, label:CN[k], score:rs[k], delta:rs[k]-bs[k] }))
    .sort((a,b)=>a.score-b.score);   // слабое — первым
  return {
    ok:true, n:win.length,
    score: Math.round(cur),
    delta: Math.round(cur - base),   // «↑/↓ за неделю» относительно своей базы
    contributors,
  };
}
function applyDerivedAxes() {
  const d = deriveAxes();
  if (!d) { toast('Мало чек-инов для расчёта (нужно ≥3 за 2 недели)', 'warn'); return; }
  const changed = [];
  if (CFG.axes.vitality)   { CFG.axes.vitality.s   = d.vitality;   changed.push('Здоровье→'+d.vitality); }
  if (CFG.axes.psychology) { CFG.axes.psychology.s = d.psychology; changed.push('Психология→'+d.psychology); }
  if (!changed.length) { toast('Нет осей Здоровье/Психология для обновления', 'warn'); return; }
  persist(); rCompass(); rAxCells(); rVit();
  if ($('ov-axis-all')?.classList.contains('on')) rAxisSliders();
  hptMed(); toast('Оси из чек-инов (' + d.n + ' дн.): ' + changed.join(', '), 'ok');
}

// ─── VITALITY ────────────────────────────────────────────────────
function rVit() {
  const v = DB.vit;
  if (!v.ci) {
    $('vit-today').innerHTML = `<div class="empty">
      <div class="em-ic" style="background:var(--green-l)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--green)"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg></div>
      <div class="em-t">Check-in не выполнен</div>
      <div class="em-d">2 минуты — фундамент всего остального</div>
      <button class="btn btn-p" style="margin-top:.75rem" onclick="openOv('ov-ci')">Начать</button>
    </div>`;
  } else {
    const avg = ((v.cl+v.mv+(10-v.st))/3).toFixed(1);
    const ac = parseFloat(avg)>=7?'var(--green)':parseFloat(avg)>=5?'var(--blue-t)':'var(--orange)';
    const adv = parseFloat(avg)>=7?'Оптимально для глубокой работы.':parseFloat(avg)>=5?'Поддерживающий режим. Текущие задачи.':'Восстановление в приоритете.';
    $('vit-today').innerHTML = `<div style="padding:1rem">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.875rem">
        ${[['Ясность',v.cl,'var(--blue-t)'],['Стресс',v.st,'var(--orange)'],['Мотивация',v.mv,'var(--green)'],['Сон',v.sl+'ч','var(--t2)'],['Тонус',v.tone,'var(--t2)'],['Среднее',avg,ac]].map(([l,val,c])=>
          `<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:var(--r8);padding:.625rem;text-align:center"><div style="font-size:var(--tx6);font-weight:700;color:${c};font-variant-numeric:tabular-nums;line-height:1">${val}</div><div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.07em;margin-top:3px">${l}</div></div>`
        ).join('')}
      </div>
      <div style="padding:.625rem .875rem;background:${ac}1A;border-left:3px solid ${ac};border-radius:0 var(--r8) var(--r8) 0;font-size:var(--tx3);font-weight:600;color:${ac}">${adv}</div>
      <div style="margin-top:.75rem;display:flex;gap:.375rem;flex-wrap:wrap">
        ${v.nic?'<span class="tag tg-project">Никотин</span>':''}
        ${v.caf?'<span class="chip">Кофеин</span>':''}
        ${v.alc?'<span class="tag tg-project">Алкоголь</span>':''}
        ${v.act&&v.act!=='нет'?`<span class="tag tg-vitality">${v.act}</span>`:''}
      </div>
    </div>`;
  }
  $('vit-bars').innerHTML = Object.entries(CFG.axes).map(([,a]) => {
    const c = a.s>=7.5?'var(--green)':a.s>=5?'var(--blue-t)':'var(--orange)';
    return `<div class="vbar">
      <span class="vb-name">${a.lbl}</span>
      <div class="vb-track"><div class="vb-fill" style="width:${a.s*10}%;background:${c}"></div></div>
      <span class="vb-val" onclick="openOv('ov-axis-all')">${a.s}</span>
    </div>`;
  }).join('');
  rTrends();
}

// ─── КНИГА ───────────────────────────────────────────────────────
function rBook() {
  const done  = DB.chapters.filter(c=>c.st==='done').length;
  const total = DB.chapters.length;
  const vol1Done = DB.chapters.filter(c=>c.n<=8 && c.st==='done').length;
  const vol2Done = DB.chapters.filter(c=>c.n>=9  && c.n<=16 && c.st==='done').length;
  const vol3Done = DB.chapters.filter(c=>c.n>=17 && c.st==='done').length;
  const rings = [
    {lbl:'Том I',  pct:Math.round(vol1Done/8*100), c:'var(--blue-btn)'},
    {lbl:'Том II', pct:Math.round(vol2Done/8*100), c:'var(--gold)'},
    {lbl:'Том III',pct:Math.round(vol3Done/8*100), c:'var(--purple)'},
  ];
  const R=28, circ=Math.PI*2*R;
  $('book-rings').innerHTML = rings.map(r =>
    `<div class="ring-item">
      <svg class="pr" width="68" height="68" viewBox="0 0 68 68">
        <circle class="pt" cx="34" cy="34" r="${R}" stroke-width="5.5"/>
        <circle class="pf" cx="34" cy="34" r="${R}" stroke-width="5.5" stroke="${r.c}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ*(1-r.pct/100)).toFixed(1)}"/>
      </svg>
      <div class="ring-lbl">${r.lbl}</div>
      <div class="ring-pct" style="color:${r.c}">${r.pct}%</div>
    </div>`
  ).join('');
  const ST = {done:['st-done','Готово'], wip:['st-wip','В работе'], priority:['st-priority','Приоритет'], todo:['st-todo','Ожидает']};
  $('ch-list').innerHTML = DB.chapters.map(c => {
    const [cl,lb] = ST[c.st]||ST.todo;
    const fx = c.flags.map(f=>`<span class="ch-flag">${f}</span>`).join('');
    return `<div class="ch-row">
      <div class="ch-n">${c.n}</div>
      <div style="flex:1;min-width:0">
        <div class="ch-title">${esc(c.title)}</div>
        <div class="ch-st ${cl}">${lb}</div>
        ${fx?`<div class="ch-flags">${fx}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ─── КАРТА: РЕНДЕРЫ ──────────────────────────────────────────────
function rBots() {
  const bt = $('bot-tasks'); if (!bt) return;   // раздел «Бот» убран из навигации
  bt.innerHTML = DB.bots.map(t =>
    `<div class="task" onclick="toggleBot(${t.id})">
      <div class="tck${t.done?' dn':''}">
        ${t.done?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;color:#fff"><polyline points="20 6 9 17 4 12"/></svg>':''}
      </div>
      <div>
        <div class="task-t${t.done?' dn':''}">${esc(t.title)}</div>
        <div class="task-p ${t.prio==='high'?'ph':'pm'}">${t.prio==='high'?'Высокий':'Средний'} приоритет</div>
      </div>
    </div>`
  ).join('');
}
function toggleBot(id) { const t=DB.bots.find(x=>x.id===id); if(t){t.done=!t.done;touch(t);persist();rBots();} }
function rPats() {
  $('pat-list').innerHTML = DB.patterns.length ? DB.patterns.map(p =>
    `<div class="pat">
      <div class="pat-type">${p.type}</div>
      <div class="pat-text">${esc(p.text)}</div>
      <div class="pat-cnt">Замечен × ${p.cnt}</div>
      <button class="pat-del" onclick="deletePat(${p.id})" aria-label="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;color:var(--t4)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>`
  ).join('') : `<div class="empty"><div class="em-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--t3)"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg></div><div class="em-t">Паттернов нет</div><div class="em-d">Паттерн — одно и то же трижды</div></div>`;
}
function rDrms() {
  $('drm-list').innerHTML = DB.dreams.length ? DB.dreams.map(d =>
    `<div class="drm">
      <div class="drm-date">${d.date}</div>
      <div class="drm-title">${esc(d.title)}</div>
      <div class="drm-body">${esc(d.body)}</div>
      ${d.arch?`<div class="drm-arch">${esc(d.arch)}</div>`:''}
      <button class="drm-del" onclick="event.stopPropagation();deleteDrm(${d.id})" aria-label="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;color:var(--t4)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
    </div>`
  ).join('') : `<div class="empty"><div class="em-ic" style="background:var(--purple-l)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--purple)"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></div><div class="em-t">Снов нет</div><div class="em-d">Запиши первый через кнопку Сон</div></div>`;
}
function rSpi() {
  $('spi-list').innerHTML = DB.spiritual.map(s =>
    `<div class="spi">
      <div class="spi-date">${s.date}</div>
      <div class="spi-type">${esc(s.type)}</div>
      <div class="spi-text">${esc(s.text)}</div>
      <button class="spi-del" onclick="deleteSpi(${s.id})" aria-label="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;color:var(--t4)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
    </div>`
  ).join('');
}
const EVO_LV = [{c:'el0',d:'ed0',lb:'Наблюдение'},{c:'el1',d:'ed1',lb:'Понято'},{c:'el2',d:'ed2',lb:'Прочувствовано'},{c:'el3',d:'ed3',lb:'Трансформировало'}];
function rEvoList(el) {
  if (!el) return;
  el.innerHTML = DB.evolution.map(e => {
    const lv = EVO_LV[Math.min(e.lv,3)];
    return `<div class="evo">
      <div class="edc"><div class="edot ${lv.d}"></div><div class="eline"></div></div>
      <div style="flex:1"><div class="elv ${lv.c}">${lv.lb}</div><div class="etx">${esc(e.text)}</div><div class="edt">${e.dt}</div></div>
    </div>`;
  }).join('');
}

// ─── СТАТИСТИКА (общая для дайджеста и трендов) ──────────────────
const dayAgo = n => isoDay(daysAgoISO(n));
const pl = (n, one, few, many) => { const m10=n%10, m100=n%100; return (m10===1&&m100!==11)?one:(m10>=2&&m10<=4&&(m100<10||m100>=20))?few:many; };
function checkinAvg(list) {
  if (!list || !list.length) return null;
  const s = k => list.reduce((a, c) => a + (+c[k] || 0), 0) / list.length;
  const cl = s('cl'), mv = s('mv'), st = s('st'), sl = s('sl');
  return { cl, mv, st, sl, comp: (cl + mv + (10 - st)) / 3, n: list.length };
}

// ─── ТРЕНД СОСТОЯНИЯ (честная визуализация: скользящее среднее,
//     явные разрывы при пропусках, показ n — без «уверенных» выводов) ──
function rTrends() {
  const el = $('vit-trends'); if (!el) return;
  const days = 30;
  const map = {}; DB.checkins.forEach(c => { if (c.date) map[c.date] = c; });
  const arr = [];
  for (let i = days-1; i >= 0; i--) { const d = dayAgo(i); const c = map[d]; arr.push({ d, v: c ? (c.cl + c.mv + (10 - c.st))/3 : null }); }
  const logged = arr.filter(p => p.v != null);
  const n = logged.length;
  if (n < 3) {
    el.innerHTML = `<div class="trend-card"><div class="trend-h"><span>Тренд состояния</span></div>
      <div class="trend-empty">Пока мало данных для честного тренда (${n} ${pl(n,'день','дня','дней')}). Делай чек-ины — через несколько дней здесь появится линия динамики.</div></div>`;
    return;
  }
  // 7-дневное скользящее среднее; точка есть только если в окне ≥3 наблюдения
  const ma = arr.map((p, idx) => {
    const win = arr.slice(Math.max(0, idx-6), idx+1).filter(x => x.v != null);
    return win.length >= 3 ? win.reduce((a, x) => a + x.v, 0) / win.length : null;
  });
  const W=320,H=120,padL=14,padR=8,padT=8,padB=6, iw=W-padL-padR, ih=H-padT-padB;
  const x = i => padL + (i/(days-1))*iw;
  const y = v => padT + (1 - v/10)*ih;
  let grid=''; [0,5,10].forEach(g => { const yy=y(g); grid+=`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W-padR}" y2="${yy.toFixed(1)}" stroke="var(--bd)" stroke-width="1"/><text x="2" y="${(yy+3).toFixed(1)}" font-size="8" fill="var(--t3)">${g}</text>`; });
  const dots = arr.map((p,i) => p.v==null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="1.7" fill="var(--t3)" opacity="0.5"/>`).join('');
  let path='', pen=false;
  ma.forEach((v,i) => { if (v==null) { pen=false; return; } path += `${pen?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen=true; });
  const avg = (logged.reduce((a,p)=>a+p.v,0)/n).toFixed(1);
  const ac = avg>=7?'var(--green)':avg>=5?'var(--blue-t)':'var(--orange)';
  const sub = checkinAvg(logged.map(p => map[p.d]));
  el.innerHTML = `<div class="trend-card">
    <div class="trend-h"><span>Тренд состояния · 30 дней</span><span class="trend-n">${n} ${pl(n,'день','дня','дней')} · ср. <b style="color:${ac}">${avg}</b></span></div>
    <svg viewBox="0 0 ${W} ${H}" class="trend-svg" preserveAspectRatio="none">${grid}<path d="${path.trim()}" fill="none" stroke="${ac}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>
    <div class="trend-legend">линия — 7-дневное среднее · точки — дни · разрывы = пропуски</div>
    <div class="trend-tiles">
      ${[['Ясность',sub.cl],['Мотивация',sub.mv],['Стресс',sub.st],['Сон',sub.sl]].map(([l,v]) =>
        `<div class="trend-tile"><b>${l==='Сон'?v.toFixed(1)+'ч':v.toFixed(1)}</b><span>${l}</span></div>`).join('')}
    </div>
  </div>`;
}

// ─── ТЕПЛОВАЯ КАРТА НАСТРОЕНИЯ (механика Daylio) ─────────────────
// Один квадрат = день, цвет = композит состояния. Тап по дню → чек-ин.
const dayComposite = c => c ? (c.cl + c.mv + (10 - c.st)) / 3 : null;   // 0–10
function moodColor(v) {
  if (v == null) return 'var(--hm0,#1E2740)';
  if (v < 4)  return 'var(--rose,#FB7185)';
  if (v < 5.5) return 'var(--gold,#F5B84B)';
  if (v < 7)  return 'var(--blue-t,#4C8DFF)';
  if (v < 8.5) return 'var(--teal,#2DD4BF)';
  return 'var(--green,#34D399)';
}
function rHeatmap(elId, days) {
  const el = $(elId); if (!el) return;
  days = days || 90;
  const map = {}; DB.checkins.forEach(c => { if (c.date) map[c.date] = c; });
  const cells = [];
  for (let i = days-1; i >= 0; i--) { const d = dayAgo(i); cells.push({ d, v: dayComposite(map[d]) }); }
  const logged = cells.filter(c => c.v != null);
  const n = logged.length;
  const avg = n ? (logged.reduce((a,c)=>a+c.v,0)/n) : 0;
  const cols = days > 45 ? 15 : 10;
  const grid = cells.map(c =>
    `<div class="hc" title="${c.d}${c.v!=null?' · '+c.v.toFixed(1):''}" style="background:${moodColor(c.v)}"${c.v!=null?` onclick="openDayCheckin('${c.d}')"`:''}></div>`
  ).join('');
  el.innerHTML =
    `<div class="hm-head"><div class="t">${n?'Настроение · '+days+' дн':'Настроение'}</div>` +
    `<div class="n">${n?'ср. '+avg.toFixed(1)+' / 10 · '+n+' '+pl(n,'день','дня','дней'):'нет данных'}</div></div>` +
    `<div class="hm" style="grid-template-columns:repeat(${cols},1fr)">${grid}</div>`;
}
function openDayCheckin(d) {
  const c = DB.checkins.find(x => x.date === d);
  if (!c) return;
  const comp = dayComposite(c);
  const emo = c.emo ? ' · ' + c.emo : '';
  toast(`${dispDate(c)} · состояние ${comp!=null?comp.toFixed(1):'—'}/10 · сон ${c.sl||0}ч${emo}`, 'ok');
}

// ─── КОРРЕЛЯЦИИ (killer-функция Daylio; честно по n) ─────────────
// Пирсон между двумя рядами по дням, где есть оба значения.
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
  let sxy=0, sxx=0, syy=0;
  for (let i=0;i<n;i++){ const dx=xs[i]-mx, dy=ys[i]-my; sxy+=dx*dy; sxx+=dx*dx; syy+=dy*dy; }
  if (sxx===0 || syy===0) return null;
  return sxy / Math.sqrt(sxx*syy);
}
// Метка честности по n (мало данных — «наблюдение», не «вывод»)
function confLabel(n) {
  if (n < 5)  return { t:'мало данных', cls:'cf-low' };
  if (n < 12) return { t:'наблюдение', cls:'cf-mid' };
  return { t:'устойчивая связь', cls:'cf-hi' };
}
function correlations() {
  const list = DB.checkins.filter(c => c.date && c.sl != null);
  const pairs = { sleep:[], calm:[], move:[], clarity:[] };
  const comp = [];
  list.forEach(c => {
    const v = dayComposite(c); if (v == null) return;
    comp.push(v);
    pairs.sleep.push(+c.sl||0); pairs.calm.push(10-(+c.st||0));
    pairs.move.push(+c.mv||0); pairs.clarity.push(+c.cl||0);
  });
  const n = comp.length;
  const defs = [['sleep','Сон'], ['calm','Спокойствие'], ['move','Движение'], ['clarity','Ясность']];
  const out = defs.map(([k,label]) => {
    const r = pearson(pairs[k], comp);
    return r==null ? null : { key:k, label, r:+r.toFixed(2), conf:confLabel(n) };
  }).filter(Boolean).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
  return { n, items: out };
}

// ─── ДВИЖОК ДЕЙСТВЕННЫХ ВЫВОДОВ (волна 1 — «данные ≠ смысл») ──────
// Не график, а фраза: ЧТО помогает/мешает, со сдвигом во времени
// (сегодня + назавтра), с конкретным действием и честной меткой по n.
// Метод: медианный сплит фактора → разница среднего состояния (в баллах).
function smartInsights() {
  const map = {}; DB.checkins.forEach(c => { if (c.date) map[c.date] = c; });
  const rows = Object.keys(map).sort().map(d => {
    const c = map[d], st = dayComposite(c);
    const nd = new Date(d + 'T00:00:00'); nd.setDate(nd.getDate() + 1);
    const nx = map[nd.toISOString().slice(0, 10)];
    return { d, c, state: st, next: nx ? dayComposite(nx) : null };
  }).filter(r => r.state != null);
  if (rows.length < 5) return { ok: false, n: rows.length, items: [] };

  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  // Только НЕзависимые от композита факторы (сон/качество сна), иначе связь
  // тавтологична: движение/ясность/спокойствие сами входят в состояние.
  const NUM = [
    { key:'sl', val:c=>+c.sl||0, more:'высыпаешься',      less:'спишь мало',  act:'Защити сон — раньше ложись в будни.' },
    { key:'sq', val:c=>+c.sq||0, more:'сон качественный', less:'сон плохой',  act:'Гигиена сна: без экрана перед сном, темнота, прохлада.' },
  ];
  const BOOL = [
    { key:'caf', label:'кофеин',   act:'Понаблюдай за кофеином во второй половине дня.' },
    { key:'alc', label:'алкоголь', act:'Попробуй несколько дней без алкоголя.' },
    { key:'nic', label:'никотин',  act:'Отметь, как никотин сказывается на состоянии.' },
    { key:'sugar', label:'сладкое', act:'Тяга к сладкому часто компенсирует усталость или стресс — понаблюдай за триггером.' },
  ];
  const raw = [];
  NUM.forEach(f => {
    // сортируем по фактору и берём равные половины по индексу (устойчиво к ничьим)
    const srt = rows.slice().sort((a, b) => f.val(a.c) - f.val(b.c));
    const h = Math.floor(srt.length / 2);
    const lo = srt.slice(0, h), hi = srt.slice(srt.length - h);
    if (hi.length < 2 || lo.length < 2) return;
    // фактор должен реально различаться между половинами, иначе связь мнимая
    if (mean(hi.map(r => f.val(r.c))) - mean(lo.map(r => f.val(r.c))) < 0.5) return;
    const dSame = mean(hi.map(r => r.state)) - mean(lo.map(r => r.state));
    const hiN = hi.filter(r => r.next != null), loN = lo.filter(r => r.next != null);
    const dNext = (hiN.length >= 2 && loN.length >= 2)
      ? mean(hiN.map(r => r.next)) - mean(loN.map(r => r.next)) : null;
    raw.push({ kind:'num', f, dSame, dNext, n: Math.min(hi.length, lo.length), strength: Math.abs(dSame) });
  });
  BOOL.forEach(b => {
    const on = rows.filter(r => r.c[b.key]), off = rows.filter(r => !r.c[b.key]);
    if (on.length < 2 || off.length < 2) return;
    const dSame = mean(on.map(r => r.state)) - mean(off.map(r => r.state));
    raw.push({ kind:'bool', b, dSame, n: Math.min(on.length, off.length), strength: Math.abs(dSame) });
  });
  // Сферы как факторы — единый смысл через все сферы (механика Exist).
  // Состояние берём из чек-инов; сопоставляем со значением сферы в тот же день.
  (DB.spheres || []).forEach(s => {
    const byDate = {}; DB.sphereLogs.filter(l => l.sphereId === s.id && l.date).forEach(l => byDate[l.date] = l);
    // lagged: сравниваем состояние СЛЕДУЮЩЕГО дня (механика Bearable)
    const lag = (a, b) => {
      const an = a.filter(r => r.next != null), bn = b.filter(r => r.next != null);
      return (an.length >= 2 && bn.length >= 2) ? mean(an.map(r => r.next)) - mean(bn.map(r => r.next)) : null;
    };
    if (s.type === 'habit') {
      const on = rows.filter(r => { const l = byDate[r.d]; return l && l.value; });
      const off = rows.filter(r => { const l = byDate[r.d]; return !(l && l.value); });
      if (on.length < 2 || off.length < 2) return;
      const dSame = mean(on.map(r => r.state)) - mean(off.map(r => r.state));
      const dNext = lag(on, off);
      raw.push({ kind:'sph-habit', s, dSame, dNext, n: Math.min(on.length, off.length), strength: Math.max(Math.abs(dSame), Math.abs(dNext||0)) });
    } else if (s.type === 'score' || s.type === 'counter' || s.type === 'goal') {
      const wv = rows.map(r => ({ r, v: byDate[r.d] ? +byDate[r.d].value : null })).filter(x => x.v != null && !Number.isNaN(x.v));
      if (wv.length < 5) return;
      const srt = wv.slice().sort((a, b) => a.v - b.v);
      const h = Math.floor(srt.length / 2), lo = srt.slice(0, h), hi = srt.slice(srt.length - h);
      if (hi.length < 2 || lo.length < 2) return;
      if (mean(hi.map(x => x.v)) - mean(lo.map(x => x.v)) < 0.001) return;
      const dSame = mean(hi.map(x => x.r.state)) - mean(lo.map(x => x.r.state));
      const dNext = lag(hi.map(x=>x.r), lo.map(x=>x.r));
      raw.push({ kind:'sph-num', s, dSame, dNext, n: Math.min(hi.length, lo.length), strength: Math.max(Math.abs(dSame), Math.abs(dNext||0)) });
    }
  });
  const items = raw.filter(o => o.strength >= 0.5)
    .sort((a, b) => b.strength - a.strength).slice(0, 3).map(o => {
      const conf = confLabel(o.n), pos = o.dSame > 0;
      const amt = Math.abs(o.dSame).toFixed(1);
      if (o.kind === 'num') {
        let text = `Когда ${pos ? o.f.more : o.f.less}, состояние ${pos ? 'выше' : 'ниже'} на ${amt} балла`;
        if (o.dNext != null && Math.sign(o.dNext) === Math.sign(o.dSame) && Math.abs(o.dNext) >= 0.4) text += ' — и на следующий день тоже';
        return { text: text + '.', action: o.f.act, conf, pos };
      }
      if (o.kind === 'sph-habit' || o.kind === 'sph-num') {
        // выбираем ведущий эффект: сегодня или назавтра (lagged, Bearable)
        const delayed = o.dNext != null && Math.abs(o.dNext) > Math.abs(o.dSame) * 1.4;
        const dEff = delayed ? o.dNext : o.dSame;
        const up = dEff > 0, aE = Math.abs(dEff).toFixed(1);
        const lead = o.kind === 'sph-habit' ? `В дни с «${o.s.name}»` : `Когда больше «${o.s.name}»`;
        let text;
        if (delayed) text = `${lead} состояние ${up ? 'выше' : 'ниже'} на ${aE} балла на следующий день.`;
        else {
          text = `${lead} состояние ${up ? 'выше' : 'ниже'} на ${aE} балла`;
          if (o.dNext != null && Math.sign(o.dNext) === Math.sign(o.dSame) && Math.abs(o.dNext) >= 0.4) text += ' — и назавтра тоже';
          text += '.';
        }
        const action = up ? `«${o.s.name}» тебе помогает — держи ритм.` : `Присмотрись к «${o.s.name}».`;
        return { text, action, conf, pos: up };
      }
      return { text: `В дни с «${o.b.label}» состояние ${pos ? 'выше' : 'ниже'} на ${amt} балла.`, action: o.b.act, conf, pos };
    });
  return { ok: true, n: rows.length, items };
}
function rSmartInsights(elId) {
  const el = $(elId); if (!el) return;
  const { ok, n, items } = smartInsights();
  if (!ok || !items.length) {
    const need = Math.max(0, 5 - n);
    el.innerHTML = `<div class="si-empty">Действенные выводы появятся${need?` после ещё ${need} ${pl(need,'чек-ина','чек-инов','чек-инов')}`:', когда наберётся заметная разница в днях'} — честно, на малых данных выводы ненадёжны.</div>`;
    return;
  }
  el.innerHTML = items.map(it => `<div class="si-row">
    <div class="si-dot ${it.pos?'pos':'neg'}"></div>
    <div class="si-body"><div class="si-text">${esc(it.text)}</div>
      <div class="si-act">→ ${esc(it.action)}</div></div>
    <span class="si-conf ${it.conf.cls}">${it.conf.t}</span>
  </div>`).join('');
}

function rCorrelations(elId) {
  const el = $(elId); if (!el) return;
  const { n, items } = correlations();
  if (n < 5 || !items.length) {
    const need = Math.max(0, 5 - n);
    el.innerHTML = `<div class="corr-empty">Что влияет на твоё состояние — покажем после ещё ${need} ${pl(need,'чек-ина','чек-инов','чек-инов')} (честно: на малых данных выводы ненадёжны)</div>`;
    return;
  }
  const top = items.slice(0, 3);
  el.innerHTML = top.map(it => {
    const pos = it.r >= 0, strength = Math.round(Math.abs(it.r) * 100);
    return `<div class="corr-row">
      <span class="corr-lbl">${it.label}<i class="corr-dir ${pos?'pos':'neg'}">${pos?'↑':'↓'}</i></span>
      <div class="corr-track"><div class="corr-fill ${pos?'pos':'neg'}" style="width:${strength}%"></div></div>
      <span class="corr-conf ${it.conf.cls}">${it.conf.t}</span>
    </div>`;
  }).join('');
}

// ═════════════════════════════════════════════════════════════════
//  СФЕРЫ ЖИЗНИ (ядро): пользователь создаёт свои сферы, каждая — со
//  своим типом трекера. Умный движок затем работает по любым сферам.
// ═════════════════════════════════════════════════════════════════
const SPHERE_TYPES = {
  score:   { lbl:'Балл 0–10',      hint:'самочувствие, удовлетворённость', icon:'📊' },
  habit:   { lbl:'Привычка да/нет', hint:'медитация, зарядка, без сахара',  icon:'✓'  },
  counter: { lbl:'Счётчик',         hint:'страниц, км, минут за день',      icon:'#'  },
  goal:    { lbl:'Цель-значение',   hint:'вес, «12 книг за год»',           icon:'◎'  },
  log:     { lbl:'Лог-заметки',     hint:'дневник сферы, свободные записи', icon:'✎'  },
};
const SPHERE_TEMPLATES = [
  { name:'Спорт',     icon:'🏃', color:'#1A7F3C', type:'habit'   },
  { name:'Сон',       icon:'😴', color:'#6B21A8', type:'score'   },
  { name:'Медитация', icon:'🧘', color:'#0E7490', type:'habit'   },
  { name:'Чтение',    icon:'📖', color:'#B45309', type:'counter', unit:'страниц' },
  { name:'Настроение',icon:'🙂', color:'#1056CC', type:'score'   },
  { name:'Вода',      icon:'💧', color:'#0E7490', type:'counter', unit:'стаканов' },
];
let _uidSeq = 0;
// Монотонный uid: без коллизий даже при быстрых пачках (онбординг, импорт).
const uid = () => Date.now() * 1000 + ((_uidSeq++) % 1000);
function createSphere({ name, icon, color, type, unit, target }) {
  const s = { id: uid(), name: String(name||'').trim() || 'Сфера', icon: icon || '●',
    color: color || '#1056CC', type: type || 'score', unit: unit || '',
    target: (target === '' || target == null) ? null : +target,
    createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now() };
  DB.spheres.push(s); persist(); return s;
}
function updateSphere(id, patch) {
  const s = DB.spheres.find(x => x.id === id); if (!s) return;
  Object.assign(s, patch); if (patch.target === '' ) s.target = null; else if (patch.target != null) s.target = +patch.target;
  s._u = Date.now(); persist();
}
function deleteSphere(id) {
  tomb(id);
  DB.spheres = DB.spheres.filter(x => x.id !== id);
  DB.sphereLogs.filter(l => l.sphereId === id).forEach(l => tomb(l.id));
  DB.sphereLogs = DB.sphereLogs.filter(l => l.sphereId !== id);
  persist();
}
// Записать/обновить значение сферы за день (по умолчанию — сегодня).
function logSphere(sphereId, value, note, date) {
  date = date || todayKey();
  const ex = DB.sphereLogs.find(l => l.sphereId === sphereId && l.date === date);
  if (ex) { ex.value = value; if (note != null) ex.note = note; ex._u = Date.now(); }
  else DB.sphereLogs.push({ id: uid(), sphereId, date, value,
    note: note || '', createdAt: nowISO(), sv: SCHEMA_VERSION, _u: Date.now() });
  persist();
}
function sphereLogsOf(id) {
  return DB.sphereLogs.filter(l => l.sphereId === id && l.date)
    .sort((a, b) => a.date < b.date ? -1 : 1);
}
// Сводка по сфере под её тип — то, что рисуем и подаём в умный движок.
function sphereStats(id, window) {
  window = window || 30;
  const s = DB.spheres.find(x => x.id === id); if (!s) return null;
  const logs = sphereLogsOf(id);
  const byDate = {}; logs.forEach(l => byDate[l.date] = l);
  const today = byDate[todayKey()];
  const inWin = logs.filter(l => l.date > dayAgo(window));
  const nums = inWin.map(l => +l.value || 0);
  const out = { sphere: s, type: s.type, today: today ? today.value : null, n: logs.length, series: [] };
  // серия за окно для спарклайна (по дням, null на пропуск)
  for (let i = window - 1; i >= 0; i--) { const d = dayAgo(i); const l = byDate[d]; out.series.push(l ? (+l.value || 0) : null); }
  if (s.type === 'score' || s.type === 'counter') {
    out.avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    out.sum = nums.reduce((a, b) => a + b, 0);
    out.last = logs.length ? +logs[logs.length - 1].value || 0 : null;
  } else if (s.type === 'habit') {
    const done = new Set(logs.filter(l => l.value).map(l => l.date));
    let num = 0, den = 0;
    for (let i = 0; i < 21; i++) { const w = 21 - i; den += w; if (done.has(dayAgo(i))) num += w; }
    out.consistency = den ? Math.round(100 * num / den) : 0;
    out.doneCount = done.size;
    out.doneToday = !!(today && today.value);
  } else if (s.type === 'goal') {
    out.last = logs.length ? +logs[logs.length - 1].value || 0 : 0;
    out.target = s.target;
    out.progress = s.target ? Math.max(0, Math.min(100, Math.round(100 * out.last / s.target))) : null;
  } else if (s.type === 'log') {
    out.entries = logs.filter(l => (l.note || String(l.value || '')).trim()).slice(-5).reverse();
  }
  return out;
}

// ─── СФЕРЫ: РЕНДЕР И ВЗАИМОДЕЙСТВИЕ ──────────────────────────────
const SPHERE_COLORS = ['#1056CC','#1A7F3C','#6B21A8','#B45309','#0E7490','#92400E','#B00020','#4C8DFF'];
let _sphereEdit = { id:null, type:'score', color:'#1056CC' };
function miniSpark(series, color) {
  const pts = series.map((v,i)=>({v,i})).filter(p=>p.v!=null);
  if (pts.length < 2) return '';
  const vals = pts.map(p=>p.v), mn = Math.min(...vals), mx = Math.max(...vals), rng = mx-mn || 1;
  const W=90, H=24, n=series.length;
  const d = pts.map(p=>`${(p.i/(n-1)*W).toFixed(1)},${(H-((p.v-mn)/rng)*H).toFixed(1)}`).join(' ');
  return `<svg class="sph-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function progRing(pct, color, txt) {
  return `<div class="sph-ring" style="--p:${pct||0};--rc:${color}"><b>${txt}</b></div>`;
}
function rSpheres() {
  const el = $('spheres-list'); if (!el) return;
  const list = DB.spheres || [];
  if (!list.length) {
    el.innerHTML = `<div class="sph-empty">
      <div class="sph-empty-t">Заведи свои сферы жизни</div>
      <div class="sph-empty-d">Любые направления — приложение подберёт правильный трекер и будет искать, что тебе помогает. Быстрый старт:</div>
      <div class="sph-tpl">${SPHERE_TEMPLATES.map((t,i)=>`<button class="sph-tpl-b" style="--tc:${t.color}" onclick="addSphereTemplate(${i})">${t.icon} ${esc(t.name)}</button>`).join('')}</div>
    </div>`;
    return;
  }
  el.innerHTML = list.map(sphereCard).join('');
}
function sphereCard(s) {
  const st = sphereStats(s.id, 30) || {};
  let body = '', action = '';
  if (s.type === 'score') {
    const val = st.today != null ? st.today : (st.last != null ? st.last : '—');
    body = `<div class="sph-big" style="color:${s.color}">${val}${val!=='—'?'<span>/10</span>':''}</div>${miniSpark(st.series||[], s.color)}`;
    action = `<button class="sph-log" onclick="event.stopPropagation();openSphereLog(${s.id})">Отметить</button>`;
  } else if (s.type === 'habit') {
    body = progRing(st.consistency||0, s.color, (st.consistency||0));
    action = `<button class="sph-log ${st.doneToday?'done':''}" onclick="event.stopPropagation();toggleHabitToday(${s.id})">${st.doneToday?'✓ сегодня':'Отметить'}</button>`;
  } else if (s.type === 'counter') {
    body = `<div class="sph-big" style="color:${s.color}">${st.sum||0}<span>${esc(s.unit||'')} · 30д</span></div>${miniSpark(st.series||[], s.color)}`;
    action = `<button class="sph-log" onclick="event.stopPropagation();openSphereLog(${s.id})">+ добавить</button>`;
  } else if (s.type === 'goal') {
    const p = st.progress!=null ? st.progress : 0;
    body = `${progRing(p, s.color, p+'%')}<div class="sph-goal-txt">${st.last||0}${s.target?' / '+s.target:''} ${esc(s.unit||'')}</div>`;
    action = `<button class="sph-log" onclick="event.stopPropagation();openSphereLog(${s.id})">Обновить</button>`;
  } else { // log
    const last = (st.entries&&st.entries[0]) ? (st.entries[0].note || String(st.entries[0].value||'')) : '';
    body = `<div class="sph-logtxt">${last?esc(last.slice(0,80)):'<i>нет записей</i>'}</div>`;
    action = `<button class="sph-log" onclick="event.stopPropagation();openSphereLog(${s.id})">Запись</button>`;
  }
  return `<div class="sph-card" style="--sc:${s.color}" onclick="openSphereLog(${s.id})">
    <div class="sph-head"><span class="sph-ic">${esc(s.icon||'●')}</span><span class="sph-name">${esc(s.name)}</span>
      <button class="sph-edit" onclick="event.stopPropagation();openSphereEdit(${s.id})" aria-label="Правка">✎</button></div>
    <div class="sph-body">${body}</div>
    <div class="sph-foot"><span class="sph-type">${SPHERE_TYPES[s.type]?.lbl||s.type}</span>${action}</div>
  </div>`;
}
function addSphereTemplate(i) {
  const t = SPHERE_TEMPLATES[i]; if (!t) return;
  createSphere({ ...t }); rSpheres(); hptMed && hptMed(); toast(`Сфера «${t.name}» создана`, 'ok');
}
function toggleHabitToday(id) {
  const st = sphereStats(id); const now = !(st && st.doneToday);
  logSphere(id, now); rSpheres(); hpt && hpt();
}
// ── Создание/правка ──
function openSphereEdit(id) {
  const s = id ? DB.spheres.find(x=>x.id===id) : null;
  _sphereEdit = { id: s?s.id:null, type: s?s.type:'score', color: s?s.color:SPHERE_COLORS[0] };
  $('sphere-edit-title').textContent = s ? 'Правка сферы' : 'Новая сфера';
  $('sphere-icon').value = s ? (s.icon||'●') : '●';
  $('sphere-name').value = s ? s.name : '';
  $('sphere-unit').value = s ? (s.unit||'') : '';
  $('sphere-target').value = s && s.target!=null ? s.target : '';
  $('sphere-del-btn').style.display = s ? '' : 'none';
  renderSphereEditForm();
  openOv('ov-sphere-edit');
}
function renderSphereEditForm() {
  $('sphere-colors').innerHTML = SPHERE_COLORS.map(c =>
    `<button class="tp sph-col ${c===_sphereEdit.color?'on':''}" style="--c:${c}" onclick="_sphereEdit.color='${c}';renderSphereEditForm()"></button>`).join('');
  $('sphere-types').innerHTML = Object.keys(SPHERE_TYPES).map(k => {
    const t = SPHERE_TYPES[k];
    return `<button class="sph-type-b ${k===_sphereEdit.type?'on':''}" onclick="_sphereEdit.type='${k}';renderSphereEditForm()">
      <b>${t.lbl}</b><span>${t.hint}</span></button>`;
  }).join('');
  $('sphere-unit-wrap').style.display   = (_sphereEdit.type==='counter'||_sphereEdit.type==='goal') ? '' : 'none';
  $('sphere-target-wrap').style.display = (_sphereEdit.type==='goal') ? '' : 'none';
}
function saveSphere() {
  const name = $('sphere-name').value.trim();
  if (!name) { toast('Назови сферу', 'warn'); return; }
  const patch = { name, icon:$('sphere-icon').value.trim()||'●', color:_sphereEdit.color,
    type:_sphereEdit.type, unit:$('sphere-unit').value.trim(), target:$('sphere-target').value };
  if (_sphereEdit.id) updateSphere(_sphereEdit.id, patch);
  else createSphere(patch);
  closeOv('ov-sphere-edit'); rSpheres(); rHome && rHome(); hptMed && hptMed();
  toast('Сфера сохранена', 'ok');
}
function confirmDeleteSphere() {
  if (!_sphereEdit.id) return;
  const s = DB.spheres.find(x=>x.id===_sphereEdit.id);
  if (!confirm(`Удалить сферу «${s?s.name:''}» со всеми записями?`)) return;
  deleteSphere(_sphereEdit.id);
  closeOv('ov-sphere-edit'); rSpheres(); toast('Сфера удалена', 'ok');
}
// ── Отметка за день ──
function openSphereLog(id) {
  const s = DB.spheres.find(x=>x.id===id); if (!s) return;
  const st = sphereStats(id); const cur = st && st.today != null ? st.today : '';
  $('sphere-log-title').textContent = `${s.icon||''} ${s.name}`.trim();
  const b = $('sphere-log-body');
  if (s.type === 'score') {
    // Слайдер как в чек-ине дня (единый паттерн 0–10 по всему приложению) —
    // тапнуть и потянуть, а не вбивать число руками (см. PATTERN_LIBRARY.md).
    const v0 = cur !== '' ? cur : 5;
    b.innerHTML = `<div class="f-lbl">Балл сегодня (0–10)</div>
      <div class="sl"><input type="range" id="sph-log-val" min="0" max="10" step="1" value="${v0}" oninput="document.getElementById('sph-log-val-v').textContent=this.value"><span class="slv" id="sph-log-val-v">${v0}</span></div>
      ${logNoteField(st)}<button class="btn btn-p btn-full" onclick="saveSphereLog(${id})">Сохранить</button>`;
  } else if (s.type === 'counter') {
    b.innerHTML = `<div class="f-lbl">Сколько сегодня${s.unit?' ('+esc(s.unit)+')':''}</div>
      <input class="field" id="sph-log-val" type="number" inputmode="decimal" value="${cur}" placeholder="0">
      ${logNoteField(st)}<button class="btn btn-p btn-full" onclick="saveSphereLog(${id})">Сохранить</button>`;
  } else if (s.type === 'goal') {
    b.innerHTML = `<div class="f-lbl">Текущее значение${s.unit?' ('+esc(s.unit)+')':''}${s.target?' · цель '+s.target:''}</div>
      <input class="field" id="sph-log-val" type="number" inputmode="decimal" value="${cur}" placeholder="0">
      ${logNoteField(st)}<button class="btn btn-p btn-full" onclick="saveSphereLog(${id})">Сохранить</button>`;
  } else if (s.type === 'habit') {
    const done = st && st.doneToday;
    b.innerHTML = `<div class="sph-habit-big">${done?'Сегодня отмечено ✓':'Отметить выполнение сегодня?'}</div>
      <button class="btn ${done?'btn-s':'btn-p'} btn-full" onclick="logSphere(${id},${!done});closeOv('ov-sphere-log');rSpheres()">${done?'Снять отметку':'Да, выполнено'}</button>`;
  } else { // log
    b.innerHTML = `<div class="f-lbl">Запись</div>
      <textarea class="field" id="sph-log-note" rows="4" placeholder="Что сегодня в этой сфере? Можно [[связать]] с инсайтом.">${st&&st.today?esc(String(st.today)):''}</textarea>
      <button class="btn btn-p btn-full" onclick="saveSphereLog(${id})">Сохранить</button>`;
  }
  openOv('ov-sphere-log');
}
function logNoteField(st) {
  const v = (st && st.today && typeof st.today === 'object') ? '' : '';
  return `<div class="f-lbl" style="margin-top:.5rem">Заметка (необязательно)</div>
    <input class="field" id="sph-log-note" placeholder="контекст дня…">`;
}
function saveSphereLog(id) {
  const s = DB.spheres.find(x=>x.id===id); if (!s) return;
  const noteEl = $('sph-log-note'), valEl = $('sph-log-val');
  const note = noteEl ? noteEl.value.trim() : '';
  let value;
  if (s.type === 'log') value = note;
  else { value = valEl && valEl.value!=='' ? +valEl.value : null; if (value==null){ toast('Введи значение','warn'); return; } }
  logSphere(id, value, note);
  closeOv('ov-sphere-log'); rSpheres(); rHome && rHome(); hptMed && hptMed();
  toast('Записано', 'ok');
  try { reactToSphere(s); rVector(); } catch (e) {}   // живой отклик и на сферы
}

// ─── СВЯЗИ МЕЖДУ СФЕРАМИ (Exist: «в дни спорта больше читаешь») ───
function crossLinks() {
  const sph = (DB.spheres || []).filter(s => s.type !== 'log');
  if (sph.length < 2) return [];
  const val = {}; sph.forEach(s => {
    val[s.id] = {}; DB.sphereLogs.filter(l => l.sphereId === s.id && l.date)
      .forEach(l => { val[s.id][l.date] = s.type === 'habit' ? (l.value ? 1 : 0) : +l.value; });
  });
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const out = [];
  for (let i = 0; i < sph.length; i++) for (let j = i + 1; j < sph.length; j++) {
    const A = sph[i], B = sph[j];
    const days = Object.keys(val[A.id]).filter(d => d in val[B.id]);
    if (days.length < 8) continue;
    const av = days.map(d => val[A.id][d]), bv = days.map(d => val[B.id][d]);
    // привычка ↔ число: сравниваем среднее числа в дни да/нет
    const habitNum = (H, hv, N, nv) => {
      const on = nv.filter((_, k) => hv[k]), off = nv.filter((_, k) => !hv[k]);
      if (on.length < 3 || off.length < 3) return null;
      const d = mean(on) - mean(off); if (Math.abs(d) < Math.max(0.5, mean(off) * 0.12)) return null;
      return { text: `В дни с «${esc(H.name)}» «${esc(N.name)}» ${d > 0 ? 'выше' : 'ниже'}`, conf: confLabel(Math.min(on.length, off.length)), s: Math.abs(d) };
    };
    let link = null;
    if (A.type === 'habit' && B.type !== 'habit') link = habitNum(A, av, B, bv);
    else if (B.type === 'habit' && A.type !== 'habit') link = habitNum(B, bv, A, av);
    else if (A.type !== 'habit' && B.type !== 'habit') {
      const r = pearson(av, bv);
      if (r != null && Math.abs(r) >= 0.45) link = { text: `Больше «${esc(A.name)}» — ${r > 0 ? 'больше' : 'меньше'} «${esc(B.name)}»`, conf: confLabel(days.length), s: Math.abs(r) };
    }
    if (link) out.push(link);
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 2);
}

// ─── ОБЗОР ПЕРИОДА (месяц/год) — синтез из данных (волна 3) ───────
function periodReview(days) {
  const since = dayAgo(days), comp = c => (c.cl + c.mv + (10 - c.st)) / 3;
  const cks = DB.checkins.filter(c => c.date && c.date > since);
  const wc = cks.map(c => ({ d: c.date, v: comp(c) }));
  const n = wc.length;
  const avg = n ? wc.reduce((a, x) => a + x.v, 0) / n : null;
  const prevSince = dayAgo(days * 2);
  const prev = DB.checkins.filter(c => c.date && c.date > prevSince && c.date <= since).map(comp);
  const prevAvg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
  const delta = (avg != null && prevAvg != null) ? avg - prevAvg : null;
  let best = null, worst = null;
  wc.forEach(x => { if (!best || x.v > best.v) best = x; if (!worst || x.v < worst.v) worst = x; });
  const adherence = Math.round(100 * new Set(cks.map(c => c.date)).size / days);
  const spheres = (DB.spheres || []).map(s => ({ s, st: sphereStats(s.id, days) }));
  const insightsN = DB.insights.filter(i => { const t = Date.parse(i.createdAt); return t && t > Date.now() - days * 864e5; }).length;
  const si = smartInsights();
  return { days, n, avg, delta, best, worst, adherence, spheres, insightsN,
    checkins: cks.length, topHelp: si.ok ? si.items.slice(0, 2) : [] };
}
function rReview(days) {
  const el = $('review-out'); if (!el) return;
  document.querySelectorAll('#review-btns .rv-b').forEach(b => b.classList.toggle('on', +b.dataset.d === days));
  const r = periodReview(days);
  if (r.n < 3) {
    el.innerHTML = `<div class="rv-empty">Мало данных за ${days===30?'месяц':'год'} (${r.n} ${pl(r.n,'чек-ин','чек-ина','чек-инов')}). Делай отметки — обзор соберётся сам.</div>`;
    return;
  }
  const dEl = r.delta==null ? '' : `<span class="rv-delta ${r.delta>=0?'up':'down'}">${r.delta>=0?'↑':'↓'} ${Math.abs(r.delta).toFixed(1)}</span>`;
  const fmtD = d => { const p = String(d).split('-'); return p[2]+'.'+p[1]; };
  const spheresHtml = r.spheres.map(({s, st}) => {
    if (!st) return '';
    let val;
    if (s.type==='habit') val = (st.consistency||0)+'% постоянство';
    else if (s.type==='counter') val = (st.sum||0)+' '+esc(s.unit||'');
    else if (s.type==='goal') val = (st.progress!=null?st.progress+'% к цели':'—');
    else if (s.type==='score') val = (st.avg!=null?'ср. '+st.avg.toFixed(1):'—');
    else val = ((st.entries||[]).length||0)+' записей';
    return `<div class="rv-sph"><span>${esc(s.icon||'●')} ${esc(s.name)}</span><b style="color:${s.color}">${val}</b></div>`;
  }).join('');
  el.innerHTML = `
    <div class="rv-hero"><div><div class="rv-lbl">Среднее состояние</div>
      <div class="rv-avg">${r.avg.toFixed(1)}<span>/10</span> ${dEl}</div></div>
      <div class="rv-adh"><div class="rv-adh-n">${r.adherence}%</div><div class="rv-adh-l">отмечено дней</div></div></div>
    <div class="rv-tiles">
      <div class="rv-tile"><b style="color:var(--green)">${r.best?r.best.v.toFixed(1):'—'}</b><span>лучший · ${r.best?fmtD(r.best.d):''}</span></div>
      <div class="rv-tile"><b style="color:var(--orange)">${r.worst?r.worst.v.toFixed(1):'—'}</b><span>трудный · ${r.worst?fmtD(r.worst.d):''}</span></div>
      <div class="rv-tile"><b>${r.insightsN}</b><span>инсайтов</span></div>
      <div class="rv-tile"><b>${r.checkins}</b><span>чек-инов</span></div>
    </div>
    ${r.topHelp.length?`<div class="rv-help"><div class="rv-help-t">Что тебе помогало</div>${r.topHelp.map(h=>`<div class="rv-help-r">• ${esc(h.text)}</div>`).join('')}</div>`:''}
    ${(()=>{const cl=crossLinks();return cl.length?`<div class="rv-help"><div class="rv-help-t">Связи сфер</div>${cl.map(l=>`<div class="rv-help-r">• ${l.text} <span class="rv-conf ${l.conf.cls}">${l.conf.t}</span></div>`).join('')}</div>`:'';})()}
    ${spheresHtml?`<div class="rv-sph-wrap"><div class="rv-help-t">Сферы</div>${spheresHtml}</div>`:''}`;
}

// ─── ДАЙДЖЕСТ ────────────────────────────────────────────────────
// Одна карточка «Итоги недели» на КАЛЕНДАРНУЮ неделю (ISO, пн–вс).
// Раньше идентичностью была строка дат скользящего окна («11 июл – 17 июл»),
// и сборка в другой день плодила почти одинаковые карточки — «повторяется
// одно и то же». Теперь неделя одна — карточка одна, свежая замещает.
function isoWeekKey(ts) {
  const d = new Date(ts);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7 + 3);   // четверг ISO-недели
  const y1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const w = 1 + Math.round(((t - y1) / 864e5 - 3 + (y1.getUTCDay() + 6) % 7) / 7);
  return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
}
const digWk = d => d.wk || isoWeekKey(d.createdAt ? Date.parse(d.createdAt) : d.id);
function dedupeDigests() {
  const seen = {}; let removed = 0;
  // список отсортирован свежими вперёд — на неделю остаётся самая свежая карточка
  DB.digests = (DB.digests || []).filter(d => {
    const k = digWk(d);
    if (seen[k]) { tomb(d.id); removed++; return false; }
    seen[k] = 1; return true;
  });
  return removed;
}
function rDig() {
  if (dedupeDigests()) persistLocal();   // страховка: дубли не выживают и после синка
  const el = $('dg-list');
  if (!DB.digests.length) {
    el.innerHTML = `<div class="empty"><div class="em-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--t3)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="em-t">Дайджеста пока нет</div><div class="em-d">Нажми «Сформировать» — соберу сводку недели из твоих данных</div></div>`;
    return;
  }
  el.innerHTML = DB.digests.map(d => {
    // Новый формат (с top/stateAvg) или старый (week/h/cnt/themes)
    if (d.top !== undefined) {
      const dlt = (cur, prev) => prev == null ? '' : cur - prev > 0 ? `<span style="color:var(--green)">▲ +${cur - prev}</span>` : cur - prev < 0 ? `<span style="color:var(--orange)">▼ ${cur - prev}</span>` : '<span style="color:var(--t3)">≈</span>';
      const arrow = d.stateDelta == null ? '' : d.stateDelta > 0 ? `<span style="color:var(--green)">▲ +${d.stateDelta}</span>` : d.stateDelta < 0 ? `<span style="color:var(--orange)">▼ ${d.stateDelta}</span>` : '<span style="color:var(--t3)">≈</span>';
      return `<div class="dg">
        <div class="dg-w">${esc(d.week)}</div>
        <div class="dg-h">Итоги недели</div>
        <div class="dg-stats">
          <div class="dg-stat"><b>${d.cnt}</b><span>инсайтов ${dlt(d.cnt, d.cntPrev)}</span></div>
          <div class="dg-stat"><b>${d.adherence}/7</b><span>чек-инов ${dlt(d.adherence, d.adhPrev)}</span></div>
          <div class="dg-stat"><b>${d.stateAvg ?? '—'}</b><span>состояние ${arrow}</span></div>
          <div class="dg-stat"><b>${d.dreams}</b><span>снов</span></div>
        </div>
        ${d.ai ? `<div class="dg-ai"><div class="dg-ai-badge">✨ Живой обзор недели</div>${esc(d.ai)}</div>` : ''}
        ${d.cause && d.cause.length ? `<div class="dg-sub">Причины → следствия</div>${d.cause.map(t=>`<div class="dg-ce">→ ${esc(t)}</div>`).join('')}` : ''}
        ${d.top && d.top.length ? `<div class="dg-sub">Сильнейшие инсайты</div>${d.top.map(t=>`<div class="dg-top"><span class="tag ${TC[t.tag]||'tg-personal'}">${TL[t.tag]||t.tag}</span> ${esc(t.title)}</div>`).join('')}` : ''}
        ${d.themes && d.themes.length ? `<div class="chips" style="margin-top:var(--s3)">${d.themes.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;
    }
    return `<div class="dg">
      <div class="dg-w">${esc(d.week)}</div>
      <div class="dg-h">${esc(d.h||'Дайджест')}</div>
      <div class="dg-meta"><div class="dg-m"><strong>${d.cnt}</strong> инсайтов</div></div>
      <div class="chips">${(d.themes||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>
    </div>`;
  }).join('');
}
// Реальный дайджест: считается из фактических данных за 7 дней (без выдумок).
async function mkDig() {
  toast('Считаю по твоим данным…');
  await new Promise(r => setTimeout(r, 250));
  const now = Date.now();
  const wk = iso => iso && Date.parse(iso) >= now - 7*864e5;
  const insW = DB.insights.filter(i => wk(i.createdAt));
  // Только инсайты ЭТОЙ недели: глобальный запасной список повторял одни и
  // те же «сильнейшие» в каждой карточке. Нет записей — блок честно пуст.
  const top = [...insW]
    .sort((a,b) => (b.w||1)-(a.w||1)).slice(0,3)
    .map(i => ({ title: i.title, tag: i.tag }));
  const ciW = DB.checkins.filter(c => c.date >  dayAgo(7));
  const ciP = DB.checkins.filter(c => c.date <= dayAgo(7) && c.date > dayAgo(14));
  const aW = checkinAvg(ciW), aP = checkinAvg(ciP);
  const stateDelta = (aW && aP) ? +(aW.comp - aP.comp).toFixed(1) : null;
  const counts = {}; insW.forEach(i => counts[i.tag] = (counts[i.tag]||0)+1);
  const themes = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t])=>TL[t]||t);
  const dreams = DB.dreams.filter(d => wk(d.createdAt)).length;
  // Причины → следствия: главные действенные связи из движков — сердце
  // обзора («что я делаю → что получаю»), а не просто счётчики.
  let cause = [];
  try { cause = (smartInsights().items || []).slice(0, 3).map(x => x.text); } catch (e) {}
  try { crossLinks().forEach(l => { if (cause.length < 5 && !cause.includes(l.text)) cause.push(l.text); }); } catch (e) {}
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const d0 = new Date(now-6*864e5), d1 = new Date(now);
  const week = `${d0.getDate()} ${M[d0.getMonth()]} – ${d1.getDate()} ${M[d1.getMonth()]}`;
  // Один обзор на КАЛЕНДАРНУЮ неделю: повторное «Собрать» обновляет карточку,
  // а не плодит дубли. Замещённые — с надгробием, чтобы синк не воскресил их
  // с другого устройства. Хвост списка ≤ 20.
  const wkKey = isoWeekKey(now);
  (DB.digests || []).filter(d => digWk(d) === wkKey).forEach(d => tomb(d.id));
  DB.digests = (DB.digests || []).filter(d => digWk(d) !== wkKey);
  while (DB.digests.length > 19) tomb(DB.digests.pop().id);
  // Дельты к прошлой неделе — обзор показывает движение, а не только счёт
  const insP7 = DB.insights.filter(i => { const t = Date.parse(i.createdAt); return t && t < now - 7 * 864e5 && t >= now - 14 * 864e5; }).length;
  DB.digests.unshift({
    id: now, createdAt: nowISO(), sv: SCHEMA_VERSION, week, wk: wkKey,
    cnt: insW.length, cntPrev: insP7, adherence: ciW.length, adhPrev: ciP.length,
    stateAvg: aW ? +aW.comp.toFixed(1) : null, stateDelta,
    dreams, patterns: DB.patterns.length, themes, top, cause,
  });
  persist(); rDig(); hptMed(); toast('Обзор недели готов', 'ok');
  // Обзор не должен «мелькнуть и уйти»: скроллим к свежей карточке и подсвечиваем.
  const fresh = document.querySelector('#dg-list .dg');
  if (fresh) {
    fresh.classList.add('dg-new');
    try { fresh.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    setTimeout(() => fresh.classList.remove('dg-new'), 2600);
  }
  // Автономно: если есть ключ — Claude тихо дописывает живой обзор (без кнопок).
  if (getAiKey()) enrichDigestAutonomously(now);
}
async function enrichDigestAutonomously(digId) {
  try {
    const user = weekContextForAI() +
      '\n\nНапиши тёплый живой обзор недели (4–6 предложений): что заметно в инсайтах и состоянии, какая динамика, на что обратить внимание. Заверши одним мягким вопросом. Без клише.';
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 700, task: 'digest' });
    const d = (DB.digests || []).find(x => x.id === digId) || DB.digests[0];
    if (d && text) { d.ai = text.trim(); persist(); rDig(); }
  } catch (e) { /* тихо: AI — необязательный фоновый слой */ }
}

// ─── КОНФИГ ──────────────────────────────────────────────────────
function rCfgForm() {
  const ni = $('cfg-name');   if(ni) ni.value = CFG.userName||'';
  const tci = $('cfg-trusted'); if(tci) tci.value = CFG.trustedContact||'';
  const di = $('cfg-domain'); if(di) di.value = CFG.domainLabel||'Книга';
  const ai = $('cfg-api');    if(ai) ai.value = CFG.apiUrl||'';
  const ki = $('cfg-space');  if(ki) ki.value = CFG.spaceKey||'';
  const ls = $('cfg-lastsync');
  if (ls) ls.textContent = CFG.lastSync ? 'Последняя синхронизация: '+new Date(CFG.lastSync).toLocaleString('ru') : 'Ещё не синхронизировано';
  const pi = $('cfg-pass'); if (pi) pi.value = getPass();
  updateEncStatus();
  const ap = $('cfg-ai-provider'); if (ap) ap.value = CFG.aiProvider || 'anthropic';
  aiProviderChanged();
  const am = $('cfg-aimodel'); if (am) am.value = CFG.aiModel || AI_MODEL_DEFAULT;
  const al = $('cfg-ai-light'); if (al) al.value = (CFG.aiRoutes && CFG.aiRoutes.light) || AI_MODEL_LIGHT_DEFAULT;
  const ad = $('cfg-ai-deep');  if (ad) ad.value = (CFG.aiRoutes && CFG.aiRoutes.deep) || CFG.aiModel || AI_MODEL_DEFAULT;
  const ab = $('cfg-ai-budget'); if (ab) ab.value = CFG.aiBudgetUSD || '';
  rAiSpend();
  updateAiStatus();
  rCfgAxes();
}
function rCfgAxes() {
  const el = $('cfg-axes-list');
  if (!el) return;
  el.innerHTML = Object.entries(CFG.axes).map(([key,ax]) =>
    `<div class="cfg-ax-row">
      <div class="cfg-ax-dot" style="background:${ax.c}"></div>
      <span class="cfg-ax-name">${ax.lbl}</span>
      <span class="cfg-ax-score">${ax.s}</span>
      <button class="cfg-ax-del" onclick="deleteAxis('${key}')" aria-label="Удалить ось"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;color:var(--t3)"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`
  ).join('');
}
function resetApiUrl() {
  // Иван ввёл неверный Railway-адрес вручную — CFG.apiUrl (локальный override
  // на устройстве) перекрывал рабочий window.ARCHITECT_API, синк молчал с
  // «Ошибка», не говоря, какой именно URL пробуется. Один тап возвращает
  // дефолт — без похода в консоль/файлы, это личный оверрайд на телефоне.
  CFG.apiUrl = '';
  const ai = $('cfg-api'); if (ai) ai.value = '';
  persist();
  checkApiStatus();
  toast('Backend сброшен на сервер по умолчанию', 'ok');
}
function saveCfg() {
  CFG.userName    = $('cfg-name')?.value.trim()||CFG.userName;
  const tc = $('cfg-trusted'); if (tc) CFG.trustedContact = tc.value.trim();
  CFG.domainLabel = $('cfg-domain')?.value.trim()||CFG.domainLabel;
  CFG.apiUrl      = $('cfg-api')?.value.trim()||'';
  const keyVal    = $('cfg-space')?.value.trim()||'';
  CFG.spaceKey    = keyVal;  // позволяет вставить ключ с другого устройства
  if (CFG.axes.domain) CFG.axes.domain.lbl = CFG.domainLabel;
  persist(); closeOv('ov-cfg');
  updateDomainLabel(); rCompass(); rVit(); checkApiStatus();
  toast('Конфигурация сохранена', 'ok');
}
function saveNewAxis() {
  const lbl = $('ax-new-lbl').value.trim();
  if (!lbl) { toast('Введи название', 'warn'); return; }
  const key = lbl.toLowerCase().replace(/\s+/g,'_').replace(/[^a-zа-яё_]/gi,'');
  CFG.axes[key] = {lbl, s: parseFloat($('ax-new-v').value)||7, c: STATE.newAxColor};
  $('ax-new-lbl').value='';
  persist(); closeOv('ov-axis-new'); openOv('ov-cfg'); rCfgAxes(); rCompass();
  toast('Ось добавлена', 'ok');
}
function deleteAxis(key) {
  if (Object.keys(CFG.axes).length<=3) { toast('Минимум 3 оси', 'warn'); return; }
  delete CFG.axes[key];
  persist(); rCfgAxes(); rCompass(); rVit();
  toast('Ось удалена');
}

// ─── ЭКСПОРТ / ИМПОРТ ────────────────────────────────────────────
function exportData() {
  const b = new Blob([JSON.stringify({exportedAt:new Date().toISOString(), db:DB, cfg:CFG}, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = `architect-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('Данные экспортированы', 'ok');
}
// Экспорт в Markdown — человекочитаемый дневник (портируемо в Obsidian и т.п.)
function exportMarkdown() {
  const d = new Date().toISOString().slice(0,10);
  const L = [`# Архитектор — выгрузка ${d}`, ''];
  const r = periodReview(30);
  if (r.n >= 3) {
    L.push('## Обзор месяца', '',
      `- Среднее состояние: **${r.avg.toFixed(1)}/10**${r.delta!=null?` (${r.delta>=0?'↑':'↓'}${Math.abs(r.delta).toFixed(1)} к прошлому)`:''}`,
      `- Отмечено дней: ${r.adherence}% · чек-инов: ${r.checkins} · инсайтов: ${r.insightsN}`);
    if (r.topHelp.length) { L.push('', '**Что помогало:**'); r.topHelp.forEach(h => L.push(`- ${h.text}`)); }
    L.push('');
  }
  if ((DB.spheres||[]).length) {
    L.push('## Сферы', '');
    DB.spheres.forEach(s => {
      const st = sphereStats(s.id, 30) || {};
      let v = '';
      if (s.type==='habit') v = `${st.consistency||0}% постоянство`;
      else if (s.type==='counter') v = `${st.sum||0} ${s.unit||''} за 30д`;
      else if (s.type==='goal') v = st.progress!=null?`${st.progress}% к цели ${s.target||''}`:'';
      else if (s.type==='score') v = st.avg!=null?`ср. ${st.avg.toFixed(1)}/10`:'';
      L.push(`- **${s.icon||''} ${s.name}** — ${v} _(${SPHERE_TYPES[s.type]?.lbl||s.type})_`);
    });
    L.push('');
  }
  L.push('## Инсайты', '');
  (DB.insights||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).forEach(i => {
    L.push(`### ${i.title||'—'}`, `*${dispDate(i)||''} · ${TL[i.tag]||i.tag||''}${i.src?' · '+i.src:''}*`, '', (i.body||''), '');
  });
  const blob = new Blob([L.join('\n')], {type:'text/markdown'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `architect-${d}.md`; a.click();
  toast('Экспортировано в Markdown', 'ok');
}
function handleImport(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.db)  DB  = {...DEFAULT_DB,  ...data.db};
      if (data.cfg) CFG = {...DEFAULT_CFG, ...data.cfg, axes:{...DEFAULT_CFG.axes,...(data.cfg.axes||{})}};
      // legacy support
      if (data.insights) DB.insights = data.insights;
      persist(); closeOv('ov-import'); initAll();
      toast('Данные импортированы', 'ok');
    } catch(err) { toast('Ошибка формата JSON', 'warn'); }
  };
  reader.readAsText(file);
}

// ═════════════════════════════════════════════════════════════════
//  ИМПОРТ ИЗ CHATGPT: многолетний дневник из чатов → в систему.
//  Всё локально: архив разбирается в браузере и НИКУДА не уходит.
//  Путь: экспорт (Settings → Data controls → Export data) → файл сюда →
//  выбор чатов → записи с настоящими датами → освоение психоконтуром
//  (метод «Зачем?») → архив питает смысловую карту, паттерны, переклички.
// ═════════════════════════════════════════════════════════════════
let _gpt = { convs: [], sel: new Set(), done: null };
// Минимальный zip-ридер (central directory + DecompressionStream) — без
// внешних библиотек, читаем только conversations.json из архива экспорта.
async function gptUnzip(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--)
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('это не zip-архив');
  const cnt = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder();
  for (let k = 0; k < cnt; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = td.decode(b.subarray(off + 46, off + 46 + nlen));
    if (/(^|\/)conversations\.json$/.test(name)) {
      const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
      const data = b.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
      if (method === 0) return td.decode(data);
      if (method === 8) {
        const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        return td.decode(new Uint8Array(out));
      }
      throw new Error('неизвестный метод сжатия');
    }
    off += 46 + nlen + elen + clen;
  }
  throw new Error('в архиве нет conversations.json');
}
// conversations.json → список чатов с ТВОИМИ сообщениями (ответы GPT не
// импортируются — дневник это твои слова). Эвристика «похоже на дневник»:
// кириллица, развёрнутые сообщения, не код.
function gptParseConvs(raw) {
  let arr; try { arr = JSON.parse(raw); } catch (e) { throw new Error('файл не читается как JSON'); }
  if (!Array.isArray(arr)) arr = (arr && arr.conversations) || [];
  const out = [];
  arr.forEach(c => {
    const msgs = [];
    Object.values(c.mapping || {}).forEach(n => {
      const m = n && n.message;
      if (!m || !m.author || m.author.role !== 'user') return;
      const parts = ((m.content && m.content.parts) || []).filter(p => typeof p === 'string');
      const t = parts.join('\n').trim();
      if (t) msgs.push({ t, ts: Math.round((m.create_time || c.create_time || 0) * 1000) });
    });
    msgs.sort((a, b) => a.ts - b.ts);
    if (!msgs.length) return;
    const all = msgs.map(m => m.t).join(' ');
    const letters = (all.match(/[a-zа-яё]/gi) || []).length || 1;
    const cyr = (all.match(/[а-яё]/gi) || []).length / letters;
    const avg = all.length / msgs.length;
    const code = /```|function |const |=>|SELECT |<div/.test(all);
    out.push({ i: 0, title: c.title || 'Без названия', t: Math.round((c.create_time || 0) * 1000),
      msgs, chars: all.length, diary: cyr >= 0.5 && avg >= 60 && !code });
  });
  out.sort((a, b) => b.t - a.t);
  out.forEach((c, i) => { c.i = i; });
  return out;
}
async function handleGptFile(input) {
  const f = input.files && input.files[0]; if (!f) return;
  input.value = '';
  try {
    toast('Читаю архив локально…');
    const raw = /\.zip$/i.test(f.name) ? await gptUnzip(await f.arrayBuffer()) : await f.text();
    _gpt.convs = gptParseConvs(raw);
    _gpt.sel = new Set(_gpt.convs.filter(c => c.diary).map(c => c.i));
    _gpt.done = null;
    if (!_gpt.convs.length) { toast('В файле не нашлось диалогов', 'warn'); return; }
    rGptList(); hptMed();
  } catch (e) { toast('Не смог прочитать: ' + e.message, 'warn'); }
}
function gptToggle(i) { _gpt.sel.has(i) ? _gpt.sel.delete(i) : _gpt.sel.add(i); }
function gptSelAll(mode) {
  _gpt.sel = new Set(mode === 'none' ? [] : _gpt.convs.filter(c => mode === 'all' || c.diary).map(c => c.i));
  rGptList();
}
function rGptList() {
  const el = $('gpt-list'); if (!el) return;
  const cs = _gpt.convs || [];
  const act = $('gpt-actions'); if (act) act.style.display = cs.length ? '' : 'none';
  if (!cs.length) { el.innerHTML = ''; gptSummary(); return; }
  const nd = cs.filter(c => c.diary).length;
  el.innerHTML = `<div class="key-d" style="margin:var(--s2) 0">Найдено ${cs.length} ${pl(cs.length, 'чат', 'чата', 'чатов')}; похожих на дневник — ${nd} (уже отмечены). Отметь вручную, что ещё взять.</div>
    <div style="display:flex;gap:var(--s2);margin-bottom:var(--s2)">
      <button class="btn btn-s btn-sm" onclick="gptSelAll('diary')">Дневниковые</button>
      <button class="btn btn-s btn-sm" onclick="gptSelAll('all')">Все</button>
      <button class="btn btn-s btn-sm" onclick="gptSelAll('none')">Снять</button>
    </div>` +
    cs.slice(0, 400).map(c => `<label class="gpt-row"><input type="checkbox" ${_gpt.sel.has(c.i) ? 'checked' : ''} onchange="gptToggle(${c.i})">
      <div><div class="gpt-t">${esc(c.title.slice(0, 60))}${c.diary ? ' <span class="gpt-badge">дневник</span>' : ''}</div>
      <div class="gpt-m">${c.t ? new Date(c.t).toLocaleDateString('ru') : ''} · ${c.msgs.length} ${pl(c.msgs.length, 'сообщение', 'сообщения', 'сообщений')}</div></div></label>`).join('');
  const res = $('gpt-result');
  if (res) res.innerHTML = _gpt.done
    ? `<div class="key-d" style="margin-top:var(--s2)">✓ Импортировано ${_gpt.done.nIns} ${pl(_gpt.done.nIns, 'запись', 'записи', 'записей')}${_gpt.done.nDrm ? ` (снов: ${_gpt.done.nDrm})` : ''}${_gpt.done.nDup ? `, пропущено дублей: ${_gpt.done.nDup}` : ''}. ${getAiKey() ? 'Теперь нажми «Освоить архив» — ИИ разметит записи по методу «Зачем?».' : 'Добавь AI-ключ («Ключи сервисов») — и ИИ осознанно освоит архив по методу «Зачем?».'}</div>`
    : '';
  gptSummary();
}
// Импорт: твои сообщения → записи с НАСТОЯЩИМИ датами (история за годы
// ложится в хронологию). Сны распознаются и уходят в дневник снов.
function gptRunImport() {
  const sel = _gpt.convs.filter(c => _gpt.sel.has(c.i));
  if (!sel.length) { toast('Выбери хотя бы один чат', 'warn'); return; }
  const seen = new Set((DB.insights || []).filter(i => i.src === 'ChatGPT').map(i => (i.day || '') + '|' + String(i.body || '').slice(0, 60)));
  const dreamRe = /присни|снилось|видел сон|видела сон|сон про|^сон[:. ]/i;
  let nIns = 0, nDrm = 0, nDup = 0, uid = Date.now();
  const CAP = 2000;
  outer:
  for (const c of sel) for (const m of c.msgs) {
    if (m.t.length < 60) continue;                 // короткие реплики — не дневник
    if (nIns >= CAP) break outer;
    const ts = m.ts || Date.now();
    const iso = new Date(ts).toISOString(), dayK = iso.slice(0, 10);
    const key = dayK + '|' + m.t.slice(0, 60);
    if (seen.has(key)) { nDup++; continue; }
    seen.add(key);
    const body = m.t.slice(0, 4000);
    const dateStr = new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const dream = dreamRe.test(m.t.slice(0, 80));
    if (dream) {
      DB.dreams.push(touch({ id: ++uid, date: dateStr, createdAt: iso, day: dayK, sv: SCHEMA_VERSION, title: titleFrom(body).slice(0, 52), body, tone: null, arch: null, src: 'ChatGPT' }));
      nDrm++;
    }
    DB.insights.push(touch({ id: ++uid, tag: dream ? 'dream' : 'personal', w: 1, title: titleFrom(body), body, date: dateStr, createdAt: iso, day: dayK, sv: SCHEMA_VERSION, src: 'ChatGPT', links: [] }));
    nIns++;
  }
  DB.insights.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  DB.dreams.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  persist();
  try { rIns(); rHIns(); rKPIs(); rDrms(); } catch (e) {}
  _gpt.done = { nIns, nDrm, nDup };
  rGptList(); hptMed();
  toast(`Импортировано: ${nIns}${nDrm ? ` · снов: ${nDrm}` : ''}`, 'ok');
}
// «Освоение» архива: массовая осознанная разметка психоконтуром — с
// прогрессом, кнопкой «остановить» и жёстким стопом по бюджету AI.
let _gptStop = false;
async function gptAbsorb() {
  if (!getAiKey()) { closeOv('ov-gpt'); openKeys(); toast('Сначала добавь AI-ключ', 'warn'); return; }
  const bar = $('gpt-absorb'); _gptStop = false; _psyBusy = true;
  const todoAll = () => (DB.insights || []).filter(i => (!i.psy || !i.psy.themes) && String(i.body || '').length >= 25);
  const total = todoAll().length;
  if (!total) { if (bar) bar.textContent = 'Всё уже освоено ✓'; _psyBusy = false; gptSummary(); return; }
  let done = 0;
  while (!_gptStop) {
    const batch = todoAll().slice(0, 8);
    if (!batch.length) break;
    try { done += await psyMarkBatch(batch); }
    catch (e) {
      if (bar) bar.textContent = e.budget ? '⏸ Бюджет AI на месяц исчерпан — остальное освою после сброса лимита' : 'Пауза: ' + e.message;
      _psyBusy = false; gptSummary(); return;
    }
    if (bar) bar.innerHTML = `Осваиваю архив… ${total - todoAll().length} из ${total} · <span class="key-del" onclick="_gptStop=true">остановить</span>`;
  }
  if (bar) bar.textContent = _gptStop ? `Остановлено: размечено ${done} из ${total}` : `Архив освоен: размечено ${done} записей ✓`;
  _psyBusy = false;
  gptSummary();
}
// Сводка «что приложение поняло из архива»: годы, сквозные темы, потребности.
function gptSummary() {
  const el = $('gpt-summary'); if (!el) return;
  const imp = (DB.insights || []).filter(i => i.src === 'ChatGPT');
  if (!imp.length) { el.innerHTML = ''; return; }
  const byYear = {};
  imp.forEach(i => { const y = String(i.createdAt || '').slice(0, 4) || '—'; byYear[y] = (byYear[y] || 0) + 1; });
  const years = Object.entries(byYear).sort();
  const th = {}, nd = {};
  imp.forEach(i => { if (i.psy) { (i.psy.themes || []).forEach(t => { th[t] = (th[t] || 0) + 1; }); if (i.psy.need) nd[i.psy.need] = (nd[i.psy.need] || 0) + 1; } });
  const topTh = Object.entries(th).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topNd = Object.entries(nd).sort((a, b) => b[1] - a[1]).slice(0, 3);
  el.innerHTML = `<div class="key-card" style="margin-top:var(--s3)">
    <div class="key-h"><b>Что приложение поняло из архива</b></div>
    <div class="key-d">По годам: ${years.map(([y, n]) => `${y} — ${n}`).join(' · ')}</div>
    ${topTh.length ? `<div class="key-d">Сквозные темы: ${topTh.map(([t, n]) => `«${esc(t)}» (${n})`).join(', ')}</div>` : ''}
    ${topNd.length ? `<div class="key-d">Глубинные потребности: ${topNd.map(([t, n]) => `${esc(t)} (${n})`).join(', ')}</div>` : `<div class="key-d">Темы и потребности появятся после освоения архива ИИ.</div>`}
    <div class="key-foot"><span class="key-del" onclick="closeOv('ov-gpt');goTo('map');msub('graph');STATE.mapView='themes';rMap()">открыть смысловую карту →</span></div>
  </div>`;
}

// ═════════════════════════════════════════════════════════════════
//  СИНХРОНИЗАЦИЯ v2  (перенос практик из TMCManager)
//  · единый API-клиент с таймаутом, ретраями и нормализацией ошибок
//  · структурный лог последних событий
//  · шифрование данных (AES-GCM) перед отправкой на сервер
//  · версии записей + слияние (offline-first, без потери данных)
//  · оффлайн-очередь и авто-синк
// ═════════════════════════════════════════════════════════════════
function apiBase() {
  return (CFG.apiUrl || window.ARCHITECT_API || '').trim().replace(/\/+$/, '');
}

// ─── PUSH-УВЕДОМЛЕНИЯ (клиент) ──────────────────────────────────
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'; }
function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function enableNotifications() {
  if (!pushSupported()) { toast('Браузер не поддерживает уведомления', 'warn'); return; }
  const base = apiBase();
  if (!base) { toast('Сначала подключи backend', 'warn'); return; }
  let vapid;
  try {
    const r = await fetch(base + '/api/push/vapid');
    if (r.status === 501 || r.status === 404) { toast('Пуш ещё не активирован на сервере — скажи, включу', 'warn'); return; }
    if (!r.ok) throw new Error('vapid ' + r.status);
    vapid = (await r.json()).publicKey;
  } catch (e) { toast('Нет связи с сервером уведомлений', 'warn'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Уведомления не разрешены', 'warn'); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapid) });
    await fetch(base + '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spaceKey: CFG.spaceKey || null, subscription: sub }) });
    localStorage.setItem('arch5_push', '1'); rPushStatus();
    toast('Уведомления включены', 'ok');
  } catch (e) { toast('Не удалось подписаться: ' + e.message, 'warn'); }
}
function rPushStatus() {
  const el = $('push-status'); if (!el) return;
  const on = typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('arch5_push') === '1';
  el.textContent = on ? 'Включены' : 'Выключены';
}

// ─── ЛОГ (кольцевой буфер последних 50 событий) ──────────────────
const LOG = [];
function log(level, msg, extra) {
  const e = { t: Date.now(), level, msg: String(msg), extra: extra ? String(extra) : '' };
  LOG.push(e);
  if (LOG.length > 50) LOG.shift();
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  (console[fn] || console.log)('[arch]', msg, extra || '');
  if ($('ov-log')?.classList.contains('on')) rLog();
}

// ─── ЕДИНЫЙ API-КЛИЕНТ ───────────────────────────────────────────
const _httpMsg = s => ({400:'Некорректный запрос',401:'Нет авторизации',403:'Доступ запрещён',404:'Не найдено',409:'Конфликт данных',500:'Ошибка сервера'})[s] || ('Ошибка '+s);
const _backoff = a => new Promise(r => setTimeout(r, [600,1800,4000][a] || 4000));
async function api(path, { method='GET', body, timeout=12000, retries=2 } = {}) {
  const API = apiBase();
  if (!API) throw new Error('Backend не подключён');
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(API + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (r.status >= 500 && attempt < retries) { log('warn', method+' '+path+' → '+r.status, 'ретрай'); await _backoff(attempt); continue; }
      const data = r.status === 204 ? null : await r.json().catch(() => null);
      if (!r.ok) {
        const err = new Error((data && data.error) || _httpMsg(r.status));
        err.status = r.status;
        log('warn', method+' '+path+' → '+r.status, err.message);
        throw err;
      }
      log('info', method+' '+path+' → '+r.status);
      return data;
    } catch (e) {
      clearTimeout(to);
      lastErr = e;
      const retryable = (e.name === 'AbortError' || e.name === 'TypeError') && !e.status;
      if (retryable && attempt < retries) { log('warn', 'сеть '+path, 'ретрай '+(attempt+1)); await _backoff(attempt); continue; }
      if (e.status) throw e;
      throw new Error(e.name === 'AbortError' ? 'Таймаут — сервер не ответил' : 'Нет соединения');
    }
  }
  throw lastErr;
}

// ─── ШИФРОВАНИЕ (E2EE: AES-GCM, ключ из парольной фразы) ─────────
// Модель (см. SECURITY_MODEL.md): сервер видит ТОЛЬКО шифроблоки; ключ
// выводится из фразы в браузере и на сервер не уходит. v2 — конверт
// (envelope): случайный DEK шифрует данные, а сам DEK «заворачивается»
// фразой И (если задан) ключом восстановления — чтобы «забыл фразу» не
// значило «потерял память навсегда». v1 (прямой ключ из фразы, 100k)
// читается по-прежнему — обратная совместимость со старыми блоками.
const _te = new TextEncoder(), _td = new TextDecoder();
const _b64  = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const _ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const KDF_ITER = 600000;   // OWASP 2023 для PBKDF2-SHA256 (было 100k)
function getPass() { try { return localStorage.getItem(passKey(activeId())) || ''; } catch(e) { return ''; } }
function setPass(p) { const id = activeId(); try { p ? localStorage.setItem(passKey(id), p) : localStorage.removeItem(passKey(id)); } catch(e) {} }
const recKey = id => 'arch5_rec_' + id;
function getRecoveryKey() { try { return localStorage.getItem(recKey(activeId())) || ''; } catch(e) { return ''; } }
function setRecoveryKey(k) { const id = activeId(); try { k ? localStorage.setItem(recKey(id), k) : localStorage.removeItem(recKey(id)); } catch(e) {} }
async function _deriveKey(secret, salt, iter, usages) {
  const base = await crypto.subtle.importKey('raw', _te.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iter, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, usages
  );
}
// Завернуть/развернуть DEK секретом (фраза ИЛИ ключ восстановления).
async function _wrapDek(dekRaw, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const kek  = await _deriveKey(secret, salt, KDF_ITER, ['encrypt']);
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, kek, dekRaw);
  return { salt:_b64(salt), iv:_b64(iv), ct:_b64(ct) };
}
async function _unwrapDek(wrap, secret) {
  const kek = await _deriveKey(secret, _ub64(wrap.salt), KDF_ITER, ['decrypt']);
  return crypto.subtle.decrypt({ name:'AES-GCM', iv:_ub64(wrap.iv) }, kek, _ub64(wrap.ct)); // -> ArrayBuffer (raw DEK)
}
async function encryptPayload(obj, pass, recovery) {
  const dek = await crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
  const dekRaw = await crypto.subtle.exportKey('raw', dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, dek, _te.encode(JSON.stringify(obj)));
  const wraps = { pass: await _wrapDek(dekRaw, pass) };
  if (recovery) wraps.recovery = await _wrapDek(dekRaw, recovery);
  return { _enc:'v2', data:{ iv:_b64(iv), ct:_b64(ct) }, wraps };
}
// which: 'pass' (по фразе) или 'recovery' (по ключу восстановления).
async function decryptPayload(blob, secret, which = 'pass') {
  if (blob && blob._enc === 'v2') {
    const wrap = blob.wraps && blob.wraps[which];
    if (!wrap) { const e = new Error(which === 'recovery' ? 'Для этих данных нет ключа восстановления' : 'Нет ключа для расшифровки'); e.needPass = true; throw e; }
    const dekRaw = await _unwrapDek(wrap, secret);
    const dek = await crypto.subtle.importKey('raw', dekRaw, { name:'AES-GCM' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv:_ub64(blob.data.iv) }, dek, _ub64(blob.data.ct));
    return JSON.parse(_td.decode(pt));
  }
  // v1 legacy: прямой ключ из фразы, 100k
  const key = await _deriveKey(secret, _ub64(blob.salt), 100000, ['decrypt']);
  const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv:_ub64(blob.iv) }, key, _ub64(blob.ct));
  return JSON.parse(_td.decode(pt));
}
// Ключ восстановления: читаемые группы, без похожих символов (0/O, 1/I).
function genRecoveryKey() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(20));
  let s = '';
  for (let i = 0; i < 20; i++) { s += A[rnd[i] % A.length]; if (i % 5 === 4 && i < 19) s += '-'; }
  return 'ARCH-' + s;
}

// ─── ВЕРСИИ ЗАПИСЕЙ + СЛИЯНИЕ ────────────────────────────────────
// Каждая правка помечает запись меткой времени `_u`; удаление кладёт
// «надгробие» в DB._del. Слияние — union по id, где новейшая метка
// побеждает, а надгробие удаляет запись на всех устройствах.
const IDCOLS = ['insights','dreams','patterns','evolution','spiritual','checkins','moments','whys','corrections','meds','medIntakes','symptoms','measures','astroCharts','bots','digests','spheres','sphereLogs','chats','cravings'];
function touch(rec) { if (rec && typeof rec === 'object') rec._u = Date.now(); return rec; }
function tomb(id) { (DB._del || (DB._del = {}))[id] = Date.now(); }
const _ru = r => r._u || r.id || 0;   // «когда обновлено» с откатом на id (id = Date.now())
function mergeById(a = [], b = [], del = {}) {
  const map = new Map();
  const put = r => {
    if (!r || r.id == null) return;
    const ex = map.get(r.id);
    if (!ex || _ru(r) >= _ru(ex)) map.set(r.id, r);
  };
  a.forEach(put); b.forEach(put);
  for (const [id, dt] of Object.entries(del)) {
    const key = map.has(+id) ? +id : id;
    const r = map.get(key);
    if (r && dt >= _ru(r)) map.delete(key);
  }
  return [...map.values()];
}
function mergeDB(local, remote) {
  // объединяем надгробия (максимальная метка), чистим старше 120 дней
  const del = {}, cutoff = Date.now() - 120*864e5;
  for (const src of [remote._del, local._del])
    for (const k in (src || {})) del[k] = Math.max(del[k] || 0, src[k]);
  for (const k in del) if (del[k] < cutoff) delete del[k];
  const out = { ...DEFAULT_DB, ...local, _del: del };
  IDCOLS.forEach(c => { out[c] = mergeById(local[c] || [], remote[c] || [], del); });
  // скалярные поля (состояние/главы/вопросы) — берём из более свежего документа
  const scal = (remote.__ts || 0) > (local.__ts || 0) ? remote : local;
  ['vit','chapters','oq','env'].forEach(k => { if (scal[k] !== undefined) out[k] = scal[k]; });
  out.__ts = Math.max(local.__ts || 0, remote.__ts || 0);
  return out;
}

// ─── УПАКОВКА / РАСПАКОВКА (с учётом шифрования) ─────────────────
async function packPayload() {
  const bundle = { db: DB, cfg: CFG };
  const pass = getPass();
  if (pass) {
    const blob = await encryptPayload(bundle, pass, getRecoveryKey() || undefined);
    return { db: blob, cfg: { _enc: 'v2' } };
  }
  return { db: DB, cfg: CFG };
}
async function unpackServer(server) {
  const sdb = server.db || {}, scfg = server.cfg || {};
  if (sdb._enc || scfg._enc) {
    const pass = getPass();
    if (!pass) { const e = new Error('Нужна парольная фраза для расшифровки'); e.needPass = true; throw e; }
    let bundle;
    try { bundle = await decryptPayload(sdb, pass, 'pass'); }
    catch (err) { if (err.needPass) throw err; const e = new Error('Неверная парольная фраза'); e.needPass = true; throw e; }
    return { db: bundle.db || {}, cfg: bundle.cfg || {} };
  }
  return { db: sdb, cfg: scfg };
}
// Восстановление на устройстве без фразы: развернуть серверный блок ключом
// восстановления, применить локально, затем попросить задать новую фразу.
async function recoverFromKey() {
  const k = ($('cfg-rec-in') && $('cfg-rec-in').value || '').trim();
  if (!k) { toast('Введи ключ восстановления', 'warn'); return; }
  if (!apiBase() || !CFG.spaceKey) { toast('Сначала укажи URL backend и ключ пространства', 'warn'); openOv('ov-cfg'); return; }
  try {
    const server = await api('/api/space/' + CFG.spaceKey);
    const bundle = await decryptPayload(server.db, k, 'recovery');
    DB = mergeDB(DB, { ...(bundle.db || {}), __ts: Date.parse(server.updated_at) || 0 });
    setRecoveryKey(k); persistLocal(); renderAfterSync();
    hptMed(); toast('Восстановлено! Задай новую парольную фразу и применишь шифрование', 'ok');
    const pi = $('cfg-pass'); if (pi) pi.focus();
  } catch (e) {
    toast(e.needPass ? 'Для этих данных нет ключа восстановления' : 'Неверный ключ восстановления', 'warn');
  }
}
// Создать ключ восстановления (только когда фраза уже задана).
function generateRecoveryKey() {
  if (!getPass()) { toast('Сначала задай парольную фразу', 'warn'); return; }
  const k = genRecoveryKey();
  setRecoveryKey(k);
  const el = $('cfg-rec-out');
  if (el) el.innerHTML = `<div class="card" style="padding:1rem;margin-top:.5rem">
    <div class="si-text" style="font-weight:600">Твой ключ восстановления</div>
    <div class="si-text" style="font-family:monospace;font-size:1.05em;margin:.4rem 0;user-select:all;word-break:break-all">${esc(k)}</div>
    <div class="si-text" style="color:var(--t3)">Сохрани его в надёжном месте (менеджер паролей или бумага). Это единственный способ войти, если забудешь фразу — восстановить его мы не можем.</div></div>`;
  updateEncStatus(); scheduleSync(300);
  hptMed(); toast('Ключ восстановления создан — сохрани его', 'ok');
}
// Применить серверный снимок к локальному состоянию (со слиянием).
async function applyServer(server, { merge = true } = {}) {
  const { db: rdb, cfg: rcfg } = await unpackServer(server);
  const remoteTs = Date.parse(server.updated_at) || 0;
  const keepApi = CFG.apiUrl, keepKey = CFG.spaceKey;
  if (merge) {
    DB = mergeDB(DB, { ...rdb, __ts: remoteTs });
    if (remoteTs > (CFG._ts || 0))
      CFG = { ...DEFAULT_CFG, ...rcfg, axes: { ...DEFAULT_CFG.axes, ...(rcfg.axes || {}) } };
  } else {
    DB  = { ...DEFAULT_DB, ...rdb };
    CFG = { ...DEFAULT_CFG, ...rcfg, axes: { ...DEFAULT_CFG.axes, ...(rcfg.axes || {}) } };
  }
  CFG.apiUrl = keepApi; CFG.spaceKey = keepKey; CFG.lastSync = server.updated_at;
  persistLocal();
}

// ─── ДВИЖОК АВТО-СИНКА (offline-first) ───────────────────────────
let _syncTimer = null, _syncing = false, _dirty = false;
function scheduleSync(delay = 2500) {
  if (!apiBase()) return;            // backend не настроен — авто-синк не нужен
  _dirty = true;
  if (CFG.spaceKey) setSyncBadge('pending');
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => runSync().catch(() => {}), delay);
}
async function runSync({ manual = false } = {}) {
  if (!apiBase()) { if (manual) { toast('Укажи URL backend в Конфигурации', 'warn'); openOv('ov-cfg'); } return; }
  if (_syncing) { _dirty = true; return; }
  if (!navigator.onLine) { setSyncBadge('offline'); log('warn', 'offline — синк отложен'); return; }
  // Защита от даунгрейда: после восстановления по ключу (recovery есть,
  // фразы ещё нет) НЕ пушим открытым текстом поверх шифрованного блока.
  if (getRecoveryKey() && !getPass()) { setSyncBadge('needpass'); if (manual) { toast('Задай новую парольную фразу после восстановления', 'warn'); openOv('ov-cfg'); } return; }
  // Privacy-гейт: без парольной фразы данные ушли бы на сервер ОТКРЫТЫМ текстом.
  // Не делаем этого молча: нужен либо E2EE (фраза), либо явное согласие один раз.
  if (!ensureSyncPrivacy(manual)) return;
  _syncing = true; _dirty = false; setSyncBadge('syncing');
  try {
    if (!CFG.spaceKey) {
      const payload = await packPayload();
      const cd = await api('/api/space', { method:'POST', body:{ name: CFG.userName || 'Архитектор', ...payload } });
      CFG.spaceKey = cd.key; CFG.lastSync = cd.updated_at; persistLocal();
      setSyncBadge('ok'); hptMed(); toast('Пространство создано — данные на сервере', 'ok');
      rCfgForm();
    } else {
      // pull → merge → push : устройства сходятся без потерь
      const server = await api('/api/space/' + CFG.spaceKey);
      await applyServer(server, { merge:true });
      const payload = await packPayload();
      const d = await api('/api/space/' + CFG.spaceKey, { method:'PUT', body:{ name: CFG.userName || 'Архитектор', ...payload } });
      CFG.lastSync = d.updated_at; persistLocal();
      renderAfterSync();
      setSyncBadge('ok');
      if (manual) { hptMed(); toast('Синхронизировано', 'ok'); }
    }
    log('info', 'sync ok');
  } catch (e) {
    if (e.status === 404) { CFG.spaceKey = ''; persistLocal(); _syncing = false; return runSync({ manual }); }
    setSyncBadge(e.needPass ? 'needpass' : 'error');
    log('error', 'sync fail', e.message);
    if (manual || e.needPass) toast(e.message, 'warn');
    if (e.needPass) openOv('ov-cfg');
  } finally {
    _syncing = false;
    if (_dirty) scheduleSync(1500);
  }
}
function renderAfterSync() {
  // тихо перерисовываем экраны после втягивания серверных изменений
  updateDomainLabel(); rHome(); rCompass(); rAxCells(); rKPIs(); rIns();
  rBook(); rBots(); rPats(); rDrms(); rSpi(); rEvoList($('evo-sh')); rDig();
  icons();
  gcMedia();   // подчистить осиротевшие фото (после удалений/черновиков)
}
function setSyncBadge(state) {
  const el = $('sync-lbl'); if (!el) return;
  const map = {
    idle:     ['Нажми — всё автоматически', ''],
    pending:  ['Ожидает синхронизации…', 'var(--orange)'],
    syncing:  ['Синхронизирую…', 'var(--blue-t)'],
    ok:       ['Сохранено ✓ ' + new Date().toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit'}), 'var(--green)'],
    offline:  ['Оффлайн — сохранится при сети', 'var(--orange)'],
    error:    ['Ошибка синхронизации', 'var(--red)'],
    needpass: ['Нужна парольная фраза', 'var(--red)'],
  };
  const [txt, col] = map[state] || map.idle;
  el.textContent = txt;
  el.style.color = col;
}

// Ручной запуск (кнопка «Синхронизировать»).
// Явное согласие на нешифрованный синк (один раз, хранится в CFG). Возвращает
// true = можно продолжать (E2EE включён или согласие есть/только что дано).
function ensureSyncPrivacy(manual) {
  if (getPass() || CFG.plainSyncConsent) return true;
  if (manual && confirm('Парольная фраза не задана — данные уйдут на сервер БЕЗ шифрования.\n\nРекомендуется: Отмена → задать фразу в Конфигурации (end-to-end шифрование).\n\nСинхронизировать без шифрования?')) {
    CFG.plainSyncConsent = true; persistLocal();
    return true;
  }
  setSyncBadge('needpass');
  if (manual) { toast('Задай парольную фразу — тогда сервер видит только шифроблок', 'warn'); openOv('ov-cfg'); }
  return false;
}
function doSync() { runSync({ manual: true }); }

// Ручная загрузка с сервера (принудительная сверка со слиянием).
async function pullData() {
  if (!apiBase())    { toast('Укажи URL backend', 'warn'); return; }
  if (!CFG.spaceKey) { toast('Нет ключа пространства', 'warn'); return; }
  try {
    const server = await api('/api/space/' + CFG.spaceKey);
    await applyServer(server, { merge:true });
    closeOv('ov-cfg'); renderAfterSync();
    hptMed(); toast('Данные слиты с сервером', 'ok');
    scheduleSync(500);   // дольём локальные правки обратно
  } catch (e) {
    if (e.status === 404) { toast('Пространство не найдено', 'warn'); return; }
    setSyncBadge(e.needPass ? 'needpass' : 'error');
    toast(e.message, 'warn');
  }
}

// Скопировать ключ пространства (для переноса на другое устройство).
function copySpaceKey() {
  if (!CFG.spaceKey) { toast('Сначала синхронизируй — ключ появится', 'warn'); return; }
  navigator.clipboard?.writeText(CFG.spaceKey).then(
    () => toast('Ключ скопирован', 'ok'),
    () => toast(CFG.spaceKey)
  );
}

// Первичная сверка при запуске + реакция на возврат сети.
function initSync() {
  if (!apiBase() || !CFG.spaceKey) { setSyncBadge('idle'); return; }
  const localTs = DB.__ts || 0, syncedTs = Date.parse(CFG.lastSync) || 0;
  setSyncBadge(localTs > syncedTs ? 'pending' : 'idle');
  runSync().catch(() => {});
}
window.addEventListener('online',  () => { log('info', 'сеть вернулась'); runSync().catch(() => {}); });
window.addEventListener('offline', () => { setSyncBadge('offline'); log('warn', 'сеть пропала'); });

// ─── ЛОГ: ПРОСМОТР ───────────────────────────────────────────────
function rLog() {
  const el = $('log-list'); if (!el) return;
  if (!LOG.length) { el.innerHTML = '<div class="search-empty">Событий пока нет</div>'; return; }
  const cmap = { error:'var(--red)', warn:'var(--orange)', info:'var(--green)' };
  el.innerHTML = [...LOG].reverse().map(e =>
    `<div class="log-row">
      <span class="log-dot" style="background:${cmap[e.level]||'var(--t3)'}"></span>
      <span class="log-time">${new Date(e.t).toLocaleTimeString('ru')}</span>
      <span class="log-msg">${esc(e.msg)}${e.extra ? ' — '+esc(e.extra) : ''}</span>
    </div>`
  ).join('');
}
function openLog() { openOv('ov-log'); rLog(); }

// ─── ПАРОЛЬНАЯ ФРАЗА (шифрование) ────────────────────────────────
function saveEncPass() {
  const p = $('cfg-pass')?.value || '';
  setPass(p.trim());
  updateEncStatus();
  toast(p.trim() ? 'Шифрование включено' : 'Шифрование выключено', 'ok');
  scheduleSync(300);
}
function updateEncStatus() {
  const el = $('cfg-enc-status'); if (!el) return;
  const on = !!getPass(), rec = !!getRecoveryKey();
  el.textContent = on
    ? `🔒 End-to-end: на сервер уходят только шифроблоки${rec ? ' · ключ восстановления создан' : ''}`
    : '⚠️ Без фразы синк уходит в открытом виде — задай фразу для end-to-end шифрования';
  el.style.color = on ? 'var(--green)' : 'var(--orange)';
}

// ═════════════════════════════════════════════════════════════════
//  AI (Claude API напрямую с клиента — плейнтекст не идёт через наш
//  сервер; ключ хранится локально в профиле, opt-in).
// ═════════════════════════════════════════════════════════════════
const AI_MODEL_DEFAULT = 'claude-opus-4-8';
const AI_MODEL_LIGHT_DEFAULT = 'claude-haiku-4-5';
// Ключ хранится per-провайдер (Anthropic — в прежнем слоте, совместимо).
const aiKeySlot = p => 'arch5_aikey_' + ((p && p !== 'anthropic') ? p + '_' : '') + activeId();
function getAiKeyFor(p) { try { return localStorage.getItem(aiKeySlot(p)) || ''; } catch (e) { return ''; } }
function getAiKey() { return getAiKeyFor(CFG.aiProvider || 'anthropic'); }
function setAiKey(k) { try { const s = aiKeySlot(CFG.aiProvider || 'anthropic'); k ? localStorage.setItem(s, k) : localStorage.removeItem(s); } catch(e) {} }
function setAiKeyFor(p, k) { try { const s = aiKeySlot(p); k ? localStorage.setItem(s, k) : localStorage.removeItem(s); } catch(e) {} }

// ─── КЛЮЧИ СЕРВИСОВ: одно меню на все внешние сервисы ────────────
// Полный перечень того, что подключается к приложению, — в одном месте:
// какие ключи есть, что каждый даёт, где взять, статус. Не надо ходить
// по разным меню.
const KEY_SERVICES = [
  { p: 'anthropic', name: 'Anthropic · Claude', ic: '✳', ph: 'sk-ant-…', url: 'console.anthropic.com → API Keys',
    gives: 'Основной ИИ: живые отклики, диалог вглубь, психоконтур «Зачем?», смысловая карта, обзор недели. Рекомендуем.' },
  { p: 'openai', name: 'OpenAI · GPT', ic: '❋', ph: 'sk-…', url: 'platform.openai.com/api-keys',
    gives: 'Модели GPT-4o в диалоге вглубь и как основной провайдер (Настройки → Конфигурация).' },
  { p: 'gemini', name: 'Google · Gemini', ic: '✦', ph: 'AIza…', url: 'aistudio.google.com/apikey',
    gives: 'Модели Gemini в диалоге вглубь и как основной провайдер.' },
];
function openKeys() { rKeys(); openOv('ov-keys'); }
function keysSetInput(p, el) {
  const v = (el.value || '').trim();
  if (!v) return;
  setAiKeyFor(p, v); el.value = '';
  toast('Ключ сохранён — сервис активен', 'ok'); rKeys();
}
function keysDrop(p) { setAiKeyFor(p, ''); toast('Ключ удалён'); rKeys(); }
function rKeys() {
  const el = $('keys-list'); if (!el) return;
  const ai = KEY_SERVICES.map(s => {
    const has = !!getAiKeyFor(s.p);
    return `<div class="key-card">
      <div class="key-h"><span class="mdl-ic p-${s.p}">${s.ic}</span><b>${s.name}</b><span class="key-st${has ? ' on' : ''}">${has ? 'активен' : 'нет ключа'}</span></div>
      <div class="key-d">${s.gives}</div>
      <input class="field" type="password" placeholder="${has ? 'ключ сохранён — вставь новый, чтобы заменить' : s.ph}"
        autocapitalize="off" autocorrect="off" spellcheck="false" onchange="keysSetInput('${s.p}', this)">
      <div class="key-foot"><span>Где взять: ${s.url}</span>${has ? `<span class="key-del" onclick="keysDrop('${s.p}')">убрать ключ</span>` : ''}</div>
    </div>`;
  }).join('');
  const srv = `<div class="sec-lbl" style="padding:var(--s3) 0 var(--s2)">Сервисы без ключа</div>
    <div class="key-card">
      <div class="key-h"><b>Синк-сервер (Railway)</b><span class="key-st${apiBase() ? ' on' : ''}">${apiBase() ? 'подключён' : 'не подключён'}</span></div>
      <div class="key-d">Синхронизация между устройствами: URL сервера, ключ пространства и парольная фраза шифрования — в Конфигурации.</div>
      <div class="key-foot"><span class="key-del" onclick="closeOv('ov-keys');openOv('ov-cfg')">открыть Конфигурацию →</span></div>
    </div>
    <div class="key-card">
      <div class="key-h"><b>Обратная связь</b><span class="key-st on">работает</span></div>
      <div class="key-d">Форма «Обратная связь» в меню — ключ не нужен, на сервер уходит только текст формы.</div>
    </div>
    <div style="font-size:var(--tx2);color:var(--t3);line-height:1.5;background:var(--bg2);border-radius:var(--r8);padding:var(--s3)">
      Все ключи хранятся <strong style="color:var(--t2)">только на этом устройстве</strong> (per-профиль) и никогда не проходят через наш сервер: запросы идут из браузера напрямую в выбранный сервис.
    </div>`;
  el.innerHTML = ai + srv;
  const kc = $('keys-cnt');
  if (kc) kc.textContent = KEY_SERVICES.filter(s => getAiKeyFor(s.p)).length + ' из ' + KEY_SERVICES.length;
}

// ─── МАРШРУТИЗАЦИЯ МОДЕЛЕЙ + УЧЁТ РАСХОДОВ (AI_ROUTING_BRIEF) ────
// Лёгкие частые задачи ходят на дешёвую модель, глубокий анализ — на
// сильную. Каждый вызов записывается в леджер: задача, модель, токены,
// стоимость — «за что сколько снято». Цены: USD за 1M токенов (вх/вых).
const AI_PRICES = {
  'claude-haiku-4-5': { i: 1,  o: 5  },
  'claude-sonnet-5':  { i: 3,  o: 15 },
  'claude-opus-4-8':  { i: 5,  o: 25 },
  'claude-fable-5':   { i: 10, o: 50 },
  // ориентировочные цены других провайдеров (правятся здесь при изменении)
  'gpt-4o-mini':      { i: 0.15, o: 0.6 },
  'gpt-4o':           { i: 2.5,  o: 10 },
  'gemini-2.0-flash': { i: 0.1,  o: 0.4 },
  'gemini-2.5-pro':   { i: 1.25, o: 10 },
};
// Модели по классам для не-Anthropic провайдеров (мини — быстрые задачи,
// про — глубокий анализ). Выбор провайдера — CFG.aiProvider.
const AI_PROVIDER_MODELS = {
  openai: { light: 'gpt-4o-mini', deep: 'gpt-4o' },
  gemini: { light: 'gemini-2.0-flash', deep: 'gemini-2.5-pro' },
};
const AI_TASKS = { react: 'Отклик наставника', deeper: 'Вопрос вглубь', prompts: 'Вопросы рефлексии', digest: 'Обзор недели', map: 'Живая карта', analysis: 'Разбор записи', chat: 'Диалог вглубь', psy: 'Психоконтур («Зачем?»)', other: 'Прочее' };
const AI_TASK_CLASS = { react: 'light', deeper: 'light', prompts: 'light', psy: 'light' };   // остальные — deep
function aiModelFor(task) {
  const cls = AI_TASK_CLASS[task] || 'deep';
  const prov = CFG.aiProvider || 'anthropic';
  if (prov !== 'anthropic') {
    const m = AI_PROVIDER_MODELS[prov] || {};
    return m[cls] || m.deep || AI_MODEL_DEFAULT;
  }
  const r = CFG.aiRoutes || {};
  if (cls === 'light') return r.light || AI_MODEL_LIGHT_DEFAULT;
  return r.deep || CFG.aiModel || AI_MODEL_DEFAULT;
}
function aiPriceOf(model) {
  const k = Object.keys(AI_PRICES).find(p => String(model).startsWith(p));
  return k ? AI_PRICES[k] : null;
}
const AI_LEDGER_KEY = 'arch5_ai_ledger';
function aiLedger() { try { return JSON.parse(localStorage.getItem(AI_LEDGER_KEY) || '[]'); } catch (e) { return []; } }
function aiLedgerAdd(rec) {
  try {
    const l = aiLedger(); l.push(rec);
    while (l.length > 500) l.shift();
    localStorage.setItem(AI_LEDGER_KEY, JSON.stringify(l));
  } catch (e) {}
}
function aiCostUSD(rec) {
  const p = aiPriceOf(rec.model); if (!p) return 0;
  return ((rec.ti || 0) * p.i + (rec.to || 0) * p.o) / 1e6;
}
function aiSpend(sinceMs) {
  let cost = 0, n = 0; const byTask = {}, byModel = {};
  aiLedger().forEach(r => {
    if (r.ts < sinceMs) return;
    const c = aiCostUSD(r); cost += c; n++;
    const t = byTask[r.task] || (byTask[r.task] = { n: 0, cost: 0, tok: 0 });
    t.n++; t.cost += c; t.tok += (r.ti || 0) + (r.to || 0);
    const m = byModel[r.model] || (byModel[r.model] = { n: 0, cost: 0 });
    m.n++; m.cost += c;
  });
  return { cost, n, byTask, byModel };
}
function aiMonthSpend() { const d = new Date(); return aiSpend(new Date(d.getFullYear(), d.getMonth(), 1).getTime()); }
// Мягкий месячный бюджет: 80% — предупреждение раз в день, 100% — стоп
// AI-слоя (локальные движки продолжают работать).
function aiBudgetState() {
  const b = +CFG.aiBudgetUSD || 0; if (!b) return { ok: true, budget: 0 };
  const s = aiMonthSpend().cost;
  return { ok: s < b, warn: s >= b * 0.8, spent: s, budget: b };
}
// Экран «Расходы AI» в Настройках: сегодня/месяц, по задачам и моделям.
function rAiSpend() {
  const el = $('ai-spend'); if (!el) return;
  const day = aiSpend(Date.now() - 864e5), mon = aiMonthSpend();
  if (!mon.n) { el.innerHTML = '<div class="ai-sp-empty">Расходов пока нет — леджер заполнится с первым AI-вызовом</div>'; return; }
  const fmt = c => c >= 0.01 ? '$' + c.toFixed(2) : '<$0.01';
  const rows = Object.entries(mon.byTask).sort((a, b) => b[1].cost - a[1].cost).map(([t, v]) =>
    `<div class="ai-sp-row"><span>${esc(AI_TASKS[t] || t)}</span><i>${v.n} выз. · ${v.tok >= 1000 ? Math.round(v.tok / 1000) + 'K' : v.tok} ток.</i><b>${fmt(v.cost)}</b></div>`).join('');
  const models = Object.entries(mon.byModel).sort((a, b) => b[1].cost - a[1].cost).map(([m, v]) =>
    `<div class="ai-sp-row"><span>${esc(String(m).replace('claude-', ''))}</span><i>${v.n} выз.</i><b>${fmt(v.cost)}</b></div>`).join('');
  const bs = aiBudgetState();
  el.innerHTML =
    `<div class="ai-sp-hero">Сутки: <b>${fmt(day.cost)}</b> · Месяц: <b>${fmt(mon.cost)}</b>${bs.budget ? ` из $${bs.budget}` : ''}</div>` +
    `<div class="ai-sp-t">По задачам</div>${rows}` +
    `<div class="ai-sp-t">По моделям</div>${models}`;
}

// Один вызов Claude Messages API из браузера.
// ─── AI «КОПНИ ГЛУБЖЕ» (механика Rosebud, №5/AI-диалог) ──────────
// По черновику записи Claude задаёт ОДИН углубляющий вопрос (CBT/ACT),
// который помогает дойти до корня. Opt-in: нужен ключ Anthropic.
async function goDeeper() {
  const ta = $('add-tx'); if (!ta) return;
  const draft = ta.value.trim();
  if (draft.length < 10) { toast('Напиши хотя бы пару фраз — тогда копнём', 'warn'); return; }
  if (!getAiKey()) { toast('Добавь ключ Anthropic в Итоги → Настройки', 'warn'); closeOv('ov-add'); goTo('sys'); return; }
  const btn = $('deeper-btn'), out = $('deeper-out');
  const prev = btn.innerHTML; btn.innerHTML = 'Думаю…'; btn.disabled = true;
  try {
    const q = await callClaude({
      system: 'Ты — вдумчивый дневник-коуч в духе CBT/ACT. По записи пользователя задай ОДИН короткий открытый вопрос (до 15 слов), который помогает копнуть глубже к корню чувства или паттерна. Только вопрос, без преамбулы, по-русски.',
      user: draft, maxTokens: 120, task: 'deeper',
    });
    const clean = String(q).trim().replace(/^["«]|["»]$/g, '');
    out.innerHTML = `<div class="deeper-q" onclick="appendDeeper(decodeURIComponent('${encodeURIComponent(clean)}'))">
      <span>💭 ${esc(clean)}</span><b>ответить →</b></div>`;
  } catch (e) {
    toast(e.noKey ? 'Нужен ключ Anthropic' : ('AI: ' + e.message), 'warn');
  } finally { btn.innerHTML = prev; btn.disabled = false; }
}
function appendDeeper(q) {
  const ta = $('add-tx'); if (!ta) return;
  ta.value = ta.value.replace(/\s+$/, '') + '\n\n' + q + '\n';
  $('deeper-out').innerHTML = '';
  ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch(e){}
}
// Провайдерская абстракция: единый интерфейс call() → {text, ti, to}.
// Первый провайдер — Anthropic; другие ИИ подключаются адаптерами с тем
// же интерфейсом, ключи per-провайдер хранятся локально.
const AI_PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    async call({ key, model, system, user, messages, maxTokens, schema, reasoning }) {
      const body = { model, max_tokens: maxTokens, messages: messages || [{ role: 'user', content: user }] };
      if (system) body.system = system;
      if (schema) body.output_config = { format: { type: 'json_schema', schema } };
      // «С рассуждением»: adaptive thinking на моделях 4.6+ (haiku — без параметра)
      if (reasoning != null && /claude-(sonnet-5|opus-4-[6-8]|fable)/.test(model))
        body.thinking = { type: reasoning ? 'adaptive' : 'disabled' };
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 60000);
      let r;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(to);
        throw new Error(e.name === 'AbortError' ? 'Таймаут запроса к Claude' : 'Нет соединения с Claude');
      }
      clearTimeout(to);
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = (data && data.error && data.error.message) || _httpMsg(r.status);
        log('error', 'Claude ' + r.status, msg);
        const e = new Error(msg); e.status = r.status; throw e;
      }
      if (data.stop_reason === 'refusal') throw new Error('Модель отклонила запрос');
      const u = data.usage || {};
      return {
        text: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(''),
        ti: +u.input_tokens || 0, to: +u.output_tokens || 0,
      };
    },
  },
  openai: {
    name: 'OpenAI (GPT)',
    async call({ key, model, system, user, messages, maxTokens, schema }) {
      const msgs = [];
      if (system) msgs.push({ role: 'system', content: system });
      (messages || [{ role: 'user', content: user }]).forEach(m => msgs.push({ role: m.role, content: m.content }));
      const body = { model, max_completion_tokens: maxTokens, messages: msgs };
      if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'out', schema, strict: true } };
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify(body),
      }).catch(() => { throw new Error('Нет соединения с OpenAI'); });
      const data = await r.json().catch(() => null);
      if (!r.ok) { const e = new Error((data && data.error && data.error.message) || _httpMsg(r.status)); e.status = r.status; throw e; }
      const u = data.usage || {};
      return {
        text: ((data.choices || [])[0] || {}).message?.content || '',
        ti: +u.prompt_tokens || 0, to: +u.completion_tokens || 0,
      };
    },
  },
  gemini: {
    name: 'Google (Gemini)',
    async call({ key, model, system, user, messages, maxTokens }) {
      const contents = (messages || [{ role: 'user', content: user }])
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => { throw new Error('Нет соединения с Gemini'); });
      const data = await r.json().catch(() => null);
      if (!r.ok) { const e = new Error((data && data.error && data.error.message) || _httpMsg(r.status)); e.status = r.status; throw e; }
      const u = data.usageMetadata || {};
      return {
        text: (((data.candidates || [])[0] || {}).content?.parts || []).map(p => p.text || '').join(''),
        ti: +u.promptTokenCount || 0, to: +u.candidatesTokenCount || 0,
      };
    },
  },
};
async function callClaude({ system, user, messages = null, maxTokens = 1024, schema = null, task = 'other', provider = null, model = null, reasoning = null }) {
  const provName = provider || CFG.aiProvider || 'anthropic';
  const key = getAiKeyFor(provName);
  if (!key) { const e = new Error('Не задан API-ключ ' + ((AI_PROVIDERS[provName] || {}).name || provName)); e.noKey = true; throw e; }
  const bs = aiBudgetState();
  if (!bs.ok) {
    const e = new Error(`Бюджет AI на месяц исчерпан ($${bs.spent.toFixed(2)} из $${bs.budget}) — увеличь в Настройках`);
    e.budget = true; throw e;
  }
  if (bs.warn && localStorage.getItem('arch5_ai_budget_warned') !== todayKey()) {
    try { localStorage.setItem('arch5_ai_budget_warned', todayKey()); } catch (e) {}
    setTimeout(() => toast(`AI: потрачено ${Math.round(bs.spent / bs.budget * 100)}% месячного бюджета`, 'warn'), 400);
  }
  const mdl = model || aiModelFor(task);
  const prov = AI_PROVIDERS[provName] || AI_PROVIDERS.anthropic;
  const res = await prov.call({ key, model: mdl, system, user, messages, maxTokens, schema, reasoning });
  aiLedgerAdd({ ts: Date.now(), task, model: mdl, ti: res.ti, to: res.to });
  log('info', `AI ✓ ${AI_TASKS[task] || task} · ${String(mdl).replace('claude-', '')} · ${res.to} ток.`);
  return res.text;
}

// Контекст недели для AI (агрегаты + тексты за 7 дней).
function weekContextForAI() {
  const now = Date.now();
  const wk = iso => iso && Date.parse(iso) >= now - 7*864e5;
  const ins = DB.insights.filter(i => wk(i.createdAt)).slice(0, 12)
    .map(i => `— [${TL[i.tag]||i.tag}] ${i.title}${i.body && i.body !== i.title ? ': ' + i.body.slice(0,160) : ''}`);
  const ciW = DB.checkins.filter(c => c.date > dayAgo(7));
  const ciP = DB.checkins.filter(c => c.date <= dayAgo(7) && c.date > dayAgo(14));
  const aW = checkinAvg(ciW), aP = checkinAvg(ciP);
  const delta = (aW && aP) ? +(aW.comp - aP.comp).toFixed(1) : null;
  const pats = DB.patterns.slice(0, 6).map(p => '— ' + p.text);
  let s = '';
  s += 'Инсайты недели:\n' + (ins.length ? ins.join('\n') : '— нет') + '\n\n';
  if (aW) s += `Состояние (ср. за ${aW.n} дн.): ясность ${aW.cl.toFixed(1)}/10, стресс ${aW.st.toFixed(1)}/10, мотивация ${aW.mv.toFixed(1)}/10, сон ${aW.sl.toFixed(1)}ч` + (delta!=null?`; динамика к прошлой неделе ${delta>0?'+':''}${delta}`:'') + '\n\n';
  s += 'Замеченные паттерны:\n' + (pats.length ? pats.join('\n') : '— нет');
  return s;
}

const AI_SYSTEM = 'Ты — вдумчивый спутник для саморефлексии. Пиши по-русски: тепло, конкретно, без осуждения, без клише и общих фраз. Опирайся строго на данные пользователя.';

// AI-обзор недели → добавляется в дайджест.
async function aiDigest() {
  if (!getAiKey()) { toast('Добавь API-ключ Anthropic в Конфигурации', 'warn'); openOv('ov-cfg'); return; }
  toast('Claude обдумывает неделю…');
  try {
    const user = weekContextForAI() +
      '\n\nНапиши тёплый живой обзор недели (4–6 предложений): что заметно в инсайтах и состоянии, какая динамика, на что стоит обратить внимание. Заверши одним мягким вопросом для размышления. Без клише и морализаторства.';
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 700, task: 'digest' });
    await mkDig();
    if (DB.digests[0]) { DB.digests[0].ai = text.trim(); persist(); rDig(); }
    hptMed(); toast('AI-обзор готов', 'ok');
  } catch (e) {
    if (e.noKey) openOv('ov-cfg');
    toast('AI: ' + e.message, 'warn');
  }
}

// AI-вопросы для рефлексии → обновляют «открытые вопросы».
async function aiQuestions() {
  if (!getAiKey()) { toast('Добавь API-ключ Anthropic в Конфигурации', 'warn'); openOv('ov-cfg'); return; }
  toast('Claude придумывает вопросы…');
  try {
    const user = weekContextForAI() +
      '\n\nСформулируй 3 коротких, личных и небанальных вопроса для саморефлексии, опираясь на эти данные. Каждый — одно предложение.';
    const schema = { type:'object', additionalProperties:false, required:['questions'],
      properties:{ questions:{ type:'array', items:{ type:'string' } } } };
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 400, schema, task: 'prompts' });
    let qs = [];
    try { qs = (JSON.parse(text).questions || []).filter(Boolean).slice(0, 3); } catch(e) {}
    if (!qs.length) throw new Error('пустой ответ');
    DB.oq = qs;
    persist(); rHome();
    hptMed(); toast('Новые вопросы готовы', 'ok');
  } catch (e) {
    if (e.noKey) openOv('ov-cfg');
    toast('AI: ' + e.message, 'warn');
  }
}

// AI-настройки в форме конфигурации.
// Смена провайдера в селекте: подставляем его ключ и подпись поля.
function aiProviderChanged() {
  CFG.aiProvider = $('cfg-ai-provider')?.value || 'anthropic';
  const lbl = $('cfg-aikey-lbl');
  const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google AI' };
  if (lbl) lbl.textContent = 'API-ключ ' + (names[CFG.aiProvider] || '');
  const ak = $('cfg-aikey'); if (ak) ak.value = getAiKey();
  updateAiStatus();
}
function saveAiCfg() {
  CFG.aiProvider = $('cfg-ai-provider')?.value || 'anthropic';
  const k = $('cfg-aikey')?.value.trim() || '';
  setAiKey(k);
  CFG.aiModel = $('cfg-aimodel')?.value.trim() || AI_MODEL_DEFAULT;
  CFG.aiRoutes = {
    light: $('cfg-ai-light')?.value || AI_MODEL_LIGHT_DEFAULT,
    deep:  $('cfg-ai-deep')?.value  || (CFG.aiModel || AI_MODEL_DEFAULT),
  };
  CFG.aiBudgetUSD = Math.max(0, +($('cfg-ai-budget')?.value || 0)) || 0;
  persist();
  updateAiStatus(); rAiSpend();
  toast(k ? 'AI подключён' : 'AI-ключ убран', 'ok');
}
function updateAiStatus() {
  const el = $('cfg-ai-status'); if (!el) return;
  const on = !!getAiKey();
  const pname = (AI_PROVIDERS[CFG.aiProvider || 'anthropic'] || AI_PROVIDERS.anthropic).name;
  el.textContent = on ? `✨ AI подключён · ${pname} · ${aiModelFor('react')} / ${aiModelFor('digest')}` : `AI выключен — вставь ключ (${pname})`;
  el.style.color = on ? 'var(--green)' : 'var(--t3)';
}

// ─── КОМАНДЫ ────────────────────────────────────────────────────
const CMDS = {
  '/актуально': () => {
    const prio = DB.chapters.filter(c=>c.st==='priority').map(c=>`<div style="font-size:var(--tx3);color:var(--t2);padding:4px 0;border-bottom:1px solid var(--bd)">— Гл.${c.n}: ${c.title}</div>`).join('');
    const bots = DB.bots.filter(b=>!b.done&&b.prio==='high').map(b=>`<div style="font-size:var(--tx3);color:var(--t2);padding:4px 0;border-bottom:1px solid var(--bd)">— ${b.title}</div>`).join('');
    return `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ ЧТО СЕЙЧАС ━━</div>
      <div style="font-size:var(--tx2);font-weight:700;color:var(--orange);letter-spacing:.07em;text-transform:uppercase;margin-bottom:.375rem">${CFG.domainLabel}</div>
      ${prio||'<div style="font-size:var(--tx3);color:var(--t3)">Нет приоритетов</div>'}
      <div style="font-size:var(--tx2);font-weight:700;color:var(--blue-t);letter-spacing:.07em;text-transform:uppercase;margin:.875rem 0 .375rem">Бот</div>
      ${bots||'<div style="font-size:var(--tx3);color:var(--t3)">Нет срочных задач</div>'}
      <div style="margin-top:.875rem;padding:.625rem .875rem;background:var(--orange-l);border-left:3px solid var(--orange);border-radius:0 var(--r8) var(--r8) 0;font-size:var(--tx3);font-weight:600;color:var(--orange)">${DB.oq[0]||'Открытых вопросов нет'}</div>`;
  },
  '/книга': () => {
    const done = DB.chapters.filter(c=>c.st==='done').length;
    const pct  = Math.round(done/DB.chapters.length*100);
    return `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ ${CFG.domainLabel.toUpperCase()} ━━</div>
      <div style="padding:.625rem .875rem;background:var(--blue-l);border-left:3px solid var(--blue-btn);border-radius:0 var(--r8) var(--r8) 0;margin-bottom:.875rem;font-size:var(--tx4);font-weight:700;color:var(--blue-t)">${done} из ${DB.chapters.length} глав готово · ${pct}%</div>
      ${DB.chapters.filter(c=>c.st==='priority').map(c=>`<div style="font-size:var(--tx3);padding:5px 0;border-bottom:1px solid var(--bd)"><strong style="color:var(--t1)">Глава ${c.n}</strong> <span style="color:var(--orange)">— ${c.flags.join(', ')||'приоритет'}</span></div>`).join('')}`;
  },
  '/паттерны': () =>
    `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ ПАТТЕРНЫ ━━</div>
    ${DB.patterns.map(p=>`<div style="padding:.5rem 0;border-bottom:1px solid var(--bd)"><div style="font-size:10px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${p.type}</div><div style="font-size:var(--tx3);color:var(--t2);line-height:1.5">${esc(p.text)}</div><div style="font-size:10px;font-weight:600;color:var(--t3);margin-top:3px">× ${p.cnt}</div></div>`).join('')}`,
  '/карта': () =>
    `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ КАРТА СВЯЗЕЙ ━━</div>
    ${DB.insights.slice(0,5).map(i=>`<div style="font-size:var(--tx3);padding:5px 0;border-bottom:1px solid var(--bd)"><span class="tag ${TC[i.tag]||'tg-personal'}">${TL[i.tag]||i.tag}</span> <span style="color:var(--t2)">${esc(i.title.slice(0,50))}</span></div>`).join('')}`,
  '/состояние': () => {
    const v = DB.vit;
    const avg = v.ci ? ((v.cl+v.mv+(10-v.st))/3).toFixed(1) : '—';
    const ac = !v.ci?'var(--t3)':parseFloat(avg)>=7?'var(--green)':parseFloat(avg)>=5?'var(--blue-t)':'var(--orange)';
    return `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ СОСТОЯНИЕ ━━</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.875rem">
        ${[['Ясность',v.cl,'var(--blue-t)'],['Стресс',v.st,'var(--orange)'],['Мотивация',v.mv,'var(--green)']].map(([l,val,c])=>
          `<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:var(--r8);padding:.625rem;text-align:center"><div style="font-size:var(--tx6);font-weight:700;color:${c}">${val||'—'}</div><div style="font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.07em;margin-top:2px">${l}</div></div>`
        ).join('')}
      </div>
      <div style="padding:.625rem .875rem;background:var(--bg2);border-left:3px solid ${ac};border-radius:0 var(--r8) var(--r8) 0;font-size:var(--tx3);font-weight:600;color:${ac}">Среднее: <strong>${avg}</strong> · Тон: ${v.tone||'—'} · Стрик: ${calcStreak()} дн.</div>`;
  },
  '/дайджест': () => {
    const top = [...DB.insights].sort((a,b)=>(b.w||1)-(a.w||1)).slice(0,3);
    return `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ ДАЙДЖЕСТ ━━</div>
      <div style="font-size:var(--tx2);font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.375rem">Топ инсайты</div>
      ${top.map(i=>`<div style="font-size:var(--tx3);padding:4px 0;border-bottom:1px solid var(--bd)"><span class="tag ${TC[i.tag]||''}">${TL[i.tag]||i.tag}</span> ${esc(i.title.slice(0,60))}</div>`).join('')}
      <div style="margin-top:.875rem;font-size:var(--tx2);font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.375rem">Паттерн недели</div>
      <div style="font-size:var(--tx3);color:var(--t2)">${DB.patterns[0]?.text.slice(0,100)||'Паттернов нет'}</div>`;
  },
  '/ретро': () =>
    `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ РЕТРО ━━</div>
    ${DB.evolution.slice(0,3).map(e=>{const lv=EVO_LV[Math.min(e.lv,3)];return`<div style="padding:.5rem 0;border-bottom:1px solid var(--bd)"><div class="elv ${lv.c}">${lv.lb}</div><div style="font-size:var(--tx3);color:var(--t2)">${esc(e.text.slice(0,100))}</div><div style="font-size:var(--tx2);color:var(--t3)">${e.dt}</div></div>`;}).join('')}`,
  '/помощь': () =>
    `<div style="font-size:var(--tx2);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:1rem">━━ КОМАНДЫ ━━</div>
    ${['/актуально','/книга','/паттерны','/карта','/состояние','/дайджест','/ретро'].map(k=>
      `<div style="font-size:var(--tx4);font-weight:600;color:var(--blue-t);padding:var(--s2) 0;border-bottom:1px solid var(--bd)">${k}</div>`
    ).join('')}`,
};
const CMD_DESCS = {
  '/актуально':'что сейчас в работе',
  '/книга':'статус книги/домена',
  '/паттерны':'все паттерны',
  '/карта':'карта связей',
  '/состояние':'vitality check',
  '/дайджест':'сводка недели',
  '/ретро':'журнал эволюции',
  '/помощь':'список команд',
};
function runCmd() {
  const raw = $('cmd').value.trim().toLowerCase();
  if (!raw) return;
  $('cmd').value = '';
  $('cmd-ac').classList.remove('on');
  const key = Object.keys(CMDS).find(k => raw===k||raw.startsWith(k+' '));
  const out = key ? CMDS[key]() : `<div style="font-size:var(--tx4);color:var(--t2)">Неизвестная команда. Попробуй <strong style="color:var(--blue-t)">/помощь</strong></div>`;
  $('cmd-res').innerHTML = out;
  $('cmd-out').style.display = 'block';
  icons({nodes:[$('cmd-res')]});
}
$('cmd')?.addEventListener('input', e => {
  const v = e.target.value;
  const ac = $('cmd-ac');
  if (!v.startsWith('/') || v.length < 2) { ac.classList.remove('on'); return; }
  const matches = Object.keys(CMDS).filter(k => k.startsWith(v.toLowerCase()));
  if (!matches.length) { ac.classList.remove('on'); return; }
  ac.innerHTML = matches.map(k =>
    `<div class="cmd-ac-item" onclick="applySuggestion('${k}')">${k}<span class="cmd-ac-desc">${CMD_DESCS[k]||''}</span></div>`
  ).join('');
  ac.classList.add('on');
});
$('cmd')?.addEventListener('keydown', e => {
  if (e.key==='Enter') { e.preventDefault(); runCmd(); }
  if (e.key==='Escape') { $('cmd-ac').classList.remove('on'); }
});
function applySuggestion(cmd) {
  $('cmd').value = cmd;
  $('cmd-ac').classList.remove('on');
  $('cmd').focus();
}

// ─── СИНХРОНИЗАЦИЯ API LABEL ─────────────────────────────────────
function checkApiStatus() {
  const API = apiBase();
  const el = $('api-lbl');
  if (!API) { if(el) el.textContent='Не подключён'; return; }
  if(el) el.textContent='Проверяю…';
  // Ошибка раньше была голым словом «Ошибка» — не видно, какой адрес пробуется
  // (частая причина: свой URL в Настройках перекрывает рабочий по умолчанию).
  // Теперь хост виден прямо в статусе — сразу понятно, что чинить.
  let host = API; try { host = new URL(API).host; } catch (e) {}
  fetch(API+'/health').then(r => {
    if(r.ok) { if(el) el.textContent = CFG.spaceKey ? 'Подключён ✓' : 'Готов — нажми Синк'; }
    else { if(el) el.textContent='Ошибка: '+host; }
  }).catch(() => { if(el) el.textContent='Недоступен: '+host; });
}

// ─── УМНЫЕ ТРИГГЕРЫ ──────────────────────────────────────────────
function smartTriggers() {
  // Напоминание о check-in уже живёт постоянной карточкой в rNudge() на
  // главном экране — отдельный тост здесь только дублировал её и перекрывал
  // шапку (см. PATTERN_LIBRARY.md, П4: результат — карточка, не тост).
  // Молчащие разделы
  const lastDrm = DB.dreams[0];
  if (lastDrm && lastDrm.createdAt) {
    const daysAgo = Math.floor((Date.now() - Date.parse(lastDrm.createdAt)) / 86400000);
    if (daysAgo > 7) setTimeout(() => toast('Снов не было 7+ дней'), 5000);
  }
}

// ─── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────
function initAll() {
  const t = localStorage.getItem('arch_t');
  if (t) {
    document.documentElement.setAttribute('data-theme', t);
    const tv = $('thv'); if(tv) tv.textContent = t==='dark'?'Ночная':'Дневная';
  }
  updateDomainLabel(); rProfileRow();
  rHome(); rCompass(); rAxCells(); rKPIs(); rIns(); rBook();
  rBots(); rPats(); rDrms(); rSpi(); rEvoList($('evo-sh')); rDig();
  icons();
  checkApiStatus();
  initSync();
  smartTriggers();
  snapshotDaily();          // авто-снимок дня (защита данных)
}

document.addEventListener('DOMContentLoaded', () => {
  hydrate();
  checkOnboard();
  initSplash();
  initAll();
});


// ═══ SHELL: drawer-навигация, блок аккаунта, жесты ═══════════════
function openNav()  { rSidebar(); document.body.classList.add('nav-open'); }
function closeNav() { document.body.classList.remove('nav-open'); }
function toggleNav(){ document.body.classList.toggle('nav-open'); hpt(); }
// Блок аккаунта в сайдбаре: имя профиля, инициал, статус-точка синка
function rSidebar() {
  try {
    const p = (typeof activeProfile === 'function' && activeProfile()) || null;
    const n = (CFG.userName || (p && p.name) || 'Профиль');
    const ava = $('acct-ava'); if (ava && ava.firstChild) ava.firstChild.nodeValue = (n[0] || 'А').toUpperCase();
    const nm = $('acct-name'); if (nm) nm.textContent = n;
    const sub = $('acct-sub'); if (sub) sub.textContent = CFG.spaceKey ? 'синхронизация включена' : 'данные на устройстве';
    const dot = $('acct-dot'); if (dot) dot.className = 'acct-dot ' + (!navigator.onLine ? 'off' : (CFG.spaceKey ? 'ok' : 'idle'));
  } catch (e) {}
}
// Жесты: край→drawer, свайп-влево по строке→удаление, шторка-вниз→закрыть.
// Вертикаль отменяет; input/textarea/canvas игнорируются.
(function initGestures() {
  let sx = 0, sy = 0, mode = null, sheet = null, ovId = null, row = null;
  const mobile = () => window.innerWidth <= 900;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    mode = null; sheet = null; ovId = null; row = null;
    const el = e.target;
    if (el.closest && el.closest('input,textarea,canvas,select')) return;
    const grip = el.closest && el.closest('.sh-pull');
    if (grip) { mode = 'sheet'; sheet = grip.closest('.sheet'); const ov = grip.closest('.ov'); ovId = ov && ov.id; return; }
    const r = el.closest && el.closest('.ins-row');
    if (r) { mode = 'row'; row = r; return; }
    if (mobile() && !document.body.classList.contains('nav-open') && sx < 36) { mode = 'edge'; return; }
    if (mobile() && document.body.classList.contains('nav-open')) { mode = 'closer'; }
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!mode) return;
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (mode === 'row' && row) {
      if (Math.abs(dy) > Math.abs(dx) + 4) { row.style.transform = ''; row.style.transition = ''; mode = null; return; }
      const x = Math.max(-120, Math.min(0, dx));
      row.style.transition = 'none'; row.style.transform = 'translateX(' + x + 'px)';
      const bg = row.parentElement && row.parentElement.querySelector('.ins-del-bg');
      if (bg) bg.style.opacity = Math.abs(x) > 6 ? '1' : '0';
      row.dataset.armed = x <= -64 ? '1' : '';
    } else if (mode === 'sheet' && sheet) {
      const y = Math.max(0, dy);
      sheet.style.transition = 'none'; sheet.style.transform = 'translateY(' + y + 'px)';
      sheet.dataset.dy = y;
    }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (mode === 'edge' && dx >= 56 && Math.abs(dx) > Math.abs(dy)) openNav();
    else if (mode === 'closer' && dx <= -56 && Math.abs(dx) > Math.abs(dy)) closeNav();
    else if (mode === 'row' && row) {
      const armed = row.dataset.armed === '1';
      row.style.transition = ''; row.style.transform = '';
      const bg = row.parentElement && row.parentElement.querySelector('.ins-del-bg');
      if (bg) bg.style.opacity = '';
      row.dataset.armed = '';
      if (armed) { const id = +String(row.id).replace('ir-', ''); if (id && typeof deleteIns === 'function') deleteIns(id); } // с undo-тостом
    } else if (mode === 'sheet' && sheet) {
      const y = +(sheet.dataset.dy || 0);
      sheet.style.transition = ''; sheet.dataset.dy = '';
      sheet.style.transform = '';
      if (y > 100 && ovId) closeOv(ovId);
    }
    mode = null; row = null; sheet = null; ovId = null;
  }, { passive: true });
  window.addEventListener('online',  () => rSidebar());
  window.addEventListener('offline', () => rSidebar());
  rSidebar();
})();

// ═══ ОБРАТНАЯ СВЯЗЬ (см. FEEDBACK_SPEC.md) ═══════════════════════
// errorBuffer: кольцевой буфер последних JS-ошибок (только локально;
// уходит на сервер ТОЛЬКО при явной отправке формы с включённым чекбоксом).
const ERRBUF_KEY = 'arch5_errbuf';
function pushErr(m) {
  try {
    const b = JSON.parse(localStorage.getItem(ERRBUF_KEY) || '[]');
    b.push({ m: String(m).slice(0, 300), ts: nowISO() });
    while (b.length > 10) b.shift();
    localStorage.setItem(ERRBUF_KEY, JSON.stringify(b));
  } catch (e) {}
}
window.addEventListener('error', e => pushErr((e.message || 'error') + ' @' + (e.filename || '').split('/').pop() + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', e => pushErr('promise: ' + ((e.reason && e.reason.message) || e.reason)));

function fbContext() {
  let screen = '';
  try { screen = (document.querySelector('.ov.on') || document.querySelector('.pg.on') || {}).id || ''; } catch (e) {}
  return {
    screen, lang: navigator.language, online: navigator.onLine,
    ua: navigator.userAgent.slice(0, 200), viewport: innerWidth + 'x' + innerHeight,
    ts: nowISO(), lastErrors: (JSON.parse(localStorage.getItem(ERRBUF_KEY) || '[]')).slice(-3),
  };
}
async function sendFeedback() {
  const ta = $('fb-text'); const t = (ta && ta.value.trim()) || '';
  if (t.length < 3) { toast('Напиши хотя бы пару слов', 'warn'); return; }
  const withCtx = !$('fb-ctx') || $('fb-ctx').checked;
  let ver = ''; try { ver = ((await caches.keys()) || []).find(k => k.startsWith('arch-')) || ''; } catch (e) {}
  const payload = { text: t, context: withCtx ? { ...fbContext(), appVersion: ver } : { ts: nowISO() } };
  const base = (typeof apiBase === 'function' && apiBase()) || window.ARCHITECT_API || '';
  try {
    const r = await fetch(base + '/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    const sent = JSON.parse(localStorage.getItem('arch5_fb_sent') || '[]');
    sent.push(d.id); localStorage.setItem('arch5_fb_sent', JSON.stringify(sent.slice(-20)));
    ta.value = ''; closeOv('ov-feedback'); if (typeof hptMed === 'function') hptMed();
    toast('Спасибо! Мы читаем каждое сообщение', 'ok');
  } catch (e) {
    // офлайн/сбой → outbox, фоновая доотправка при подключении
    const ob = JSON.parse(localStorage.getItem('arch5_fb_outbox') || '[]');
    ob.push(payload); localStorage.setItem('arch5_fb_outbox', JSON.stringify(ob.slice(-10)));
    ta.value = ''; closeOv('ov-feedback');
    toast('Сохранено — отправлю при подключении', 'ok');
  }
}
async function flushFeedbackOutbox() {
  try {
    const ob = JSON.parse(localStorage.getItem('arch5_fb_outbox') || '[]');
    if (!ob.length || !navigator.onLine) return;
    const base = (typeof apiBase === 'function' && apiBase()) || window.ARCHITECT_API || '';
    const rest = [];
    for (const p of ob) {
      try { const r = await fetch(base + '/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }); if (!r.ok) rest.push(p); }
      catch (e) { rest.push(p); }
    }
    localStorage.setItem('arch5_fb_outbox', JSON.stringify(rest));
  } catch (e) {}
}
window.addEventListener('online', flushFeedbackOutbox);
setTimeout(flushFeedbackOutbox, 4000);

// Замыкание цикла (FEEDBACK_SPEC.md): раз в запуск спрашиваем статус
// отправленных отзывов; «fixed» → благодарим и убираем из ожидания.
async function checkFeedbackStatus() {
  try {
    if (!navigator.onLine) return;
    const sent = JSON.parse(localStorage.getItem('arch5_fb_sent') || '[]');
    if (!sent.length) return;
    const base = (typeof apiBase === 'function' && apiBase()) || window.ARCHITECT_API || '';
    const r = await fetch(base + '/api/feedback/status?ids=' + sent.join(','));
    if (!r.ok) return;
    const d = await r.json();
    const fixedIds = (d.items || []).filter(i => i.status === 'fixed').map(i => +i.id);
    if (fixedIds.length) {
      toast('Твой отзыв учтён — уже исправлено ✓', 'ok');
      localStorage.setItem('arch5_fb_sent', JSON.stringify(sent.filter(id => !fixedIds.includes(+id))));
    }
  } catch (e) {}
}
setTimeout(checkFeedbackStatus, 6000);

// ═══ ЖИВОЙ ОТКЛИК ════════════════════════════════════════════════
// Дневник не должен молчать. После каждой записи — карточка-отклик:
// связи с прошлым, зреющие темы, динамика. С AI-ключом добавляется
// живая реакция наставника (напрямую браузер→Anthropic, как весь AI-слой).
const rcDay = i => i.day || String(i.createdAt || '').slice(0, 10);
// «Эхо из прошлого» использует тот же смысловой словарь, что и карта тем:
// стемы минус служебные слова — переклички только по содержанию.
function rcWords(s) { return new Set(keywords(s)); }
// Лучшее «эхо» из прошлого: пересечение значимых слов ≥2.
function rcRelated(text, excludeId) {
  const w = rcWords(text); if (w.size < 2) return null;
  let best = null, bs = 0;
  for (const i of (DB.insights || [])) {
    if (i.id === excludeId) continue;
    const ov = [...rcWords((i.title || '') + ' ' + (i.body || ''))].filter(x => w.has(x)).length;
    if (ov > bs) { bs = ov; best = i; }
  }
  return bs >= 2 ? best : null;
}
function rcClose() {
  const el = $('react-card'); if (!el) return;
  el.classList.remove('on'); setTimeout(() => el.remove(), 250);
}
function reactCard(rows, title) {
  rows = (rows || []).filter(Boolean).slice(0, 4);
  if (!rows.length) return;
  clearTimeout(window.__rcT);
  const old = document.getElementById('react-card'); if (old) old.remove();  // сразу, без анимации — id должен быть один
  const el = document.createElement('div');
  el.className = 'react-card'; el.id = 'react-card';
  el.innerHTML = `<div class="rc-head"><span>${esc(title || 'Отклик')}</span><button class="rc-x" onclick="rcClose()" aria-label="Закрыть">✕</button></div>` +
    rows.map(r => `<div class="rc-row${r.act ? ' tap' : ''}"${r.act ? ` onclick="${r.act}" role="button"` : ''}>${r.html}</div>`).join('') +
    `<div class="rc-ai" id="rc-ai"></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  window.__rcT = setTimeout(rcClose, 14000);
}
// AI-реакция наставника — только при заданном пользовательском ключе.
async function rcAI(text) {
  try {
    if (!getAiKey() || !navigator.onLine || !text || text.length < 10) return;
    const slot = () => document.getElementById('rc-ai');
    if (!slot()) return;
    slot().innerHTML = '<span class="rc-think">⚡ читаю…</span>';
    const a = await callClaude({
      system: 'Ты — живой дневник-наставник приложения «Архитектор». Пользователь только что сохранил запись. Отреагируй по-русски: 1–2 коротких предложения по сути (отрази главное, без пустых похвал и воды) и один короткий вопрос в конце.',
      user: text, maxTokens: 220, task: 'react',
    });
    const s = slot(); if (!s) return;
    s.innerHTML = `<div class="rc-mentor">${esc(String(a).trim())}</div>`;
    clearTimeout(window.__rcT); window.__rcT = setTimeout(rcClose, 22000);
  } catch (e) { const s = document.getElementById('rc-ai'); if (s) s.innerHTML = ''; }
}
function reactToInsight(ins) {
  const rows = [];
  const rel = rcRelated((ins.title || '') + ' ' + (ins.body || ''), ins.id);
  if (rel) rows.push({ html: `🔗 Перекликается с «${esc(rel.title)}»<i>${esc(rel.date || '')}</i>`, act: `rcClose();showDet(${rel.id})` });
  const m30 = DB.insights.filter(i => i.tag === ins.tag && rcDay(i) > dayAgo(30)).length;
  if (m30 >= 2) rows.push({ html: `📚 ${m30}-я мысль о «${TL[ins.tag] || ins.tag}» за месяц — тема зреет` });
  if (m30 >= 3 && ins.tag !== 'pattern') rows.push({ html: `⚡ Похоже на паттерн — предложение уже на главной` });
  const wk = DB.insights.filter(i => rcDay(i) > dayAgo(7)).length;
  const pw = DB.insights.filter(i => rcDay(i) > dayAgo(14) && rcDay(i) <= dayAgo(7)).length;
  if (wk >= 2) rows.push({ html: pw ? `📈 Темп: ${wk} ${pl(wk, 'запись', 'записи', 'записей')} за неделю (было ${pw})` : `📈 ${wk} ${pl(wk, 'запись', 'записи', 'записей')} за эту неделю` });
  if (!rows.length) rows.push({ html: `🌱 Мысль №${DB.insights.length} в базе — граф связей растёт` });
  rows.push({ html: `💬 <b>Обсудить глубже</b> — раскрутить тему в диалоге`, act: `rcDiscuss(${ins.id})` });
  reactCard(rows);
  rcAI(ins.body || ins.title || '');
}
function reactToCheckin(todayAvg) {
  const rows = [];
  if (todayAvg != null && todayAvg < 5) rows.push({ html: `⚠️ Состояние сегодня ниже 5 — восстановление в приоритете, не требуй от себя многого` });
  const s = stateScore();
  if (s.ok) {
    rows.push({ html: `📊 Состояние ${s.score}/100 — ${s.delta > 0 ? 'выше' : s.delta < 0 ? 'ниже' : 'ровно по'} твоей норме${s.delta ? ` на ${Math.abs(s.delta)}` : ''}`, act: `rcClose();goTo('vit')` });
    const weak = s.contributors && s.contributors[0];
    if (weak && weak.score < 60) rows.push({ html: `🎯 Слабое звено сейчас — ${weak.label.toLowerCase()} (${weak.score}/100)` });
  }
  const st = typeof calcStreak === 'function' ? calcStreak() : 0;
  if (st >= 2) rows.push({ html: `🔥 ${st} ${pl(st, 'день', 'дня', 'дней')} подряд с чек-ином` });
  try {
    const si = smartInsights();
    if (si && si.items && si.items.length) rows.push({ html: `💡 ${esc(si.items[0].text)}` });
  } catch (e) {}
  if (!rows.length) rows.push({ html: '📊 Данные копятся — ещё пара чек-инов, и покажу твою динамику' });
  reactCard(rows);
}
function reactToSphere(s) {
  const rows = [];
  try {
    const st = sphereStats(s.id) || {};
    if (s.type === 'habit' && st.streak >= 2) rows.push({ html: `🔥 «${esc(s.name)}»: ${st.streak} ${pl(st.streak, 'день', 'дня', 'дней')} подряд` });
    if (s.type === 'goal' && st.progress != null) rows.push({ html: `🎯 «${esc(s.name)}»: ${st.progress}% к цели` });
    if (s.type === 'counter' && st.sum != null) rows.push({ html: `📈 «${esc(s.name)}»: всего ${st.sum} ${esc(s.unit || '')}` });
    const cl = crossLinks().find(l => l.text && l.text.includes(s.name));
    if (cl) rows.push({ html: `🔗 ${esc(cl.text)}` });
  } catch (e) {}
  if (!rows.length) {
    const n = (DB.sphereLogs || []).filter(l => l.sphereId === s.id).length;
    rows.push({ html: `🌱 «${esc(s.name)}»: ${n} ${pl(n, 'отметка', 'отметки', 'отметок')} — данные копятся` });
  }
  reactCard(rows);
}
function reactToDream(d, insId) {
  const rows = [];
  const rel = rcRelated(d.body || '', null);
  if (rel) rows.push({ html: `🔗 Сон перекликается с «${esc(rel.title)}»`, act: `rcClose();showDet(${rel.id})` });
  rows.push({ html: `🌙 ${DB.dreams.length}-й сон в дневнике${d.arch ? ` · архетип «${esc(d.arch)}»` : ''}` });
  if (insId) rows.push({ html: `🔮 <b>Растолковать сон</b> — Юнг, гештальт и твой контекст жизни`, act: `rcDiscuss(${insId})` });
  reactCard(rows);
  rcAI('Сон: ' + (d.body || ''));
}
// ─── ВЕКТОР НЕДЕЛИ: «куда я еду» одним взглядом ───────────────────
function rVector() {
  const el = $('h-vector'); if (!el) return;
  const all = [...(DB.insights || []), ...(DB.dreams || []), ...(DB.spiritual || [])];
  const wk = all.filter(i => rcDay(i) > dayAgo(7)).length + (DB.checkins || []).filter(c => c.date > dayAgo(7)).length;
  const pw = all.filter(i => rcDay(i) > dayAgo(14) && rcDay(i) <= dayAgo(7)).length + (DB.checkins || []).filter(c => c.date > dayAgo(14) && c.date <= dayAgo(7)).length;
  const s = stateScore();
  if (!wk && !s.ok) { el.innerHTML = ''; return; }
  const dir = s.ok ? (s.delta >= 3 ? 'up' : s.delta <= -3 ? 'down' : 'flat') : (wk > pw ? 'up' : wk < pw ? 'down' : 'flat');
  const HEAD = { up: ['↗', 'Ты набираешь ход'], flat: ['→', 'Ровный ход'], down: ['↘', 'Сбавляешь — это тоже данные'] };
  const cnt = {};
  DB.insights.filter(i => rcDay(i) > dayAgo(7)).forEach(i => { cnt[i.tag] = (cnt[i.tag] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  const bits = [`${wk} ${pl(wk, 'запись', 'записи', 'записей')} за 7 дней${pw ? ` (было ${pw})` : ''}`];
  if (top && top[1] >= 2) bits.push(`главная тема — «${TL[top[0]] || top[0]}» (${top[1]})`);
  if (s.ok) bits.push(`состояние ${s.score}/100${s.delta ? ` (${s.delta > 0 ? '+' : ''}${s.delta} к норме)` : ''}`);
  el.innerHTML = `<div class="sec-lbl">Вектор недели</div>
    <div class="vec-card mx mb" onclick="goTo('sys')" role="button">
      <div class="vec-dir ${dir}"><span class="vec-ar">${HEAD[dir][0]}</span>${HEAD[dir][1]}</div>
      <div class="vec-sub">${bits.join(' · ')}</div>
    </div>`;
}

// ═══ ЖИВОЕ ОБНОВЛЕНИЕ PWA + «ЧТО НОВОГО» ═════════════════════════
// Запущенное PWA живёт в памяти со старым кодом и само не узнаёт о
// новой версии. Здесь: проверка при каждом возвращении в приложение,
// баннер «Обновить» и карточка «Что нового» после обновления — чтобы
// изменения были ВИДНЫ, а не молчали.
const APP_CHANGES = [
  '📥 Импорт из ChatGPT: многолетний дневник из чатов — в систему, с настоящими датами и освоением по методу «Зачем?»',
  '🧠 Карта теперь строится из СМЫСЛОВ: ИИ осознанно определяет, о чём каждая запись, — не из повторяемых слов',
  '🔮 Сонник: сны толкуются отдельным режимом — Юнг (Тень), гештальт, наука + твой контекст жизни',
  '🔑 «Ключи сервисов» в Настройках: все подключения и ключи в одном меню',
  '📆 «Итоги недели» больше не дублируются: одна карточка на календарную неделю',
];
async function currentAppVersion() {
  try { return ((await caches.keys()) || []).find(k => /^arch-v/.test(k)) || ''; } catch (e) { return ''; }
}
async function maybeWhatsNew(cur) {
  cur = cur || await currentAppVersion();
  if (!cur) return;
  const seen = localStorage.getItem('arch5_ver');
  localStorage.setItem('arch5_ver', cur);
  if (!seen || seen === cur) return;       // первый запуск или версия не менялась
  reactCard(APP_CHANGES.map(t => ({ html: esc(t) })), 'Что нового');
  clearTimeout(window.__rcT); window.__rcT = setTimeout(rcClose, 25000);
}
function showUpdateToast() {
  if (document.getElementById('upd-toast')) return;
  const el = document.createElement('div');
  el.className = 'toast t-undo on'; el.id = 'upd-toast';
  el.innerHTML = `<span>Вышла новая версия</span><button class="toast-undo" onclick="location.reload()">Обновить</button>`;
  $('toasts').appendChild(el);
}
(function initSWUpdates() {
  if (!('serviceWorker' in navigator)) { return; }
  const hadController = !!navigator.serviceWorker.controller;
  // Новый SW взял контроль (skipWaiting) → свежая версия готова.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateToast();
  });
  const poke = () => navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poke(); });
  window.addEventListener('online', poke);
  setInterval(poke, 30 * 60 * 1000);
})();
setTimeout(() => { try { maybeWhatsNew(); } catch (e) {} }, 2500);

// ═══ ДИАЛОГ ВГЛУБЬ ═══════════════════════════════════════════════
// Режим чата (как в Claude/GPT): лёгкий отклик → «Обсудить глубже» →
// полноценный диалог с наставником, раскручивающий тему до корня.
// Диалог сохраняется в DB.chats (синк/бэкап как у всех коллекций),
// а «Завершить» сжимает его в инсайт — вывод попадает в граф, паттерны
// и будущие переклички. Ничего не проходит бесследно.
// Диалог ведётся по методу «Зачем?» владельца (его научно-методический
// труд): симптом → серия «Зачем?» → функция → вторичная выгода → цена →
// альтернативный способ закрыть потребность → закрепление выбора.
const CHAT_SYSTEM = 'Ты — наставник дневника «Архитектор». Работаешь строго по методу «Зачем?» (интеграция: логотерапия Франкла, транзактный анализ Бёрна, теория привязанности Боулби, эмоциональная регуляция Гоулмана). Алгоритм диалога: 1) зафиксируй симптом словами человека; 2) последовательно спрашивай «Зачем?» — по ОДНОЙ итерации за ход, всего 3–5, двигаясь от жалобы к ФУНКЦИИ переживания (вопрос «зачем», не «почему»: не причина в прошлом, а функция сейчас); 3) когда функция видна — назови её и вторичную выгоду (payoff, Бёрн); 4) мягко покажи цену симптома; 5) спроси, каким другим способом можно удовлетворить ту же глубинную потребность; 6) помоги закрепить новый выбор. Замечай состояния Я (Ребёнок/Родитель/Взрослый) и психологические игры — называй их бережно. За один ход: короткое отражение (1–3 предложения) + ОДИН вопрос. Без советов, пока не попросят. Тепло, без осуждения, по-русски, на «ты».';
// Сонник — ОТДЕЛЬНЫЙ режим диалога: сон не «раскручивают методом „Зачем?"»,
// его толкуют. Синтез признанных подходов + жизненный контекст из дневника —
// приложение знает дела, проблемы и потребности сновидца, и сон читается
// на их фоне, а не в вакууме.
const DREAM_SYSTEM = 'Ты — толкователь снов дневника «Архитектор». Работаешь как синтез признанных подходов: аналитическая психология Юнга (сон компенсирует сознательную установку; образы — части психики: Тень — вытесненное и отвергаемое, Анима/Анимус, Персона, Самость; амплификация образов), гештальт-подход Перлза (каждый элемент сна — часть самого сновидца; можно предложить «сказать от лица» образа), научный слой (Холл/Домхофф: сны продолжают дневные заботы — гипотеза непрерывности; Ревонсуо: репетиция угроз; консолидация эмоциональной памяти). НЕ сонник-предсказание, НЕ эзотерика, НЕ метод «Зачем?» — это другой режим. Алгоритм: 1) прими сон; уточни максимум 1–2 детали: самый яркий образ и чувство в момент пробуждения; 2) выдели ключевые образы, отдельно замечай возможные фигуры Тени (пугающее, отвратительное, «это не я»); 3) ОБЯЗАТЕЛЬНО связывай образы с жизненным контекстом сновидца (дан ниже) — сны продолжают дневную жизнь; 4) предложи 2–3 гипотезы толкования, называя подход каждой (Юнг / гештальт / непрерывность), и спроси, какая отзывается; 5) заверши интеграцией: что сон приглашает признать или сделать — один маленький шаг. За один ход: короткое отражение + один вопрос ИЛИ гипотезы. Тепло, по-русски, на «ты».';
// Жизненный контекст для толкования: свежие записи (не сны), глубинные
// потребности из психоконтура, состояние, паттерны — то, что сон «продолжает».
function dreamLifeContext() {
  const ins = (DB.insights || []).filter(i => i.tag !== 'dream' && i.src !== 'Дневник снов').slice(0, 8)
    .map(i => '— ' + i.title + (i.psy && i.psy.need ? ` (потребность: ${i.psy.need})` : ''));
  const needs = {};
  (DB.insights || []).forEach(i => { const n = i.psy && i.psy.need; if (n) needs[n] = (needs[n] || 0) + 1; });
  const topNeeds = Object.entries(needs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} (${c})`);
  const aW = checkinAvg((DB.checkins || []).filter(c => c.date > dayAgo(7)));
  const pats = (DB.patterns || []).slice(0, 4).map(p => '— ' + p.text);
  let s = 'Свежие записи дневника:\n' + (ins.length ? ins.join('\n') : '— нет') + '\n';
  if (topNeeds.length) s += 'Глубинные потребности по методу «Зачем?»: ' + topNeeds.join(', ') + '\n';
  if (aW) s += `Состояние за 7 дней: ясность ${aW.cl.toFixed(1)}/10, стресс ${aW.st.toFixed(1)}/10, мотивация ${aW.mv.toFixed(1)}/10, сон ${aW.sl.toFixed(1)}ч\n`;
  if (pats.length) s += 'Замеченные паттерны:\n' + pats.join('\n');
  return s;
}
const chatSystemFor = c => c && c.mode === 'dream'
  ? DREAM_SYSTEM + '\n\nЖизненный контекст сновидца (из его дневника):\n' + dreamLifeContext()
  : CHAT_SYSTEM;
// Модель диалога выбирается как в Perplexity: список моделей трёх
// провайдеров, выбранная раскрыта с описанием и тумблером «С рассуждением».
// Диалог идёт на выбранной (дефолт — sonnet, дёшево); а вот ЗАКЛЮЧЕНИЕ
// («Завершить» → вывод в систему) — всегда на deep-маршруте (opus):
// сильная модель включается только там, где решается итог.
const CHAT_MODELS = [
  { provider: 'anthropic', model: 'claude-sonnet-5',  name: 'Claude Sonnet 5',  ic: '✳', desc: 'Быстрая модель Anthropic — рекомендуем для диалога', reason: true },
  { provider: 'anthropic', model: 'claude-opus-4-8',  name: 'Claude Opus 4.8',  ic: '✳', tag: 'max', desc: 'Самая сильная Anthropic — дороже в ~2 раза', reason: true },
  { provider: 'anthropic', model: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', ic: '✳', desc: 'Самая быстрая и дешёвая Anthropic' },
  { provider: 'openai',    model: 'gpt-4o',           name: 'GPT-4o',           ic: '❋', desc: 'Флагман OpenAI' },
  { provider: 'openai',    model: 'gpt-4o-mini',      name: 'GPT-4o mini',      ic: '❋', desc: 'Быстрая и дешёвая OpenAI' },
  { provider: 'gemini',    model: 'gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   ic: '✦', desc: 'Последняя модель Google' },
  { provider: 'gemini',    model: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', ic: '✦', desc: 'Быстрая модель Google' },
];
const CHAT_MODEL_DEFAULT = { provider: 'anthropic', model: 'claude-sonnet-5', reasoning: true };
const chatModel = () => CFG.chatModel || CHAT_MODEL_DEFAULT;
function rModels() {
  const el = $('models-list'); if (!el) return;
  const cm = chatModel();
  el.innerHTML = CHAT_MODELS.map((m, i) => {
    const sel = m.provider === cm.provider && m.model === cm.model;
    const hasKey = !!getAiKeyFor(m.provider);
    return `<div class="mdl-row${sel ? ' sel' : ''}" onclick="chatModelPick(${i})" role="button">
      <div class="mdl-main"><span class="mdl-ic p-${m.provider}">${m.ic}</span><b>${m.name}</b>${m.tag ? `<span class="mdl-tag">${m.tag}</span>` : ''}${sel ? '<span class="mdl-check">✓</span>' : ''}</div>
      ${sel ? `<div class="mdl-desc">${m.desc}${hasKey ? '' : ' · <span class="mdl-nokey" onclick="event.stopPropagation();closeOv(\'ov-models\');closeOv(\'ov-chat\');openKeys()">нет ключа — добавить в «Ключи сервисов»</span>'}</div>` +
        (m.reason ? `<div class="mdl-reason" onclick="event.stopPropagation();chatReasonToggle()"><span>С рассуждением</span><span class="tgl${cm.reasoning !== false ? ' on' : ''}"></span></div>` : '') : ''}
    </div>`;
  }).join('');
}
function chatModelPick(i) {
  const m = CHAT_MODELS[i]; if (!m) return;
  const cur = chatModel();
  if (cur.provider !== m.provider || cur.model !== m.model)
    CFG.chatModel = { provider: m.provider, model: m.model, reasoning: cur.reasoning !== false };
  persist(); rModels(); rChatChip(); hpt();
}
function chatReasonToggle() {
  const cm = { ...chatModel() };
  cm.reasoning = cm.reasoning === false;
  CFG.chatModel = cm; persist(); rModels();
}
function rChatChip() {
  const chip = $('chat-model-chip'); if (!chip) return;
  const cm = chatModel();
  const m = CHAT_MODELS.find(x => x.provider === cm.provider && x.model === cm.model);
  chip.textContent = m ? m.name.replace('Claude ', '') : cm.model;
}
let _chatId = null, _chatBusy = false;
function openChatFor(insId, seed) {
  const src = insId ? DB.insights.find(x => x.id === insId) : null;
  if (!seed && src) seed = src.body || src.title;
  // сон уходит в режим толкования (Юнг/гештальт/наука), не в метод «Зачем?»
  const isDream = !!(src && (src.tag === 'dream' || src.src === 'Дневник снов'));
  let chat = insId ? (DB.chats || []).find(c => c.insightId === insId) : null;
  if (!chat) {
    const now = Date.now();
    chat = { id: now, insightId: insId || null, mode: isDream ? 'dream' : null,
             title: titleFrom(seed || 'Диалог') || 'Диалог',
             createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, msgs: [] };
    if (seed) chat.msgs.push({ r: 'u', t: seed, ts: now });
    (DB.chats = DB.chats || []).push(chat); touch(chat); persist();
  } else if (isDream && !chat.mode) { chat.mode = 'dream'; touch(chat); persist(); }
  _chatId = chat.id;
  rChat(); openOv('ov-chat');
  // первый ход наставника — сразу, чтобы диалог не начинался с тишины
  if (chat.msgs.length === 1 && chat.msgs[0].r === 'u') chatReply();
  setTimeout(() => { try { $('chat-in').focus(); } catch (e) {} }, 350);
}
function chatGet() { return (DB.chats || []).find(c => c.id === _chatId); }
function rChat() {
  const c = chatGet(); const box = $('chat-msgs'); if (!c || !box) return;
  const tt = $('chat-title'); if (tt) tt.textContent = c.title;
  box.innerHTML = c.msgs.map(m =>
    `<div class="cm ${m.r === 'u' ? 'cm-u' : 'cm-a'}">${esc(m.t).replace(/\n/g, '<br>')}</div>`).join('') +
    (_chatBusy ? '<div class="cm cm-a cm-think">думаю…</div>' : '') +
    (!getAiKeyFor(chatModel().provider) ? '<div class="cm cm-hint tap" onclick="closeOv(\'ov-chat\');openKeys()" role="button">Для этой модели нет ключа — открыть «Ключи сервисов» →</div>' : '');
  box.scrollTop = box.scrollHeight;
  rChatChip();
}
function chatSendMsg() {
  const ta = $('chat-in'); const t = (ta && ta.value || '').trim(); if (!t || _chatBusy) return;
  const c = chatGet(); if (!c) return;
  c.msgs.push({ r: 'u', t, ts: Date.now() }); touch(c); persist();
  ta.value = ''; ta.style.height = '';
  rChat(); chatReply();
}
async function chatReply() {
  const cm = chatModel();
  const c = chatGet(); if (!c || _chatBusy || !getAiKeyFor(cm.provider)) { rChat(); return; }
  _chatBusy = true; rChat();
  try {
    const messages = c.msgs.slice(-24).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t }));
    // диалог — на выбранной в пикере модели (дёшево); заключение — отдельно
    const a = await callClaude({ system: chatSystemFor(c), messages, maxTokens: 500, task: 'chat', provider: cm.provider, model: cm.model, reasoning: cm.reasoning !== false });
    const t = String(a).trim();
    if (t) { c.msgs.push({ r: 'a', t, ts: Date.now() }); touch(c); persist(); }
  } catch (e) { toast(e.budget ? e.message : 'AI: ' + e.message, 'warn'); }
  _chatBusy = false; rChat();
  if (typeof hpt === 'function') hpt();
}
// Завершение: диалог сжимается в личный вывод и уходит в инсайты —
// так тема попадает в граф связей, паттерны и будущие переклички.
async function chatFinish() {
  const c = chatGet();
  closeOv('ov-chat');
  if (!c || c.msgs.length < 3 || !getAiKey()) return;
  if (c.summarized) return;                      // вывод уже собран
  toast('Собираю вывод диалога…');
  try {
    const dialog = c.msgs.map(m => (m.r === 'u' ? 'Я: ' : 'Наставник: ') + m.t).join('\n');
    // Заключение — работа для СИЛЬНОЙ модели (deep-маршрут, opus): вывод
    // сразу размечается по методу «Зачем?» и разносится по системе.
    const schema = { type: 'object', additionalProperties: false,
      required: ['text', 'symptom', 'func', 'gain', 'need', 'ego', 'emotion', 'game', 'state'],
      properties: {
        text: { type: 'string' },
        symptom: { anyOf: [{ type: 'string' }, { type: 'null' }] }, func: { anyOf: [{ type: 'string' }, { type: 'null' }] }, gain: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        ...psyEnumProps(),
        emotion: { anyOf: [{ type: 'string' }, { type: 'null' }] }, game: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        // Метрики состояния из диалога → синхронизируются с журналом здоровья
        // (запрос владельца: при закрытии чата ключевые данные о состоянии
        // распределяются в «Здоровье»). Коарс-оценка, ASCII-enum (не union+enum).
        state: { type: 'object', additionalProperties: false, required: ['mood', 'stress', 'lonely'],
          properties: {
            mood: { type: 'string', enum: ['low', 'mid', 'high'] },
            stress: { type: 'string', enum: ['low', 'mid', 'high'] },
            lonely: { type: 'boolean' },
          } },
      } };
    const out = await callClaude({
      system: (c.mode === 'dream'
        ? 'Сожми разбор сна. text: личный вывод от первого лица (2–4 предложения — что сон показал, какая часть меня в нём говорила, что признать или сделать). Плюс психологическая структура вывода: симптом (что сон подсветил), функция, вторичная выгода, глубинная потребность, состояние Я, эмоция, игра (null, если не видно). По-русски, без эзотерики и воды.'
        : 'Сожми диалог по методу «Зачем?». text: личный вывод от первого лица (2–4 предложения — что я понял, корень темы, один следующий шаг). Плюс структура метода: симптом, функция симптома, вторичная выгода, глубинная потребность, состояние Я, эмоция, игра (null, если не видно). По-русски, без воды.')
        + ' Поля need/ego — строго кодом: need = safety(безопасность)/acceptance(принятие)/significance(значимость)/autonomy(автономия)/meaning(смысл)/closeness(близость)/control(контроль)/calm(покой)/novelty(новизна); ego = child(Ребёнок)/parent(Родитель)/adult(Взрослый). Если не видно — ставь \'none\' (не null). Плюс state — коротко оцени по диалогу: mood (low/mid/high — общий тон настроения), stress (low/mid/high — уровень напряжения), lonely (true, если тема одиночества/изоляции звучит).',
      user: dialog, maxTokens: 500, task: 'analysis', schema,
    });
    let parsed; try { parsed = JSON.parse(out); } catch (e) { parsed = { text: String(out).trim() }; }
    const t = String(parsed.text || '').trim(); if (!t) return;
    const psyNeed = psyNeedFromAI(parsed.need), psyEgo = psyEgoFromAI(parsed.ego);
    // Метрики состояния из диалога → журнал здоровья (см. mentalStateDigest,
    // cravingRisk): распределяем данные о состоянии в «Здоровье», как просил
    // владелец, не перезаписывая честный чек-ин — это отдельный сигнал.
    const st = parsed.state && ['low', 'mid', 'high'].includes(parsed.state.mood)
      ? { mood: parsed.state.mood, stress: parsed.state.stress, lonely: !!parsed.state.lonely, emotion: parsed.emotion || null, at: nowISO(), day: todayKey() }
      : undefined;
    c.summarized = true; touch(c);
    DB.insights.unshift({
      id: Date.now(), tag: 'personal', w: 2, title: titleFrom(t), body: t,
      date: dateRU(), createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION,
      src: c.mode === 'dream' ? 'Разбор сна' : 'Диалог', links: [], chatId: c.id,
      psy: psyNeed || parsed.func ? { symptom: parsed.symptom, func: parsed.func, gain: parsed.gain, need: psyNeed, ego: psyEgo, emotion: parsed.emotion, game: parsed.game, conf: 85, at: nowISO() } : undefined,
      stateNote: st,
    });
    persist(); rIns(); rHIns(); rKPIs();
    toast(st ? 'Вывод сохранён · состояние учтено в «Здоровье»' : 'Вывод диалога сохранён в инсайты', 'ok');
  } catch (e) { toast('Вывод не собрался: ' + e.message, 'warn'); }
}
// История диалогов: Разум → Записи → Диалоги.
function rChats() {
  const el = $('chats-list'); if (!el) return;
  const list = [...(DB.chats || [])].sort((a, b) => b.id - a.id);
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="em-t">Диалогов пока нет</div><div class="em-d">Сохрани запись и нажми «Обсудить глубже» в отклике — раскрутим тему до корня</div></div>`;
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="chat-row" onclick="_chatId=${c.id};rChat();openOv('ov-chat')" role="button">
      <div class="chat-row-t">${c.mode === 'dream' ? '🌙 ' : ''}${esc(c.title)}</div>
      <div class="chat-row-m">${c.msgs.length} ${pl(c.msgs.length, 'сообщение', 'сообщения', 'сообщений')} · ${new Date(c.id).toLocaleDateString('ru')}${c.summarized ? ' · вывод сохранён' : ''}</div>
    </div>`).join('');
}
// Кнопка «Обсудить глубже» из карточки отклика.
function rcDiscuss(insId) { rcClose(); openChatFor(insId); }

// ═══ КАРТА ТЕМ (паттерн InfraNodus) ══════════════════════════════
// Записи → сеть ПОНЯТИЙ: узел — тема (слово-стем в 2+ записях), связь —
// совместная встречаемость, цвет — кластер (label propagation). Главная
// ценность — выводы простым языком: ядро внимания, мост между группами,
// структурный разрыв (несвязанные темы → подсказка записать мысль о связи).
// кластеры тем: label propagation — для малых графов сходится за пару шагов
function clusterizeGraph(nodes, edges) {
  nodes.forEach((n, i) => n.cluster = i);
  const nb = {}; edges.forEach(e => { (nb[e.a] = nb[e.a] || []).push([e.b, e.w]); (nb[e.b] = nb[e.b] || []).push([e.a, e.w]); });
  const byKey = {}; nodes.forEach(n => byKey[n.key] = n);
  for (let it = 0; it < 6; it++) {
    nodes.forEach(n => {
      const votes = {};
      (nb[n.key] || []).forEach(([k, w]) => { const c = byKey[k].cluster; votes[c] = (votes[c] || 0) + w; });
      const best = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
      if (best) n.cluster = +best[0];
    });
  }
}
// Смысловой граф: узлы — темы, осознанно определённые ИИ по СУТИ записи
// (психоконтур, i.psy.themes), а не по повторяемым словам. Связь — темы
// живут в одной записи ИЛИ их записи держит одна глубинная потребность.
function semThemeGraph() {
  const list = (DB.insights || []).filter(i => i.psy && Array.isArray(i.psy.themes) && i.psy.themes.length);
  if (list.length < 4) return null;
  const df = {}, entries = [];
  list.forEach(i => {
    const t = [...new Set(i.psy.themes)];
    entries.push({ themes: t, need: i.psy.need || null });
    t.forEach(w => { df[w] = (df[w] || 0) + 1; });
  });
  const labels = Object.keys(df).sort((a, b) => df[b] - df[a]).slice(0, 16);
  if (labels.length < 3) return null;
  const idx = new Set(labels);
  const nodes = labels.map(s => ({ key: 't' + s, stem: s, title: s, df: df[s], deg: 0, cluster: 0 }));
  const byStem = {}; nodes.forEach(n => byStem[n.stem] = n);
  const co = {};
  const bump = (a, b, w) => { const k = [a, b].sort().join('\u0001'); co[k] = (co[k] || 0) + w; };
  // связь 1: темы одной записи (сильная — психика соединила их в одном тексте)
  entries.forEach(e => {
    const p = e.themes.filter(w => idx.has(w));
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) bump(p[i], p[j], 2);
  });
  // связь 2: темы разных записей с одной глубинной потребностью (метод «Зачем?»)
  const byNeed = {};
  entries.forEach(e => { if (e.need) e.themes.forEach(t => { if (idx.has(t)) (byNeed[e.need] = byNeed[e.need] || new Set()).add(t); }); });
  Object.values(byNeed).forEach(set => {
    const p = [...set];
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) bump(p[i], p[j], 1);
  });
  const edges = [];
  Object.entries(co).forEach(([k, w]) => {
    const [a, b] = k.split('\u0001');
    if (byStem[a] && byStem[b]) { edges.push({ a: 't' + a, b: 't' + b, w }); byStem[a].deg++; byStem[b].deg++; }
  });
  clusterizeGraph(nodes, edges);
  return { nodes, edges, N: list.length, sem: true };
}
function buildThemeGraph() {
  // Есть смысловая разметка ИИ — карта строится из смыслов, не из слов.
  const sem = semThemeGraph();
  if (sem) return sem;
  const T = themeIndex(); const forms = themeForms();
  const N = (DB.insights || []).length;
  const df = {};
  T.kws.forEach(kw => kw.forEach(w => { df[w] = (df[w] || 0) + 1; }));
  const stems = Object.keys(df).filter(w => df[w] >= 2 && T.informative(w))
    .sort((a, b) => df[b] - df[a]).slice(0, 14);
  const idx = new Set(stems);
  const co = {};
  T.kws.forEach(kw => {
    const p = kw.filter(w => idx.has(w));
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      const k = [p[i], p[j]].sort().join('|'); co[k] = (co[k] || 0) + 1;
    }
  });
  const minW = N >= 8 ? 2 : 1;
  const nodes = stems.map(s => ({ key: 't' + s, stem: s, title: forms[s] || s, df: df[s], deg: 0, cluster: 0 }));
  const byStem = {}; nodes.forEach(n => byStem[n.stem] = n);
  const edges = [];
  Object.entries(co).forEach(([k, w]) => {
    if (w < minW) return;
    const [a, b] = k.split('|');
    if (byStem[a] && byStem[b]) { edges.push({ a: 't' + a, b: 't' + b, w }); byStem[a].deg++; byStem[b].deg++; }
  });
  clusterizeGraph(nodes, edges);
  return { nodes, edges, N, sem: false };
}
function themeMapInsights(g) {
  const out = [];
  if (!g.nodes.length) return out;
  const byKey = {}; g.nodes.forEach(n => byKey[n.key] = n);
  const wdeg = {}; g.edges.forEach(e => { wdeg[e.a] = (wdeg[e.a] || 0) + e.w; wdeg[e.b] = (wdeg[e.b] || 0) + e.w; });
  const hub = [...g.nodes].sort((a, b) => (wdeg[b.key] || 0) - (wdeg[a.key] || 0))[0];
  if (hub && wdeg[hub.key]) out.push({ ic: '🎯', html: `Ядро карты — <b>«${esc(hub.title)}»</b>: встречается в ${hub.df} ${pl(hub.df, 'записи', 'записях', 'записях')} и связана с ${hub.deg} темами. Сейчас это главный узел твоего внимания.` });
  // мост: тема с рёбрами в наибольшее число ЧУЖИХ кластеров
  let bridge = null, bmax = 1;
  g.nodes.forEach(n => {
    const cl = new Set();
    g.edges.forEach(e => { if (e.a === n.key) cl.add(byKey[e.b].cluster); if (e.b === n.key) cl.add(byKey[e.a].cluster); });
    cl.delete(n.cluster);
    if (cl.size > bmax) { bmax = cl.size; bridge = n; }
  });
  if (bridge && bridge !== hub) out.push({ ic: '🌉', html: `Мост — <b>«${esc(bridge.title)}»</b>: соединяет разные группы тем. Изменения в ней отзовутся сразу в нескольких областях жизни.` });
  // структурный разрыв: две крупнейшие группы тем без единой связи
  const clusters = {};
  g.nodes.forEach(n => (clusters[n.cluster] = clusters[n.cluster] || []).push(n));
  const big = Object.values(clusters).filter(c => c.length >= 2).sort((a, b) => b.length - a.length);
  if (big.length >= 2) {
    const [A, B] = big;
    const setA = new Set(A.map(n => n.key)), setB = new Set(B.map(n => n.key));
    const linked = g.edges.some(e => (setA.has(e.a) && setB.has(e.b)) || (setA.has(e.b) && setB.has(e.a)));
    if (!linked) out.push({ ic: '🕳', html: `Разрыв: группы <b>«${esc(A[0].title)}»</b> и <b>«${esc(B[0].title)}»</b> у тебя никак не связаны. На таких стыках чаще всего прячутся инсайты — <span class="tm-cta" onclick="themeGapWrite('${encodeURIComponent(A[0].title)}','${encodeURIComponent(B[0].title)}')">написать мысль о связи →</span>` });
  }
  // рост: тема с наибольшим числом упоминаний за 7 дней
  const grow = {};
  (DB.insights || []).forEach(i => {
    if (rcDay(i) <= dayAgo(7)) return;
    const ws = g.sem ? ((i.psy && i.psy.themes) || []) : keywords((i.title || '') + ' ' + (i.body || ''));
    ws.forEach(w => { grow[w] = (grow[w] || 0) + 1; });
  });
  const g7 = g.nodes.map(n => [n, grow[n.stem] || 0]).sort((a, b) => b[1] - a[1])[0];
  if (g7 && g7[1] >= 2) out.push({ ic: '📈', html: `Растёт: <b>«${esc(g7[0].title)}»</b> — ${g7[1]} ${pl(g7[1], 'упоминание', 'упоминания', 'упоминаний')} за последнюю неделю.` });
  return out;
}
function themeGapWrite(a, b) {
  openOv('ov-add');
  const ta = $('add-tx');
  if (ta) { ta.value = `Как связаны «${decodeURIComponent(a)}» и «${decodeURIComponent(b)}» в моей жизни?\n\n`; ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }
}
function setMapView(v) { STATE.mapView = v; rMap(); if (typeof hpt === 'function') hpt(); }
function rMap() {
  const v = STATE.mapView || 'themes';
  const bt = $('mt-themes'), bp = $('mt-psy'), bn = $('mt-notes');
  if (bt) bt.classList.toggle('on', v === 'themes');
  if (bp) bp.classList.toggle('on', v === 'psy');
  if (bn) bn.classList.toggle('on', v === 'notes');
  const hint = $('graph-hint');
  const semOn = (DB.insights || []).some(i => i.psy && i.psy.themes && i.psy.themes.length);
  if (hint) hint.textContent = v === 'themes'
    ? (semOn
      ? 'Карта строится из СМЫСЛОВ: ИИ осознанно определяет, о чём каждая запись по сути, а связи — темы одной записи или одной глубинной потребности (метод «Зачем?»).'
      : 'Пока карта строится по повторяющимся словам. ' + (getAiKey() ? 'ИИ уже размечает записи по смыслу в фоне — скоро карта станет смысловой.' : 'Добавь AI-ключ в Настройках — и карта станет смысловой: ИИ определит, о чём каждая запись по сути.'))
    : v === 'psy'
      ? 'ИИ осознанно размечает записи по методу «Зачем?»: функция симптома, вторичная выгода, глубинная потребность, состояние Я, игры. Связи — по психологии, не по словам.'
      : 'Связи находятся сами — по общим темам твоих записей. Крупные узлы упоминаются чаще. Тапни узел — фокус на его окружении.';
  const ti = $('theme-insights');
  if (v === 'themes') rThemeMap('graph-canvas');
  else if (v === 'psy') rPsyView('graph-canvas');
  else { if (ti) ti.innerHTML = ''; rGraph('graph-canvas', 380, false); }
}
let _tmSel = null;
function tmSelect(enc) {
  const stem = enc ? decodeURIComponent(enc) : null;
  _tmSel = (stem && _tmSel !== stem) ? stem : null;
  rThemeMap('graph-canvas'); if (typeof hpt === 'function') hpt();
}
function rThemeMap(elId) {
  const el = $(elId); if (!el) return;
  const g = buildThemeGraph();
  const ti = $('theme-insights');
  if (g.nodes.length < 3) {
    el.innerHTML = `<div class="empty"><div class="em-t">Тем пока мало</div><div class="em-d">Пиши записи своими словами (не только ответы на вопросы) — повторяющиеся темы проявятся сами, и карта покажет, как они связаны</div></div>`;
    if (ti) ti.innerHTML = '';
    return;
  }
  const W = el.clientWidth || 340, H = 340;
  const PAL = ['var(--accent)', 'var(--teal)', 'var(--gold)', 'var(--rose)', 'var(--green)', 'var(--purple)'];
  const clOrder = [...new Set(g.nodes.map(n => n.cluster))];
  const colorOf = c => PAL[clOrder.indexOf(c) % PAL.length];
  g.nodes.forEach(n => { n.r = 7 + Math.min(n.df, 8) * 1.4; });
  layoutGraph(g.nodes, g.edges.map(e => ({ a: e.a, b: e.b })), W, H);
  const byKey = {}; g.nodes.forEach(n => byKey[n.key] = n);
  if (_tmSel && !byKey['t' + _tmSel]) _tmSel = null;
  const selKey = _tmSel ? 't' + _tmSel : null;
  const neigh = new Set();
  if (selKey) g.edges.forEach(e => { if (e.a === selKey) neigh.add(e.b); if (e.b === selKey) neigh.add(e.a); });
  const lines = g.edges.map(e => {
    const A = byKey[e.a], B = byKey[e.b];
    const cls = selKey ? (e.a === selKey || e.b === selKey ? 'gedge on' : 'gedge dim') : 'gedge';
    return `<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" class="${cls}" style="stroke-width:${Math.min(1 + e.w * 0.6, 3)}"/>`;
  }).join('');
  const placed = [];
  const circ = g.nodes.map(nd => {
    const maxL = g.sem ? 20 : 14;   // смысловые темы длиннее слов — им больше места
    const short = nd.title.length > maxL ? nd.title.slice(0, maxL - 1) + '…' : nd.title;
    const w = short.length * 5.6 + 8, ly = nd.y + nd.r + 11;
    const lx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, nd.x));
    const box = { x1: lx - w / 2, x2: lx + w / 2, y1: ly - 9, y2: ly + 3 };
    const clash = placed.some(b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2));
    if (!clash) placed.push(box);
    const dim = selKey && nd.key !== selKey && !neigh.has(nd.key) ? ' gdim' : '';
    return `<g class="gnode${dim}" onclick="event.stopPropagation();tmSelect('${encodeURIComponent(nd.stem)}')">
      ${nd.key === selKey ? `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${nd.r + 4}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>` : ''}
      <circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${nd.r}" fill="${colorOf(nd.cluster)}" fill-opacity=".85"/>
      ${clash ? '' : `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="glbl">${esc(short)}</text>`}
    </g>`;
  }).join('');
  let info;
  if (_tmSel) {
    const recs = (DB.insights || []).filter(i => g.sem
      ? ((i.psy && i.psy.themes) || []).includes(_tmSel)
      : keywords((i.title || '') + ' ' + (i.body || '')).includes(_tmSel)).slice(0, 4);
    const sel = byKey['t' + _tmSel];
    info = `<div class="ginfo"><div class="gi-t">Тема «${esc(sel.title)}» · ${sel.df} ${pl(sel.df, 'запись', 'записи', 'записей')}<i>${recs.map(r => `<span class="wl" onclick="showDet(${r.id})">${esc(r.title.slice(0, 38))}</span>`).join(' · ')}</i></div></div>`;
  } else {
    info = `<div class="graph-meta">${g.nodes.length} тем · ${g.edges.length} связей · ${g.sem ? '✨ смысловые темы (размечает ИИ)' : 'цвет — группа тем'} · тапни тему</div>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="graph-svg" onclick="tmSelect(null)">${lines}${circ}</svg>` + info;
  if (ti) {
    const ins = themeMapInsights(g);
    ti.innerHTML = ins.length
      ? `<div class="sec-lbl">Что видно по карте</div><div class="tm-card mx mb">${ins.map(x => `<div class="tm-row"><span>${x.ic}</span><div>${x.html}</div></div>`).join('')}</div>`
      : '';
  }
}

// ═══ ПСИХОЛОГИЧЕСКИЙ КОНТУР — метод «Зачем?» владельца ═══════════
// Основа: научно-методический труд владельца (интеграция логотерапии
// Франкла, транзактного анализа Бёрна, теории привязанности Боулби,
// эмоциональной регуляции Гоулмана). ИИ ОСОЗНАННО размечает каждую
// запись по схеме метода: симптом → функция → вторичная выгода →
// потребность → состояние Я → эмоция → игра. Связи между записями
// строятся по ПОТРЕБНОСТЯМ и ИГРАМ — системно, а не по словам.
const PSY_NEEDS = ['безопасность', 'принятие', 'значимость', 'автономия', 'смысл', 'близость', 'контроль', 'покой', 'новизна'];
const PSY_EGO = ['Ребёнок', 'Родитель', 'Взрослый'];
// В JSON Schema структурированного вывода enum-значения должны быть ASCII —
// кириллица в enum ловит ошибку API «Invalid schema: Enum value … does not
// match» (воспроизведено в проде), и вся психоразметка тихо не сохранялась.
// Схеме отдаём латинские коды, а в данных/интерфейсе как жили, так и живут
// русские значения PSY_NEEDS/PSY_EGO — перевод туда-обратно на границе ИИ.
const PSY_NEED_CODE = { 'безопасность': 'safety', 'принятие': 'acceptance', 'значимость': 'significance', 'автономия': 'autonomy', 'смысл': 'meaning', 'близость': 'closeness', 'контроль': 'control', 'покой': 'calm', 'новизна': 'novelty' };
const PSY_EGO_CODE = { 'Ребёнок': 'child', 'Родитель': 'parent', 'Взрослый': 'adult' };
const PSY_NEED_FROM_CODE = Object.fromEntries(Object.entries(PSY_NEED_CODE).map(([ru, code]) => [code, ru]));
const PSY_EGO_FROM_CODE = Object.fromEntries(Object.entries(PSY_EGO_CODE).map(([ru, code]) => [code, ru]));
const psyNeedFromAI = code => PSY_NEED_FROM_CODE[code] || null;
const psyEgoFromAI = code => PSY_EGO_FROM_CODE[code] || null;
// need/ego в схеме — плоский string с сентинелом 'none' вместо union-типа
// ['string','null']. Причина (воспроизведено в проде, IMG_3165): Anthropic-
// валидатор отвергает union-тип ВМЕСТЕ с enum — «Enum value 'safety' does
// not match declared type '['string','null']'», хотя null и был в enum.
// Плоский string + 'none' проходит и в Anthropic, и в OpenAI strict; 'none'
// декодится в null через psyNeedFromAI/psyEgoFromAI (нет в обратной карте).
function psyEnumProps() {
  return {
    need: { type: 'string', enum: [...Object.values(PSY_NEED_CODE), 'none'] },
    ego:  { type: 'string', enum: [...Object.values(PSY_EGO_CODE), 'none'] },
  };
}
const PSY_SYSTEM = 'Ты — психолог-аналитик дневника «Архитектор». Работаешь строго по методу «Зачем?» (интеграция: логотерапия Франкла — у симптома есть функция и смысл; транзактный анализ Бёрна — игры, скрытый выигрыш, состояния Я; теория привязанности Боулби; эмоциональная регуляция Гоулмана). Для каждой записи осознанно определи: симптом (что болит/повторяется, словами автора), функцию симптома (ЗАЧЕМ он нужен психике), вторичную выгоду (payoff), глубинную потребность, состояние Я, ядровую эмоцию и психологическую игру, если она видна. Поля need/ego — строго кодом (не переводи и не выдумывай новые): need = safety(безопасность)/acceptance(принятие)/significance(значимость)/autonomy(автономия)/meaning(смысл)/closeness(близость)/control(контроль)/calm(покой)/novelty(новизна); ego = child(Ребёнок)/parent(Родитель)/adult(Взрослый). НЕ выдумывай: если по тексту не видно — для need/ego ставь код \'none\', для остальных полей null, и снижай confidence. Дополнительно определи themes: 1–3 СМЫСЛОВЫЕ темы записи — о чём она ПО СУТИ (короткая обобщённая фраза в именительном падеже: «отношения», «страх остановки», «признание на работе», «границы с матерью»). Не служебные слова, не пересказ, не эмоции — суть. Если в словаре уже есть подходящая тема — переиспользуй её дословно, чтобы записи связывались.';
let _psyBusy = false;
// Разметка одного батча записей психоконтуром — используется и фоновым
// psyAutoRun, и массовым «освоением» архива (gptAbsorb).
async function psyMarkBatch(todo) {
  const schema = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'symptom', 'func', 'gain', 'need', 'ego', 'emotion', 'game', 'conf', 'themes'],
    properties: {
      id: { type: 'integer' },
      symptom: { anyOf: [{ type: 'string' }, { type: 'null' }] }, func: { anyOf: [{ type: 'string' }, { type: 'null' }] }, gain: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      ...psyEnumProps(),
      emotion: { anyOf: [{ type: 'string' }, { type: 'null' }] }, game: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      conf: { type: 'integer', minimum: 0, maximum: 100 },
      themes: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    } } } } };
  const vocab = [...new Set((DB.insights || []).flatMap(i => (i.psy && i.psy.themes) || []))].slice(0, 40);
  const user = 'Записи дневника (id, текст):\n' + JSON.stringify(todo.map(i => ({ id: i.id, text: (i.title + '. ' + (i.body || '')).slice(0, 600) }))) +
    (vocab.length ? '\n\nСловарь уже существующих тем (переиспользуй дословно, если подходит): ' + vocab.join(', ') : '') +
    '\n\nРазметь каждую по методу «Зачем?». Кратко, по-русски, без пересказа.';
  const text = await callClaude({ system: PSY_SYSTEM, user, maxTokens: 1400, schema, task: 'psy' });
  const out = JSON.parse(text);
  let n = 0;
  (out.items || []).forEach(m => {
    const i = DB.insights.find(x => x.id === m.id);
    if (!i) return;
    i.psy = { symptom: m.symptom, func: m.func, gain: m.gain, need: psyNeedFromAI(m.need), ego: psyEgoFromAI(m.ego), emotion: m.emotion, game: m.game, conf: m.conf, at: nowISO(),
      themes: [...new Set((m.themes || []).map(t => String(t).trim().toLowerCase().replace(/['"«»]/g, '')).filter(t => t && t.length <= 40))].slice(0, 3) };
    touch(i); n++;
  });
  if (n) persist();
  return n;
}
async function psyAutoRun() {
  try {
    if (_psyBusy || !getAiKey() || !navigator.onLine) return;
    // В очередь попадают и уже размеченные записи без themes — смысловой
    // слой карты дозаполняется по старым записям сам.
    const todo = (DB.insights || []).filter(i => (!i.psy || !i.psy.themes) && String(i.body || '').length >= 25).slice(0, 5);
    if (!todo.length) return;
    _psyBusy = true;
    const n = await psyMarkBatch(todo);
    if (n) log('info', `психоконтур: размечено ${n} записей`);
  } catch (e) { log('warn', 'психоконтур: ' + e.message); }
  _psyBusy = false;
}
setTimeout(psyAutoRun, 9000);
setInterval(psyAutoRun, 10 * 60 * 1000);
// Осознанные связи: записи с той же глубинной потребностью.
function psyRelated(ins, limit) {
  if (!ins.psy || !ins.psy.need) return [];
  return (DB.insights || []).filter(x => x.id !== ins.id && x.psy && x.psy.need === ins.psy.need).slice(0, limit || 3);
}
// Вью «Психика»: системная структура вместо графа — потребности,
// состояния Я, повторяющиеся игры, свежие «симптом → функция → выгода».
let _psySel = null;
function psySelect(need) { _psySel = _psySel === need ? null : need; rPsyView('graph-canvas'); if (typeof hpt === 'function') hpt(); }
function rPsyView(elId) {
  const el = $(elId); if (!el) return;
  const ti = $('theme-insights'); if (ti) ti.innerHTML = '';
  const marked = (DB.insights || []).filter(i => i.psy);
  if (!marked.length) {
    el.innerHTML = `<div class="empty"><div class="em-t">Психика ещё не размечена</div><div class="em-d">${getAiKey() ? 'ИИ размечает записи по методу «Зачем?» в фоне — загляни через пару минут' : 'Добавь AI-ключ в Настройках — ИИ начнёт осознанно размечать записи по методу «Зачем?»: функция, выгода, потребность, состояние Я'}</div></div>`;
    return;
  }
  // потребности
  const byNeed = {};
  marked.forEach(i => { const n = i.psy.need; if (n) (byNeed[n] = byNeed[n] || []).push(i); });
  const needRows = Object.entries(byNeed).sort((a, b) => b[1].length - a[1].length).map(([n, list]) => {
    const open = _psySel === n;
    const w = Math.round(list.length / marked.length * 100);
    return `<div class="psy-need${open ? ' open' : ''}" onclick="psySelect('${n}')" role="button">
      <div class="psy-need-h"><span>${esc(n)}</span><i>${list.length}</i></div>
      <div class="psy-bar"><div style="width:${w}%"></div></div>
      ${open ? `<div class="psy-recs">${list.slice(0, 5).map(r => `<span class="wl" onclick="event.stopPropagation();showDet(${r.id})">${esc(r.title.slice(0, 40))}</span>`).join('<br>')}</div>` : ''}
    </div>`;
  }).join('');
  // состояния Я
  const ego = { 'Ребёнок': 0, 'Родитель': 0, 'Взрослый': 0 };
  marked.forEach(i => { if (i.psy.ego && ego[i.psy.ego] != null) ego[i.psy.ego]++; });
  const egoN = ego['Ребёнок'] + ego['Родитель'] + ego['Взрослый'];
  const egoHtml = egoN ? `<div class="psy-sec">Состояния Я (Бёрн)</div>
    <div class="psy-ego">${PSY_EGO.map(k => `<div class="psy-ego-i"><b>${Math.round(ego[k] / egoN * 100)}%</b><span>${k}</span></div>`).join('')}</div>` : '';
  // повторяющиеся игры
  const games = {};
  marked.forEach(i => { const g = (i.psy.game || '').trim(); if (g) (games[g] = games[g] || []).push(i); });
  const rep = Object.entries(games).filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const gamesHtml = rep.length ? `<div class="psy-sec">Повторяющиеся игры (вскрыть = ослабить)</div>` +
    rep.map(([g, l]) => `<div class="psy-game">🎭 «${esc(g)}» — ${l.length} ${pl(l.length, 'раз', 'раза', 'раз')}</div>`).join('') : '';
  // свежие разборы: симптом → функция → выгода
  const fresh = marked.filter(i => i.psy.func).slice(0, 3);
  const freshHtml = fresh.length ? `<div class="psy-sec">Симптом → функция → выгода</div>` +
    fresh.map(i => `<div class="psy-chain" onclick="showDet(${i.id})" role="button">${esc((i.psy.symptom || i.title).slice(0, 44))} <em>→</em> ${esc((i.psy.func || '').slice(0, 50))}${i.psy.gain ? ` <em>→</em> ${esc(i.psy.gain.slice(0, 44))}` : ''}</div>`).join('') : '';
  el.innerHTML = `<div class="psy-wrap">
    <div class="psy-sec" style="border-top:0;padding-top:0">Глубинные потребности · размечено ${marked.length} из ${(DB.insights || []).length}</div>
    ${needRows || '<div class="ai-sp-empty">Потребности пока не определены</div>'}
    ${egoHtml}${gamesHtml}${freshHtml}
  </div>`;
}
