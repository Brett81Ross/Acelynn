export const LOUDNESS_OFFSET = -0.691;
export const ABSOLUTE_GATE_LUFS = -70;
export const RELATIVE_GATE_LU = -10;

export function clampFinite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function powerToLufs(power) {
  const value = Number(power);
  return Number.isFinite(value) && value > 0
    ? LOUDNESS_OFFSET + 10 * Math.log10(value)
    : -Infinity;
}

export function lufsToPower(lufs) {
  const value = Number(lufs);
  return Number.isFinite(value) ? 10 ** ((value - LOUDNESS_OFFSET) / 10) : 0;
}

export function createKWeightingCoefficients(sampleRate) {
  const fs = Number(sampleRate);
  if (!Number.isFinite(fs) || fs < 8000) throw new TypeError('sampleRate must be at least 8000 Hz');

  const shelfDb = 3.999843853973347;
  const shelfF0 = 1681.974450955533;
  const shelfQ = 0.7071752369554196;
  let K = Math.tan(Math.PI * shelfF0 / fs);
  const Vh = 10 ** (shelfDb / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / shelfQ + K * K;
  const pre = {
    b0: (Vh + Vb * K / shelfQ + K * K) / a0,
    b1: 2 * (K * K - Vh) / a0,
    b2: (Vh - Vb * K / shelfQ + K * K) / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / shelfQ + K * K) / a0
  };

  const highPassF0 = 38.13547087602444;
  const highPassQ = 0.5003270373238773;
  K = Math.tan(Math.PI * highPassF0 / fs);
  a0 = 1 + K / highPassQ + K * K;
  const rlb = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / highPassQ + K * K) / a0
  };
  return { pre, rlb };
}

export class BiquadState {
  constructor(coefficients) {
    this.c = { ...coefficients };
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(sample) {
    const x = Number.isFinite(sample) ? sample : 0;
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return Number.isFinite(y) ? y : 0;
  }
}

export class KWeightingState {
  constructor(sampleRate) {
    const { pre, rlb } = createKWeightingCoefficients(sampleRate);
    this.pre = new BiquadState(pre);
    this.rlb = new BiquadState(rlb);
  }

  process(sample) {
    return this.rlb.process(this.pre.process(sample));
  }
}

export function calculateIntegratedLufs(blockPowers) {
  const blocks = Array.from(blockPowers || [], value => Number(value)).filter(value => Number.isFinite(value) && value > 0);
  if (!blocks.length) return { integratedLufs: -Infinity, absoluteGatedCount: 0, relativeGatedCount: 0, relativeGateLufs: -Infinity };

  const absolute = blocks.filter(power => powerToLufs(power) > ABSOLUTE_GATE_LUFS);
  if (!absolute.length) return { integratedLufs: -Infinity, absoluteGatedCount: 0, relativeGatedCount: 0, relativeGateLufs: -Infinity };

  const absoluteMean = absolute.reduce((sum, value) => sum + value, 0) / absolute.length;
  const relativeGateLufs = powerToLufs(absoluteMean) + RELATIVE_GATE_LU;
  const finalGate = Math.max(ABSOLUTE_GATE_LUFS, relativeGateLufs);
  const relative = absolute.filter(power => powerToLufs(power) > finalGate);
  if (!relative.length) return { integratedLufs: -Infinity, absoluteGatedCount: absolute.length, relativeGatedCount: 0, relativeGateLufs };

  const mean = relative.reduce((sum, value) => sum + value, 0) / relative.length;
  return {
    integratedLufs: powerToLufs(mean),
    absoluteGatedCount: absolute.length,
    relativeGatedCount: relative.length,
    relativeGateLufs
  };
}

export function correlationFromSums({ sumLR, sumL2, sumR2 }) {
  const lr = Number(sumLR);
  const l2 = Number(sumL2);
  const r2 = Number(sumR2);
  if (![lr, l2, r2].every(Number.isFinite) || l2 <= 0 || r2 <= 0) return null;
  const value = lr / Math.sqrt(l2 * r2);
  return Math.max(-1, Math.min(1, value));
}

export function cubicInterpolate(p0, p1, p2, p3, t) {
  const a0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const a1 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const a2 = -0.5 * p0 + 0.5 * p2;
  const a3 = p1;
  return ((a0 * t + a1) * t + a2) * t + a3;
}

export function estimateInterSamplePeak4x(samples) {
  const input = Array.from(samples || [], value => Number.isFinite(Number(value)) ? Number(value) : 0);
  if (!input.length) return 0;
  let peak = input.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (input.length < 4) return peak;
  for (let i = 1; i < input.length - 2; i += 1) {
    for (const t of [0.25, 0.5, 0.75]) {
      peak = Math.max(peak, Math.abs(cubicInterpolate(input[i - 1], input[i], input[i + 1], input[i + 2], t)));
    }
  }
  return peak;
}

export function amplitudeToDbfs(amplitude) {
  const value = Math.abs(Number(amplitude));
  return Number.isFinite(value) && value > 0 ? 20 * Math.log10(value) : -Infinity;
}

export function summarizeInputBlock(channels) {
  const valid = Array.from(channels || []).filter(channel => channel && typeof channel.length === 'number');
  if (!valid.length) return {
    channelCount: 0,
    samplePeakDbfs: -Infinity,
    truePeakEstimateDbtp: -Infinity,
    correlation: null,
    dcOffset: [],
    rmsDbfs: -Infinity
  };
  const length = Math.max(0, ...valid.map(channel => channel.length));
  let samplePeak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  const dcOffset = valid.map(channel => {
    let sum = 0;
    for (let i = 0; i < channel.length; i += 1) {
      const value = Number.isFinite(channel[i]) ? channel[i] : 0;
      sum += value;
      sumSquares += value * value;
      samplePeak = Math.max(samplePeak, Math.abs(value));
      sampleCount += 1;
    }
    return channel.length ? sum / channel.length : 0;
  });
  let truePeak = samplePeak;
  for (const channel of valid) truePeak = Math.max(truePeak, estimateInterSamplePeak4x(channel));

  let correlation = null;
  if (valid.length >= 2) {
    let sumLR = 0;
    let sumL2 = 0;
    let sumR2 = 0;
    const count = Math.min(valid[0].length, valid[1].length, length);
    for (let i = 0; i < count; i += 1) {
      const left = Number.isFinite(valid[0][i]) ? valid[0][i] : 0;
      const right = Number.isFinite(valid[1][i]) ? valid[1][i] : 0;
      sumLR += left * right;
      sumL2 += left * left;
      sumR2 += right * right;
    }
    correlation = correlationFromSums({ sumLR, sumL2, sumR2 });
  }
  const rms = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
  return {
    channelCount: valid.length,
    samplePeakDbfs: amplitudeToDbfs(samplePeak),
    truePeakEstimateDbtp: amplitudeToDbfs(truePeak),
    correlation,
    dcOffset,
    rmsDbfs: amplitudeToDbfs(rms)
  };
}

export function classifyDropout({ previousRmsDbfs, currentRmsDbfs, priorSignalFloorDbfs = -55, dropoutFloorDbfs = -90 }) {
  const previous = Number(previousRmsDbfs);
  const current = Number(currentRmsDbfs);
  return Number.isFinite(previous) && Number.isFinite(current) && previous >= priorSignalFloorDbfs && current <= dropoutFloorDbfs;
}
