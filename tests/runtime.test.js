import { beforeEach, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { STORES, openDatabase, resetDatabaseConnectionForTests } from '../js/db.js';
import { clear, read } from '../js/storage.js';
import { getLegacyBackupStatus } from '../js/migration.js';
import { clearSourceFile, initializeRuntime, persistAnalysis, setSourceFile } from '../js/runtime.js';

async function clearAllStores() {
  resetDatabaseConnectionForTests();
  await openDatabase();
  for (const store of Object.values(STORES)) await clear(store);
}

async function resetStores() {
  await clearAllStores();
  localStorage.clear();
  await initializeRuntime();
}

function flatSpectrum(length = 1024, value = 1) {
  return Array.from({ length }, () => value);
}

beforeEach(async () => {
  clearSourceFile();
  await resetStores();
});

describe('Acelynn v1.2 runtime persistence', () => {
  it('persists a structured 32-bin analysis record without audio bytes', async () => {
    const before = Date.now();
    const result = await persistAnalysis({
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      profile: 'Balanced mix',
      score: 84,
      focus: 'Mids',
      bandValues: [20, 40, 80, 55, 30],
      sourceType: 'microphone',
      perspective: 'mix'
    });
    expect(result.saved).toBe(true);
    const record = result.record;
    expect(record.analysisTimestamp).toBeGreaterThanOrEqual(before);
    expect(record.createdAt).toBeGreaterThanOrEqual(record.analysisTimestamp);
    expect(record.spectralDefinition).toBe('log32-slope-v1');
    expect(record.spectralFeatures.coarseBins).toHaveLength(32);
    expect(record.spectralFeatures.normalizedCoarseSpectrum).toHaveLength(32);
    expect(record.roomSignatureId).toBeNull();
    expect(record.roomConfidence).toBeNull();
    expect(record.fileHash).toBeNull();
    expect(record.sourceMetadata).toEqual({});
    expect(JSON.stringify(record)).not.toContain('audioBytes');
    expect(JSON.stringify(record)).not.toContain('pcm');
    expect(await read.all(STORES.VERSIONS)).toHaveLength(1);
  });

  it('hashes a source file and prevents duplicate file records for the same workspace', async () => {
    const file = new NodeBlob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/wav' });
    Object.defineProperty(file, 'name', { value: 'mix.wav' });
    const hash = await setSourceFile(file);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const payload = {
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      profile: 'Balanced mix',
      score: 75,
      focus: 'Bass',
      bandValues: [30, 70, 55, 40, 20],
      sourceType: 'file',
      perspective: 'mix'
    };
    const first = await persistAnalysis(payload);
    const second = await persistAnalysis(payload);
    expect(first.saved).toBe(true);
    expect(first.record.fileHash).toBe(hash);
    expect(first.record.sourceMetadata).toMatchObject({ name: 'mix.wav', type: 'audio/wav', size: 5 });
    expect(second.saved).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await read.all(STORES.VERSIONS)).toHaveLength(1);
  });

  it('imports legacy snapshots once and removes the verified backup only on a later clean launch', async () => {
    await clearAllStores();
    localStorage.clear();
    localStorage.setItem('acelynn-snapshots', JSON.stringify([
      { time: 'Sep 2, 9:00 PM', profile: 'Balanced mix', score: 81, focus: 'Mids', bands: [12, 20, 31, 24, 14] }
    ]));

    const firstLaunch = await initializeRuntime();
    expect(firstLaunch.migration.migration?.imported).toBe(true);
    let status = await getLegacyBackupStatus();
    expect(status.migration?.status).toBe('validated');
    expect(status.backup?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await read.all(STORES.VERSIONS)).filter(v => v.origin === 'legacy-v1.1')).toHaveLength(1);

    const secondLaunch = await initializeRuntime();
    expect(secondLaunch.migration.finalizedPriorBackup).toBe(true);
    status = await getLegacyBackupStatus();
    expect(status.backup).toBeNull();
    expect((await read.all(STORES.VERSIONS)).filter(v => v.origin === 'legacy-v1.1')).toHaveLength(1);
  });
});
