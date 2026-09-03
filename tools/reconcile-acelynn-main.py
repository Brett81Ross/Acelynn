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


def require(text, needle, path, message):
    if needle not in text:
        raise SystemExit(f'{path}: {message}')


for path in FILES:
    text=path.read_text(encoding='utf-8')
    require(text, RECOVERY_TAG, path, 'missing recovery engine')
    require(text, RUNTIME_TAG, path, 'missing v1.2 runtime module')
    require(text, ENHANCEMENTS_TAG, path, 'missing v1.2 enhancement module')
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
    require(text, "localStorage.setItem('acelynn-snapshots'", path, 'legacy local snapshot fallback missing')
    require(text, 'navigator.serviceWorker.getRegistrations()', path, 'legacy service-worker retirement missing')
    if 'function capture(){if(!running)return;' in text:
        raise SystemExit(f'{path}: legacy running-only Save behavior is forbidden')
    if 'localStorage.clear(' in text:
        raise SystemExit(f'{path}: destructive localStorage.clear() is forbidden')
    if 'serviceWorker.register(' in text:
        raise SystemExit(f'{path}: service-worker registration must remain removed')
    if text.count(RUNTIME_TAG)!=1:
        raise SystemExit(f'{path}: v1.2 runtime must be loaded exactly once')
    if text.count(ENHANCEMENTS_TAG)!=1:
        raise SystemExit(f'{path}: v1.2 enhancement UI must be loaded exactly once')
    if text.count(RECOVERY_TAG)!=1:
        raise SystemExit(f'{path}: recovery engine must be loaded exactly once')
    print(f'{path}: final v1.2 state deterministic')

index=FILES[0].read_text(encoding='utf-8')
base=FILES[1].read_text(encoding='utf-8').rstrip('\n')
if index.count(DIRECT_BRIDGE)!=1:
    raise SystemExit('index.html: approved direct legacy export bridge count changed')
if base.count(DIRECT_BRIDGE)!=0:
    raise SystemExit('app-base.html: direct legacy bridge must remain demo-shell injected only')
if normalize_approved_index_drift(index) != base:
    raise SystemExit('index.html/app-base.html drift exceeds the approved legacy bridge/closing-tag/trailing-newline differences')
print('Acelynn Pro source parity: OK (final stopped-save + v1.2 insight state)')
