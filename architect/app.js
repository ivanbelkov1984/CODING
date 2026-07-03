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
  oq: [
    'Что самое важное прямо сейчас?',
    'Что мешает двигаться вперёд?',
  ],
  vit: {sl:7, sq:7, cl:7, st:4, mv:7, nic:false, caf:true, alc:false, act:'нет', tone:'нейтрально', note:'', ci:false, date:''},
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
  ['insights','checkins','spheres','sphereLogs','dreams','patterns','evolution','spiritual','digests']
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
    });
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
const TITLES = {home:'Сегодня', insights:'Инсайты', book:CFG.domainLabel||'Книга', vit:'Сферы', sys:'Итоги', map:'Разум', settings:'Настройки'};
function goTo(tab, el) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  const pg = $('pg-'+tab);
  if (pg) pg.classList.add('on');
  const nb = $('nt-'+tab) || el;
  if (nb) nb.classList.add('on');
  $('ptitle').textContent = TITLES[tab] || tab;
  hpt();
  if (tab==='vit') { rSpheres(); rVit(); }
  if (tab==='sys') { rDig(); rReview(30); }
  if (tab==='map') rIns();
  if (tab==='settings') { rProfileRow(); checkApiStatus(); rPushStatus(); }
}
function msub(tab, el) {
  document.querySelectorAll('[id^="ms-"]').forEach(t => t.style.display='none');
  document.querySelectorAll('#subnav .snpill').forEach(p => p.classList.remove('on'));
  const t = $('ms-'+tab);
  if (t) t.style.display = 'block';
  if (el) el.classList.add('on');
  hpt();
  if (tab==='evolution') rEvoList($('evo-more'));
  if (tab==='insights')  rIns();
  if (tab==='book')      rBook();
  if (tab==='patterns')  rPats();
  if (tab==='dreams')    rDrms();
  if (tab==='spiritual') rSpi();
  if (tab==='graph')     rGraph();
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
  if (id==='ov-add')      { STATE.addMedia = []; rAddMedia(); }
}
// Сборка мусора медиа: удаляем из IndexedDB картинки, на которые никто
// не ссылается (после удаления инсайтов / брошенных черновиков).
async function gcMedia() {
  try {
    const ref = new Set(STATE.addMedia || []);
    (DB.insights || []).forEach(i => (i.media || []).forEach(m => ref.add(m)));
    const db = await idbOpen();
    const keys = await new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, 'readonly'); const rq = tx.objectStore(IDB_STORE).getAllKeys(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    for (const k of keys) if (!ref.has(k)) await idbDel(k).catch(() => {});
  } catch (e) { /* IndexedDB недоступен — не критично */ }
}
function closeOv(id) {
  $(id).classList.remove('on');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
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
  rStateHero(); rAmbient('home-ambient'); rSmartInsights('home-smart'); rHeatmap('home-heatmap', 90); rGraph('home-graph', 190, true);
  rPrompts();
  rOnThisDay();
  rHIns();
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
function smartNudge() {
  const today = todayKey();
  if (localStorage.getItem('arch5_nudge_dismiss') === today) return null;
  const v = DB.vit, hour = new Date().getHours();
  // 1. Не отмечен день (после полудня)
  if ((!v || !v.ci || v.date !== today) && hour >= 11)
    return { icon:'📝', text:'Хороший момент отметить день?', cta:'Чек-ин', act:"openOv('ov-ci')" };
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
function rHState() {
  const el = $('h-st'); const v = DB.vit;
  if (!v.ci) { el.textContent='check-in не выполнен'; el.style.color='var(--t3)'; return; }
  const avg = (v.cl + v.mv + (10 - v.st)) / 3;
  const lbl = avg>=8?'заряжен':avg>=6?'нейтрально':avg>=4?'пусто':'тяжело';
  el.textContent = lbl;
  el.style.color = avg>=8?'var(--green)':avg>=6?'var(--blue-t)':'var(--orange)';
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
  el.innerHTML = list.map(iRow).join('');
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
function saveIns() {
  const tx = $('add-tx').value.trim();
  if (!tx) { toast('Введи текст инсайта', 'warn'); return; }
  const src = $('add-src').value.trim();
  DB.insights.unshift({
    id: Date.now(), tag: STATE.addTag, w: STATE.addW,
    title: tx.slice(0,80)+(tx.length>80?'…':''), body: tx,
    date: dateRU(), createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION,
    src: src||'Вручную', links: extractLinks(tx), media: STATE.addMedia || [],
  });
  STATE.addMedia = []; const am = $('add-media'); if (am) am.innerHTML = '';
  $('add-tx').value=''; $('add-src').value='';
  closeOv('ov-add'); persist(); rIns(); rHIns(); rKPIs(); detectPatterns();
  hptMed(); toast('Инсайт сохранён', 'ok');
  const same = DB.insights.filter(i=>i.tag===STATE.addTag).length;
  if (same>=3 && STATE.addTag!=='pattern') toast(`${same} инсайта «${TL[STATE.addTag]}» — рассмотри как паттерн`);
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
  ins.title = tx.slice(0,80)+(tx.length>80?'…':'');
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
  // мысль ↔ мысль: ручные [[ссылки]] + автосвязи по темам
  ins.forEach(a => (a.links || []).forEach(l => { const b = ins.find(x => x.id !== a.id && matchLink(l, x)); if (b) { addIns(a); addIns(b); addEdge(iK(a.id), iK(b.id)); } }));
  ins.forEach(a => relatedByTheme(a, 4).forEach(r => { addIns(a); addIns(r.ins); addEdge(iK(a.id), iK(r.ins.id)); }));
  // мысль ↔ сфера: текст записи задевает тему сферы
  sph.forEach(s => {
    const skw = new Set(keywords(s.name)); if (!skw.size) return;
    ins.forEach(i => { if (keywords((i.title||'') + ' ' + (i.body||'')).some(w => skw.has(w))) { addSph(s); addIns(i); addEdge(sK(s.id), iK(i.id)); } });
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
// Детерминированная силовая раскладка (Fruchterman–Reingold, фикс. число шагов).
function layoutGraph(nodes, edges, W, H) {
  const n = nodes.length; if (!n) return;
  const cx = W/2, cy = H/2, R = Math.min(W, H)/2 - 34;
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2;
    nd.x = cx + Math.cos(a) * R * 0.7;
    nd.y = cy + Math.sin(a) * R * 0.7;
    nd.vx = 0; nd.vy = 0;
  });
  const byId = {}; nodes.forEach(nd => byId[nd.key] = nd);
  const k = Math.max(38, R / Math.sqrt(n));       // идеальная длина ребра
  const ITER = 220;
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
      nd.vx += (cx - nd.x) * 0.03; nd.vy += (cy - nd.y) * 0.03;  // к центру
      const vm = Math.hypot(nd.vx, nd.vy) || 0.01;
      const step = Math.min(vm, k) * t;
      nd.x += (nd.vx / vm) * step; nd.y += (nd.vy / vm) * step;
      nd.vx *= 0.5; nd.vy *= 0.5;
      nd.x = Math.max(28, Math.min(W-28, nd.x));
      nd.y = Math.max(24, Math.min(H-30, nd.y));
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
  layoutGraph(nodes, edges, W, H);
  const byId = {}; nodes.forEach(nd => byId[nd.key] = nd);
  const lines = edges.map(e => {
    const A = byId[e.a], B = byId[e.b];
    return `<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" class="gedge"/>`;
  }).join('');
  const circ = nodes.map(nd => {
    const r = 6 + Math.min(nd.deg, 6) * 2;
    const short = nd.title.length > 16 ? nd.title.slice(0, 15) + '…' : nd.title;
    const label = compact ? '' : `<text x="${nd.x.toFixed(1)}" y="${(nd.y + r + 11).toFixed(1)}" class="glbl">${esc(short)}</text>`;
    const click = nd.type === 'sphere' ? `openSphereLog(${nd.eid})` : `showDet(${nd.eid})`;
    // сферы — скруглённый квадрат (узел жизни), мысли — круг
    const shape = nd.type === 'sphere'
      ? `<rect x="${(nd.x-r).toFixed(1)}" y="${(nd.y-r).toFixed(1)}" width="${(r*2)}" height="${(r*2)}" rx="${(r*0.5).toFixed(1)}" fill="${nd.color}"/>`
      : `<circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="${r}" fill="${nd.color}"/>`;
    return `<g class="gnode" onclick="event.stopPropagation();${click}">${shape}${label}</g>`;
  }).join('');
  const nIns = nodes.filter(n => n.type === 'insight').length, nSph = nodes.filter(n => n.type === 'sphere').length;
  const meta = [nIns ? nIns + ' ' + pl(nIns,'мысль','мысли','мыслей') : '', nSph ? nSph + ' ' + pl(nSph,'сфера','сферы','сфер') : '']
    .filter(Boolean).join(' + ') + ` · ${edges.length} ${pl(edges.length,'связь','связи','связей')}` + (compact ? ' · открыть карту →' : '');
  el.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="graph-svg" preserveAspectRatio="xMidYMid meet">${lines}${circ}</svg>` +
    `<div class="graph-meta">${meta}</div>`;
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
function keywords(text) {
  return [...new Set(String(text || '').toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ')
    .split(/\s+/).filter(w => w.length >= 4 && !RU_STOP.has(w)).map(stemRu).filter(w => w.length >= 3))];
}
function relatedByTheme(ins, limit) {
  const mine = new Set(keywords((ins.title || '') + ' ' + (ins.body || '')));
  if (mine.size < 2) return [];
  return (DB.insights || []).filter(x => x.id !== ins.id).map(x => {
    const kw = keywords((x.title || '') + ' ' + (x.body || ''));
    let overlap = 0; kw.forEach(w => { if (mine.has(w)) overlap++; });
    return { ins: x, overlap };
  }).filter(s => s.overlap >= 2).sort((a, b) => b.overlap - a.overlap).slice(0, limit || 5);
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
        const s = stemRu(w); if (s.length < 3) return;
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
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 320 });
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
    act: STATE.ciAct, tone: STATE.ciTone, emo: STATE.ciEmo || '', note: $('ci-note').value, ci: true, date: todayKey(),
    createdAt: nowISO(), day: todayKey(), sv: SCHEMA_VERSION, _u: Date.now(),
  };
  DB.vit = v;
  const existing = DB.checkins.findIndex(c=>c.date===v.date);
  const ci = {...v, id: existing>=0 ? DB.checkins[existing].id : Date.now()};
  if (existing>=0) DB.checkins[existing] = ci; else DB.checkins.push(ci);
  closeOv('ov-ci'); persist(); rVit(); rCompass(); rHState(); rStreak();
  const avg = (v.cl + v.mv + (10-v.st)) / 3;
  if (avg < 5) toast('Состояние ниже 5 — восстановление в приоритете', 'warn');
  else { hptMed(); toast('Check-in сохранён', 'ok'); }
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
    b.innerHTML = `<div class="f-lbl">Балл сегодня (0–10)</div>
      <input class="field" id="sph-log-val" type="number" min="0" max="10" inputmode="decimal" value="${cur}" placeholder="7">
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
function rDig() {
  const el = $('dg-list');
  if (!DB.digests.length) {
    el.innerHTML = `<div class="empty"><div class="em-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:26px;height:26px;color:var(--t3)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="em-t">Дайджеста пока нет</div><div class="em-d">Нажми «Сформировать» — соберу сводку недели из твоих данных</div></div>`;
    return;
  }
  el.innerHTML = DB.digests.map(d => {
    // Новый формат (с top/stateAvg) или старый (week/h/cnt/themes)
    if (d.top !== undefined) {
      const arrow = d.stateDelta == null ? '' : d.stateDelta > 0 ? `<span style="color:var(--green)">▲ +${d.stateDelta}</span>` : d.stateDelta < 0 ? `<span style="color:var(--orange)">▼ ${d.stateDelta}</span>` : '<span style="color:var(--t3)">≈</span>';
      return `<div class="dg">
        <div class="dg-w">${esc(d.week)}</div>
        <div class="dg-h">Итоги недели</div>
        <div class="dg-stats">
          <div class="dg-stat"><b>${d.cnt}</b><span>инсайтов</span></div>
          <div class="dg-stat"><b>${d.adherence}/7</b><span>чек-инов</span></div>
          <div class="dg-stat"><b>${d.stateAvg ?? '—'}</b><span>состояние ${arrow}</span></div>
          <div class="dg-stat"><b>${d.dreams}</b><span>снов</span></div>
        </div>
        ${d.ai ? `<div class="dg-ai"><div class="dg-ai-badge">✨ AI-обзор</div>${esc(d.ai)}</div>` : ''}
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
  const top = [...(insW.length ? insW : DB.insights)]
    .sort((a,b) => (b.w||1)-(a.w||1)).slice(0,3)
    .map(i => ({ title: i.title, tag: i.tag }));
  const ciW = DB.checkins.filter(c => c.date >  dayAgo(7));
  const ciP = DB.checkins.filter(c => c.date <= dayAgo(7) && c.date > dayAgo(14));
  const aW = checkinAvg(ciW), aP = checkinAvg(ciP);
  const stateDelta = (aW && aP) ? +(aW.comp - aP.comp).toFixed(1) : null;
  const counts = {}; insW.forEach(i => counts[i.tag] = (counts[i.tag]||0)+1);
  const themes = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t])=>TL[t]||t);
  const dreams = DB.dreams.filter(d => wk(d.createdAt)).length;
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const d0 = new Date(now-6*864e5), d1 = new Date(now);
  const week = `${d0.getDate()} ${M[d0.getMonth()]} – ${d1.getDate()} ${M[d1.getMonth()]}`;
  DB.digests.unshift({
    id: now, createdAt: nowISO(), sv: SCHEMA_VERSION, week,
    cnt: insW.length, adherence: ciW.length,
    stateAvg: aW ? +aW.comp.toFixed(1) : null, stateDelta,
    dreams, patterns: DB.patterns.length, themes, top,
  });
  persist(); rDig(); hptMed(); toast('Дайджест готов', 'ok');
}

// ─── КОНФИГ ──────────────────────────────────────────────────────
function rCfgForm() {
  const ni = $('cfg-name');   if(ni) ni.value = CFG.userName||'';
  const di = $('cfg-domain'); if(di) di.value = CFG.domainLabel||'Книга';
  const ai = $('cfg-api');    if(ai) ai.value = CFG.apiUrl||'';
  const ki = $('cfg-space');  if(ki) ki.value = CFG.spaceKey||'';
  const ls = $('cfg-lastsync');
  if (ls) ls.textContent = CFG.lastSync ? 'Последняя синхронизация: '+new Date(CFG.lastSync).toLocaleString('ru') : 'Ещё не синхронизировано';
  const pi = $('cfg-pass'); if (pi) pi.value = getPass();
  updateEncStatus();
  const ak = $('cfg-aikey');   if (ak) ak.value = getAiKey();
  const am = $('cfg-aimodel'); if (am) am.value = CFG.aiModel || AI_MODEL_DEFAULT;
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
function saveCfg() {
  CFG.userName    = $('cfg-name')?.value.trim()||CFG.userName;
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

// ─── ШИФРОВАНИЕ (AES-GCM, ключ из парольной фразы) ───────────────
const _te = new TextEncoder(), _td = new TextDecoder();
const _b64  = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const _ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function getPass() { try { return localStorage.getItem(passKey(activeId())) || ''; } catch(e) { return ''; } }
function setPass(p) { const id = activeId(); try { p ? localStorage.setItem(passKey(id), p) : localStorage.removeItem(passKey(id)); } catch(e) {} }
async function _deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', _te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
}
async function encryptPayload(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await _deriveKey(pass, salt);
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, _te.encode(JSON.stringify(obj)));
  return { _enc:'v1', salt:_b64(salt), iv:_b64(iv), ct:_b64(ct) };
}
async function decryptPayload(blob, pass) {
  const key = await _deriveKey(pass, _ub64(blob.salt));
  const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv:_ub64(blob.iv) }, key, _ub64(blob.ct));
  return JSON.parse(_td.decode(pt));
}

// ─── ВЕРСИИ ЗАПИСЕЙ + СЛИЯНИЕ ────────────────────────────────────
// Каждая правка помечает запись меткой времени `_u`; удаление кладёт
// «надгробие» в DB._del. Слияние — union по id, где новейшая метка
// побеждает, а надгробие удаляет запись на всех устройствах.
const IDCOLS = ['insights','dreams','patterns','evolution','spiritual','checkins','bots','digests','spheres','sphereLogs'];
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
  ['vit','chapters','oq'].forEach(k => { if (scal[k] !== undefined) out[k] = scal[k]; });
  out.__ts = Math.max(local.__ts || 0, remote.__ts || 0);
  return out;
}

// ─── УПАКОВКА / РАСПАКОВКА (с учётом шифрования) ─────────────────
async function packPayload() {
  const bundle = { db: DB, cfg: CFG };
  const pass = getPass();
  if (pass) {
    const blob = await encryptPayload(bundle, pass);
    return { db: blob, cfg: { _enc: 'v1' } };
  }
  return { db: DB, cfg: CFG };
}
async function unpackServer(server) {
  const sdb = server.db || {}, scfg = server.cfg || {};
  if (sdb._enc === 'v1' || scfg._enc === 'v1') {
    const pass = getPass();
    if (!pass) { const e = new Error('Нужна парольная фраза для расшифровки'); e.needPass = true; throw e; }
    let bundle;
    try { bundle = await decryptPayload(sdb, pass); }
    catch (err) { const e = new Error('Неверная парольная фраза'); e.needPass = true; throw e; }
    return { db: bundle.db || {}, cfg: bundle.cfg || {} };
  }
  return { db: sdb, cfg: scfg };
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
  const on = !!getPass();
  el.textContent = on ? '🔒 Данные шифруются перед отправкой' : 'Без шифрования — данные хранятся как есть';
  el.style.color = on ? 'var(--green)' : 'var(--t3)';
}

// ═════════════════════════════════════════════════════════════════
//  AI (Claude API напрямую с клиента — плейнтекст не идёт через наш
//  сервер; ключ хранится локально в профиле, opt-in).
// ═════════════════════════════════════════════════════════════════
const AI_MODEL_DEFAULT = 'claude-opus-4-8';
const aiKeyName = () => 'arch5_aikey_' + activeId();
function getAiKey() { try { return localStorage.getItem(aiKeyName()) || ''; } catch(e) { return ''; } }
function setAiKey(k) { try { k ? localStorage.setItem(aiKeyName(), k) : localStorage.removeItem(aiKeyName()); } catch(e) {} }

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
      user: draft, maxTokens: 120,
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
async function callClaude({ system, user, maxTokens = 1024, schema = null }) {
  const key = getAiKey();
  if (!key) { const e = new Error('Не задан API-ключ Anthropic'); e.noKey = true; throw e; }
  const body = {
    model: (CFG.aiModel || AI_MODEL_DEFAULT),
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) body.system = system;
  if (schema) body.output_config = { format: { type: 'json_schema', schema } };
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
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  log('info', 'Claude ✓ ' + (data.usage ? data.usage.output_tokens : 0) + ' ток.');
  return text;
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
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 700 });
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
    const text = await callClaude({ system: AI_SYSTEM, user, maxTokens: 400, schema });
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
function saveAiCfg() {
  const k = $('cfg-aikey')?.value.trim() || '';
  setAiKey(k);
  CFG.aiModel = $('cfg-aimodel')?.value.trim() || AI_MODEL_DEFAULT;
  persist();
  updateAiStatus();
  toast(k ? 'AI подключён' : 'AI-ключ убран', 'ok');
}
function updateAiStatus() {
  const el = $('cfg-ai-status'); if (!el) return;
  const on = !!getAiKey();
  el.textContent = on ? '✨ AI подключён · ' + (CFG.aiModel || AI_MODEL_DEFAULT) : 'AI выключен — вставь ключ Anthropic';
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
  fetch(API+'/health').then(r => {
    if(r.ok) { if(el) el.textContent = CFG.spaceKey ? 'Подключён ✓' : 'Готов — нажми Синк'; }
    else { if(el) el.textContent='Ошибка'; }
  }).catch(() => { if(el) el.textContent='Недоступен'; });
}

// ─── УМНЫЕ ТРИГГЕРЫ ──────────────────────────────────────────────
function smartTriggers() {
  // Напоминание о check-in если не сделан сегодня
  if (!DB.vit.ci || DB.vit.date !== todayKey()) {
    const now = new Date();
    if (now.getHours() >= 12) {
      setTimeout(() => toast('Check-in не выполнен сегодня', 'warn'), 3000);
    }
  }
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
}

document.addEventListener('DOMContentLoaded', () => {
  hydrate();
  checkOnboard();
  initSplash();
  initAll();
});
