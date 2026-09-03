import { describe, expect, it } from 'vitest';
import {
  applyRoomSignature,
  buildRuleFindings,
  calculatePerspectiveHealth,
  diffSnapshots,
  estimateRoomConfidence,
  normalizeBandValues
} from '../js/insights.js';

const target = [42, 56, 62, 55, 43];

describe('Acelynn perspective-weighted health', () => {
  it('keeps mix weighting equal to the raw profile score', () => {
    const result = calculatePerspectiveHealth({ bandValues: [42, 56, 62, 55, 43], target, perspective: 'mix' });
    expect(result.weightedScore).toBe(result.rawScore);
    expect(result.normalized).toHaveLength(5);
  });

  it('weights low-frequency mismatch more strongly in room perspective', () => {
    const values = [100, 95, 62, 55, 43];
    const room = calculatePerspectiveHealth({ bandValues: values, target, perspective: 'room' });
    const detail = calculatePerspectiveHealth({ bandValues: values, target, perspective: 'detail' });
    expect(room.weightedScore).toBeLessThan(detail.weightedScore);
  });

  it('weights upper-frequency mismatch more strongly in detail perspective', () => {
    const values = [42, 56, 62, 95, 100];
    const room = calculatePerspectiveHealth({ bandValues: values, target, perspective: 'room' });
    const detail = calculatePerspectiveHealth({ bandValues: values, target, perspective: 'detail' });
    expect(detail.weightedScore).toBeLessThan(room.weightedScore);
  });
});

describe('Acelynn room signature behavior', () => {
  it('applies conservative centered compensation without mutating the live bands', () => {
    const live = [100, 80, 65, 55, 45];
    const signature = [100, 92, 70, 52, 40];
    const original = [...live];
    const liveNormalized = normalizeBandValues(live);
    const result = applyRoomSignature(live, signature);
    expect(live).toEqual(original);
    expect(result.adjusted).toHaveLength(5);
    expect(Math.max(...result.corrections.map(Math.abs))).toBeLessThanOrEqual(14);
    expect(result.corrections[0]).toBeGreaterThan(0);
    expect(result.adjusted[0] - result.adjusted[2]).toBeLessThan(liveNormalized[0] - liveNormalized[2]);
  });

  it('scores stable multi-frame room captures higher than unstable captures', () => {
    const stable = Array.from({ length: 10 }, (_, i) => [40 + (i % 2), 55, 62, 54, 43]);
    const unstable = Array.from({ length: 10 }, (_, i) => i % 2 ? [100, 10, 95, 5, 90] : [10, 100, 5, 95, 8]);
    expect(estimateRoomConfidence(stable)).toBeGreaterThan(estimateRoomConfidence(unstable));
    expect(estimateRoomConfidence(stable)).toBeGreaterThan(0.7);
  });
});

describe('Acelynn Mix-Diff and live rule coach', () => {
  it('surfaces the three largest A/B band changes and score movement', () => {
    const previous = { score: 70, bands: [30, 50, 80, 45, 25] };
    const current = { score: 78, bands: [55, 50, 60, 85, 25] };
    const diff = diffSnapshots(current, previous);
    expect(diff.scoreDelta).toBe(8);
    expect(diff.largestChanges).toHaveLength(3);
    expect(diff.largestChanges[0].name).toBe('Presence');
    expect(diff.summary).toContain('improved');
  });

  it('prioritizes clipping and perspective-specific deterministic warnings', () => {
    const findings = buildRuleFindings({
      normalized: [95, 94, 60, 55, 40],
      target,
      perspective: 'room',
      peakDb: -0.2,
      rmsDb: -8,
      weightedScore: 55,
      roomApplied: true
    });
    expect(findings[0].title).toContain('Peak headroom');
    expect(findings.some(item => item.title.includes('room buildup'))).toBe(true);
    expect(findings.length).toBeLessThanOrEqual(3);
  });

  it('does not invent clipping or crest warnings when level data is unavailable', () => {
    const findings = buildRuleFindings({
      normalized: target,
      target,
      perspective: 'mix',
      peakDb: null,
      rmsDb: null,
      weightedScore: 90
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('No rule-level warning.');
  });
});
