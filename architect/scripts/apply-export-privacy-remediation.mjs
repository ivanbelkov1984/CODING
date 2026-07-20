import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../app.js', import.meta.url);
let source = await readFile(file, 'utf8');
if (source.includes("exportPolicy:'portable-no-connection-secrets'")) {
  console.log('export privacy remediation already applied');
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before), last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`missing patch anchor: ${label}`);
  if (first !== last) throw new Error(`non-unique patch anchor: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
`// ─── ЭКСПОРТ / ИМПОРТ ────────────────────────────────────────────
function exportData() {
  const b = new Blob([JSON.stringify({exportedAt:new Date().toISOString(), db:DB, cfg:CFG}, null, 2)], {type:'application/json'});`,
`// ─── ЭКСПОРТ / ИМПОРТ ────────────────────────────────────────────
// Обычный переносимый экспорт содержит пользовательские настройки, но не
// параметры подключения конкретного устройства. Ключ пространства, URL
// синк-сервера и служебные метки остаются локальными и не попадают в файл.
function exportSafeCfg(cfg = CFG) {
  const { spaceKey, apiUrl, lastSync, _ts, ...portable } = cfg || {};
  return portable;
}
function exportData() {
  const payload = {exportVersion:2, exportPolicy:'portable-no-connection-secrets', exportedAt:new Date().toISOString(), db:DB, cfg:exportSafeCfg(CFG)};
  const b = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});`,
'portable export payload');

replaceOnce(
`      if (data.db)  DB  = {...DEFAULT_DB,  ...data.db};
      if (data.cfg) CFG = {...DEFAULT_CFG, ...data.cfg, axes:{...DEFAULT_CFG.axes,...(data.cfg.axes||{})}};`,
`      if (data.db)  DB  = {...DEFAULT_DB,  ...data.db};
      if (data.cfg) {
        // Импорт не имеет права менять локальное подключение, даже если это
        // старый экспорт, где поля ещё присутствовали.
        const localConnection = {apiUrl:CFG.apiUrl || '', spaceKey:CFG.spaceKey || '', lastSync:CFG.lastSync || ''};
        const {spaceKey:_fileSpaceKey, apiUrl:_fileApiUrl, lastSync:_fileLastSync, _ts:_fileTs, ...portableCfg} = data.cfg;
        CFG = {...DEFAULT_CFG, ...portableCfg, axes:{...DEFAULT_CFG.axes,...(portableCfg.axes||{})}, ...localConnection};
      }`,
'safe config import');

await writeFile(file, source);
console.log('applied portable export privacy remediation');
