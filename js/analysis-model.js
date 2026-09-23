import { ANALYSIS_ENGINE_VERSION, BAND_KEYS } from './comparability.js';

function id(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function text(value, max = 160) {
  return value == null ? null : String(value).slice(0, max);
}
export function inferSourceFormat(metadata = {}) {
  const type = String(metadata.type || '').toLowerCase();
  const name = String(metadata.name || '').toLowerCase();
  if (type.includes('wav') || /\.wav$/.test(name)) return 'wav';
  if (type.includes('mpeg') || /\.mp3$/.test(name)) return 'mp3';
  if (type.includes('flac') || /\.flac$/.test(name)) return 'flac';
  if (type.includes('aac') || /\.aac$/.test(name)) return 'aac';
  if (type.includes('mp4') || /\.m4a$/.test(name)) return 'm4a';
  if (type.includes('ogg') || /\.ogg$/.test(name)) return 'ogg';
  if (type.includes('opus') || /\.opus$/.test(name)) return 'opus';
  return type ? type.replace(/^audio\//, '') : null;
}
export function buildVersionRecord({ songId, label, note = '', parentVersionId = null, createdAt = Date.now() }) {
  if (!songId) throw new TypeError('songId is required');
  return Object.freeze({
    id: id('version'), songId, label: text(label || 'Mix version', 100),
    note: text(note || '', 1200) || '', parentVersionId: parentVersionId || null,
    createdAt, updatedAt: createdAt, origin: 'pre-play-core-loop'
  });
}
export function buildAnalysisRecord({
  songId, versionId, timestamp = Date.now(), captureMode, sourceMetadata = {},
  sampleRate = null, bitDepth = null, bitrate = null, channelCount = null,
  profileUsed = null, bands = {}, bandUnit = 'legacy-byte-energy', balance = {}, levels = {}, coachingText = '',
  coachingFindings = [], userNote = '', perspective = null, sourceFileHash = null,
  analysisEngineVersion = ANALYSIS_ENGINE_VERSION, spectralFeatures = null, referenceDeltas = [], roomSignatureId = null, roomConfidence = null
}) {
  if (!songId || !versionId) throw new TypeError('songId and versionId are required');
  if (!['file','microphone'].includes(captureMode)) throw new TypeError('captureMode must be file or microphone');
  const cleanBands = Object.fromEntries(BAND_KEYS.map(key => [key, finite(bands[key])]));
  const safeLevels = levels || {};
  return Object.freeze({
    id: id('analysis'), songId, versionId, timestamp, captureMode,
    sourceFormat: captureMode === 'file' ? inferSourceFormat(sourceMetadata) : null,
    sampleRate: finite(sampleRate), bitDepth: finite(bitDepth), bitrate: finite(bitrate),
    channelCount: finite(channelCount), analysisEngineVersion, profileUsed: text(profileUsed, 80),
    bands: Object.freeze(cleanBands), bandUnit: text(bandUnit, 40),
    balance: Object.freeze({
      score: finite(balance.score),
      contributions: Object.freeze(Object.fromEntries(BAND_KEYS.map(key => [key, finite(balance.contributions?.[key])]))),
      leadingRegion: text(balance.leadingRegion, 40),
      deviations: Object.freeze(Object.fromEntries(BAND_KEYS.map(key => [key, finite(balance.deviations?.[key])])))
    }),
    levels: Object.freeze({
      peakDbfs: finite(safeLevels.peakDbfs), rmsDbfs: finite(safeLevels.rmsDbfs),
      crestDb: finite(safeLevels.crestDb ?? (finite(safeLevels.peakDbfs) !== null && finite(safeLevels.rmsDbfs) !== null ? finite(safeLevels.peakDbfs)-finite(safeLevels.rmsDbfs) : null))
    }),
    coachingText: text(coachingText, 2400) || '',
    coachingFindings: Object.freeze((Array.isArray(coachingFindings) ? coachingFindings : []).slice(0,10).map(x => Object.freeze({
      title: text(x?.title,140) || '', text: text(x?.text,360) || '', severity: finite(x?.severity)
    }))),
    userNote: text(userNote, 1200) || '', perspective: text(perspective, 40),
    sourceFileHash: sourceFileHash || null,
    spectralFeatures: spectralFeatures || null,
    referenceDeltas: Object.freeze((Array.isArray(referenceDeltas) ? referenceDeltas : []).slice(0,10).map(x => Object.freeze({
      name: text(x?.name,40) || '', delta: finite(x?.delta), direction: text(x?.direction,16)
    }))),
    roomSignatureId: roomSignatureId || null,
    roomConfidence: finite(roomConfidence),
    sourceMetadata: Object.freeze({
      name: captureMode === 'file' ? text(sourceMetadata.name, 240) : null,
      type: captureMode === 'file' ? text(sourceMetadata.type, 100) : null,
      size: captureMode === 'file' ? finite(sourceMetadata.size) : null
    })
  });
}
