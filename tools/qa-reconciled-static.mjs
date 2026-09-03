import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const read=path=>fs.readFileSync(path,'utf8');
const index=read('index.html');
const base=read('app-base.html');
const sw=read('sw.js');
const shell=read('api/demo-shell.js');
const vercel=read('vercel.json');
const directBridge='\n<script src="/legacy-export-bridge.js?v=cutover1"></script>';
const normalizeApprovedIndexDrift=text=>text.replace(directBridge,'').replace('</script>\n</body></html>','</script></body></html>');

assert.equal(normalizeApprovedIndexDrift(index),base,'index/app-base may differ only by the approved direct bridge and its exact closing-tag whitespace');
for(const html of [index,base]){
  assert(html.includes('<script src="/acelynn-recovery.js"></script>'),'recovery engine uses origin-absolute URL');
  assert(html.includes('Restore / merge backup'),'restore UI present');
  assert(html.includes('min-height:48px'),'restore touch target is at least 48px');
  assert(html.includes('acelynn-pro-pre-import-backup.json'),'pre-import safety backup present');
  assert(html.indexOf('downloadJson(AcelynnRecovery.createBackup(snapshots)')<html.indexOf('snapshots=AcelynnRecovery.restore(localStorage,incoming)'),'pre-import backup precedes restore write');
  assert(html.includes('AcelynnRecovery.parseBackupText(raw)'),'restore validates backup before write');
  assert(!html.includes('localStorage.clear('),'destructive localStorage.clear is forbidden');
  assert(!html.includes('serviceWorker.register('),'new service-worker registration remains retired');
  assert(html.includes('navigator.serviceWorker.getRegistrations()'),'stale service workers are enumerated');
  assert(html.includes('registration=>registration.unregister()'),'stale service workers are unregistered');
  assert(html.includes("key.startsWith('acelynn-pro-')"),'cache cleanup is Acelynn-scoped');
  assert(html.includes('caches.delete(key)'),'stale Acelynn caches are deleted');
  assert(html.includes('Acelynn Pro™'),'Acelynn Pro trademark footer remains present');
  assert(html.includes('Cactus🌵Byte Studios™'),'CactusByte trademark footer remains present');
  assert(html.includes('All Rights Reserved'),'rights footer remains present');
}

assert(sw.includes("const MIGRATION_SHELL='/api/demo-shell.js'"),'migration fallback worker remains available');
assert(sw.includes("key.startsWith(LEGACY_CACHE_PREFIX)"),'migration worker only targets Acelynn legacy caches');
assert(!sw.includes('caches.open('),'migration worker does not create caches');
assert(!sw.includes('cache.put('),'migration worker does not write caches');
assert(shell.includes('/legacy-export-bridge.js?v=cutover1'),'production shell still injects the proven Android export bridge');
assert(shell.includes('/demo-help.js?v=1.1.2'),'existing demo/help injection remains intact');
assert(/"deploymentEnabled"\s*:\s*false/.test(vercel),'staging branch must not deploy to Vercel');

const bridgeBlob=execFileSync('git',['hash-object','legacy-export-bridge.js'],{encoding:'utf8'}).trim();
assert.equal(bridgeBlob,'4289393f9ad736ab55a4ff525bb80464ac2c1b5e','proven legacy export bridge must remain byte-for-byte unchanged');

console.log('Acelynn Pro reconciled static QA passed.');
