export const BAND_NAMES = Object.freeze(['Sub', 'Bass', 'Mids', 'Presence', 'Air']);
export const PERSPECTIVE_WEIGHTS = Object.freeze({
  mix: Object.freeze([1, 1, 1, 1, 1]),
  room: Object.freeze([1.30, 1.25, 1.00, 0.85, 0.70]),
  detail: Object.freeze([0.75, 0.85, 1.00, 1.25, 1.30])
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const optionalFinite = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

export function normalizeBandValues(values) {
  const clean = BAND_NAMES.map((_, index) => Math.max(0, finite(values?.[index])));
  const max = Math.max(0, ...clean);
  return clean.map(value => max > 0 ? Math.round(value / max * 1000) / 10 : 0);
}

export function calculatePerspectiveHealth({ bandValues, target, perspective = 'mix' }) {
  const normalized = normalizeBandValues(bandValues);
  const targetValues = BAND_NAMES.map((_, index) => clamp(finite(target?.[index]), 0, 100));
  const deltas = normalized.map((value, index) => value - targetValues[index]);
  const rawError = deltas.reduce((sum, delta) => sum + Math.abs(delta), 0);
  const rawScore = clamp(Math.round(100 - rawError / 5.6), 0, 100);
  const weights = PERSPECTIVE_WEIGHTS[perspective] || PERSPECTIVE_WEIGHTS.mix;
  const weightedMeanError = deltas.reduce((sum, delta, index) => sum + Math.abs(delta) * weights[index], 0)
    / weights.reduce((sum, weight) => sum + weight, 0);
  const weightedScore = clamp(Math.round(100 - weightedMeanError * 5 / 5.6), 0, 100);
  return { normalized, target: targetValues, deltas, rawScore, weightedScore, perspective, weights: [...weights] };
}

export function applyRoomSignature(normalizedBands, signatureBands, strength = 0.35) {
  const current = BAND_NAMES.map((_, index) => clamp(finite(normalizedBands?.[index]), 0, 100));
  const signature = BAND_NAMES.map((_, index) => clamp(finite(signatureBands?.[index]), 0, 100));
  const sorted = [...signature].sort((a, b) => a - b);
  const center = sorted[2] ?? 0;
  const corrections = signature.map(value => clamp((value - center) * clamp(finite(strength), 0, 1), -14, 14));
  const corrected = current.map((value, index) => clamp(value - corrections[index], 0, 100));
  return { adjusted: normalizeBandValues(corrected), corrections, center, strength: clamp(finite(strength), 0, 1) };
}

export function estimateRoomConfidence(frames) {
  const valid = Array.isArray(frames)
    ? frames.filter(frame => Array.isArray(frame) && frame.length >= BAND_NAMES.length).map(normalizeBandValues)
    : [];
  if (valid.length < 3) return 0;
  const stds = BAND_NAMES.map((_, bandIndex) => {
    const values = valid.map(frame => frame[bandIndex]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  });
  const meanStd = stds.reduce((sum, value) => sum + value, 0) / stds.length;
  const stability = clamp(1 - meanStd / 20, 0, 1);
  const sampleFactor = clamp(valid.length / 10, 0, 1);
  return Math.round(stability * sampleFactor * 100) / 100;
}

function diffGuidance(index, delta) {
  const rising = delta > 0;
  const guidance = [
    rising ? 'Deep sub increased; check rumble, kick/bass overlap, or a low shelf.' : 'Deep sub fell; confirm the low end still carries on small speakers.',
    rising ? 'Bass grew; check 80–250 Hz for extra punch versus cloudiness.' : 'Bass dropped; verify the groove did not lose weight or body.',
    rising ? 'Mids increased; check 300 Hz–2 kHz for body, boxiness, and forwardness.' : 'Mids fell; confirm vocals and core instruments still speak at low volume.',
    rising ? 'Presence increased; check 2–6 kHz for clarity versus fatigue.' : 'Presence fell; confirm vocals and attacks did not move too far back.',
    rising ? 'Air increased; check cymbals, hiss, and sibilance before adding more top.' : 'Air fell; confirm the mix still has enough openness and polish.'
  ];
  return guidance[index];
}

export function diffSnapshots(current, previous) {
  if (!current || !previous) return null;
  const currentBands = normalizeBandValues(current.bands);
  const previousBands = normalizeBandValues(previous.bands);
  const deltas = currentBands.map((value, index) => Math.round((value - previousBands[index]) * 10) / 10);
  const ranked = deltas.map((delta, index) => ({
    index,
    name: BAND_NAMES[index],
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    guidance: diffGuidance(index, delta)
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  const scoreDelta = Number.isFinite(Number(current.score)) && Number.isFinite(Number(previous.score))
    ? Math.round((Number(current.score) - Number(previous.score)) * 10) / 10
    : null;
  return {
    scoreDelta,
    currentBands,
    previousBands,
    deltas,
    largestChanges: ranked,
    summary: scoreDelta === null
      ? 'Band balance changed between the two saved checks.'
      : scoreDelta > 0
        ? `Health improved by ${scoreDelta} points.`
        : scoreDelta < 0
          ? `Health fell by ${Math.abs(scoreDelta)} points.`
          : 'Health score held steady.'
  };
}

export function buildRuleFindings({ normalized, target, perspective = 'mix', peakDb = null, rmsDb = null, weightedScore = null, roomApplied = false }) {
  const bands = BAND_NAMES.map((_, index) => clamp(finite(normalized?.[index]), 0, 100));
  const targetValues = BAND_NAMES.map((_, index) => clamp(finite(target?.[index]), 0, 100));
  const findings = [];
  const peak = optionalFinite(peakDb);
  const rms = optionalFinite(rmsDb);
  const crest = peak !== null && rms !== null ? peak - rms : null;

  if (peak !== null && peak > -1) findings.push({ severity: 3, title: 'Peak headroom is tight.', text: 'The signal is close to 0 dBFS. Check for clipping before making tonal decisions.' });
  if (perspective === 'room' && bands[0] + bands[1] > targetValues[0] + targetValues[1] + 30) findings.push({ severity: 2, title: 'Low-frequency room buildup.', text: 'Sub and bass are elevated in the room-weighted view. Move the mic or speakers before treating the mix.' });
  if (perspective === 'detail' && bands[3] + bands[4] > targetValues[3] + targetValues[4] + 28) findings.push({ severity: 2, title: 'Upper-detail fatigue risk.', text: 'Presence and air are elevated in the detail-weighted view. Check harshness and sibilance before boosting more.' });
  if (crest !== null && crest < 6) findings.push({ severity: 1, title: 'Dynamics are dense.', text: 'Crest range is narrow. Make sure compression or limiting is not flattening the mix more than intended.' });
  if (crest !== null && crest > 20) findings.push({ severity: 1, title: 'Dynamics are very wide.', text: 'Large peak-to-average range can be musical, but confirm quiet details remain audible.' });
  if (roomApplied) findings.push({ severity: 1, title: 'Room-aware compensation is active.', text: 'Health scoring is being adjusted conservatively using the saved room signature; the live band display remains uncorrected.' });
  const score = optionalFinite(weightedScore);
  if (!findings.length && score !== null) findings.push({ severity: 0, title: 'No rule-level warning.', text: score >= 80 ? 'The current perspective is translating cleanly.' : 'Use the largest profile mismatch as the next listening target.' });

  return findings.sort((a, b) => b.severity - a.severity).slice(0, 3);
}
