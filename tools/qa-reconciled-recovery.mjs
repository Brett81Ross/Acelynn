import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadLegacyCommonJs(path){
  const code=fs.readFileSync(path,'utf8');
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,globalThis:{},console,URL,TextEncoder,TextDecoder,setTimeout,clearTimeout});
  vm.runInContext(code,context,{filename:path});
  return module.exports;
}

const recovery=loadLegacyCommonJs('acelynn-recovery.js');
const bridge=loadLegacyCommonJs('legacy-export-bridge.js');
const snap=(id,score=70)=>({time:id,profile:'Balanced mix',score,focus:'Mids',bands:[20,40,80,55,30]});

assert.equal(recovery.APP,'Acelynn Pro');
assert.equal(recovery.SCHEMA,'acelynn-pro-backup-v1');
assert.equal(recovery.VERSION,1);

const legacyPayload=bridge.buildLegacyPayload(JSON.stringify([snap('old-1'),snap('old-2')]),'2026-09-02T00:00:00.000Z');
assert.equal(legacyPayload.schema,undefined);
assert.deepEqual(recovery.parseBackupObject(legacyPayload).map(x=>x.time),['old-1','old-2']);

const modern=recovery.createBackup([snap('new-1',91)]);
assert.equal(modern.app,'Acelynn Pro');
assert.equal(modern.schema,'acelynn-pro-backup-v1');
assert.equal(modern.version,1);
assert.equal(Array.isArray(modern.snapshots),true);
assert.equal(modern.snapshots.length,1);

const current=[snap('current-a'),snap('current-b')];
const incoming=[snap('old-a'),snap('old-b'),snap('current-b'),...Array.from({length:15},(_,i)=>snap(`incoming-${i}`,50+i))];
const merged=recovery.mergeSnapshots(current,incoming);
assert.equal(merged.length,12);
assert.deepEqual(merged.slice(0,2).map(x=>x.time),['current-a','current-b']);
assert.deepEqual(merged.slice(2).map(x=>x.time),Array.from({length:10},(_,i)=>`incoming-${i+5}`));

let raw=JSON.stringify([snap('keep-me',88)]);
let shouldFail=true;
const failingStorage={
  getItem(){return raw},
  setItem(key,value){
    if(shouldFail){shouldFail=false;throw new Error('simulated quota failure')}
    raw=value;
  },
  removeItem(){raw=null}
};
assert.throws(()=>recovery.restore(failingStorage,[snap('incoming')]),/simulated quota failure/);
assert.equal(JSON.parse(raw)[0].time,'keep-me');

assert.throws(()=>recovery.parseBackupObject({app:'Other App',snapshots:[]}),/different app/);
assert.throws(()=>recovery.parseBackupObject({app:'Acelynn Pro',schema:'future',version:9,snapshots:[]}),/Unsupported/);
assert.equal(bridge.isAndroidWebView('Mozilla/5.0 (Linux; Android 16; Pixel; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0 Mobile Safari/537.36'),true);
assert.equal(bridge.isAndroidWebView('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'),false);
assert.throws(()=>bridge.buildBridgeUrl('http://example.com',legacyPayload),/secure/);
assert.match(bridge.buildBridgeUrl('https://acelynn.vercel.app/',legacyPayload),/^https:\/\/acelynn\.vercel\.app\/legacy-export\.html#v1=/);

assert.equal(new URL('/acelynn-recovery.js','https://acelynn.vercel.app/api/demo-shell.js').pathname,'/acelynn-recovery.js');
assert.equal(new URL('/acelynn-recovery.js','https://acelynn.vercel.app/').pathname,'/acelynn-recovery.js');

console.log('Acelynn Pro reconciled recovery compatibility QA passed.');
