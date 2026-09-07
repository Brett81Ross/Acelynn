import { createLiveController } from './live-controller.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'acelynn-snapshots';
const MAX_SNAPSHOTS = 12;

let snapshots = [];
let activeSource = 'mic';

function safeSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_SNAPSHOTS) : [];
  } catch (_) {
    return [];
  }
}

function renderSnapshots() {
  const list = $('snapshots');
  const count = $('sessionCount');
  const exportButton = $('exportButton');
  if (count) count.textContent = `${snapshots.length} saved`;
  if (exportButton) exportButton.disabled = !snapshots.length;
  if (!list) return;
  if (!snapshots.length) {
    list.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'subtle';
    empty.id = 'emptySession';
    empty.textContent = 'Saved checks will appear here on this device.';
    list.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  snapshots.slice().reverse().forEach(snapshot => {
    const row = document.createElement('div');
    row.className = 'snapshot';
    const copy = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = snapshot.profile || 'Saved check';
    const meta = document.createElement('span');
    meta.textContent = `${snapshot.time || ''} · ${snapshot.focus || '—'} leading`;
    copy.append(title, meta);
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = `${snapshot.score ?? '—'}/100`;
    row.append(copy, badge);
    fragment.appendChild(row);
  });
  list.replaceChildren(fragment);
}

const controller = createLiveController({
  environment: window,
  document,
  getSnapshots: () => snapshots
});

function installBridge() {
  globalThis.AcelynnCoreBridge = Object.freeze({
    getLastFrame: controller.getLastFrame,
    getRecentFrames: controller.getRecentFrames,
    getSnapshots: () => snapshots.slice(),
    getLiveState: controller.getLiveState
  });
}

function setMicButton(running) {
  const button = $('micButton');
  if (!button) return;
  button.textContent = running ? 'Stop live analysis' : 'Start live analysis';
  button.classList.toggle('stop', running);
}

function showSource(source) {
  activeSource = source;
  document.querySelectorAll('.tab[data-source]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.source === source);
  });
  $('micPanel')?.classList.toggle('hidden', source !== 'mic');
  $('filePanel')?.classList.toggle('hidden', source !== 'file');
  const player = $('audioPlayer');
  if (player && source !== 'file') player.classList.add('hidden');
}

async function toggleMic() {
  if (controller.isRunning()) {
    controller.stop();
    setMicButton(false);
    return;
  }
  try {
    await controller.startMic();
    setMicButton(true);
  } catch (error) {
    setMicButton(false);
    console.warn('Acelynn microphone start failed:', error);
  }
}

async function startFile(file) {
  if (!file) return;
  setMicButton(false);
  try {
    await controller.startFile(file);
    const player = $('audioPlayer');
    if (player) player.classList.remove('hidden');
    if ($('fileName')) $('fileName').textContent = file.name || 'Loaded audio file';
  } catch (error) {
    console.warn('Acelynn file analysis start failed:', error);
  }
}

function downloadJson(payload, name) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}

function exportReport() {
  if (!globalThis.AcelynnRecovery) return;
  downloadJson(AcelynnRecovery.createBackup(snapshots), 'acelynn-pro-backup.json');
}

async function restoreReport(file) {
  if (!file || !globalThis.AcelynnRecovery) return;
  try {
    if (file.size > AcelynnRecovery.MAX_FILE_BYTES) throw new Error('Backup file is larger than 5 MB.');
    const raw = await file.text();
    const incoming = AcelynnRecovery.parseBackupText(raw);
    downloadJson(AcelynnRecovery.createBackup(snapshots), 'acelynn-pro-pre-import-backup.json');
    snapshots = AcelynnRecovery.restore(localStorage, incoming);
    renderSnapshots();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'The backup was rejected.');
  } finally {
    if ($('restoreInput')) $('restoreInput').value = '';
  }
}

function capture() {
  const frame = controller.getLastFrame();
  const state = controller.getLiveState();
  if (!frame || frame.saved || state?.signal !== 'valid') return;
  const result = frame.result;
  const previous = snapshots[snapshots.length - 1] || null;
  const snapshot = {
    time: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    profile: result.p.name,
    score: result.score,
    focus: frame.focus,
    bands: frame.bandValues.slice(),
    perspective: frame.perspective
  };
  snapshots.push(snapshot);
  snapshots = snapshots.slice(-MAX_SNAPSHOTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  controller.markLastFrameSaved();
  renderSnapshots();

  const api = globalThis.AcelynnV12;
  const diff = api?.diffSnapshots?.(snapshot, previous) || null;
  const rules = api?.buildRuleFindings?.({
    normalized: result.normalized,
    target: result.p.target,
    perspective: frame.perspective,
    peakDb: frame.peakDb,
    rmsDb: frame.rmsDb,
    weightedScore: result.weightedScore ?? result.score,
    roomApplied: result.roomApplied
  }) || [];
  const room = result.roomApplied ? globalThis.AcelynnActiveRoomSignature : null;

  window.dispatchEvent(new CustomEvent('acelynn:snapshot-saved', {
    detail: { current: snapshot, previous, diff }
  }));

  if (api?.persistAnalysis) {
    api.persistAnalysis({
      fftMagnitudes: frame.fftMagnitudes.slice(),
      sampleRate: frame.sampleRate,
      fftSize: frame.fftSize,
      profile: result.p.name,
      score: result.rawScore ?? result.score,
      perspectiveWeightedScore: result.weightedScore ?? result.score,
      targetProfileMatch: result.rawScore ?? result.score,
      focus: frame.focus,
      bandValues: frame.bandValues.slice(),
      sourceType: frame.sourceType,
      perspective: frame.perspective,
      levels: {
        peakDbfs: frame.peakDb,
        rmsDbfs: frame.rmsDb,
        crestDb: frame.peakDb - frame.rmsDb
      },
      coachingFindings: rules,
      referenceDeltas: diff?.largestChanges || [],
      roomSignatureId: room?.id || null,
      roomConfidence: room?.confidence ?? null
    }).catch(error => console.warn('Structured analysis persistence failed; local snapshot remains safe:', error));
  }
}

function installEvents() {
  document.querySelectorAll('.tab[data-source]').forEach(tab => {
    tab.addEventListener('click', () => {
      const next = tab.dataset.source;
      if (!next || next === activeSource) return;
      controller.stop();
      controller.resetSource();
      setMicButton(false);
      showSource(next);
    });
  });

  $('micButton')?.addEventListener('click', toggleMic);
  $('fileInput')?.addEventListener('change', event => startFile(event.target.files?.[0]));
  $('captureButton')?.addEventListener('click', capture);

  const exportButton = $('exportButton');
  if (exportButton && exportButton.dataset.cactusbyteLegacyExportBridge !== '1') {
    exportButton.addEventListener('click', exportReport);
  }

  $('restoreButton')?.addEventListener('click', () => $('restoreInput')?.click());
  $('restoreInput')?.addEventListener('change', event => restoreReport(event.target.files?.[0]));

  $('audioPlayer')?.addEventListener('ended', () => {
    controller.stop();
    setMicButton(false);
  });
}

function initialize() {
  snapshots = safeSnapshots();
  renderSnapshots();
  installBridge();
  installEvents();
  showSource(activeSource);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
