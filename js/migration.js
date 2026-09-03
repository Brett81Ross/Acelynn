import { STORES, requestToPromise } from './db.js';
import { hashBytesSha256, meta, read, runWriteTransaction } from './storage.js';
import { APP_META } from './meta.js';

const LEGACY_KEY = 'acelynn-snapshots';
const BACKUP_KEY = '_legacy_backup';
const MIGRATION_KEY = 'legacyMigration';
const textEncoder = new TextEncoder();

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `acelynn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapProfile(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('bass') || normalized.includes('hip-hop')) return 'bass';
  if (normalized.includes('acoustic') || normalized.includes('singer')) return 'acoustic';
  if (normalized.includes('vocal')) return 'vocal';
  if (normalized.includes('balanced')) return 'balanced';
  return null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeLegacySnapshot(snapshot, index, songId, importBaseTime) {
  const rawBands = Array.isArray(snapshot?.bands) ? snapshot.bands.slice(0, 5).map(numberOrNull) : [];
  while (rawBands.length < 5) rawBands.push(null);
  const positive = rawBands.map(v => Math.max(0, v || 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  const ids = ['sub', 'bass', 'mids', 'presence', 'air'];
  const bands = Object.fromEntries(ids.map((id, i) => [id, {
    linearPower: null,
    percentOfObservedPower: total > 0 ? positive[i] / total * 100 : null,
    relativeDb: null,
    legacyByteEnergy: rawBands[i]
  }]));

  return {
    id: uuid(),
    songId,
    parentVersionId: null,
    versionLabel: `Legacy snapshot ${index + 1}`,
    analysisTimestamp: null,
    createdAt: importBaseTime + index,
    importedAt: Date.now(),
    origin: 'legacy-v1.1',
    featureSchemaVersion: 0,
    fileHash: null,
    sourceType: 'legacy-unknown',
    sourceMetadata: {},
    perspective: null,
    listeningProfile: mapProfile(snapshot?.profile),
    bands,
    levels: { peakDbfs: null, rmsDbfs: null, crestDb: null },
    dominantFrequencyArea: null,
    spectralFeatures: null,
    mixHealth: {
      raw: numberOrNull(snapshot?.score),
      perspectiveWeighted: null,
      targetProfileMatch: null
    },
    confidence: {
      overall: null,
      status: 'legacy-unrated',
      claimStrengthFactor: null,
      factors: null
    },
    coachingFindings: [],
    referenceDeltas: [],
    roomSignatureId: null,
    roomConfidence: null,
    legacy: {
      legacyTimeLabel: typeof snapshot?.time === 'string' ? snapshot.time : null,
      legacyOrder: index,
      originalSnapshot: snapshot
    }
  };
}

export function dryRunLegacyMigration(storage = globalThis.localStorage) {
  const raw = storage?.getItem?.(LEGACY_KEY);
  if (!raw) return { found: false, importableCount: 0, invalidCount: 0, snapshots: [], raw: null };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { found: true, importableCount: 0, invalidCount: 1, snapshots: [], raw, error: 'Legacy snapshot payload is not an array' };
    const snapshots = parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    return {
      found: true,
      importableCount: snapshots.length,
      invalidCount: parsed.length - snapshots.length,
      snapshots,
      raw,
      unrecoverableFields: ['source type', 'analysis perspective', 'peak/RMS/crest', 'true band dB', 'spectral features', 'confidence', 'captured coaching text']
    };
  } catch (error) {
    return { found: true, importableCount: 0, invalidCount: 1, snapshots: [], raw, error: String(error?.message || error) };
  }
}

async function hashRaw(raw) {
  return hashBytesSha256(textEncoder.encode(raw));
}

async function createBackup(raw) {
  const sha256 = await hashRaw(raw);
  const value = { sourceKey: LEGACY_KEY, raw, sha256, capturedAt: Date.now(), retained: true };
  await meta.set(BACKUP_KEY, value);
  const stored = await meta.get(BACKUP_KEY);
  if (!stored?.value?.raw || stored.value.sha256 !== sha256) throw new Error('Legacy backup write verification failed');
  if (await hashRaw(stored.value.raw) !== sha256) throw new Error('Legacy backup hash verification failed');
  return value;
}

async function restoreFromBackup(backup, storage = globalThis.localStorage) {
  if (backup?.raw != null) storage?.setItem?.(LEGACY_KEY, backup.raw);
}

async function cleanupImportedRecords({ projectId, songId, versionIds }) {
  try {
    await runWriteTransaction([STORES.PROJECTS, STORES.SONGS, STORES.VERSIONS, STORES.META], async stores => {
      for (const id of versionIds || []) await requestToPromise(stores[STORES.VERSIONS].delete(id));
      if (songId) await requestToPromise(stores[STORES.SONGS].delete(songId));
      if (projectId) await requestToPromise(stores[STORES.PROJECTS].delete(projectId));
      await requestToPromise(stores[STORES.META].delete(MIGRATION_KEY));
    }, { operation: 'migrationRollbackCleanup' });
  } catch (_) {}
}

export async function validateLegacyMigration(expected) {
  const migration = await meta.get(MIGRATION_KEY);
  const backupRecord = await meta.get(BACKUP_KEY);
  if (!migration?.value || !['committed', 'validated'].includes(migration.value.status)) return { ok: false, reason: 'migration marker missing' };
  if (!backupRecord?.value?.raw) return { ok: false, reason: 'backup missing' };

  const actualHash = await hashRaw(backupRecord.value.raw);
  if (actualHash !== backupRecord.value.sha256) return { ok: false, reason: 'backup hash mismatch' };
  if (migration.value.backupSha256 && migration.value.backupSha256 !== actualHash) return { ok: false, reason: 'migration backup hash mismatch' };

  const versions = await Promise.all(expected.versionIds.map(id => read.one(STORES.VERSIONS, id)));
  if (versions.length !== expected.versionIds.length) return { ok: false, reason: 'record count mismatch' };
  if (versions.some(record => !record)) return { ok: false, reason: 'version record missing' };
  if (versions.some(record => record.origin !== 'legacy-v1.1' || record.featureSchemaVersion !== 0 || record.sourceType !== 'legacy-unknown')) {
    return { ok: false, reason: 'required legacy fields failed validation' };
  }

  const project = await read.one(STORES.PROJECTS, expected.projectId);
  const song = await read.one(STORES.SONGS, expected.songId);
  if (!project || !song) return { ok: false, reason: 'project/song missing' };
  if (song.projectId !== expected.projectId) return { ok: false, reason: 'song/project relationship mismatch' };
  if (versions.some(record => record.songId !== expected.songId)) return { ok: false, reason: 'version/song relationship mismatch' };
  return { ok: true, count: versions.length, backupSha256: actualHash };
}

export async function importLegacySnapshots({ storage = globalThis.localStorage } = {}) {
  const existing = await meta.get(MIGRATION_KEY);
  if (existing?.value?.status === 'validated' || existing?.value?.status === 'committed') {
    return { imported: false, reason: 'Legacy migration already completed or is awaiting validation', migration: existing.value };
  }

  const dryRun = dryRunLegacyMigration(storage);
  if (!dryRun.found || dryRun.importableCount === 0) return { imported: false, reason: dryRun.error || 'No importable legacy snapshots', dryRun };

  const backup = await createBackup(dryRun.raw);
  const now = Date.now();
  const projectId = uuid();
  const songId = uuid();
  const versions = dryRun.snapshots.map((snapshot, index) => normalizeLegacySnapshot(snapshot, index, songId, now + 1));
  const expected = { projectId, songId, versionIds: versions.map(v => v.id) };

  try {
    await runWriteTransaction([STORES.PROJECTS, STORES.SONGS, STORES.VERSIONS, STORES.META], async stores => {
      await requestToPromise(stores[STORES.PROJECTS].put({
        id: projectId,
        name: 'Imported Snapshots',
        createdAt: now,
        updatedAt: now,
        metadata: { origin: 'legacy-v1.1' }
      }));
      await requestToPromise(stores[STORES.SONGS].put({
        id: songId,
        projectId,
        name: 'Imported Mixes',
        createdAt: now,
        updatedAt: now,
        metadata: { origin: 'legacy-v1.1' }
      }));
      for (const version of versions) await requestToPromise(stores[STORES.VERSIONS].put(version));
      await requestToPromise(stores[STORES.META].put({
        key: MIGRATION_KEY,
        value: {
          status: 'committed',
          importedCount: versions.length,
          projectId,
          songId,
          versionIds: expected.versionIds,
          backupSha256: backup.sha256,
          appVersion: APP_META.version,
          committedAt: Date.now()
        },
        updatedAt: Date.now()
      }));
    }, { operation: 'legacyImport', count: versions.length });

    const validation = await validateLegacyMigration(expected);
    if (!validation.ok) throw new Error(`Migration integrity validation failed: ${validation.reason}`);

    await meta.set(MIGRATION_KEY, {
      status: 'validated',
      importedCount: versions.length,
      projectId,
      songId,
      versionIds: expected.versionIds,
      backupSha256: backup.sha256,
      appVersion: APP_META.version,
      validatedAt: Date.now(),
      backupRemovalEligibleAfterCleanLaunch: true
    });

    return { imported: true, count: versions.length, projectId, songId, validation };
  } catch (error) {
    await cleanupImportedRecords(expected);
    await restoreFromBackup(backup, storage);
    await meta.set(MIGRATION_KEY, {
      status: 'rolled-back',
      reason: String(error?.message || error),
      rolledBackAt: Date.now(),
      backupSha256: backup.sha256
    });
    throw error;
  }
}

export async function finalizeLegacyBackupAfterCleanLaunch() {
  const migration = await meta.get(MIGRATION_KEY);
  const backup = await meta.get(BACKUP_KEY);
  if (migration?.value?.status !== 'validated' || !migration.value.backupRemovalEligibleAfterCleanLaunch) return { removed: false };
  if (!backup?.value?.raw || !backup.value.sha256) throw new Error('Validated migration backup is missing');
  const actualHash = await hashRaw(backup.value.raw);
  if (actualHash !== backup.value.sha256 || actualHash !== migration.value.backupSha256) {
    throw new Error('Validated migration backup hash changed; refusing cleanup');
  }
  const next = { ...migration.value, backupRemovalEligibleAfterCleanLaunch: false, cleanLaunchConfirmedAt: Date.now() };
  await runWriteTransaction([STORES.META], async stores => {
    await requestToPromise(stores[STORES.META].put({ key: MIGRATION_KEY, value: next, updatedAt: Date.now() }));
    await requestToPromise(stores[STORES.META].delete(BACKUP_KEY));
  }, { operation: 'finalizeLegacyBackup' });
  return { removed: true };
}

export async function getLegacyBackupStatus() {
  const backup = await meta.get(BACKUP_KEY);
  const migration = await meta.get(MIGRATION_KEY);
  return { backup: backup?.value || null, migration: migration?.value || null };
}
