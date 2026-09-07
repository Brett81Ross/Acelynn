import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLiveStateMachine } from '../js/live-state.js';

const frame = {
  peakDb: -12,
  rmsDb: -24,
  bandValues: [30, 50, 70, 55, 40],
  focus: 'Mids',
  result: {
    score: 82,
    weightedScore: 82,
    normalized: [43, 71, 100, 79, 57],
    p: { name: 'Balanced mix', target: [42, 56, 62, 55, 43] }
  }
};

function validity(valid) {
  return valid
    ? { valid: true, failures: [], reason: null, metrics: {} }
    : { valid: false, failures: ['bands'], reason: 'bands', metrics: {} };
}

describe('unified live integration', () => {
  it('keeps visible signal state stable through an alternating boundary sequence', () => {
    const machine = createLiveStateMachine();
    const sequence = [false, true, false, true, true, true, false, true, false, false];
    const visible = sequence.map(valid => machine.build({
      lifecycle: 'listening',
      frame,
      signalValidity: validity(valid),
      saved: false
    }).signal);
    expect(visible).toEqual(['waiting','waiting','waiting','waiting','waiting','valid','valid','valid','valid','waiting']);
  });

  it('preserves the certified backup-v1 contract and snapshot storage key', async () => {
    await import('../acelynn-recovery.js');
    const recovery = globalThis.AcelynnRecovery;
    const backup = recovery.createBackup([]);
    expect(backup).toMatchObject({
      app: 'Acelynn Pro',
      schema: 'acelynn-pro-backup-v1',
      version: 1,
      snapshots: []
    });
    expect(recovery.STORAGE_KEY).toBe('acelynn-snapshots');
    const liveApp = readFileSync('js/live-app.js', 'utf8');
    expect(liveApp).toContain("const STORAGE_KEY = 'acelynn-snapshots'");
    expect(liveApp).toContain('controller.getLastFrame()');
    expect(liveApp).toContain('AcelynnRecovery.createBackup(snapshots)');
    expect(liveApp).toContain('AcelynnRecovery.parseBackupText(raw)');
    expect(liveApp).toContain('AcelynnRecovery.restore(localStorage, incoming)');
  });

  it('keeps room signature and Mix-Diff as non-canonical feature consumers', () => {
    const enhancements = readFileSync('js/ui-enhancements.js', 'utf8');
    expect(enhancements).toContain('captureRoomSignature');
    expect(enhancements).toContain('saveRoomSignature');
    expect(enhancements).toContain('createDiffCard');
    expect(enhancements).toContain('renderDiff');
    expect(enhancements).toContain("state?.signal === 'valid'");
    expect(enhancements).not.toContain('new MutationObserver');
    expect(enhancements).not.toContain('renderSignalWaiting');
    expect(enhancements).not.toContain('renderRules');
  });
});
