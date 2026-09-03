import { describe, expect, it } from 'vitest';
import {
  COARSE_BIN_COUNT,
  computeSpectralFeatures,
  createLogEdges,
  getAnalysisUpperHz,
  linearRegressionSlope
} from '../js/spectral.js';

function spectrum(sampleRate, fftSize, amplitudeForHz) {
  const length = fftSize / 2;
  return Float64Array.from({ length }, (_, i) => amplitudeForHz(i * sampleRate / fftSize, i));
}

const sampleRate = 48000;
const fftSize = 65536;

describe('log32-slope-v1 spectral engine', () => {
  it('creates exactly 32 logarithmic bins from 20 Hz to the usable upper bound', () => {
    const edges = createLogEdges(sampleRate);
    expect(edges).toHaveLength(COARSE_BIN_COUNT + 1);
    expect(edges[0]).toBe(20);
    expect(edges.at(-1)).toBe(20000);
    for (let i = 1; i < edges.length; i += 1) expect(edges[i]).toBeGreaterThan(edges[i - 1]);
  });

  it('produces a near-flat normalized spectrum and near-zero slope for flat FFT magnitudes', () => {
    const input = spectrum(sampleRate, fftSize, hz => hz >= 20 ? 1 : 0);
    const result = computeSpectralFeatures(input, sampleRate, fftSize);
    expect(result.definition).toBe('log32-slope-v1');
    expect(result.coarseBins).toHaveLength(32);
    expect(result.normalizedCoarseSpectrum).toHaveLength(32);
    expect(result.spectralSlope).toBeCloseTo(0, 2);
    expect(result.normalizedCoarseSpectrum.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
  });

  it('reports negative slope for bass-heavy spectra and positive slope for treble-heavy spectra', () => {
    const bassHeavy = spectrum(sampleRate, fftSize, hz => hz < 20 ? 0 : 1 / Math.sqrt(hz));
    const trebleHeavy = spectrum(sampleRate, fftSize, hz => hz < 20 ? 0 : Math.sqrt(hz));
    expect(computeSpectralFeatures(bassHeavy, sampleRate, fftSize).spectralSlope).toBeLessThan(0);
    expect(computeSpectralFeatures(trebleHeavy, sampleRate, fftSize).spectralSlope).toBeGreaterThan(0);
  });

  it('captures a narrow tonal emphasis without producing NaN or Infinity', () => {
    const tone = spectrum(sampleRate, fftSize, hz => Math.abs(hz - 1000) < 6 ? 10 : 0.01);
    const result = computeSpectralFeatures(tone, sampleRate, fftSize);
    const peak = result.coarseBins.reduce((best, bin) => bin.normalized > best.normalized ? bin : best, result.coarseBins[0]);
    expect(peak.minHz).toBeLessThan(1000);
    expect(peak.maxHz).toBeGreaterThan(1000);
    expect(Number.isFinite(result.spectralSlope)).toBe(true);
    for (const diagnostic of Object.values(result.macroBands)) {
      expect(Number.isFinite(diagnostic.spectralCrest)).toBe(true);
      expect(Number.isFinite(diagnostic.spectralContrastDb)).toBe(true);
    }
  });

  it('honors low sample-rate Nyquist limits while retaining all 32 coarse bins', () => {
    const lowRate = 8000;
    const lowFft = 32768;
    const input = spectrum(lowRate, lowFft, hz => hz >= 20 ? 1 : 0);
    const result = computeSpectralFeatures(input, lowRate, lowFft);
    expect(getAnalysisUpperHz(lowRate)).toBe(4000);
    expect(result.upperHz).toBe(4000);
    expect(result.coarseBins).toHaveLength(32);
    expect(result.coarseBins.at(-1).maxHz).toBe(4000);
    expect(result.macroBands.air.available).toBe(false);
  });

  it('handles silence and non-finite input deterministically', () => {
    const silent = new Float64Array(fftSize / 2);
    silent[100] = Number.NaN;
    silent[200] = Number.POSITIVE_INFINITY;
    const result = computeSpectralFeatures(silent, sampleRate, fftSize);
    expect(result.normalizedCoarseSpectrum.every(v => v === 0)).toBe(true);
    expect(result.spectralSlope).toBe(0);
  });

  it('uses deterministic linear regression', () => {
    expect(linearRegressionSlope([1, 2, 3], [2, 4, 6])).toBeCloseTo(2, 12);
    expect(linearRegressionSlope([1, 2, 3], [5, 5, 5])).toBeCloseTo(0, 12);
  });
});
