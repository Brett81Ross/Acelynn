import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateSignalValidity,
  persistAnalysis,
  SIGNAL_VALIDITY_THRESHOLDS
} from '../js/runtime.js';

describe('Acelynn signal validity gate', () => {
  it('rejects complete silence before scoring or saving', () => {
    const result = evaluateSignalValidity({
      bandValues: [0, 0, 0, 0, 0],
      fftMagnitudes: new Uint8Array(1024),
      rmsDb: -100
    });
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('rms');
    expect(result.failures).toContain('bands');
    expect(result.failures).toContain('fft');
  });

  it('rejects the real Fold failure shape: measurable RMS with near-zero spectral bands', () => {
    const result = evaluateSignalValidity({
      bandValues: [0.2, 0.4, 0.3, 0.2, 0.1],
      fftMagnitudes: [0, 1, 1, 0],
      rmsDb: -46
    });
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('bands');
    expect(result.metrics.rmsDb).toBe(-46);
  });

  it('rejects a usable spectrum when the overall level is still below the listening floor', () => {
    const result = evaluateSignalValidity({
      bandValues: [12, 24, 40, 22, 8],
      fftMagnitudes: [1, 3, 8, 15],
      rmsDb: SIGNAL_VALIDITY_THRESHOLDS.minRmsDb - 1
    });
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('rms');
  });

  it('accepts a normal analysis frame with both usable level and spectral content', () => {
    const result = evaluateSignalValidity({
      bandValues: [12, 24, 40, 22, 8],
      fftMagnitudes: [1, 3, 8, 15],
      rmsDb: -35
    });
    expect(result.valid).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('refuses to persist a zero-band snapshot even when RMS alone looks active', async () => {
    await expect(persistAnalysis({
      fftMagnitudes: new Uint8Array(1024),
      sampleRate: 48000,
      fftSize: 2048,
      profile: 'Balanced mix',
      score: 54,
      perspectiveWeightedScore: 54,
      targetProfileMatch: 54,
      focus: 'Sub',
      bandValues: [0, 0, 0, 0, 0],
      sourceType: 'microphone',
      perspective: 'mix',
      levels: { peakDbfs: -42.1, rmsDbfs: -46.6, crestDb: 4.5 }
    })).rejects.toMatchObject({
      code: 'NO_USABLE_SIGNAL',
      name: 'AcelynnSignalValidationError'
    });
  });

  it('installs a capture-phase UI guard so invalid frames cannot become legacy snapshots', () => {
    const source = readFileSync(resolve(process.cwd(), 'js/ui-enhancements.js'), 'utf8');
    expect(source).toContain("captureButton.addEventListener('click'");
    expect(source).toContain('event.stopImmediatePropagation()');
    expect(source).toContain("captureButton.textContent !== 'Waiting for audio'");
    expect(source).toContain('evaluateFrameSignal(frame)');
  });
});
