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
    const snapshots = parsed.filter(item => item && typeof item === 'object');
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

async function createBackup(raw) {
  const sha256 = await hashBytesSha256(textEncoder.encode(raw));
  const value = { sourceKey: LEGACY_KEY, raw, sha256, capturedAt: Date.now(), retained: true };
  await meta.set(BACKUP_KEY, value);
  return value;
}

async function restoreFromBackup(backup, storage = globalThis.localStorage) {
  if (backup?.raw != null) storage?.setItem?.(LEGACY_KEY, backup.raw);
}

async function cleanupImportedRecords({ projectId, songId, versionIds }) {
  try {
    await runWriteTransaction([STORES.PROJECTS, STORES.SONGS, STORES.VERSIONS, STORES.META], async stores => {
      for (const id of versionIds || []) stores[STORES.VERSIONS].delete(id);
      if (songId) stores[STORES.SONGS].delete(songId);
      if (projectId) stores[STORES.PROJECTS].delete(projectId);
      stores[STORES.META].delete(MIGRATION_KEY);
    }, { operation: 'migrationRollbackCleanup' });
  } catch (_) {
    // The migration itself is atomic; cleanup is a defensive second line.
  }
}

export async function validateLegacyMigration(expected) {
  const migration = await meta.get(MIGRATION_KEY);
  const backupRecord = await meta.get(BACKUP_KEY);
  if (!migration?.value || migration.value.status !== 'committed') return { ok: false, reason: 'migration marker missing' };
  if (!backupRecord?.value?.raw) return { ok: false, reason: 'backup missing' };

  const actualHash = await hashBytesSha256(textEncoder.encode(backupRecord.value.raw));
  if (actualHash !== backupRecord.value.sha256) return { ok: false, reason: 'backup hash mismatch' };

  const versions = await Promise.all(expected.versionIds.map(id => read.one(STORES.VERSIONS, id)));
  if (versions.some(record => !record)) return { ok: false, reason: 'version record missing' };
  if (versions.length !== expected.versionIds.length) return { ok: false, reason: 'record count mismatch' };
  if (versions.some(record => record.origin !== 'legacy-v1.1' || record.featureSchemaVersion !== 0 || record.sourceType !== 'legacy-unknown')) {
    return { ok: false, reason: 'required legacy fields failed validation' };
  }

  const project = await read.one(STORES.PROJECTS, expected.projectId);
  const song = await read.one(STORES.SONGS, expected.songId);
  if (!project || !song) return { ok: false, reason: 'project/song missing' };
  return { ok: true, count: versions.length, backupSha256: actualHash };
}

export async function importLegacySnapshots({ storage = globalThis.localStorage } = {}) {
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
      stores[STORES.PROJECTS].put({
        id: projectId,
        name: 'Imported Snapshots',
        createdAt: now,
        updatedAt: now,
        metadata: {}
      });
      stores[STORES.SONGS].put({
        id: songId,
        projectId,
        name: 'Imported Mixes',
        createdAt: now,
        updatedAt: now,
        metadata: {}
      });
      for (const version of versions) stores[STORES.VERSIONS].put(version);
      stores[STORES.META].put({
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
      });
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
  if (migration?.value?.status !== 'validated' || !migration.value.backupRemovalEligibleAfterCleanLaunch) return { removed: false };
  const next = { ...migration.value, backupRemovalEligibleAfterCleanLaunch: false, cleanLaunchConfirmedAt: Date.now() };
  await meta.set(MIGRATION_KEY, next);
  await meta.remove(BACKUP_KEY);
  return { removed: true };
}

export async function getLegacyBackupStatus() {
  const backup = await meta.get(BACKUP_KEY);
  const migration = await meta.get(MIGRATION_KEY);
  return { backup: backup?.value || null, migration: migration?.value || null };
}
