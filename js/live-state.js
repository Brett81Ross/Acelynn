const DEFAULT_HYSTERESIS = Object.freeze({ validFrames: 3, invalidFrames: 2 });

export function createLiveStateMachine({ hysteresis = DEFAULT_HYSTERESIS } = {}) {
  let signal = 'unknown';
  let validStreak = 0;
  let invalidStreak = 0;
  let current = null;

  function transition(validity) {
    if (!validity) return signal;
    if (validity.valid) {
      validStreak += 1;
      invalidStreak = 0;
      if (signal !== 'valid' && validStreak >= hysteresis.validFrames) signal = 'valid';
    } else {
      invalidStreak += 1;
      validStreak = 0;
      if (signal === 'unknown') signal = 'waiting';
      else if (signal === 'valid' && invalidStreak >= hysteresis.invalidFrames) signal = 'waiting';
    }
    return signal;
  }

  function build({ lifecycle = 'ready', frame = null, signalValidity = null, saved = false } = {}) {
    const nextSignal = transition(signalValidity);
    const result = frame?.result;
    const score = Number(result?.weightedScore ?? result?.score);
    const waiting = lifecycle === 'listening' && nextSignal !== 'valid';
    const rangeDb = Number.isFinite(frame?.peakDb) && Number.isFinite(frame?.rmsDb)
      ? Math.max(0, frame.peakDb - frame.rmsDb)
      : null;

    current = Object.freeze({
      lifecycle,
      signal: nextSignal,
      peakDb: Number.isFinite(frame?.peakDb) ? frame.peakDb : null,
      rmsDb: Number.isFinite(frame?.rmsDb) ? frame.rmsDb : null,
      rangeDb,
      bandValues: Object.freeze((frame?.bandValues || [0, 0, 0, 0, 0]).slice(0, 5)),
      normalized: Object.freeze((result?.normalized || [0, 0, 0, 0, 0]).slice(0, 5)),
      focus: waiting ? '—' : (frame?.focus || '—'),
      healthScore: waiting || !Number.isFinite(score) ? '—' : Math.round(score),
      healthLabel: waiting
        ? 'Waiting for audio'
        : Number.isFinite(score)
          ? (score >= 80 ? 'Healthy balance' : score >= 60 ? 'A few things to check' : 'Needs attention')
          : 'Waiting for audio',
      balanceText: waiting
        ? 'Waiting for signal'
        : Number.isFinite(score)
          ? (score >= 80 ? 'On target' : score >= 60 ? 'Check the highlighted bands' : 'Out of target')
          : 'Waiting for signal',
      status: waiting ? 'Waiting for usable audio' : frame?.focus ? `${frame.focus} is leading` : 'Not listening',
      coaching: Object.freeze(waiting
        ? {
            title: 'Waiting for usable audio',
            text: 'Acelynn can hear the input path, but there is not enough real spectral energy to score this check yet.',
            items: Object.freeze([])
          }
        : { title: null, text: null, items: Object.freeze([]) }),
      capture: Object.freeze({
        enabled: Boolean(frame && !saved && !waiting),
        label: frame ? (saved ? 'Last check saved' : 'Save current check') : 'Save current check'
      })
    });
    return current;
  }

  return Object.freeze({
    build,
    getState: () => current,
    reset() {
      signal = 'unknown';
      validStreak = 0;
      invalidStreak = 0;
      current = null;
    }
  });
}
