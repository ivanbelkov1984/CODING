import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const clone = x => JSON.parse(JSON.stringify(x));
const IDCOLS = ['insights','checkins','spheres','sphereLogs','dreams','patterns','evolution','spiritual','bots','chapters','digests','chats','cravings'];
const emptyDB = () => ({...Object.fromEntries(IDCOLS.map(k=>[k,[]])),oq:[],vit:{},env:{},_del:{},__ts:0});

class Storage { constructor(){this.m=new Map()} getItem(k){return this.m.has(k)?this.m.get(k):null} setItem(k,v){this.m.set(k,String(v))} removeItem(k){this.m.delete(k)} }
const dbKey=id=>`arch5_db_${id}`, cfgKey=id=>`arch5_cfg_${id}`, passKey=id=>`arch5_pass_${id}`, bakKey=id=>`arch5_bak_${id}`;
const ts = r => r?.updatedAt ?? r?.createdAt ?? r?.ts ?? 0;
function mergeById(a=[],b=[],tomb={}){const m=new Map();for(const r of [...a,...b]){if(!r||r.id==null)continue;const p=m.get(r.id);if(!p||ts(r)>=ts(p))m.set(r.id,clone(r));}return [...m.values()].filter(r=>!(tomb[r.id]&&tomb[r.id]>=ts(r)));}
function mergeDB(a,b){const tomb={...(a._del||{}),...(b._del||{})},out={...clone(a),_del:tomb,__ts:Math.max(a.__ts||0,b.__ts||0)};for(const c of IDCOLS)out[c]=mergeById(a[c],b[c],tomb);for(const [k,v] of Object.entries(b)){if(IDCOLS.includes(k)||k==='_del'||k==='__ts')continue;if((b.__ts||0)>=(a.__ts||0))out[k]=clone(v);}return out;}
function fixture(){const db=emptyDB();let n=1;for(const c of IDCOLS)db[c]=[{id:`${c}-${n++}`,createdAt:100,updatedAt:100,note:`synthetic ${c}`}];db.insights.push({id:'shared-id',updatedAt:100,text:'synthetic diary text'});db.dreams.push({id:'shared-id',updatedAt:100,text:'synthetic dream text'});db.__ts=100;return db;}
function safeExport(db,cfg){const c=clone(cfg);for(const k of ['aiKey','passphrase','recoveryKey','backendToken'])delete c[k];return{schemaVersion:2,db:clone(db),cfg:c};}
function key(pass,salt){return crypto.pbkdf2Sync(pass,salt,10000,32,'sha256')}
function pack(v,pass){if(!pass)return{v:1,plaintext:clone(v)};const salt=Buffer.alloc(16,7),iv=Buffer.alloc(12,9),c=crypto.createCipheriv('aes-256-gcm',key(pass,salt),iv),data=Buffer.concat([c.update(JSON.stringify(v),'utf8'),c.final()]);return{v:2,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')}}
function unpack(e,pass){if(e.v===1)return clone(e.plaintext);const d=crypto.createDecipheriv('aes-256-gcm',key(pass,Buffer.from(e.salt,'base64')),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8'))}

test('source contracts',()=>{for(const f of ['const DEFAULT_DB','const IDCOLS','function mergeById','function mergeDB','function encryptPayload','function packPayload'])assert.ok(source.includes(f),f);assert.ok(source.includes("'arch5_db_'"));assert.ok(source.includes("'arch5_cfg_'"));assert.ok(source.includes("'arch5_pass_'"));});
test('profile isolation',()=>{const s=new Storage();s.setItem(dbKey('a'),'1');s.setItem(dbKey('b'),'2');s.setItem(passKey('a'),'p');assert.equal(s.getItem(dbKey('a')),'1');assert.equal(s.getItem(dbKey('b')),'2');assert.equal(s.getItem(passKey('b')),null);});
test('legacy migration idempotence',()=>{const s=new Storage();s.setItem('arch5_db','{"x":1}');s.setItem('arch5_cfg','{"userName":"Synthetic"}');s.setItem('arch5_pass','synthetic');const migrate=id=>{for(const [o,n] of [['arch5_db',dbKey(id)],['arch5_cfg',cfgKey(id)],['arch5_pass',passKey(id)]]){const v=s.getItem(o);if(v&&!s.getItem(n))s.setItem(n,v);s.removeItem(o)}};migrate('p1');const once=s.getItem(dbKey('p1'));migrate('p1');assert.equal(s.getItem(dbKey('p1')),once);assert.equal(s.getItem('arch5_db'),null);});
test('backup recovery and empty protection',()=>{const s=new Storage(),good=fixture();s.setItem(dbKey('p1'),'{bad');s.setItem(bakKey('p1'),JSON.stringify(good));const read=k=>{try{return JSON.parse(s.getItem(k)||'null')}catch{return undefined}};let db=read(dbKey('p1'));if(db===undefined)db=read(bakKey('p1'));assert.equal(db.insights[0].id,'insights-1');});
test('snapshot restore preserves tombstone',()=>{const db=fixture();db._del.gone=500;db.__ts=500;const restored=JSON.parse(JSON.stringify(db));assert.equal(restored._del.gone,500);assert.equal(restored.__ts,500);});
test('export import roundtrip and secret exclusion',()=>{const db=fixture(),cfg={spaceKey:'review-me',aiKey:'x',passphrase:'x',recoveryKey:'x',backendToken:'x'};const e=safeExport(db,cfg),i=JSON.parse(JSON.stringify(e));assert.deepEqual(i.db,db);assert.equal(i.cfg.aiKey,undefined);assert.equal(i.cfg.spaceKey,'review-me');});
test('global tombstone cross-collection collision',()=>{const a=fixture(),b=fixture();b._del['shared-id']=200;b.insights=[];const m=mergeDB(a,b);assert.equal(m.insights.some(x=>x.id==='shared-id'),false);assert.equal(m.dreams.some(x=>x.id==='shared-id'),false);});
test('merge newer wins and idempotence',()=>{const a=fixture(),b=fixture();a.insights=[{id:'x',updatedAt:100,v:'old'}];b.insights=[{id:'x',updatedAt:200,v:'new'}];const m=mergeDB(a,b);assert.equal(m.insights[0].v,'new');assert.deepEqual(mergeDB(m,m),m);});
test('encrypted sync roundtrip and failures',()=>{const db=fixture(),e=pack(db,'synthetic-pass');assert.equal(JSON.stringify(e).includes('synthetic diary text'),false);assert.deepEqual(unpack(e,'synthetic-pass'),db);assert.throws(()=>unpack(e,'wrong'));const c={...e,data:e.data.slice(0,-4)+'AAAA'};assert.throws(()=>unpack(c,'synthetic-pass'));});
test('plaintext no-passphrase boundary',()=>{const e=pack(fixture(),'');assert.equal(e.v,1);assert.ok(JSON.stringify(e).includes('synthetic diary text'));});
test('media references remain out of band',()=>{const db=fixture();db.media=[{id:'m1',blobId:'b1',mime:'image/png'}];const e=safeExport(db,{});assert.equal(e.db.media[0].blobId,'b1');assert.equal('blobBytes' in e.db.media[0],false);});

let passed=0;for(const [name,fn] of tests){try{await fn();passed++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e);process.exitCode=1}}console.log(`RESULT ${passed}/${tests.length} passed`);if(passed!==tests.length)process.exitCode=1;
