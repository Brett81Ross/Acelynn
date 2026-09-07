import { describe, expect, it } from 'vitest';
import { createLiveStateMachine } from '../js/live-state.js';

const valid = { valid: true, failures: [], reason: null, metrics: {} };
const invalid = { valid: false, failures: ['bands'], reason: 'bands', metrics: {} };
const frame = {
  peakDb: -12.4,
  rmsDb: -24.8,
  bandValues: [30, 50, 70, 55, 40],
  focus: 'Mids',
  result: {
    score: 82,
    weightedScore: 82,
    normalized: [43, 71, 100, 79, 57],
    p: { name: 'Balanced mix', target: [42, 56, 62, 55, 43] }
  }
};

describe('live state machine', () => {
  it('does not leave waiting until three consecutive valid frames', () => {
    const machine = createLiveStateMachine();
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: invalid }).signal).toBe('waiting');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: valid }).signal).toBe('waiting');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: valid }).signal).toBe('waiting');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: valid }).signal).toBe('valid');
  });

  it('does not leave valid until two consecutive invalid frames', () => {
    const machine = createLiveStateMachine();
    machine.build({ lifecycle: 'listening', frame, signalValidity: valid });
    machine.build({ lifecycle: 'listening', frame, signalValidity: valid });
    machine.build({ lifecycle: 'listening', frame, signalValidity: valid });
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: invalid }).signal).toBe('valid');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: invalid }).signal).toBe('waiting');
  });

  it('returns a deterministic waiting view model without score/coaching thrash', () => {
    const machine = createLiveStateMachine();
    const state = machine.build({ lifecycle: 'listening', frame, signalValidity: invalid, saved: false });
    expect(state.healthScore).toBe('—');
    expect(state.healthLabel).toBe('Waiting for audio');
    expect(state.capture.enabled).toBe(false);
    expect(state.coaching.title).toBe('Waiting for usable audio');
    expect(Object.isFrozen(state)).toBe(true);
  });
});
