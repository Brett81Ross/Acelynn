import fs from 'node:fs';
import vm from 'node:vm';

const engineSource=fs.readFileSync('acelynn-recovery.js','utf8');
const sandbox={module:{exports:{}},exports:{},globalThis:{},TextEncoder,Date,JSON,Math,Number,String,Array,Set,Error};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(engineSource,sandbox,{filename:'acelynn-recovery.js'});
const R=sandbox.module.exports;

function assert(condition,message){if(!condition)throw new Error(message)}
function throws(fn,needle,label){let ok=false;try{fn()}catch(e){ok=String(e.message||e).includes(needle)}assert(ok,label)}

assert(R.APP==='Acelynn Pro','app id');
assert(R.SCHEMA==='acelynn-pro-backup-v1','schema');
assert(R.VERSION===1,'version');
assert(R.MAX_STORED_SNAPSHOTS===12,'retention cap');

const a={time:'Sep 1, 5:00 PM',profile:'Balanced mix',score:82,focus:'Mids',bands:[20,40,80,55,30]};
const b={time:'Sep 1, 5:05 PM',profile:'Bass / hip-hop',score:74,focus:'Bass',bands:[60,90,50,40,30]};
const legacy=R.parseBackupText(JSON.stringify({app:'Acelynn Pro',created:new Date().toISOString(),snapshots:[a]}));
assert(legacy.length===1&&legacy[0].score===82,'legacy report compatibility');
const versioned=R.parseBackupText(JSON.stringify(R.createBackup([a,b])));
assert(versioned.length===2,'versioned export roundtrip');
throws(()=>R.parseBackupObject({app:'Other',snapshots:[]}), 'different app','wrong app rejected');
throws(()=>R.parseBackupObject({app:'Acelynn Pro',schema:'bad',version:1,snapshots:[]}), 'schema','wrong schema rejected');
throws(()=>R.parseBackupObject({app:'Acelynn Pro',schema:R.SCHEMA,version:2,snapshots:[]}), 'version','future version rejected');
throws(()=>R.parseBackupObject({app:'Acelynn Pro',snapshots:Array.from({length:1001},()=>a)}), 'too many','oversized snapshot list rejected');

const polluted=JSON.parse('{"app":"Acelynn Pro","snapshots":[{"time":"x","profile":"y","score":50,"focus":"z","bands":[1,2,3],"__proto__":{"polluted":true},"constructor":{"x":1}}]}');
const clean=R.parseBackupObject(polluted)[0];
assert(!Object.prototype.hasOwnProperty.call(clean,'__proto__')&&!Object.prototype.hasOwnProperty.call(clean,'constructor'),'special keys stripped');

const merged=R.mergeSnapshots([a],[a,b]);
assert(merged.length===2&&merged[0].time===a.time&&merged[1].time===b.time,'current-first dedupe merge');
const many=Array.from({length:20},(_,i)=>({...a,time:`t${i}`}));
const capped=R.mergeSnapshots([],many);
assert(capped.length===12,'12 snapshot cap');
assert(capped[0].time==='t8'&&capped[11].time==='t19','clean restore keeps newest 12 in chronological storage order');
const next={...a,time:'t20'};
const afterNextSave=[...capped,next].slice(-12);
assert(afterNextSave[0].time==='t9'&&afterNextSave[11].time==='t20','next save drops oldest restored snapshot, not newest');
const currentMany=Array.from({length:15},(_,i)=>({...a,time:`c${i}`}));
const currentCapped=R.mergeSnapshots(currentMany,[]);
assert(currentCapped[0].time==='c3'&&currentCapped[11].time==='c14','oversized current storage retains newest 12 in chronology');

class FakeStorage{
 constructor(raw=null,fail=false){this.raw=raw;this.fail=fail;this.calls=0}
 getItem(k){return k===R.STORAGE_KEY?this.raw:null}
 setItem(k,v){this.calls++;if(this.fail&&this.calls===1)throw new Error('simulated write failure');if(k===R.STORAGE_KEY)this.raw=v}
 removeItem(k){if(k===R.STORAGE_KEY)this.raw=null}
}
const storage=new FakeStorage(JSON.stringify([a]));
const restored=R.restore(storage,[b]);
assert(restored.length===2&&JSON.parse(storage.raw).length===2,'successful restore write');
assert(restored[0].time===a.time&&restored[1].time===b.time,'restore persists chronological order');
const before=JSON.stringify([a]);
const failing=new FakeStorage(before,true);
throws(()=>R.restore(failing,[b]),'simulated write failure','write failure surfaced');
assert(failing.raw===before,'rollback preserves previous storage');

const index=fs.readFileSync('index.html','utf8');
const base=fs.readFileSync('app-base.html','utf8');
assert(index===base,'index/app-base parity');
for(const html of [index,base]){
 assert(html.includes('<script src="acelynn-recovery.js"></script>'),'recovery engine loaded');
 assert(html.includes('Restore / merge backup'),'restore UI present');
 assert(html.includes('acelynn-pro-pre-import-backup.json'),'pre-import backup present');
 assert(html.indexOf('downloadJson(AcelynnRecovery.createBackup(snapshots)')<html.indexOf('snapshots=AcelynnRecovery.restore(localStorage,incoming)'),'pre-import backup precedes restore write');
 assert(!html.includes('localStorage.clear('),'no destructive clear');
 assert(html.includes("AcelynnRecovery.parseBackupText(raw)"),'validated restore parse');
}
const vercel=fs.readFileSync('vercel.json','utf8');
assert(/"deploymentEnabled"\s*:\s*false/.test(vercel),'Vercel Git deployment stays disabled');
console.log('Acelynn Pro signing-cutover data recovery QA passed.');
