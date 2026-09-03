from pathlib import Path

FILES=[Path('index.html'),Path('app-base.html')]
DIRECT_BRIDGE='\n<script src="/legacy-export-bridge.js?v=cutover1"></script>'
METER_ENGINE_TAG='<script type="module" src="/js/metering-engine.js"></script>'
METER_UI_TAG='<script type="module" src="/js/metering-ui.js"></script>'
RUNTIME_TAG='<script type="module" src="/js/runtime.js"></script>'
ENHANCEMENTS_TAG='<script type="module" src="/js/ui-enhancements.js"></script>'
RECOVERY_TAG='<script src="/acelynn-recovery.js"></script>'


def require(text, needle, path, message):
    if needle not in text:
        raise SystemExit(f'{path}: {message}')


def replace_once(text, old, new, path, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{path}: missing v1.3 reconciliation anchor: {label}')
    return text.replace(old, new, 1)


for path in FILES:
    text=path.read_text(encoding='utf-8')

    if METER_ENGINE_TAG not in text or METER_UI_TAG not in text:
        require(text, RUNTIME_TAG, path, 'missing runtime anchor for professional metering modules')
        text=text.replace(RUNTIME_TAG, METER_ENGINE_TAG+'\n'+METER_UI_TAG+'\n'+RUNTIME_TAG, 1)

    text=replace_once(
        text,
        'function clearAnalysisMemory(){lastFrame=null;recentFrames=[];frameTick=0;updateCaptureState();window.dispatchEvent',
        'function clearAnalysisMemory(){lastFrame=null;recentFrames=[];frameTick=0;globalThis.AcelynnMetering?.reset?.();updateCaptureState();window.dispatchEvent',
        path,
        'metering reset bridge'
    )
    text=replace_once(
        text,
        'function stop(){running=false;cancelAnimationFrame(raf);',
        'function stop(){running=false;globalThis.AcelynnMetering?.detach?.();cancelAnimationFrame(raf);',
        path,
        'metering detach bridge'
    )
    text=replace_once(
        text,
        'micSource=audioCtx.createMediaStreamSource(stream);micSource.connect(analyser);running=true;',
        "micSource=audioCtx.createMediaStreamSource(stream);if(!(await globalThis.AcelynnMetering?.attach?.(audioCtx,micSource,analyser,{sourceType:'microphone'})))micSource.connect(analyser);running=true;",
        path,
        'microphone AudioWorklet bridge'
    )
    text=replace_once(
        text,
        "if(!mediaSource)mediaSource=audioCtx.createMediaElementSource(p);mediaSource.connect(analyser);analyser.connect(audioCtx.destination);p.classList.remove('hidden');",
        "if(!mediaSource)mediaSource=audioCtx.createMediaElementSource(p);if(!(await globalThis.AcelynnMetering?.attach?.(audioCtx,mediaSource,analyser,{sourceType:'file'})))mediaSource.connect(analyser);analyser.connect(audioCtx.destination);p.classList.remove('hidden');",
        path,
        'file AudioWorklet bridge'
    )
    text=replace_once(
        text,
        'roomConfidence:room?.confidence??null}).catch',
        'roomConfidence:room?.confidence??null,professionalMetering:globalThis.AcelynnMetering?.getSnapshot?.()||null}).catch',
        path,
        'professional metering persistence bridge'
    )

    require(text, RECOVERY_TAG, path, 'missing recovery engine')
    require(text, RUNTIME_TAG, path, 'missing runtime module')
    require(text, ENHANCEMENTS_TAG, path, 'missing enhancement module')
    require(text, METER_ENGINE_TAG, path, 'missing v1.3 metering engine module')
    require(text, METER_UI_TAG, path, 'missing v1.3 metering UI module')
    require(text, 'Restore / merge backup', path, 'missing recovery controls')
    require(text, 'function updateCaptureState()', path, 'missing stopped-save state model')
    require(text, "'Save last check'", path, 'stopped analysis is not clearly saveable')
    require(text, 'function capture(){if(!lastFrame||lastFrame.saved)return;', path, 'capture still depends on active playback instead of frozen frame')
    require(text, 'AcelynnCoreBridge=Object.freeze', path, 'missing narrow enhancement bridge')
    require(text, "new CustomEvent('acelynn:stopped'", path, 'missing stopped-analysis event')
    require(text, "new CustomEvent('acelynn:snapshot-saved'", path, 'missing Mix-Diff save event')
    require(text, 'perspectiveWeightedScore:r.weightedScore??r.score', path, 'missing weighted health persistence')
    require(text, 'referenceDeltas:diff?.largestChanges||[]', path, 'missing Mix-Diff persistence')
    require(text, 'roomSignatureId:room?.id||null', path, 'missing room signature linkage')
    require(text, 'professionalMetering:globalThis.AcelynnMetering?.getSnapshot?.()||null', path, 'missing professional metering persistence')
    require(text, "sourceType:'microphone'", path, 'missing microphone metering attachment')
    require(text, "sourceType:'file'", path, 'missing file metering attachment')
    require(text, "localStorage.setItem('acelynn-snapshots'", path, 'legacy local snapshot fallback missing')
    require(text, 'navigator.serviceWorker.getRegistrations()', path, 'legacy service-worker retirement missing')
    if 'function capture(){if(!running)return;' in text:
        raise SystemExit(f'{path}: legacy running-only Save behavior is forbidden')
    if 'localStorage.clear(' in text:
        raise SystemExit(f'{path}: destructive localStorage.clear() is forbidden')
    if 'serviceWorker.register(' in text:
        raise SystemExit(f'{path}: service-worker registration must remain removed')
    for tag,label in [(METER_ENGINE_TAG,'v1.3 metering engine'),(METER_UI_TAG,'v1.3 metering UI'),(RUNTIME_TAG,'runtime'),(ENHANCEMENTS_TAG,'enhancement UI'),(RECOVERY_TAG,'recovery engine')]:
        if text.count(tag)!=1:
            raise SystemExit(f'{path}: {label} must be loaded exactly once')

    path.write_text(text, encoding='utf-8')
    print(f'{path}: final stopped-save + v1.3 metering state deterministic')

index=FILES[0].read_text(encoding='utf-8')
base=FILES[1].read_text(encoding='utf-8')
if index.count(DIRECT_BRIDGE)!=1:
    raise SystemExit('index.html: approved direct legacy export bridge count changed')
if base.count(DIRECT_BRIDGE)!=0:
    raise SystemExit('app-base.html: direct legacy bridge must remain demo-shell injected only')
# The production repair intentionally left small historical ordering/whitespace differences
# between index.html and app-base.html. Full byte parity is therefore not a valid safety
# invariant. The required functional/security anchors above are checked independently on
# both shells, while the legacy bridge distinction is checked explicitly here.
for needle,label in [
    (METER_ENGINE_TAG,'metering engine'),
    (METER_UI_TAG,'metering UI'),
    ('professionalMetering:globalThis.AcelynnMetering?.getSnapshot?.()||null','metering persistence'),
    ("sourceType:'microphone'",'microphone metering'),
    ("sourceType:'file'",'file metering'),
    ("'Save last check'",'stopped-save state'),
    ('navigator.serviceWorker.getRegistrations()','service-worker retirement')
]:
    if needle not in index or needle not in base:
        raise SystemExit(f'index/app-base semantic parity missing: {label}')
print('Acelynn Pro semantic source parity: OK (v1.3 metering + v1.2 recovery preserved)')
