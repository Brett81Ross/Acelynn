import { beforeEach, describe, expect, it } from 'vitest';
import { STORES, openDatabase, resetDatabaseConnectionForTests } from '../js/db.js';
import { clear, read } from '../js/storage.js';
import { initializeRuntime, persistAnalysis, saveRoomSignature, getActiveRoomSignature } from '../js/runtime.js';
import {
  FULL_BACKUP_SCHEMA,
  createFullStateBackup,
  detectBackupKind,
  restoreFullStateBackup,
  verifyFullStateBackup
} from '../js/full-state-backup.js';

async function clearAllStores() {
  resetDatabaseConnectionForTests();
  await openDatabase();
  for (const store of Object.values(STORES)) await clear(store);
}

async function resetState() {
  await clearAllStores();
  localStorage.clear();
  await initializeRuntime();
}

function flatSpectrum(length = 1024, value = 4) {
  return Array.from({ length }, () => value);
}

beforeEach(resetState);

describe('Acelynn full-state backup v2', () => {
  it('exports and restores legacy snapshots plus the complete IndexedDB state exactly', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify([
      { time: 'Sep 4, 9:30 PM', profile: 'Balanced mix', score: 78, focus: 'Mids', bands: [15, 28, 52, 40, 20] }
    ]));

    const signature = await saveRoomSignature({
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      bandValues: [42, 60, 55, 38, 24],
      confidence: 0.84,
      name: 'Fold room check'
    });

    const analysis = await persistAnalysis({
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      profile: 'Balanced mix',
      score: 78,
      perspectiveWeightedScore: 80,
      targetProfileMatch: 78,
      focus: 'Mids',
      bandValues: [15, 28, 52, 40, 20],
      sourceType: 'microphone',
      perspective: 'room',
      levels: { peakDbfs: -8, rmsDbfs: -20, crestDb: 12 },
      roomSignatureId: signature.id,
      roomConfidence: signature.confidence
    });

    const backup = await createFullStateBackup();
    expect(backup.schema).toBe(FULL_BACKUP_SCHEMA);
    expect(backup.checksum.value).toMatch(/^[a-f0-9]{64}$/);
    expect(backup.database.counts.projects).toBe(1);
    expect(backup.database.counts.songs).toBe(1);
    expect(backup.database.counts.versions).toBe(1);
    expect(backup.database.counts.references).toBe(1);
    expect(backup.database.stores.versions[0].id).toBe(analysis.record.id);
    expect(backup.database.stores.references[0].id).toBe(signature.id);
    expect(backup.legacy.raw).toContain('Balanced mix');
    expect(JSON.stringify(backup)).not.toContain('audioBytes');
    expect(JSON.stringify(backup)).not.toContain('pcm');

    await clearAllStores();
    localStorage.clear();
    await initializeRuntime();
    expect((await read.all(STORES.PROJECTS)).length).toBe(1);

    const result = await restoreFullStateBackup(backup);
    expect(result.restored).toBe(true);
    expect(result.counts.versions).toBe(1);
    expect(JSON.parse(localStorage.getItem('acelynn-snapshots'))).toHaveLength(1);
    expect((await read.all(STORES.PROJECTS)).map(record => record.id)).toEqual(backup.database.stores.projects.map(record => record.id));
    expect((await read.all(STORES.SONGS)).map(record => record.id)).toEqual(backup.database.stores.songs.map(record => record.id));
    expect((await read.all(STORES.VERSIONS)).map(record => record.id)).toEqual(backup.database.stores.versions.map(record => record.id));
    expect((await read.all(STORES.REFERENCES)).map(record => record.id)).toEqual(backup.database.stores.references.map(record => record.id));
    expect((await getActiveRoomSignature())?.id).toBe(signature.id);
  });

  it('rejects tampered full backups before changing user data', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify([
      { time: 'Before', profile: 'Balanced mix', score: 75, focus: 'Mids', bands: [10, 20, 30, 20, 10] }
    ]));
    const backup = await createFullStateBackup();
    const beforeRaw = localStorage.getItem('acelynn-snapshots');
    const beforeProjects = await read.all(STORES.PROJECTS);

    backup.database.stores.projects[0].name = 'Tampered project';
    await expect(verifyFullStateBackup(backup)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    await expect(restoreFullStateBackup(backup)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });

    expect(localStorage.getItem('acelynn-snapshots')).toBe(beforeRaw);
    expect(await read.all(STORES.PROJECTS)).toEqual(beforeProjects);
  });

  it('keeps legacy v1 backups importable through the compatibility detector', () => {
    expect(detectBackupKind({
      app: 'Acelynn Pro',
      schema: 'acelynn-pro-backup-v1',
      version: 1,
      snapshots: []
    })).toBe('legacy-v1');
    expect(detectBackupKind({
      app: 'Acelynn Pro',
      snapshots: []
    })).toBe('legacy-v1');
  });
});
