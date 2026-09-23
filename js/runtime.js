import { APP_META } from './meta.js';
import { STORES, openDatabase, requestToPromise } from './db.js';
import { hashAudioContent, meta, read, runWriteTransaction } from './storage.js';
import { saveVersionAnalysis } from './core-loop.js';
import { computeSpectralFeatures } from './spectral.js';
import {
  applyRoomSignature,
  buildRuleFindings,
  calculatePerspectiveHealth,
  diffSnapshots,
  estimateRoomConfidence,
  normalizeBandValues
} from './insights.js';
import {
  dryRunLegacyMigration,
  finalizeLegacyBackupAfterCleanLaunch,
  getLegacyBackupStatus,
  importLegacySnapshots
} from './migration.js';

const WORKSPACE_META_KEY = 'defaultWorkspace';
const ACTIVE_ROOM_META_KEY = 'activeRoomSignatureId';
export const SIGNAL_VALIDITY_THRESHOLDS = Object.freeze({
  minRmsDb: -72,
  minBandEnergyTotal: 5,
  minBandPeak: 2,
  minFftPeak: 1
});
let sourceFileHash = null;
let sourceFileMetadata = null;

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `acelynn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function evaluateSignalValidity({
  bandValues = [],
  fftMagnitudes = [],
  rmsDb = null
} = {}) {
  const cleanBands = Array.isArray(bandValues)
    ? bandValues.slice(0, 5).map(value => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : 0;
    })
    : [];
  const cleanFft = Array.isArray(fftMagnitudes) || ArrayBuffer.isView(fftMagnitudes)
    ? Array.from(fftMagnitudes, value => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : 0;
    })
    : [];
  const rms = finiteOrNull(rmsDb);
  const bandEnergyTotal = cleanBands.reduce((sum, value) => sum + value, 0);
  const bandPeak = cleanBands.length ? Math.max(...cleanBands) : 0;
  const fftPeak = cleanFft.length ? Math.max(...cleanFft) : 0;
  const failures = [];

  if (rms !== null && rms < SIGNAL_VALIDITY_THRESHOLDS.minRmsDb) failures.push('rms');
  if (
    bandEnergyTotal < SIGNAL_VALIDITY_THRESHOLDS.minBandEnergyTotal ||
    bandPeak < SIGNAL_VALIDITY_THRESHOLDS.minBandPeak
  ) failures.push('bands');
  if (fftPeak < SIGNAL_VALIDITY_THRESHOLDS.minFftPeak) failures.push('fft');

  return Object.freeze({
    valid: failures.length === 0,
    reason: failures[0] || null,
    failures: Object.freeze(failures.slice()),
    metrics: Object.freeze({ rmsDb: rms, bandEnergyTotal, bandPeak, fftPeak })
  });
}

async function ensureDefaultWorkspace() {
  const existing = await meta.get(WORKSPACE_META_KEY);
  if (existing?.value?.projectId && existing?.value?.songId) {
    const [project, song] = await Promise.all([
      read.one(STORES.PROJECTS, existing.value.projectId),
      read.one(STORES.SONGS, existing.value.songId)
    ]);
    if (project && song) return existing.value;
  }

  const now = Date.now();
  const projectId = uuid();
  const songId = uuid();
  const workspace = { projectId, songId, createdAt: now };
  await runWriteTransaction([STORES.PROJECTS, STORES.SONGS, STORES.META], async stores => {
    await requestToPromise(stores[STORES.PROJECTS].put({
      id: projectId,
      name: 'Local Sessions',
      createdAt: now,
      updatedAt: now,
      metadata: { origin: 'v1.2-runtime' }
    }));
    await requestToPromise(stores[STORES.SONGS].put({
      id: songId,
      projectId,
      name: 'Current Analysis',
      createdAt: now,
      updatedAt: now,
      metadata: { origin: 'v1.2-runtime' }
    }));
    await requestToPromise(stores[STORES.META].put({ key: WORKSPACE_META_KEY, value: workspace, updatedAt: now }));
  }, { operation: 'ensureDefaultWorkspace' });
  return workspace;
}

async function runStartupMigration() {
  const before = await getLegacyBackupStatus();
  let finalizedPriorBackup = false;
  if (before.migration?.status === 'validated' && before.backup && before.migration.backupRemovalEligibleAfterCleanLaunch) {
    await finalizeLegacyBackupAfterCleanLaunch();
    finalizedPriorBackup = true;
  }

  const dryRun = dryRunLegacyMigration();
  let migration = null;
  if (dryRun.found && dryRun.importableCount > 0) {
    migration = await importLegacySnapshots();
  }
  return { dryRun, migration, finalizedPriorBackup };
}

export async function initializeRuntime() {
  await openDatabase();
  let migrationState;
  try {
    migrationState = await runStartupMigration();
  } catch (error) {
    migrationState = { error: error?.message || String(error), rolledBack: true };
    console.warn('Acelynn v1.2 legacy migration rolled back:', error);
  }
  const workspace = await ensureDefaultWorkspace();
  return { workspace, migration: migrationState };
}

export async function setSourceFile(file) {
  if (!file) {
    sourceFileHash = null;
    sourceFileMetadata = null;
    return null;
  }
  sourceFileHash = await hashAudioContent(file);
  sourceFileMetadata = {
    name: typeof file.name === 'string' ? file.name : null,
    type: typeof file.type === 'string' ? file.type : null,
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : null
  };
  return sourceFileHash;
}

export function clearSourceFile() {
  sourceFileHash = null;
  sourceFileMetadata = null;
}

export async function saveRoomSignature({
  fftMagnitudes,
  sampleRate,
  fftSize,
  bandValues,
  confidence = null,
  name = 'Room signature'
}) {
  const spectralFeatures = computeSpectralFeatures(fftMagnitudes, sampleRate, fftSize);
  const normalizedBands = normalizeBandValues(bandValues);
  const id = uuid();
  const createdAt = Date.now();
  const record = {
    id,
    scope: 'room',
    name: String(name || 'Room signature').slice(0, 80),
    createdAt,
    updatedAt: createdAt,
    origin: 'v1.2-room-signature',
    spectralDefinition: APP_META.spectralDefinition,
    spectralFeatures,
    normalizedBands,
    confidence: finiteOrNull(confidence),
    sourceType: 'microphone'
  };

  await runWriteTransaction([STORES.REFERENCES, STORES.META], async stores => {
    await requestToPromise(stores[STORES.REFERENCES].put(record));
    await requestToPromise(stores[STORES.META].put({ key: ACTIVE_ROOM_META_KEY, value: id, updatedAt: createdAt }));
  }, { operation: 'saveRoomSignature', roomSignatureId: id });
  return record;
}

export async function getActiveRoomSignature() {
  const active = await meta.get(ACTIVE_ROOM_META_KEY);
  if (!active?.value) return null;
  return read.one(STORES.REFERENCES, active.value);
}

export async function clearActiveRoomSignature() {
  await meta.remove(ACTIVE_ROOM_META_KEY);
  return true;
}

export async function persistAnalysis({
  fftMagnitudes,
  sampleRate,
  fftSize,
  profile,
  score,
  perspectiveWeightedScore = null,
  targetProfileMatch = null,
  focus,
  bandValues,
  sourceType,
  perspective,
  levels = null,
  coachingFindings = [],
  referenceDeltas = [],
  roomSignatureId = null,
  roomConfidence = null
}) {
  const signalValidity = evaluateSignalValidity({ bandValues, fftMagnitudes, rmsDb: levels?.rmsDbfs });
  if (!signalValidity.valid) {
    const error = new Error('No usable audio signal was detected.');
    error.name = 'AcelynnSignalValidationError';
    error.code = 'NO_USABLE_SIGNAL';
    error.userMessage = 'No usable audio signal was detected. Play audio at a normal listening level and try again.';
    error.signalValidity = signalValidity;
    throw error;
  }

  const workspace = await ensureDefaultWorkspace();
  if (sourceFileHash) {
    const existing = await read.byIndex(STORES.ANALYSES, 'bySourceFileHash', sourceFileHash);
    const sameSong = existing.find(record => record.songId === workspace.songId && record.captureMode === 'file');
    if (sameSong) return { saved: false, duplicate: true, record: sameSong };
  }

  const spectralFeatures = computeSpectralFeatures(fftMagnitudes, sampleRate, fftSize);
  const cleanBands = Array.isArray(bandValues) ? bandValues.slice(0,5).map(finiteOrNull) : [];
  const bandMap = Object.fromEntries(['sub','bass','mids','presence','air'].map((key,index)=>[key,cleanBands[index] ?? null]));
  const cleanFindings = Array.isArray(coachingFindings) ? coachingFindings.slice(0,10).map(item => ({
    severity: finiteOrNull(item?.severity),
    title: String(item?.title || '').slice(0,140),
    text: String(item?.text || '').slice(0,360)
  })) : [];
  const coachingText = cleanFindings.map(item => [item.title,item.text].filter(Boolean).join(' ')).join('\n');
  const label = sourceFileMetadata?.name ? String(sourceFileMetadata.name).slice(0,100) : new Date().toISOString();
  const saved = await saveVersionAnalysis({
    songId: workspace.songId,
    label,
    analysis: {
      captureMode: sourceType === 'file' ? 'file' : 'microphone',
      sourceMetadata: sourceFileMetadata ? { ...sourceFileMetadata } : {},
      sampleRate,
      bitDepth: null,
      bitrate: null,
      channelCount: null,
      profileUsed: profile || null,
      bandUnit: 'legacy-byte-energy',
      bands: bandMap,
      balance: {
        score: finiteOrNull(perspectiveWeightedScore ?? score),
        contributions: {},
        leadingRegion: focus || null,
        deviations: {}
      },
      levels,
      coachingText,
      coachingFindings: cleanFindings,
      perspective: perspective || null,
      sourceFileHash,
      spectralFeatures,
      referenceDeltas,
      roomSignatureId,
      roomConfidence
    }
  });
  return { saved: true, duplicate: false, record: saved.analysis, version: saved.version, ignoredLegacyTargetProfileMatch: targetProfileMatch };
}

const runtime = Object.freeze({
  initializeRuntime,
  setSourceFile,
  clearSourceFile,
  saveRoomSignature,
  getActiveRoomSignature,
  clearActiveRoomSignature,
  persistAnalysis,
  evaluateSignalValidity,
  calculatePerspectiveHealth,
  applyRoomSignature,
  estimateRoomConfidence,
  diffSnapshots,
  buildRuleFindings,
  normalizeBandValues
});

globalThis.AcelynnV12 = runtime;
initializeRuntime().catch(error => {
  console.error('Acelynn v1.2 runtime initialization failed:', error);
});
