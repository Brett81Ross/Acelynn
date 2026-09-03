import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_GATE_LUFS,
  calculateIntegratedLufs,
  classifyDropout,
  correlationFromSums,
  createKWeightingCoefficients,
  estimateInterSamplePeak4x,
  lufsToPower,
  powerToLufs,
  summarizeInputBlock
} from '../js/metering-core.js';

describe('Acelynn v1.3 professional metering core', () => {
  it('matches the ITU-R BS.1770 48 kHz K-weighting coefficients', () => {
    const { pre, rlb } = createKWeightingCoefficients(48000);
    expect(pre.b0).toBeCloseTo(1.53512485958697, 10);
    expect(pre.b1).toBeCloseTo(-2.69169618940638, 10);
    expect(pre.b2).toBeCloseTo(1.19839281085285, 10);
    expect(pre.a1).toBeCloseTo(-1.69065929318241, 10);
    expect(pre.a2).toBeCloseTo(0.73248077421585, 10);
    expect(rlb.b0).toBe(1);
    expect(rlb.b1).toBe(-2);
    expect(rlb.b2).toBe(1);
    expect(rlb.a1).toBeCloseTo(-1.99004745483398, 10);
    expect(rlb.a2).toBeCloseTo(0.99007225036621, 10);
  });

  it('adapts K-weighting coefficients to other valid sample rates without non-finite values', () => {
    const coefficients = createKWeightingCoefficients(44100);
    for (const stage of Object.values(coefficients)) {
      for (const value of Object.values(stage)) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('round-trips loudness power and LUFS', () => {
    for (const lufs of [-60, -23, -14, -6]) {
      expect(powerToLufs(lufsToPower(lufs))).toBeCloseTo(lufs, 10);
    }
  });

  it('applies the BS.1770 absolute and relative integrated loudness gates', () => {
    const programme = Array.from({ length: 20 }, () => lufsToPower(-23));
    const silence = Array.from({ length: 5 }, () => lufsToPower(-80));
    const result = calculateIntegratedLufs([...silence, ...programme]);
    expect(ABSOLUTE_GATE_LUFS).toBe(-70);
    expect(result.absoluteGatedCount).toBe(20);
    expect(result.relativeGatedCount).toBe(20);
    expect(result.integratedLufs).toBeCloseTo(-23, 6);
    expect(result.relativeGateLufs).toBeCloseTo(-33, 6);
  });

  it('does not invent integrated loudness for silence', () => {
    const result = calculateIntegratedLufs(Array.from({ length: 8 }, () => lufsToPower(-90)));
    expect(result.integratedLufs).toBe(-Infinity);
    expect(result.absoluteGatedCount).toBe(0);
  });

  it('calculates stereo correlation and rejects missing stereo energy', () => {
    expect(correlationFromSums({ sumLR: 10, sumL2: 10, sumR2: 10 })).toBeCloseTo(1, 10);
    expect(correlationFromSums({ sumLR: -10, sumL2: 10, sumR2: 10 })).toBeCloseTo(-1, 10);
    expect(correlationFromSums({ sumLR: 0, sumL2: 10, sumR2: 10 })).toBeCloseTo(0, 10);
    expect(correlationFromSums({ sumLR: 0, sumL2: 0, sumR2: 10 })).toBeNull();
  });

  it('never reports an inter-sample estimate below the actual sample peak', () => {
    const samples = [0, 0.8, -1, 0.7, 0, -0.2];
    expect(estimateInterSamplePeak4x(samples)).toBeGreaterThanOrEqual(1);
  });

  it('keeps mono input mono-safe and does not fabricate stereo correlation', () => {
    const mono = Float32Array.from([0.1, 0.2, -0.1, -0.2]);
    const summary = summarizeInputBlock([mono]);
    expect(summary.channelCount).toBe(1);
    expect(summary.correlation).toBeNull();
    expect(summary.dcOffset).toHaveLength(1);
    expect(Number.isFinite(summary.samplePeakDbfs)).toBe(true);
    expect(Number.isFinite(summary.truePeakEstimateDbtp)).toBe(true);
  });

  it('detects a transition from valid programme level to a near-silent dropout', () => {
    expect(classifyDropout({ previousRmsDbfs: -30, currentRmsDbfs: -96 })).toBe(true);
    expect(classifyDropout({ previousRmsDbfs: -75, currentRmsDbfs: -96 })).toBe(false);
    expect(classifyDropout({ previousRmsDbfs: -30, currentRmsDbfs: -60 })).toBe(false);
  });
});
