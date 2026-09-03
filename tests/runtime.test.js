import { beforeEach, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { STORES, openDatabase, resetDatabaseConnectionForTests } from '../js/db.js';
import { clear, read } from '../js/storage.js';
import { getLegacyBackupStatus } from '../js/migration.js';
import {
  clearActiveRoomSignature,
  clearSourceFile,
  getActiveRoomSignature,
  initializeRuntime,
  persistAnalysis,
  saveRoomSignature,
  setSourceFile
} from '../js/runtime.js';

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

describe('Acelynn v1.3 runtime persistence', () => {
  it('persists a structured enriched 32-bin analysis record and metering aggregates without audio bytes', async () => {
    const before = Date.now();
    const result = await persistAnalysis({
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      profile: 'Balanced mix',
      score: 82,
      perspectiveWeightedScore: 84,
      targetProfileMatch: 82,
      focus: 'Mids',
      bandValues: [20, 40, 80, 55, 30],
      sourceType: 'microphone',
      perspective: 'mix',
      levels: { peakDbfs: -2.5, rmsDbfs: -12.5, crestDb: 10 },
      coachingFindings: [{ severity: 1, title: 'Check mids.', text: 'Listen around 1 kHz.' }],
      referenceDeltas: [{ name: 'Mids', delta: 4.2, direction: 'up' }],
      professionalMetering: {
        standard: 'ITU-R BS.1770-5 / EBU Tech 3341 aligned',
        compliance: 'algorithm-aligned; official compliance test-set pending',
        measurementDomain: 'acoustic-capture',
        sampleRate: 48000,
        channelCount: 1,
        momentaryLufs: -24.1,
        shortTermLufs: -23.8,
        integratedLufs: -24.0,
        samplePeakDbfs: -2.5,
        truePeakEstimateDbtp: -2.1,
        truePeakMethod: '4x-cubic-inter-sample-estimate',
        correlation: null,
        dcOffset: [0.0002],
        dropoutCount: 0,
        vectorPoints: [[0.2, 0.2], [0.3, 0.3]]
      }
    });
    expect(result.saved).toBe(true);
    const record = result.record;
    expect(record.analysisTimestamp).toBeGreaterThanOrEqual(before);
    expect(record.createdAt).toBeGreaterThanOrEqual(record.analysisTimestamp);
    expect(record.origin).toBe('v1.3-runtime');
    expect(record.featureSchemaVersion).toBe(3);
    expect(record.spectralDefinition).toBe('log32-slope-v1');
    expect(record.meteringDefinition).toBe('bs1770-ebu3341-v1');
    expect(record.spectralFeatures.coarseBins).toHaveLength(32);
    expect(record.spectralFeatures.normalizedCoarseSpectrum).toHaveLength(32);
    expect(record.mixHealth).toEqual({ raw: 82, perspectiveWeighted: 84, targetProfileMatch: 82 });
    expect(record.levels).toEqual({ peakDbfs: -2.5, rmsDbfs: -12.5, crestDb: 10 });
    expect(record.coachingFindings[0].title).toBe('Check mids.');
    expect(record.referenceDeltas[0]).toMatchObject({ name: 'Mids', delta: 4.2, direction: 'up' });
    expect(record.roomSignatureId).toBeNull();
    expect(record.roomConfidence).toBeNull();
    expect(record.fileHash).toBeNull();
    expect(record.sourceMetadata).toEqual({});
    expect(record.professionalMetering).toMatchObject({
      definition: 'bs1770-ebu3341-v1',
      measurementDomain: 'acoustic-capture',
      sampleRate: 48000,
      channelCount: 1,
      momentaryLufs: -24.1,
      truePeakEstimateDbtp: -2.1,
      dropoutCount: 0
    });
    expect(record.professionalMetering).not.toHaveProperty('vectorPoints');
    expect(JSON.stringify(record)).not.toContain('audioBytes');
    expect(JSON.stringify(record)).not.toContain('pcm');
    expect(await read.all(STORES.VERSIONS)).toHaveLength(1);
  });

  it('stores a local room signature, resolves it as active, and can deactivate it without deleting history', async () => {
    const signature = await saveRoomSignature({
      fftMagnitudes: flatSpectrum(1024, 2),
      sampleRate: 48000,
      fftSize: 2048,
      bandValues: [50, 70, 65, 52, 38],
      confidence: 0.86,
      name: 'Studio desk'
    });
    expect(signature.scope).toBe('room');
    expect(signature.normalizedBands).toHaveLength(5);
    expect(signature.spectralFeatures.coarseBins).toHaveLength(32);
    expect(signature.confidence).toBe(0.86);
    expect((await getActiveRoomSignature())?.id).toBe(signature.id);
    expect((await read.all(STORES.REFERENCES)).filter(ref => ref.scope === 'room')).toHaveLength(1);

    await clearActiveRoomSignature();
    expect(await getActiveRoomSignature()).toBeNull();
    expect((await read.all(STORES.REFERENCES)).filter(ref => ref.scope === 'room')).toHaveLength(1);
  });

  it('persists the room signature linkage when an analysis uses room-aware scoring', async () => {
    const signature = await saveRoomSignature({
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      bandValues: [60, 75, 64, 50, 39],
      confidence: 0.78
    });
    const result = await persistAnalysis({
      fftMagnitudes: flatSpectrum(),
      sampleRate: 48000,
      fftSize: 2048,
      profile: 'Balanced mix',
      score: 76,
      perspectiveWeightedScore: 79,
      targetProfileMatch: 76,
      focus: 'Bass',
      bandValues: [55, 72, 60, 48, 38],
      sourceType: 'microphone',
      perspective: 'room',
      roomSignatureId: signature.id,
      roomConfidence: signature.confidence
    });
    expect(result.record.roomSignatureId).toBe(signature.id);
    expect(result.record.roomConfidence).toBe(0.78);
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
      perspectiveWeightedScore: 75,
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
