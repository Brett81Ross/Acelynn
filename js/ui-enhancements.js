const byId = id => document.getElementById(id);

function averageArrays(arrays) {
  const valid = arrays.filter(array => array && typeof array.length === 'number' && array.length);
  if (!valid.length) return [];
  const length = Math.min(...valid.map(array => array.length));
  return Array.from({ length }, (_, index) => valid.reduce((sum, array) => sum + Number(array[index] || 0), 0) / valid.length);
}

function injectStyles() {
  if (byId('acelynn-v12-enhancement-styles')) return;
  const style = document.createElement('style');
  style.id = 'acelynn-v12-enhancement-styles';
  style.textContent = `
    .v12-tools{display:grid;gap:10px;margin-top:12px}.v12-copy{color:var(--muted);font-size:.72rem;line-height:1.45}.v12-actions{display:grid;grid-template-columns:1fr auto;gap:8px}.v12-actions .secondary{min-height:48px}.v12-status{font-size:.7rem;color:var(--cyan);font-weight:800}.rule-meter{margin-top:14px;padding-top:13px;border-top:1px solid var(--line)}.rule-meter-head{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:.66rem;font-weight:850}.rule-track{height:10px;margin-top:8px;border-radius:999px;background:#090914;overflow:hidden}.rule-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--pink),var(--yellow),var(--lime));transition:width .18s ease}.rule-list{display:grid;gap:7px;margin-top:9px}.rule-item{padding:8px 9px;border-radius:10px;background:#0c0c17;border-left:3px solid var(--violet);font-size:.7rem;line-height:1.4;color:#d7d6e0}.rule-item b{color:#fff}.diff-grid{display:grid;gap:8px;margin-top:12px}.diff-row{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #303049;border-radius:10px;background:#0b0b16;font-size:.71rem}.diff-row strong{color:var(--ink)}.diff-row span{color:var(--muted);text-align:right}@media(max-width:430px){.v12-actions{grid-template-columns:1fr}.v12-actions .secondary{width:100%}}
  `;
  document.head.appendChild(style);
}

function createRoomCard() {
  if (byId('roomSignatureCard')) return;
  const bandSection = document.querySelector('.bandlist')?.closest('.card.section');
  if (!bandSection) return;
  const section = document.createElement('section');
  section.className = 'card section';
  section.id = 'roomSignatureCard';
  section.innerHTML = `
    <div class="section-head"><span>Room signature</span><span class="v12-status" id="roomSignatureStatus">Loading…</span></div>
    <div class="v12-tools">
      <div class="v12-copy">For live-mic checks, play a familiar reference or calibration track through the speakers, let the analysis settle, then capture. Acelynn stores only a lightweight spectral signature—not the audio—and applies conservative room-aware scoring to later live checks.</div>
      <div class="v12-actions"><button class="secondary" id="roomSignatureButton" disabled>Capture room signature</button><button class="secondary" id="roomSignatureClearButton" disabled>Clear active</button></div>
    </div>`;
  bandSection.insertAdjacentElement('afterend', section);
}

function createRuleMeter() {
  if (byId('ruleMeter')) return;
  const coachSection = byId('coachTitle')?.closest('.card.section');
  if (!coachSection) return;
  const meter = document.createElement('div');
  meter.className = 'rule-meter';
  meter.id = 'ruleMeter';
  meter.innerHTML = `
    <div class="rule-meter-head"><span>LIVE RULE METER</span><span id="ruleMeterLabel">Waiting for analysis</span></div>
    <div class="rule-track"><div class="rule-fill" id="ruleMeterFill"></div></div>
    <div class="rule-list" id="ruleFindings"><div class="rule-item"><b>Ready.</b> Start an analysis to see deterministic level, balance, room, and detail checks.</div></div>`;
  coachSection.appendChild(meter);
}

function createDiffCard() {
  if (byId('mixDiffCard')) return;
  const snapshotSection = byId('sessionCount')?.closest('.card.section');
  if (!snapshotSection) return;
  const section = document.createElement('section');
  section.className = 'card section';
  section.id = 'mixDiffCard';
  section.innerHTML = `
    <div class="section-head"><span>Mix-Diff A/B</span><span class="subtle" id="diffScore">Save two checks</span></div>
    <p class="v12-copy" id="diffSummary">Save two analysis states and Acelynn will surface the biggest balance changes automatically.</p>
    <div class="diff-grid" id="diffRows"></div>`;
  snapshotSection.insertAdjacentElement('beforebegin', section);
}

function renderDiff(current, previous) {
  const summary = byId('diffSummary');
  const rows = byId('diffRows');
  const score = byId('diffScore');
  if (!summary || !rows || !score) return;
  const diff = globalThis.AcelynnV12?.diffSnapshots?.(current, previous);
  if (!diff) {
    score.textContent = 'Save two checks';
    summary.textContent = 'Save two analysis states and Acelynn will surface the biggest balance changes automatically.';
    rows.innerHTML = '';
    return;
  }
  score.textContent = diff.scoreDelta === null ? 'A/B ready' : `${diff.scoreDelta >= 0 ? '+' : ''}${diff.scoreDelta} health`;
  summary.textContent = diff.summary;
  rows.innerHTML = diff.largestChanges.map(change => `
    <div class="diff-row"><strong>${change.name} ${change.delta > 0 ? '↑' : change.delta < 0 ? '↓' : '→'} ${Math.abs(change.delta).toFixed(1)}</strong><span>${change.guidance}</span></div>`).join('');
}

