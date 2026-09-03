import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, STORES, openDatabase, requestToPromise, resetDatabaseConnectionForTests, withTransaction } from '../js/db.js';
import {
  clear,
  classifyQuotaRatio,
  hashAudioContent,
  meta,
  put,
  read,
  resilientWrite,
  SAVE_FAILURE_MESSAGE
} from '../js/storage.js';
import {
  dryRunLegacyMigration,
  finalizeLegacyBackupAfterCleanLaunch,
  getLegacyBackupStatus,
  importLegacySnapshots
} from '../js/migration.js';

async function clearAll() {
  await openDatabase();
  for (const store of Object.values(STORES)) await clear(store);
  localStorage.clear();
}

beforeEach(async () => {
  resetDatabaseConnectionForTests();
  await clearAll();
});

describe('Acelynn v1.2 IndexedDB foundation', () => {
  it('creates the required stores and version indexes', async () => {
    const db = await openDatabase();
    expect(DB_NAME).toBe('AcelynnProStudioDB');
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(Object.values(STORES)));
    await withTransaction([STORES.VERSIONS], 'readonly', stores => {
      expect([...stores[STORES.VERSIONS].indexNames]).toEqual(expect.arrayContaining([
        'bySong', 'bySongCreated', 'byParent', 'byCreatedAt', 'bySourceType', 'byPerspective', 'byFileHash'
      ]));
    });
  });

  it('retries transient writes and surfaces the locked failure message after exhaustion', async () => {
    let attempts = 0;
    const result = await resilientWrite(async () => {
      attempts += 1;
      if (attempts < 3) throw new DOMException('temporary failure', 'UnknownError');
      return 'saved';
    });
    expect(result).toBe('saved');
    expect(attempts).toBe(3);

    await expect(resilientWrite(async () => {
      throw new DOMException('still full', 'QuotaExceededError');
    })).rejects.toMatchObject({ message: SAVE_FAILURE_MESSAGE });
  });

  it('keeps multi-store writes atomic when work throws', async () => {
    await expect(withTransaction([STORES.PROJECTS, STORES.SONGS], 'readwrite', async stores => {
      await requestToPromise(stores[STORES.PROJECTS].put({ id: 'p1', name: 'P', createdAt: 1, updatedAt: 1, metadata: {} }));
      await requestToPromise(stores[STORES.SONGS].put({ id: 's1', projectId: 'p1', name: 'S', createdAt: 1, updatedAt: 1, metadata: {} }));
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    expect(await read.one(STORES.PROJECTS, 'p1')).toBeUndefined();
    expect(await read.one(STORES.SONGS, 's1')).toBeUndefined();
  });

  it('hashes actual audio bytes with SHA-256 rather than filename metadata', async () => {
    const a = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const b = new Blob([new Uint8Array([1, 2, 3, 5])]);
    const hashA = await hashAudioContent(a);
    const hashA2 = await hashAudioContent(new Blob([new Uint8Array([1, 2, 3, 4])]));
    const hashB = await hashAudioContent(b);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    expect(hashA2).toBe(hashA);
    expect(hashB).not.toBe(hashA);
  });

  it('preserves the 60/80/90 quota warning thresholds', () => {
    expect(classifyQuotaRatio(0.59)).toBe('normal');
    expect(classifyQuotaRatio(0.60)).toBe('advisory');
    expect(classifyQuotaRatio(0.80)).toBe('strong');
    expect(classifyQuotaRatio(0.90)).toBe('critical');
    expect(classifyQuotaRatio(null)).toBe('unknown');
  });
});

describe('Acelynn v1.2 legacy migration integrity', () => {
  const legacy = [{ time: 'Aug 30, 1:00 PM', profile: 'Balanced mix', score: 82, focus: 'Mids', bands: [10, 20, 30, 20, 10] }];

  it('dry-runs without modifying legacy localStorage', () => {
    const raw = JSON.stringify(legacy);
    localStorage.setItem('acelynn-snapshots', raw);
    const result = dryRunLegacyMigration();
    expect(result.importableCount).toBe(1);
    expect(localStorage.getItem('acelynn-snapshots')).toBe(raw);
  });

  it('backs up, atomically imports, validates and preserves reserved room fields', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify(legacy));
    const result = await importLegacySnapshots();
    expect(result.imported).toBe(true);
    expect(result.validation.ok).toBe(true);

    const versions = await read.all(STORES.VERSIONS);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      origin: 'legacy-v1.1',
      sourceType: 'legacy-unknown',
      analysisTimestamp: null,
      fileHash: null,
      spectralFeatures: null,
      roomSignatureId: null,
      roomConfidence: null
    });

    const status = await getLegacyBackupStatus();
    expect(status.backup?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(status.migration?.status).toBe('validated');
  });

  it('prevents duplicate migration imports', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify(legacy));
    const first = await importLegacySnapshots();
    const second = await importLegacySnapshots();
    expect(first.imported).toBe(true);
    expect(second.imported).toBe(false);
    expect(await read.all(STORES.VERSIONS)).toHaveLength(1);
  });

  it('refuses backup cleanup if the validated backup hash changes', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify(legacy));
    await importLegacySnapshots();
    const status = await getLegacyBackupStatus();
    await meta.set('_legacy_backup', { ...status.backup, raw: JSON.stringify([{ tampered: true }]) });
    await expect(finalizeLegacyBackupAfterCleanLaunch()).rejects.toThrow(/hash changed/i);
    expect((await getLegacyBackupStatus()).backup).not.toBeNull();
  });

  it('removes the verified backup only after the next confirmed clean launch', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify(legacy));
    await importLegacySnapshots();
    const final = await finalizeLegacyBackupAfterCleanLaunch();
    expect(final.removed).toBe(true);
    expect((await getLegacyBackupStatus()).backup).toBeNull();
  });
});
