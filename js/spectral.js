import { APP_META } from './meta.js';

export const COARSE_BIN_COUNT = 32;
export const MIN_ANALYSIS_HZ = 20;
export const MAX_ANALYSIS_HZ = 20000;
export const MACRO_BANDS = Object.freeze([
  { id: 'sub', minHz: 20, maxHz: 60 },
  { id: 'bass', minHz: 60, maxHz: 250 },
  { id: 'mids', minHz: 250, maxHz: 2000 },
  { id: 'presence', minHz: 2000, maxHz: 6000 },
  { id: 'air', minHz: 6000, maxHz: 20000 }
]);

const EPSILON = 1e-12;

function finiteNonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getAnalysisUpperHz(sampleRate) {
  const nyquist = Number(sampleRate) / 2;
  if (!Number.isFinite(nyquist) || nyquist <= MIN_ANALYSIS_HZ) throw new RangeError('Sample rate is too low for 20 Hz spectral analysis');
  return Math.min(MAX_ANALYSIS_HZ, nyquist);
}

export function createLogEdges(sampleRate, count = COARSE_BIN_COUNT) {
  if (!Number.isInteger(count) || count <= 0) throw new RangeError('Bin count must be a positive integer');
  const upper = getAnalysisUpperHz(sampleRate);
  const ratio = Math.pow(upper / MIN_ANALYSIS_HZ, 1 / count);
  const edges = Array.from({ length: count + 1 }, (_, i) => MIN_ANALYSIS_HZ * Math.pow(ratio, i));
  edges[0] = MIN_ANALYSIS_HZ;
  edges[edges.length - 1] = upper;
  return edges;
}

export function linearRegressionSlope(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return 0;
  const clean = xs.map((x, i) => [Number(x), Number(ys[i])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (clean.length < 2) return 0;
  const meanX = clean.reduce((sum, pair) => sum + pair[0], 0) / clean.length;
  const meanY = clean.reduce((sum, pair) => sum + pair[1], 0) / clean.length;
  let numerator = 0;
  let denominator = 0;
  for (const [x, y] of clean) {
    const dx = x - meanX;
    numerator += dx * (y - meanY);
    denominator += dx * dx;
  }
  return denominator > EPSILON ? numerator / denominator : 0;
}

function validateFftInput(magnitudes, sampleRate, fftSize) {
  if (!magnitudes || typeof magnitudes.length !== 'number' || magnitudes.length < 2) throw new TypeError('FFT magnitudes are required');
  if (!Number.isFinite(Number(sampleRate)) || Number(sampleRate) <= 0) throw new RangeError('sampleRate must be positive');
  if (!Number.isInteger(Number(fftSize)) || Number(fftSize) <= 0) throw new RangeError('fftSize must be a positive integer');
}

function fftPointFrequency(index, sampleRate, fftSize) {
  return index * sampleRate / fftSize;
}

function aggregateRange(magnitudes, sampleRate, fftSize, minHz, maxHz, includeUpper = false) {
  let sumPower = 0;
  let count = 0;
  let maxPower = 0;
  let minPositivePower = Infinity;
  for (let i = 0; i < magnitudes.length; i += 1) {
    const hz = fftPointFrequency(i, sampleRate, fftSize);
    if (hz < minHz || (includeUpper ? hz > maxHz : hz >= maxHz)) continue;
    const amplitude = finiteNonNegative(magnitudes[i]);
    const power = amplitude * amplitude;
    sumPower += power;
    maxPower = Math.max(maxPower, power);
    if (power > EPSILON) minPositivePower = Math.min(minPositivePower, power);
    count += 1;
  }
  const meanPower = count ? sumPower / count : 0;
  const spectralCrest = meanPower > EPSILON ? maxPower / meanPower : 0;
  const spectralContrastDb = maxPower > EPSILON && Number.isFinite(minPositivePower)
    ? 10 * Math.log10(maxPower / Math.max(minPositivePower, EPSILON))
    : 0;
  return { count, sumPower, meanPower, maxPower, spectralCrest, spectralContrastDb };
}

export function computeCoarseSpectrum(magnitudes, sampleRate, fftSize) {
  validateFftInput(magnitudes, sampleRate, fftSize);
  const upperHz = getAnalysisUpperHz(sampleRate);
  const edges = createLogEdges(sampleRate, COARSE_BIN_COUNT);
  const bins = [];
  for (let i = 0; i < COARSE_BIN_COUNT; i += 1) {
    const minHz = edges[i];
    const maxHz = edges[i + 1];
    const aggregate = aggregateRange(magnitudes, sampleRate, fftSize, minHz, maxHz, i === COARSE_BIN_COUNT - 1);
    bins.push({
      index: i,
      minHz,
      maxHz,
      centerHz: Math.sqrt(minHz * maxHz),
      sourceBinCount: aggregate.count,
      meanPower: aggregate.meanPower
    });
  }

  const maxPower = Math.max(0, ...bins.map(bin => bin.meanPower));
  const normalized = bins.map(bin => maxPower > EPSILON ? bin.meanPower / maxPower : 0);
  return {
    definition: APP_META.spectralDefinition,
    upperHz,
    bins: bins.map((bin, i) => ({ ...bin, normalized: normalized[i] }))
  };
}

export function computeMacroBandDiagnostics(magnitudes, sampleRate, fftSize) {
  validateFftInput(magnitudes, sampleRate, fftSize);
  const upperHz = getAnalysisUpperHz(sampleRate);
  return Object.fromEntries(MACRO_BANDS.map((band, index) => {
    const minHz = band.minHz;
    const maxHz = Math.min(band.maxHz, upperHz);
    if (maxHz <= minHz) {
      return [band.id, { available: false, minHz, maxHz, sourceBinCount: 0, meanPower: 0, spectralCrest: 0, spectralContrastDb: 0 }];
    }
    const aggregate = aggregateRange(magnitudes, sampleRate, fftSize, minHz, maxHz, index === MACRO_BANDS.length - 1 || maxHz === upperHz);
    return [band.id, {
      available: aggregate.count > 0,
      minHz,
      maxHz,
      sourceBinCount: aggregate.count,
      meanPower: aggregate.meanPower,
      spectralCrest: aggregate.spectralCrest,
      spectralContrastDb: aggregate.spectralContrastDb
    }];
  }));
}

export function computeSpectralFeatures(magnitudes, sampleRate, fftSize) {
  const coarse = computeCoarseSpectrum(magnitudes, sampleRate, fftSize);
  const xs = coarse.bins.map(bin => Math.log10(bin.centerHz));
  const ys = coarse.bins.map(bin => bin.normalized);
  const spectralSlope = linearRegressionSlope(xs, ys);
  const macroBands = computeMacroBandDiagnostics(magnitudes, sampleRate, fftSize);
  return {
    definition: APP_META.spectralDefinition,
    coarseBinCount: COARSE_BIN_COUNT,
    minHz: MIN_ANALYSIS_HZ,
    upperHz: coarse.upperHz,
    normalizedCoarseSpectrum: coarse.bins.map(bin => bin.normalized),
    coarseBins: coarse.bins,
    spectralSlope,
    macroBands
  };
}
