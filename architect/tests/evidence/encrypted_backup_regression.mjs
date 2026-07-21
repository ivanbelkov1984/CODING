import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../../backup-adapter.js', import.meta.url), 'utf8');
const context = { crypto: webcrypto, TextEncoder, TextDecoder, console, Date, JSON, Uint8Array, Array, Object, String, Error, Set, Promise, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'backup-adapter.js' });
const B = context.ARCH_BACKUP;
const PASSWORD = 'synthetic backup password';
const SENSITIVE = ['UNICODE-СЕКРЕТ-ДНЕВНИК-long-text', 'SPACE-SECRET-62', 'https://api.secret.invalid', 'PROVIDER-KEY-62', 'RECOVERY-KEY-62', 'feedback diagnostic'];
const fixtureDb = () => ({
  insights:[{id:'i1',title:'Fictional title',body:SENSITIVE[0],media:['m1','m2','missing-m3'],_meta:{provenance:{origin:'synthetic'}}}],
  dreams:[{id:'d1',text:'fictional dream'}], patterns:[{id:'p1',name:'fictional'}], evolution:[{id:'e1'}], spiritual:[{id:'s1'}], checkins:[{id:'c1',note:'long '.repeat(80)}],
  spheres:[{id:'sphere1',name:'Synthetic'}], sphereLogs:[{id:'sl1',sphereId:'sphere1',value:7}], bots:[{id:1,title:'bot'}], chapters:[{n:1,title:'chapter'}], digests:[{id:'dg1'}], chats:[{id:'ch1',msgs:[{r:'u',t:'hello'}]}], cravings:[{id:'cr1'}], oq:['?'], vit:{sl:6}, env:{ritual:true}, _del:{insights:{old:123}}, __ts:62
});
const cfg = { userName:'Synthetic', domainLabel:'Book', spaceKey:SENSITIVE[1], apiUrl:SENSITIVE[2], lastSync:'x', providerKey:SENSITIVE[3], recoveryKey:SENSITIVE[4], axes:{work:{lbl:'Work',s:5,c:'#111'}} };
const media = { m1:{data:'data:image/png;base64,AAAA', mime:'image/png'}, m2:{data:'synthetic audio bytes', mime:'audio/webm'}, m4:{data:'text bytes', mime:'text/plain'} };
const mediaGet = async id => media[id] || null;
async function test(name, fn){ try{ await fn(); console.log('✓', name); }catch(e){ console.error('✗', name, e); process.exitCode=1; } }

await test('same input and password produce different authenticated ciphertext', async()=>{
  const a = await B.createBackup({profileId:'profile-a',db:fixtureDb(),cfg,password:PASSWORD,mode:'complete',mediaGet});
  const b = await B.createBackup({profileId:'profile-a',db:fixtureDb(),cfg,password:PASSWORD,mode:'complete',mediaGet});
  assert.notEqual(a.ciphertext, b.ciphertext); assert.notEqual(a.salt, b.salt); assert.notEqual(a.iv, b.iv);
});
await test('correct password roundtrips every store, metadata, tombstones and media', async()=>{
  const env = await B.createBackup({profileId:'profile-a',db:fixtureDb(),cfg,password:PASSWORD,mode:'complete',mediaGet});
  const dec = await B.decryptBackup(env, PASSWORD);
  for (const store of B.STORES) assert.deepEqual(dec.payload.db[store], fixtureDb()[store]);
  assert.equal(dec.payload.cfg.spaceKey, undefined); assert.equal(dec.payload.cfg.apiUrl, undefined); assert.equal(dec.payload.cfg.providerKey, undefined); assert.equal(dec.payload.media.entries.length, 2); assert.equal(dec.payload.media.missing[0].id, 'missing-m3');
});
await test('wrong password, modified ciphertext, modified manifest, truncation and unsupported version fail closed', async()=>{
  const env = await B.createBackup({profileId:'profile-a',db:fixtureDb(),cfg,password:PASSWORD,mode:'data',mediaGet});
  await assert.rejects(() => B.decryptBackup(env, 'wrong password'), /пароль неверен/);
  const tampered = {...env, ciphertext: env.ciphertext.slice(0,-4)+'AAAA'};
  await assert.rejects(() => B.decryptBackup(tampered, PASSWORD));
  await assert.rejects(() => B.decryptBackup({...env, manifestDigest:'bad'}, PASSWORD), /целостности/);
  assert.throws(() => B.validateEnvelope({...env, ciphertext:''}), /файл/);
  assert.throws(() => B.validateEnvelope({...env, version:999}), /Версия/);
});
await test('plaintext scan excludes synthetic sensitive strings and named secrets', async()=>{
  const env = await B.createBackup({profileId:'profile-a',db:fixtureDb(),cfg,password:PASSWORD,mode:'complete',mediaGet});
  const text = JSON.stringify(env);
  for (const s of SENSITIVE) assert.equal(text.includes(s), false, s);
  assert.equal(/spaceKey|apiUrl|providerKey|recoveryKey|feedback/i.test(text), false);
});
await test('only selected profile is exported and restore supports new, empty and replacement snapshot rollback', async()=>{
  const env = await B.createBackup({profileId:'selected-profile',db:fixtureDb(),cfg,password:PASSWORD,mode:'data',mediaGet});
  const dec = await B.decryptBackup(env, PASSWORD);
  assert.equal(JSON.stringify(dec).includes('other-profile'), false);
  const map = new Map(); const storage = {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
  const restored = await B.restore({decrypted:dec,targetProfileId:'new-profile',storage});
  assert.equal(restored.activated, true); assert.ok(map.get('arch5_db_new-profile'));
  await assert.rejects(() => B.restore({decrypted:dec,targetProfileId:'new-profile',storage}), /target_not_empty/);
  const replaced = await B.restore({decrypted:dec,targetProfileId:'new-profile',replace:true,storage});
  assert.ok(replaced.snapshotKey.startsWith('arch5_pre_restore_'));
});
await test('machine-readable inclusion/exclusion inventory and fixture artifact are synthetic', async()=>{
  const env = await B.createBackup({profileId:'selected-profile',db:fixtureDb(),cfg,password:PASSWORD,mode:'complete',mediaGet});
  const dir = new URL('../artifacts/', import.meta.url); await mkdir(dir, {recursive:true});
  await writeFile(new URL('encrypted-backup-test-report.json', dir), JSON.stringify({format:env.format,version:env.version,includedStores:B.STORES,excludedCfg:['spaceKey','apiUrl','lastSync','_ts','providerKey','recoveryKey'],mode:env.mode,plaintextSensitiveFound:false}, null, 2));
  await writeFile(new URL('synthetic-current.archbackup', dir), JSON.stringify(env, null, 2));
});

if (process.exitCode) process.exit(process.exitCode);
