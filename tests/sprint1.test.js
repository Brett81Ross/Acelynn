import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, STORES, openDatabase, requestToPromise, resetDatabaseConnectionForTests, withTransaction } from '../js/db.js';
import { clear, deleteProjectCascade, meta, put, read, resilientWrite } from '../js/storage.js';
import { dryRunLegacyMigration, finalizeLegacyBackupAfterCleanLaunch, getLegacyBackupStatus, importLegacySnapshots } from '../js/migration.js';

async function clearAll() {
  await openDatabase();
  for (const store of Object.values(STORES)) await clear(store);
  localStorage.clear();
}

beforeEach(async () => {
  resetDatabaseConnectionForTests();
  await clearAll();
});

describe('Sprint 1 IndexedDB foundation', () => {
  it('creates the required stores and indexes', async () => {
    const db = await openDatabase();
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(Object.values(STORES)));

    await withTransaction([STORES.VERSIONS], 'readonly', stores => {
      expect([...stores[STORES.VERSIONS].indexNames]).toEqual(expect.arrayContaining([
        'bySong', 'bySongCreated', 'byParent', 'byCreatedAt', 'bySourceType', 'byPerspective'
      ]));
    });
  });

  it('retries transient writes before succeeding', async () => {
    let attempts = 0;
    const value = await resilientWrite(async () => {
      attempts += 1;
      if (attempts < 3) throw new DOMException('temporarily locked', 'UnknownError');
      return 'saved';
    });
    expect(value).toBe('saved');
    expect(attempts).toBe(3);
  });

  it('keeps multi-store writes atomic when work throws', async () => {
    await expect(withTransaction([STORES.PROJECTS, STORES.SONGS], 'readwrite', async stores => {
      await requestToPromise(stores[STORES.PROJECTS].put({ id: 'p1', name: 'P', createdAt: 1, updatedAt: 1, metadata: {} }));
      stores[STORES.SONGS].put({ id: 's1', projectId: 'p1', name: 'S', createdAt: 1, updatedAt: 1, metadata: {} });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    expect(await read.one(STORES.PROJECTS, 'p1')).toBeUndefined();
    expect(await read.one(STORES.SONGS, 's1')).toBeUndefined();
  });

  it('cascades project deletion through songs, versions and references', async () => {
    await put(STORES.PROJECTS, { id: 'p1', name: 'Project', createdAt: 1, updatedAt: 1, metadata: {} });
    await put(STORES.SONGS, { id: 's1', projectId: 'p1', name: 'Song', createdAt: 1, updatedAt: 1, metadata: {} });
    await put(STORES.VERSIONS, { id: 'v1', songId: 's1', parentVersionId: null, createdAt: 1, sourceType: 'file', perspective: 'full-mix' });
    await put(STORES.REFERENCES, { id: 'r1', scope: 'song', songId: 's1', name: 'Ref', createdAt: 1 });

    const result = await deleteProjectCascade('p1');
    expect(result).toEqual({ songsDeleted: 1, versionsDeleted: 1, referencesDeleted: 1 });
    expect(await read.one(STORES.PROJECTS, 'p1')).toBeUndefined();
    expect(await read.one(STORES.VERSIONS, 'v1')).toBeUndefined();
  });
});

describe('legacy migration', () => {
  it('dry-runs without modifying legacy localStorage', () => {
    const raw = JSON.stringify([{ time: 'Aug 30, 1:00 PM', profile: 'Balanced mix', score: 82, focus: 'Mids', bands: [10, 20, 30, 20, 10] }]);
    localStorage.setItem('acelynn-snapshots', raw);
    const result = dryRunLegacyMigration();
    expect(result.importableCount).toBe(1);
    expect(localStorage.getItem('acelynn-snapshots')).toBe(raw);
  });

  it('backs up, imports, validates, and keeps legacy observations explicitly limited', async () => {
    localStorage.setItem('acelynn-snapshots', JSON.stringify([
      { time: 'Aug 30, 1:00 PM', profile: 'Balanced mix', score: 82, focus: 'Mids', bands: [10, 20, 30, 20, 10] }
    ]));

    const result = await importLegacySnapshots();
    expect(result.imported).toBe(true);
    expect(result.validation.ok).toBe(true);

    const versions = await read.all(STORES.VERSIONS);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      origin: 'legacy-v1.1',
      sourceType: 'legacy-unknown',
      perspective: null,
      analysisTimestamp: null,
      fileHash: null,
      spectralFeatures: null,
      roomSignatureId: null,
      roomConfidence: null
    });
    expect(versions[0].confidence.overall).toBeNull();

    const status = await getLegacyBackupStatus();
    expect(status.backup?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(status.migration?.status).toBe('validated');

    const final = await finalizeLegacyBackupAfterCleanLaunch();
    expect(final.removed).toBe(true);
    expect((await getLegacyBackupStatus()).backup).toBeNull();
  });
});
