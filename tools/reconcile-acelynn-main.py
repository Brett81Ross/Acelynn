from pathlib import Path

FILES=[Path('index.html'),Path('app-base.html')]
DIRECT_BRIDGE='\n<script src="/legacy-export-bridge.js?v=cutover1"></script>'

for path in FILES:
    text=path.read_text(encoding='utf-8')
    original=text

    script_anchor='<script>\n(()=>{const $=id=>document.getElementById(id)'
    script_replacement='<script src="/acelynn-recovery.js"></script>\n<script>\n(()=>{const $=id=>document.getElementById(id)'
    if script_replacement not in text:
        if script_anchor not in text:
            raise SystemExit(f'{path}: missing script anchor')
        text=text.replace(script_anchor,script_replacement,1)

    controls_anchor='<div class="action-row"><button class="secondary" id="captureButton" disabled>Save current check</button><button class="secondary" id="exportButton" disabled>Export session report</button></div><div class="snapshot-list" id="snapshots">'
    controls_replacement='<div class="action-row"><button class="secondary" id="captureButton" disabled>Save current check</button><button class="secondary" id="exportButton" disabled>Export session report</button></div><div class="action-row"><button class="secondary" id="restoreButton" style="grid-column:1/-1;min-height:48px">Restore / merge backup</button></div><input id="restoreInput" class="hidden" type="file" accept="application/json,.json"><div class="snapshot-list" id="snapshots">'
    if controls_replacement not in text:
        if controls_anchor not in text:
            raise SystemExit(f'{path}: missing recovery controls anchor')
        text=text.replace(controls_anchor,controls_replacement,1)

    old_export="function exportReport(){const payload={app:'Acelynn Pro',created:new Date().toISOString(),snapshots};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='acelynn-session-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}"
    new_export="function downloadJson(payload,name){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}function exportReport(){downloadJson(AcelynnRecovery.createBackup(snapshots),'acelynn-pro-backup.json')}async function restoreReport(file){if(!file)return;try{if(file.size>AcelynnRecovery.MAX_FILE_BYTES)throw new Error('Backup file is larger than 5 MB.');const raw=await file.text(),incoming=AcelynnRecovery.parseBackupText(raw);downloadJson(AcelynnRecovery.createBackup(snapshots),'acelynn-pro-pre-import-backup.json');snapshots=AcelynnRecovery.restore(localStorage,incoming);renderSnapshots();setCoach('Backup restored','Saved Acelynn Pro checks were merged into this device without deleting the checks already here.',[{title:'Recovery complete.',text:snapshots.length+' saved checks are available on this device.',color:'#78f0b1'}],'#78f0b1')}catch(e){setCoach('Backup could not be restored',e instanceof Error?e.message:'The backup was rejected.',[{title:'Nothing was replaced.',text:'Your current saved checks were left in place.',color:'#ff6a98'}],'#ff6a98')}finally{$('restoreInput').value=''}}"
    if new_export not in text:
        if old_export not in text:
            raise SystemExit(f'{path}: missing export function anchor')
        text=text.replace(old_export,new_export,1)

    old_handlers="$('captureButton').addEventListener('click',capture);$('exportButton').addEventListener('click',exportReport);window.addEventListener('resize',draw);"
    new_handlers="$('captureButton').addEventListener('click',capture);$('exportButton').addEventListener('click',exportReport);$('restoreButton').addEventListener('click',()=>$('restoreInput').click());$('restoreInput').addEventListener('change',e=>restoreReport(e.target.files&&e.target.files[0]));window.addEventListener('resize',draw);"
    if new_handlers not in text:
        if old_handlers not in text:
            raise SystemExit(f'{path}: missing recovery handler anchor')
        text=text.replace(old_handlers,new_handlers,1)

    legacy_sw="if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{})"
    retire_sw="async function retireLegacyServiceWorker(){if('serviceWorker'in navigator){try{const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(registration=>registration.unregister()))}catch(e){}}if('caches'in window){try{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('acelynn-pro-')).map(key=>caches.delete(key)))}catch(e){}}}retireLegacyServiceWorker()"
    if retire_sw not in text:
        if legacy_sw not in text:
            raise SystemExit(f'{path}: missing legacy service-worker registration anchor')
        text=text.replace(legacy_sw,retire_sw,1)

    if 'localStorage.clear(' in text:
        raise SystemExit(f'{path}: destructive localStorage.clear() is forbidden')
    if 'serviceWorker.register(' in text:
        raise SystemExit(f'{path}: service-worker registration must remain removed')

    path.write_text(text,encoding='utf-8')
    print(f"{path}: {'patched' if text!=original else 'already deterministic'}")

index=FILES[0].read_text(encoding='utf-8')
base=FILES[1].read_text(encoding='utf-8')
if index.replace(DIRECT_BRIDGE,'') != base:
    raise SystemExit('index.html/app-base.html drift exceeds the approved legacy bridge difference')
print('Acelynn Pro source parity: OK (legacy bridge exception only)')
