import { describe, expect, it } from 'vitest';
import { compareAnalyses } from '../js/comparability.js';

const base = {
  captureMode: 'file', bandUnit: 'relative-db', sourceFormat: 'wav', sampleRate: 48000, bitDepth: 24,
  bitrate: null, channelCount: 2, analysisEngineVersion: 'core-1', profileUsed: 'Balanced mix',
  bands: { sub: -30, bass: -24, mids: -20, presence: -25, air: -32 },
  balance: { score: 78 }
};
const changed = { ...base, bands: { sub: -29, bass: -24.5, mids: -21, presence: -23, air: -31 }, balance: { score: 82 } };

describe('per-band comparability contract', () => {
  it('compares same-condition WAV revisions numerically', () => {
    const d = compareAnalyses(base, changed);
    expect(d.comparableBandCount).toBe(5);
    expect(d.bands.presence).toMatchObject({ classification: 'comparable', delta: 2, direction: '↑' });
    expect(d.balanceDelta).toBe(4);
  });

  it('suppresses codec-sensitive bands for WAV to low-bitrate MP3', () => {
    const mp3 = { ...changed, sourceFormat: 'mp3', bitrate: 128000 };
    const d = compareAnalyses(base, mp3);
    expect(d.bands.sub.classification).toBe('comparable');
    expect(d.bands.mids.classification).toBe('comparable');
    expect(d.bands.presence.classification).toBe('direction-only');
    expect(d.bands.presence.delta).toBeNull();
    expect(d.bands.air.classification).toBe('suppressed');
  });

  it('suppresses file-to-microphone comparison', () => {
    const mic = { ...changed, captureMode: 'microphone', sourceFormat: null };
    const d = compareAnalyses(base, mic);
    expect(Object.values(d.bands).every(x => x.classification === 'suppressed')).toBe(true);
  });

  it('keeps measurements independent while suppressing profile-dependent score delta', () => {
    const other = { ...changed, profileUsed: 'Vocal clarity' };
    const d = compareAnalyses(base, other);
    expect(d.bands.mids.classification).toBe('comparable');
    expect(d.balanceDelta).toBeNull();
    expect(d.profileMismatch).toBe(true);
  });

  it('refuses fake dB precision for legacy byte-energy bands', () => {
    const legacy = { ...base, bandUnit: 'legacy-byte-energy' };
    const legacy2 = { ...changed, bandUnit: 'legacy-byte-energy' };
    const d = compareAnalyses(legacy, legacy2);
    expect(d.bands.sub.classification).toBe('direction-only');
    expect(d.bands.sub.delta).toBeNull();
    expect(d.bands.sub.direction).toBe('↑');
  });

  it('warns across engine versions while retaining tagged band deltas', () => {
    const newer = { ...changed, analysisEngineVersion: 'core-2' };
    const d = compareAnalyses(base, newer);
    expect(d.engineMismatch).toBe(true);
    expect(d.bands.sub.classification).toBe('comparable');
    expect(d.bands.sub.reasons.join(' ')).toMatch(/engine version changed/i);
  });
});
