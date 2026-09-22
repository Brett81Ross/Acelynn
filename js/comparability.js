export const ANALYSIS_ENGINE_VERSION = 'acelynn-core-1';

export const BAND_KEYS = Object.freeze(['sub', 'bass', 'mids', 'presence', 'air']);

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeFormat(value) {
  return String(value || '').toLowerCase().replace(/^audio\//, '').replace('x-wav', 'wav').replace('mpeg', 'mp3');
}

function bitrateClass(value) {
  const n = finite(value);
  if (n === null) return 'unknown';
  if (n <= 128000) return 'lossy-low';
  if (n <= 192000) return 'lossy-medium';
  return 'lossy-high';
}

export function classifyBandComparability(left, right, band) {
  const reasons = [];
  if (!left || !right) return { classification: 'suppressed', reasons: ['analysis metadata is missing'] };

  if (left.captureMode !== 'file' || right.captureMode !== 'file') {
    if (left.captureMode === 'microphone' && right.captureMode === 'microphone') {
      return { classification: 'direction-only', reasons: ['separate microphone captures are affected by gain, distance, and room conditions'] };
    }
    return { classification: 'suppressed', reasons: ['file and microphone captures are not directly comparable'] };
  }

  const lf = normalizeFormat(left.sourceFormat);
  const rf = normalizeFormat(right.sourceFormat);
  const formatMismatch = lf && rf && lf !== rf;
  const lossyPair = ['mp3', 'aac', 'm4a', 'ogg', 'opus'].includes(lf) || ['mp3', 'aac', 'm4a', 'ogg', 'opus'].includes(rf);

  if (formatMismatch && lossyPair) {
    if (band === 'air') return { classification: 'suppressed', reasons: ['high-frequency content may differ because of lossy codec behavior'] };
    if (band === 'presence') return { classification: 'direction-only', reasons: ['magnitude is suppressed because codec differences can affect upper-frequency energy'] };
    reasons.push('format mismatch; low and mid bands remain usable with caution');
  }

  if (left.sampleRate && right.sampleRate && Number(left.sampleRate) !== Number(right.sampleRate)) {
    if (band === 'air') return { classification: 'direction-only', reasons: [...reasons, 'sample-rate mismatch can affect the highest band'] };
    reasons.push('sample-rate mismatch');
  }

  if (left.channelCount && right.channelCount && Number(left.channelCount) !== Number(right.channelCount)) {
    return { classification: 'direction-only', reasons: [...reasons, 'channel-count mismatch makes magnitude less reliable'] };
  }

  if (bitrateClass(left.bitrate) !== 'unknown' && bitrateClass(right.bitrate) !== 'unknown' && bitrateClass(left.bitrate) !== bitrateClass(right.bitrate)) {
    if (band === 'air') return { classification: 'suppressed', reasons: [...reasons, 'bitrate mismatch can alter high-frequency content'] };
    if (band === 'presence') return { classification: 'direction-only', reasons: [...reasons, 'bitrate mismatch can alter upper-frequency magnitude'] };
  }

  if (left.analysisEngineVersion && right.analysisEngineVersion && left.analysisEngineVersion !== right.analysisEngineVersion) {
    reasons.push('analysis engine version changed; interpret the delta with caution');
  }

  return { classification: 'comparable', reasons };
}

export function compareAnalyses(left, right) {
  const profileMismatch = Boolean(left?.profileUsed && right?.profileUsed && left.profileUsed !== right.profileUsed);
  const engineMismatch = Boolean(left?.analysisEngineVersion && right?.analysisEngineVersion && left.analysisEngineVersion !== right.analysisEngineVersion);
  const bands = {};
  let comparable = 0;

  for (const key of BAND_KEYS) {
    const guard = classifyBandComparability(left, right, key);
    const a = finite(left?.bands?.[key]);
    const b = finite(right?.bands?.[key]);
    const delta = a !== null && b !== null ? b - a : null;
    const epsilon = 0.5;
    const direction = delta === null ? null : Math.abs(delta) < epsilon ? '≈' : delta > 0 ? '↑' : '↓';
    if (guard.classification === 'comparable' && delta !== null) comparable += 1;
    bands[key] = Object.freeze({ ...guard, delta: guard.classification === 'comparable' ? delta : null, direction });
  }

  return Object.freeze({
    bands: Object.freeze(bands),
    comparableBandCount: comparable,
    totalBandCount: BAND_KEYS.length,
    profileMismatch,
    engineMismatch,
    balanceDelta: profileMismatch ? null : (() => {
      const a = finite(left?.balance?.score);
      const b = finite(right?.balance?.score);
      return a !== null && b !== null ? b - a : null;
    })(),
    warnings: Object.freeze([
      ...(profileMismatch ? ['Listening profile changed; profile-dependent balance comparisons are suppressed.'] : []),
      ...(engineMismatch ? ['Analysis engine version changed; numerical deltas may include algorithm changes.'] : [])
    ])
  });
}

export function comparisonSummary(diff) {
  const suppressed = BAND_KEYS.filter(key => diff.bands[key].classification !== 'comparable');
  if (!suppressed.length) return 'All 5 bands are reliably comparable.';
  return `${diff.comparableBandCount} of 5 bands reliably comparable — ${suppressed.map(key => key[0].toUpperCase() + key.slice(1)).join(' and ')} limited by capture conditions.`;
}
