from pathlib import Path

FILES=[Path('index.html'),Path('app-base.html')]
DIRECT_BRIDGE='\n<script src="/legacy-export-bridge.js?v=cutover1"></script>'
RUNTIME_TAG='<script type="module" src="/js/runtime.js"></script>'
ENHANCEMENTS_TAG='<script type="module" src="/js/ui-enhancements.js"></script>'
RECOVERY_TAG='<script src="/acelynn-recovery.js"></script>'

def normalize_approved_index_drift(text):
    text=text.replace(DIRECT_BRIDGE,'')
    text=text.replace('</script>\n</body></html>','</script></body></html>')
    return text.rstrip('\n')

for path in FILES:
    text=path.read_text(encoding='utf-8')
    original=text

    script_anchor='<script>\n(()=>{const $=id=>document.getElementById(id)'
    recovery_replacement=RECOVERY_TAG+'\n<script>\n(()=>{const $=id=>document.getElementById(id)'
    if RECOVERY_TAG not in text:
        if script_anchor not in text:
            raise SystemExit(f'{path}: missing script anchor')
        text=text.replace(script_anchor,recovery_replacement,1)
    if RUNTIME_TAG not in text:
        if RECOVERY_TAG not in text:
            raise SystemExit(f'{path}: missing recovery tag for runtime insertion')
        text=text.replace(RECOVERY_TAG,RUNTIME_TAG+'\n'+RECOVERY_TAG,1)
    if ENHANCEMENTS_TAG not in text:
        if RUNTIME_TAG not in text:
            raise SystemExit(f'{path}: missing runtime tag for enhancements insertion')
        text=text.replace(RUNTIME_TAG,RUNTIME_TAG+'\n'+ENHANCEMENTS_TAG,1)

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

    mic_anchor='async function startMic(){try{stop();await context();'
    mic_replacement="async function startMic(){try{stop();if(globalThis.AcelynnV12)AcelynnV12.clearSourceFile();await context();"
    if mic_replacement not in text:
        if mic_anchor not in text:
            raise SystemExit(f'{path}: missing microphone source anchor')
        text=text.replace(mic_anchor,mic_replacement,1)

    file_anchor='async function startFile(file){try{stop();await context();'
    file_replacement='async function startFile(file){try{stop();if(globalThis.AcelynnV12)await AcelynnV12.setSourceFile(file);await context();'
    if file_replacement not in text:
        if file_anchor not in text:
            raise SystemExit(f'{path}: missing file source anchor')
        text=text.replace(file_anchor,file_replacement,1)

    old_capture="function capture(){if(!running)return;const r=profileResult(lastValues),focus=bands[r.normalized.indexOf(Math.max(...r.normalized))].name;snapshots.push({time:new Date().toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),profile:r.p.name,score:r.score,focus,bands:lastValues.map(v=>Math.round(v))});snapshots=snapshots.slice(-12);localStorage.setItem('acelynn-snapshots',JSON.stringify(snapshots));renderSnapshots()}"
    persisted_capture="function capture(){if(!running)return;const r=profileResult(lastValues),focus=bands[r.normalized.indexOf(Math.max(...r.normalized))].name,bandValues=lastValues.map(v=>Math.round(v)),fftMagnitudes=Array.from(data);snapshots.push({time:new Date().toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),profile:r.p.name,score:r.score,focus,bands:bandValues});snapshots=snapshots.slice(-12);localStorage.setItem('acelynn-snapshots',JSON.stringify(snapshots));renderSnapshots();if(globalThis.AcelynnV12&&audioCtx&&analyser)AcelynnV12.persistAnalysis({fftMagnitudes,sampleRate:audioCtx.sampleRate,fftSize:analyser.fftSize,profile:r.p.name,score:r.score,focus,bandValues,sourceType:activeSource==='file'?'file':'microphone',perspective:$('analysisMode').value}).catch(e=>setCoach('Saved locally, v1.2 storage needs attention',e?.userMessage||e?.message||'Unable to save the structured analysis record.',[{title:'Your current check is still safe.',text:'The legacy local snapshot was preserved on this device.',color:'#ffb25b'}],'#ffb25b'))}"
    if persisted_capture not in text and old_capture in text:
        text=text.replace(old_capture,persisted_capture,1)

    state_anchor="let audioCtx,analyser,micSource,mediaSource,stream,fileUrl,data,timeData,running=false,raf,activeSource='mic',lastValues=[0,0,0,0,0],snapshots=[];"
    state_replacement="let audioCtx,analyser,micSource,mediaSource,stream,fileUrl,data,timeData,running=false,raf,activeSource='mic',lastValues=[0,0,0,0,0],snapshots=[],lastFrame=null,recentFrames=[],frameTick=0;"
    if state_replacement not in text:
        if state_anchor not in text:
            raise SystemExit(f'{path}: missing analyzer state anchor')
        text=text.replace(state_anchor,state_replacement,1)

    set_state_anchor="function setState(on,text){$('dot').classList.toggle('live',on);$('stateText').textContent=text}"
    set_state_replacement=set_state_anchor+"function updateCaptureState(){const button=$('captureButton'),canSave=!!lastFrame&&!lastFrame.saved;button.disabled=!canSave;button.textContent=running?'Save current check':lastFrame?(lastFrame.saved?'Last check saved':'Save last check'):'Save current check'}function clearAnalysisMemory(){lastFrame=null;recentFrames=[];frameTick=0;updateCaptureState();window.dispatchEvent(new CustomEvent('acelynn:source-reset'))}"
    if 'function updateCaptureState()' not in text:
        if set_state_anchor not in text:
            raise SystemExit(f'{path}: missing setState anchor')
        text=text.replace(set_state_anchor,set_state_replacement,1)

    stop_anchor="function stop(){running=false;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;if(micSource){try{micSource.disconnect()}catch(e){}}micSource=null;if(mediaSource){try{mediaSource.disconnect()}catch(e){}}$('audioPlayer').pause();$('audioPlayer').classList.add('hidden');$('micButton').textContent='Start live analysis';$('micButton').classList.remove('stop');setState(false,'READY');$('status').textContent='Not listening';$('captureButton').disabled=true}"
    stop_replacement="function stop(){running=false;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;if(micSource){try{micSource.disconnect()}catch(e){}}micSource=null;if(mediaSource){try{mediaSource.disconnect()}catch(e){}}$('audioPlayer').pause();$('audioPlayer').classList.add('hidden');$('micButton').textContent='Start live analysis';$('micButton').classList.remove('stop');if(lastFrame){setState(false,'PAUSED');$('status').textContent=lastFrame.saved?'Analysis stopped · last check saved':'Analysis stopped · last check ready to save'}else{setState(false,'READY');$('status').textContent='Not listening'}updateCaptureState();window.dispatchEvent(new CustomEvent('acelynn:stopped',{detail:{frame:lastFrame}}))}"
    if stop_replacement not in text:
        if stop_anchor not in text:
            raise SystemExit(f'{path}: missing stop-state anchor')
        text=text.replace(stop_anchor,stop_replacement,1)

    start_mic_anchor="async function startMic(){try{stop();if(globalThis.AcelynnV12)AcelynnV12.clearSourceFile();await context();"
    start_mic_replacement="async function startMic(){try{stop();clearAnalysisMemory();if(globalThis.AcelynnV12)AcelynnV12.clearSourceFile();await context();"
    if start_mic_replacement not in text:
        if start_mic_anchor not in text:
            raise SystemExit(f'{path}: missing staged microphone start anchor')
        text=text.replace(start_mic_anchor,start_mic_replacement,1)

    start_file_anchor="async function startFile(file){try{stop();if(globalThis.AcelynnV12)await AcelynnV12.setSourceFile(file);await context();"
    start_file_replacement="async function startFile(file){try{stop();clearAnalysisMemory();if(globalThis.AcelynnV12)await AcelynnV12.setSourceFile(file);await context();"
    if start_file_replacement not in text:
        if start_file_anchor not in text:
            raise SystemExit(f'{path}: missing staged file start anchor')
        text=text.replace(start_file_anchor,start_file_replacement,1)

    profile_anchor="function profileResult(vals){const key=$('profile').value,p=profiles[key],top=Math.max(...vals),normalized=vals.map(v=>top?Math.round(v/top*100):0);let err=0;normalized.forEach((n,i)=>err+=Math.abs(n-p.target[i]));let score=Math.max(0,Math.min(100,Math.round(100-err/5.6)));const mode=$('analysisMode').value;if(mode==='detail'&&normalized[3]+normalized[4]>150)score=Math.max(0,score-8);if(mode==='room'&&normalized[0]+normalized[1]>150)score=Math.max(0,score-6);return{key,p,normalized,score}}"
    profile_replacement="function profileResult(vals){const key=$('profile').value,p=profiles[key],mode=$('analysisMode').value;if(globalThis.AcelynnV12?.calculatePerspectiveHealth){let scoringValues=vals,roomApplied=false;const room=globalThis.AcelynnActiveRoomSignature;if(activeSource==='mic'&&room?.normalizedBands){const normalizedLive=AcelynnV12.normalizeBandValues(vals);scoringValues=AcelynnV12.applyRoomSignature(normalizedLive,room.normalizedBands).adjusted;roomApplied=true}const health=AcelynnV12.calculatePerspectiveHealth({bandValues:scoringValues,target:p.target,perspective:mode});return{key,p,normalized:health.normalized,score:health.weightedScore,rawScore:health.rawScore,weightedScore:health.weightedScore,roomApplied}}const top=Math.max(...vals),normalized=vals.map(v=>top?Math.round(v/top*100):0);let err=0;normalized.forEach((n,i)=>err+=Math.abs(n-p.target[i]));let score=Math.max(0,Math.min(100,Math.round(100-err/5.6)));if(mode==='detail'&&normalized[3]+normalized[4]>150)score=Math.max(0,score-8);if(mode==='room'&&normalized[0]+normalized[1]>150)score=Math.max(0,score-6);return{key,p,normalized,score,rawScore:score,weightedScore:score,roomApplied:false}}"
    if profile_replacement not in text:
        if profile_anchor not in text:
            raise SystemExit(f'{path}: missing profile result anchor')
        text=text.replace(profile_anchor,profile_replacement,1)

    loop_anchor="const result=profileResult(vals);$('targetText').textContent='Target: '+result.p.name;coach(result,vals,vals.reduce((a,b)=>a+b,0)/5);$('captureButton').disabled=false;draw();raf=requestAnimationFrame(loop)}"
    loop_replacement="const result=profileResult(vals);$('targetText').textContent='Target: '+result.p.name;coach(result,vals,vals.reduce((a,b)=>a+b,0)/5);const focus=bands[result.normalized.indexOf(Math.max(...result.normalized))].name;lastFrame={capturedAt:Date.now(),bandValues:vals.map(v=>Math.round(v)),fftMagnitudes:Array.from(data),sampleRate:audioCtx.sampleRate,fftSize:analyser.fftSize,profile:result.p.name,result,focus,sourceType:activeSource==='file'?'file':'microphone',perspective:$('analysisMode').value,peakDb,rmsDb,saved:false};frameTick++;if(frameTick%6===0){recentFrames.push({bandValues:lastFrame.bandValues.slice(),fftMagnitudes:lastFrame.fftMagnitudes.slice()});recentFrames=recentFrames.slice(-12);window.dispatchEvent(new CustomEvent('acelynn:frame',{detail:{frame:lastFrame}}))}updateCaptureState();draw();raf=requestAnimationFrame(loop)}"
    if loop_replacement not in text:
        if loop_anchor not in text:
            raise SystemExit(f'{path}: missing loop capture-state anchor')
        text=text.replace(loop_anchor,loop_replacement,1)

    current_capture=persisted_capture
    capture_replacement="function capture(){if(!lastFrame||lastFrame.saved)return;const frame=lastFrame,r=frame.result,focus=frame.focus,bandValues=frame.bandValues.slice(),fftMagnitudes=frame.fftMagnitudes.slice(),previous=snapshots[snapshots.length-1]||null,snapshot={time:new Date().toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),profile:r.p.name,score:r.score,focus,bands:bandValues,perspective:frame.perspective};snapshots.push(snapshot);snapshots=snapshots.slice(-12);localStorage.setItem('acelynn-snapshots',JSON.stringify(snapshots));lastFrame.saved=true;renderSnapshots();updateCaptureState();const diff=globalThis.AcelynnV12?.diffSnapshots?.(snapshot,previous)||null,rules=globalThis.AcelynnV12?.buildRuleFindings?.({normalized:r.normalized,target:r.p.target,perspective:frame.perspective,peakDb:frame.peakDb,rmsDb:frame.rmsDb,weightedScore:r.weightedScore??r.score,roomApplied:r.roomApplied})||[],room=r.roomApplied?globalThis.AcelynnActiveRoomSignature:null;window.dispatchEvent(new CustomEvent('acelynn:snapshot-saved',{detail:{current:snapshot,previous,diff}}));if(globalThis.AcelynnV12)AcelynnV12.persistAnalysis({fftMagnitudes,sampleRate:frame.sampleRate,fftSize:frame.fftSize,profile:r.p.name,score:r.rawScore??r.score,perspectiveWeightedScore:r.weightedScore??r.score,targetProfileMatch:r.rawScore??r.score,focus,bandValues,sourceType:frame.sourceType,perspective:frame.perspective,levels:{peakDbfs:frame.peakDb,rmsDbfs:frame.rmsDb,crestDb:frame.peakDb-frame.rmsDb},coachingFindings:rules,referenceDeltas:diff?.largestChanges||[],roomSignatureId:room?.id||null,roomConfidence:room?.confidence??null}).catch(e=>setCoach('Saved locally, v1.2 storage needs attention',e?.userMessage||e?.message||'Unable to save the structured analysis record.',[{title:'Your current check is still safe.',text:'The legacy local snapshot was preserved on this device.',color:'#ffb25b'}],'#ffb25b'))}"
    if capture_replacement not in text:
        if current_capture not in text:
            raise SystemExit(f'{path}: missing stopped-save capture anchor')
        text=text.replace(current_capture,capture_replacement,1)

    source_handler_anchor="document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{if(t.dataset.source===activeSource)return;stop();activeSource=t.dataset.source;"
    source_handler_replacement="document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{if(t.dataset.source===activeSource)return;stop();clearAnalysisMemory();activeSource=t.dataset.source;"
    if source_handler_replacement not in text:
        if source_handler_anchor not in text:
            raise SystemExit(f'{path}: missing source-tab reset anchor')
        text=text.replace(source_handler_anchor,source_handler_replacement,1)

    resize_anchor="$('restoreInput').addEventListener('change',e=>restoreReport(e.target.files&&e.target.files[0]));window.addEventListener('resize',draw);"
    resize_replacement="$('restoreInput').addEventListener('change',e=>restoreReport(e.target.files&&e.target.files[0]));globalThis.AcelynnCoreBridge=Object.freeze({getLastFrame:()=>lastFrame,getRecentFrames:()=>recentFrames.slice(),getSnapshots:()=>snapshots.slice()});window.addEventListener('resize',draw);"
    if resize_replacement not in text:
        if resize_anchor not in text:
            raise SystemExit(f'{path}: missing core bridge anchor')
        text=text.replace(resize_anchor,resize_replacement,1)

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
    if text.count(RUNTIME_TAG)!=1:
        raise SystemExit(f'{path}: v1.2 runtime must be loaded exactly once')
    if text.count(ENHANCEMENTS_TAG)!=1:
        raise SystemExit(f'{path}: v1.2 enhancement UI must be loaded exactly once')
    if "if(!running)return" in text[text.find('function capture()'):text.find('function downloadJson')]:
        raise SystemExit(f'{path}: stopped analyses must remain saveable')

    path.write_text(text,encoding='utf-8')
    print(f"{path}: {'patched' if text!=original else 'already deterministic'}")

index=FILES[0].read_text(encoding='utf-8')
base=FILES[1].read_text(encoding='utf-8').rstrip('\n')
normalized_index=normalize_approved_index_drift(index)
if normalized_index != base:
    raise SystemExit('index.html/app-base.html drift exceeds the approved legacy bridge/closing-tag/trailing-newline differences')
print('Acelynn Pro source parity: OK (approved bridge formatting differences only)')