function renderRules(frame, stopped = false) {
  if (!frame?.result || !globalThis.AcelynnV12) return;
  const score = Number(frame.result.weightedScore ?? frame.result.score ?? 0);
  const findings = AcelynnV12.buildRuleFindings({
    normalized: frame.result.normalized,
    target: frame.result.p?.target,
    perspective: frame.perspective,
    peakDb: frame.peakDb,
    rmsDb: frame.rmsDb,
    weightedScore: score,
    roomApplied: Boolean(frame.result.roomApplied)
  });
  frame.ruleFindings = findings;
  const fill = byId('ruleMeterFill');
  const label = byId('ruleMeterLabel');
  const list = byId('ruleFindings');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, score))}%`;
  if (label) label.textContent = `${stopped ? 'Last reading · ' : ''}${Math.round(score)}/100`;
  if (list) list.innerHTML = findings.map(item => `<div class="rule-item"><b>${item.title}</b> ${item.text}</div>`).join('');
  const healthMetric = document.querySelector('.scorebox small');
  if (healthMetric) healthMetric.textContent = frame.perspective === 'room' ? 'Room health' : frame.perspective === 'detail' ? 'Detail health' : 'Mix health';
}

function renderRoomStatus(signature) {
  const status = byId('roomSignatureStatus');
  const clearButton = byId('roomSignatureClearButton');
  if (status) status.textContent = signature ? `Active · ${Math.round(Number(signature.confidence || 0) * 100)}% confidence` : 'Not captured';
  if (clearButton) clearButton.disabled = !signature;
}

function updateRoomCaptureAvailability() {
  const button = byId('roomSignatureButton');
  const bridge = globalThis.AcelynnCoreBridge;
  if (!button || !bridge) return;
  const frame = bridge.getLastFrame?.();
  const recent = bridge.getRecentFrames?.() || [];
  button.disabled = !(frame?.sourceType === 'microphone' && recent.length >= 3);
}

async function captureRoomSignature() {
  const bridge = globalThis.AcelynnCoreBridge;
  if (!bridge || !globalThis.AcelynnV12) return;
  const frame = bridge.getLastFrame?.();
  const recent = bridge.getRecentFrames?.() || [];
  if (!frame || frame.sourceType !== 'microphone' || recent.length < 3) return;
  const bands = recent.map(item => item.bandValues);
  const fft = recent.map(item => item.fftMagnitudes);
  const confidence = AcelynnV12.estimateRoomConfidence(bands);
  try {
    const signature = await AcelynnV12.saveRoomSignature({
      fftMagnitudes: averageArrays(fft),
      sampleRate: frame.sampleRate,
      fftSize: frame.fftSize,
      bandValues: averageArrays(bands),
      confidence,
      name: `Room signature ${new Date().toLocaleDateString()}`
    });
    globalThis.AcelynnActiveRoomSignature = signature;
    renderRoomStatus(signature);
    const status = byId('status');
    if (status) status.textContent = 'Room signature captured · live-mic scoring is room-aware';
  } catch (error) {
    const status = byId('roomSignatureStatus');
    if (status) status.textContent = error?.userMessage || error?.message || 'Could not save';
  }
}

async function clearRoomSignature() {
  if (!globalThis.AcelynnV12) return;
  await AcelynnV12.clearActiveRoomSignature();
  globalThis.AcelynnActiveRoomSignature = null;
  renderRoomStatus(null);
}

async function initializeEnhancements() {
  if (!byId('captureButton')) return;
  injectStyles();
  createRoomCard();
  createRuleMeter();
  createDiffCard();

  byId('roomSignatureButton')?.addEventListener('click', captureRoomSignature);
  byId('roomSignatureClearButton')?.addEventListener('click', clearRoomSignature);

  if (globalThis.AcelynnV12) {
    try {
      globalThis.AcelynnActiveRoomSignature = await AcelynnV12.getActiveRoomSignature();
    } catch (_) {
      globalThis.AcelynnActiveRoomSignature = null;
    }
  }
  renderRoomStatus(globalThis.AcelynnActiveRoomSignature);
  updateRoomCaptureAvailability();

  const snapshots = globalThis.AcelynnCoreBridge?.getSnapshots?.() || [];
  if (snapshots.length >= 2) renderDiff(snapshots[snapshots.length - 1], snapshots[snapshots.length - 2]);

  window.addEventListener('acelynn:frame', event => {
    renderRules(event.detail?.frame, false);
    updateRoomCaptureAvailability();
  });
  window.addEventListener('acelynn:stopped', event => {
    if (event.detail?.frame) renderRules(event.detail.frame, true);
    updateRoomCaptureAvailability();
  });
  window.addEventListener('acelynn:snapshot-saved', event => {
    renderDiff(event.detail?.current, event.detail?.previous);
  });
  window.addEventListener('acelynn:source-reset', updateRoomCaptureAvailability);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeEnhancements, { once: true });
  else queueMicrotask(initializeEnhancements);
}
