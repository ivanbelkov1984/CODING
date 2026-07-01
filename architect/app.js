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

// ─── КОНФИГУРАЦИЯ ПО УМОЛЧАНИЮ ──────────────────────────────────
const DEFAULT_CFG = {
  userName: '',
  domainLabel: 'Книга',
  apiUrl: '',
  spaceKey: '',
  lastSync: '',
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

// ─── PERSIST / HYDRATE ──────────────────────────────────────────
// persistLocal — «тихая» запись в localStorage (без авто-синка),
// используется движком синхронизации, чтобы не зациклиться.
function persistLocal() {
  try {
    localStorage.setItem('arch5_db',  JSON.stringify(DB));
    localStorage.setItem('arch5_cfg', JSON.stringify(CFG));
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
function hydrate() {
  try {
    const db  = JSON.parse(localStorage.getItem('arch5_db')  || 'null');
    const cfg = JSON.parse(localStorage.getItem('arch5_cfg') || 'null');
    if (db)  DB  = {...DEFAULT_DB,  ...db};
    if (cfg) CFG = {...DEFAULT_CFG, ...cfg, axes: {...DEFAULT_CFG.axes, ...(cfg.axes||{})}};
  } catch(e) {}
}

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
  persist();
  closeOv('ov-onboard');
  updateDomainLabel();
  toast('Добро пожаловать, ' + name + '!', 'ok');
}
function updateDomainLabel() {
  const lbl = CFG.domainLabel || 'Книга';
  const el = $('tab-book-lbl');
  if (el) el.textContent = lbl;
  const bl = $('book-lbl');
  if (bl) bl.textContent = 'Главы · ' + lbl;
}

// ─── НАВИГАЦИЯ ───────────────────────────────────────────────────
const TITLES = {home:'Архитектор', insights:'Инсайты', book:CFG.domainLabel||'Книга', vit:'Жизнь', sys:'Система', map:'Карта'};
function goTo(tab, el) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  const pg = $('pg-'+tab);
  if (pg) pg.classList.add('on');
  const nb = $('nt-'+tab) || el;
  if (nb) nb.classList.add('on');
  $('ptitle').textContent = tab==='book' ? (CFG.domainLabel||'Книга') : (TITLES[tab]||tab);
  hpt();
  if (tab==='vit') rVit();
  if (tab==='sys') rDig();
  if (tab==='book') rBook();
}
function msub(tab, el) {
  document.querySelectorAll('[id^="ms-"]').forEach(t => t.style.display='none');
  document.querySelectorAll('#subnav .snpill').forEach(p => p.classList.remove('on'));
  const t = $('ms-'+tab);
  if (t) t.style.display = 'block';
  if (el) el.classList.add('on');
  hpt();
  if (tab==='evolution') rEvoList($('evo-more'));
  if (tab==='patterns')  rPats();
  if (tab==='dreams')    rDrms();
  if (tab==='spiritual') rSpi();
  if (tab==='settings')  rCfgAxes();
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
function rStreak() {
  const el = $('h-streak-wrap');
  if (!el) return;
  const s = calcStreak();
  if (s < 2) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="h-streak">
    <span class="h-streak-n">${s}</span>
    <span class="h-streak-l">дней подряд 🔥</span>
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
  $('h-oq').innerHTML = DB.oq.map(q =>
    `<div class="oqrow"><div class="oqpulse"></div><span>${esc(q)}</span></div>`
  ).join('');
  rHIns();
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
  if (rc>0) { b.style.display='flex'; b.textContent=rc; } else b.style.display='none';
}

// ─── ИНСАЙТ ROW ──────────────────────────────────────────────────
function iRow(ins) {
  const stripe = SC[ins.tag] || 'var(--bd2)';
  return `<div class="ins-wrap">
    <div class="ins-del-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></div>
    <div class="ins-row" id="ir-${ins.id}" onclick="showDet(${ins.id})">
      <div class="ins-stripe" style="background:${stripe}"></div>
      <div class="ins-body">
        <div class="ins-meta"><span class="tag ${TC[ins.tag]||'tg-personal'}">${TL[ins.tag]||ins.tag}</span><span class="pips">${pips(ins.w||1)}</span><span class="ins-date">${ins.date}</span></div>
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
function saveIns() {
  const tx = $('add-tx').value.trim();
  if (!tx) { toast('Введи текст инсайта', 'warn'); return; }
  const src = $('add-src').value.trim();
  DB.insights.unshift({
    id: Date.now(), tag: STATE.addTag, w: STATE.addW,
    title: tx.slice(0,80)+(tx.length>80?'…':''), body: tx,
    date: dateRU(), src: src||'Вручную', links: [],
  });
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
  touch(ins);
  persist(); closeOv('ov-edit'); rIns(); rHIns();
  hptMed(); toast('Инсайт обновлён', 'ok');
}
function deleteIns(id) {
  tomb(id);
  DB.insights = DB.insights.filter(x=>x.id!==id);
  persist(); rIns(); rHIns(); rKPIs(); detectPatterns();
  hptMed(); toast('Инсайт удалён');
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

// ─── ДЕТАЛИ ──────────────────────────────────────────────────────
function showDet(id) {
  const ins = DB.insights.find(x=>x.id==id);
  if (!ins) return;
  STATE.detId = ins.id;
  $('det-meta').innerHTML = `<span class="tag ${TC[ins.tag]||'tg-personal'}">${TL[ins.tag]||ins.tag}</span><span class="pips">${pips(ins.w||1)}</span><span style="font-size:var(--tx2);font-weight:500;color:var(--t3);margin-left:auto">${ins.date} · ${esc(ins.src||'')}</span>`;
  $('det-title').textContent = ins.title;
  $('det-body').textContent  = ins.body;
  $('det-links').innerHTML   = ins.links?.length ? 'Связи: '+ins.links.map(l=>`<span style="font-weight:700;color:var(--blue-t)">${l}</span>`).join(' · ') : '';
  openOv('ov-det');
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
function saveCI() {
  const v = {
    sl: parseFloat($('ci-sl').value), sq: parseInt($('ci-sq').value),
    cl: parseInt($('ci-cl').value), st: parseInt($('ci-st').value), mv: parseInt($('ci-mv').value),
    nic: $('tog-nic').classList.contains('on'),
    caf: $('tog-caf').classList.contains('on'),
    alc: $('tog-alc').classList.contains('on'),
    act: STATE.ciAct, tone: STATE.ciTone, note: $('ci-note').value, ci: true, date: todayKey(),
    _u: Date.now(),
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
  DB.dreams.unshift({id:Date.now(), date:dateFullRU(), title:tx.slice(0,52)+(tx.length>52?'…':''), body:tx, tone:STATE.drmTone, arch:arch||null});
  DB.insights.unshift({id:Date.now()+1, tag:'dream', w:1, title:'Сон: '+DB.dreams[0].title, body:tx, date:dateRU(), src:'Дневник снов', links:[]});
  $('drm-tx').value=''; $('drm-arch').value='';
  closeOv('ov-drm'); persist(); rDrms(); rIns(); rHIns(); rKPIs();
  hptMed(); toast('Сон зафиксирован', 'ok');
}
function deleteDrm(id) {
  tomb(id);
  DB.dreams = DB.dreams.filter(x=>x.id!==id);
  persist(); rDrms(); toast('Сон удалён');
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
  tomb(id);
  DB.patterns = DB.patterns.filter(x=>x.id!==id);
  persist(); rPats(); toast('Паттерн удалён');
}

// ─── ДУХОВНОЕ ────────────────────────────────────────────────────
function saveSpi() {
  const tx = $('spi-tx').value.trim();
  if (!tx) { toast('Опиши переживание', 'warn'); return; }
  DB.spiritual.unshift({id:Date.now(), type:STATE.spiType, date:dateFullRU(), text:tx});
  $('spi-tx').value='';
  closeOv('ov-spi-add'); persist(); rSpi();
  hptMed(); toast('Запись сохранена', 'ok');
}
function deleteSpi(id) {
  tomb(id);
  DB.spiritual = DB.spiritual.filter(x=>x.id!==id);
  persist(); rSpi(); toast('Запись удалена');
}

// ─── ЭВОЛЮЦИЯ ────────────────────────────────────────────────────
function saveEvo() {
  const tx = $('evo-tx').value.trim();
  if (!tx) { toast('Введи текст', 'warn'); return; }
  DB.evolution.unshift({id:Date.now(), lv:STATE.evoLv, text:tx, dt:dateFullRU()});
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
  $('bot-tasks').innerHTML = DB.bots.map(t =>
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

// ─── ДАЙДЖЕСТ ────────────────────────────────────────────────────
function rDig() {
  $('dg-list').innerHTML = DB.digests.map(d =>
    `<div class="dg">
      <div class="dg-w">${d.week}</div>
      <div class="dg-h">${esc(d.h)}</div>
      <div class="dg-meta"><div class="dg-m"><strong>${d.cnt}</strong> инсайтов</div></div>
      <div class="chips">${d.themes.map(t=>`<span class="chip">${t}</span>`).join('')}</div>
    </div>`
  ).join('');
}
async function mkDig() {
  toast('Генерируем…');
  await new Promise(r=>setTimeout(r,900));
  const now = new Date();
  const w = `${now.getDate()-6}–${now.getDate()} ${['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][now.getMonth()]} ${now.getFullYear()}`;
  DB.digests.unshift({id:Date.now(), week:w, h:'Дайджест: Архитектор v5', cnt:DB.insights.length, themes:['Vitality','Паттерны',CFG.domainLabel,'Система']});
  rDig(); toast('Дайджест готов', 'ok');
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
function getPass() { try { return localStorage.getItem('arch5_pass') || ''; } catch(e) { return ''; } }
function setPass(p) { try { p ? localStorage.setItem('arch5_pass', p) : localStorage.removeItem('arch5_pass'); } catch(e) {} }
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
const IDCOLS = ['insights','dreams','patterns','evolution','spiritual','checkins','bots','digests'];
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
  if (lastDrm) {
    const daysAgo = Math.floor((Date.now() - new Date(lastDrm.date).getTime()) / 86400000);
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
  updateDomainLabel();
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
