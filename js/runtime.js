import { APP_META } from './meta.js';
import { STORES, openDatabase, requestToPromise } from './db.js';
import { findVersionsByFileHash, hashAudioContent, meta, read, runWriteTransaction } from './storage.js';
import { computeSpectralFeatures } from './spectral.js';
import {
  dryRunLegacyMigration,
  finalizeLegacyBackupAfterCleanLaunch,
  getLegacyBackupStatus,
  importLegacySnapshots
} from './migration.js';

const WORKSPACE_META_KEY = 'defaultWorkspace';
let sourceFileHash = null;
let sourceFileMetadata = null;

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `acelynn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

export async function persistAnalysis({
  fftMagnitudes,
  sampleRate,
  fftSize,
  profile,
  score,
  focus,
  bandValues,
  sourceType,
  perspective
}) {
  const spectralFeatures = computeSpectralFeatures(fftMagnitudes, sampleRate, fftSize);
  const analysisTimestamp = Date.now();
  const workspace = await ensureDefaultWorkspace();

  if (sourceFileHash) {
    const duplicates = await findVersionsByFileHash(sourceFileHash);
    const sameSong = duplicates.find(record => record.songId === workspace.songId && record.sourceType === 'file');
    if (sameSong) return { saved: false, duplicate: true, record: sameSong };
  }

  const createdAt = Date.now();
  const id = uuid();
  const normalizedBands = Array.isArray(bandValues) ? bandValues.slice(0, 5).map(value => Number.isFinite(Number(value)) ? Number(value) : null) : [];
  const record = {
    id,
    songId: workspace.songId,
    parentVersionId: null,
    versionLabel: new Date(analysisTimestamp).toISOString(),
    analysisTimestamp,
    createdAt,
    origin: 'v1.2-runtime',
    featureSchemaVersion: APP_META.featureSchemaVersion,
    spectralDefinition: APP_META.spectralDefinition,
    fileHash: sourceFileHash,
    sourceType: sourceType || 'unknown',
    sourceMetadata: sourceFileMetadata ? { ...sourceFileMetadata } : {},
    perspective: perspective || null,
    listeningProfile: profile || null,
    bands: {
      sub: { legacyByteEnergy: normalizedBands[0] ?? null },
      bass: { legacyByteEnergy: normalizedBands[1] ?? null },
      mids: { legacyByteEnergy: normalizedBands[2] ?? null },
      presence: { legacyByteEnergy: normalizedBands[3] ?? null },
      air: { legacyByteEnergy: normalizedBands[4] ?? null }
    },
    levels: { peakDbfs: null, rmsDbfs: null, crestDb: null },
    dominantFrequencyArea: focus || null,
    spectralFeatures,
    mixHealth: {
      raw: Number.isFinite(Number(score)) ? Number(score) : null,
      perspectiveWeighted: null,
      targetProfileMatch: null
    },
    confidence: {
      overall: null,
      status: 'not-yet-scored',
      claimStrengthFactor: null,
      factors: null
    },
    coachingFindings: [],
    referenceDeltas: [],
    roomSignatureId: null,
    roomConfidence: null
  };

  await runWriteTransaction([STORES.VERSIONS, STORES.SONGS], async stores => {
    await requestToPromise(stores[STORES.VERSIONS].put(record));
    const song = await requestToPromise(stores[STORES.SONGS].get(workspace.songId));
    if (song) await requestToPromise(stores[STORES.SONGS].put({ ...song, updatedAt: createdAt }));
  }, { operation: 'persistAnalysis', versionId: id, sourceType: record.sourceType });

  return { saved: true, duplicate: false, record };
}

const runtime = Object.freeze({
  initializeRuntime,
  setSourceFile,
  clearSourceFile,
  persistAnalysis
});

globalThis.AcelynnV12 = runtime;
initializeRuntime().catch(error => {
  console.error('Acelynn v1.2 runtime initialization failed:', error);
});
