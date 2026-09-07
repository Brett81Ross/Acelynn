import { createLiveStateMachine } from './live-state.js';
import { createLiveRenderer } from './live-renderer.js';

export const ANDROID_NATIVE_TARGET_FPS = 20;
export const ANDROID_NATIVE_FRAME_INTERVAL_MS = 1000 / ANDROID_NATIVE_TARGET_FPS;

export const LIVE_BANDS = Object.freeze([
  Object.freeze({ id: 'sub', min: 20, max: 60, name: 'Sub' }),
  Object.freeze({ id: 'bass', min: 60, max: 250, name: 'Bass' }),
  Object.freeze({ id: 'mid', min: 250, max: 2000, name: 'Mids' }),
  Object.freeze({ id: 'pres', min: 2000, max: 6000, name: 'Presence' }),
  Object.freeze({ id: 'air', min: 6000, max: 18000, name: 'Air' })
]);

export const LIVE_PROFILES = Object.freeze({
  balanced: Object.freeze({ name: 'Balanced mix', target: Object.freeze([42, 56, 62, 55, 43]) }),
  bass: Object.freeze({ name: 'Bass / hip-hop', target: Object.freeze([62, 72, 51, 46, 39]) }),
  acoustic: Object.freeze({ name: 'Acoustic / singer-songwriter', target: Object.freeze([31, 45, 70, 59, 53]) }),
  vocal: Object.freeze({ name: 'Vocal clarity', target: Object.freeze([25, 37, 72, 69, 56]) })
});

export function isCactusByteAndroidWebView(userAgent = globalThis.navigator?.userAgent || '') {
  const ua = String(userAgent || '');
  return /Android/i.test(ua) && /CactusByteNative\/1\.0/i.test(ua);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreColor(score) {
  return score >= 80 ? '#78f0b1' : score >= 60 ? '#ffe27a' : '#ff6a98';
}

function fallbackPerspectiveHealth(values, target, perspective) {
  const top = Math.max(0, ...values);
  const normalized = values.map(value => top ? Math.round(value / top * 100) : 0);
  let error = 0;
  normalized.forEach((value, index) => { error += Math.abs(value - target[index]); });
  let score = clamp(Math.round(100 - error / 5.6), 0, 100);
  if (perspective === 'detail' && normalized[3] + normalized[4] > 150) score = Math.max(0, score - 8);
  if (perspective === 'room' && normalized[0] + normalized[1] > 150) score = Math.max(0, score - 6);
  return { normalized, rawScore: score, weightedScore: score };
}

function buildCoaching(result) {
  const { p, normalized, score } = result;
  const delta = normalized.map((value, index) => value - p.target[index]);
  const rank = [0, 1, 2, 3, 4].sort((a, b) => Math.abs(delta[b]) - Math.abs(delta[a]));
  const tips = [];
  rank.slice(0, 3).forEach(index => {
    const high = delta[index] > 0;
    const band = LIVE_BANDS[index].name;
    let text = '';
    if (index === 0) text = high
      ? 'Sub energy is above this profile. Check 30–55 Hz for rumble and keep low end intentional.'
      : 'The deep sub area is light. Do not boost blindly—check whether the bass has enough harmonic content.';
    if (index === 1) text = high
      ? 'Bass energy is carrying the track. If it feels cloudy, inspect 160–350 Hz before adding top end.'
      : 'The punch zone is restrained. Try saturation or a small 80–120 Hz move before a big EQ boost.';
    if (index === 2) text = high
      ? 'Mids are crowded. Sweep 300–700 Hz for mud, then 1–2 kHz for nasal buildup.'
      : 'Mids are comparatively shy. Make sure vocals, guitars, or snare still speak at low volume.';
    if (index === 3) text = high
      ? 'Presence is sharp. A dynamic cut in the 2–6 kHz area can soften fatigue without killing clarity.'
      : 'Presence is relaxed. If the song feels distant, carefully check the 2–4 kHz intelligibility zone.';
    if (index === 4) text = high
      ? 'Top end is bright. Check 8–12 kHz for hiss, cymbal buildup, or vocal sibilance.'
      : 'Air is gentle. If you need polish, try a very small high shelf instead of a hard boost.';
    tips.push(Object.freeze({
      title: `${band}${high ? ' is high.' : ' is low.'}`,
      text,
      color: ['#ff6a98', '#ffb25b', '#ffe27a', '#78f0b1', '#73f3ff'][index]
    }));
  });
  return Object.freeze({
    title: score >= 80 ? 'Your mix is translating well' : score >= 60 ? 'A focused second pass will help' : 'Here is where to start',
    text: score >= 80 ? 'Balance is in a good place.' : score >= 60 ? 'The mix is close—listen to the three areas below.' : 'Start with the biggest mismatch, then run this check again.',
    items: Object.freeze(tips),
    color: scoreColor(score)
  });
}

export function createLiveController({
  environment = globalThis,
  document = environment?.document,
  renderer = document ? createLiveRenderer({ document }) : null,
  stateMachine = createLiveStateMachine(),
  getProfileKey = () => document?.getElementById('profile')?.value || 'balanced',
  getPerspective = () => document?.getElementById('analysisMode')?.value || 'mix',
  getSnapshots = () => [],
  audioElement = document?.getElementById('audioPlayer') || null,
  autoInstall = true
} = {}) {
  const androidNative = isCactusByteAndroidWebView(environment?.navigator?.userAgent || '');
  let audioContext = null;
  let analyser = null;
  let frequencyData = null;
  let timeData = null;
  let stream = null;
  let micSource = null;
  let mediaSource = null;
  let fileUrl = null;
  let running = false;
  let activeSource = 'mic';
  let rafHandle = null;
  let lastProcessedAt = -Infinity;
  let lastFrame = null;
  let recentFrames = [];
  let frameTick = 0;
  let liveState = null;

  function appApi() {
    return environment?.AcelynnV12 || globalThis.AcelynnV12 || null;
  }

  async function ensureAudioContext() {
    if (!audioContext) {
      const AudioContextCtor = environment?.AudioContext || environment?.webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio is unavailable on this device.');
      audioContext = new AudioContextCtor();
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -20;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
  }

  function bandEnergy(min, max) {
    const nyquist = audioContext.sampleRate / 2;
    const start = Math.max(0, Math.floor(min / nyquist * frequencyData.length));
    const end = Math.min(frequencyData.length - 1, Math.ceil(max / nyquist * frequencyData.length));
    let sum = 0;
    for (let index = start; index <= end; index += 1) sum += frequencyData[index];
    return sum / Math.max(1, end - start + 1);
  }

  function profileResult(values) {
    const key = LIVE_PROFILES[getProfileKey()] ? getProfileKey() : 'balanced';
    const p = LIVE_PROFILES[key];
    const perspective = getPerspective() || 'mix';
    const api = appApi();
    if (api?.calculatePerspectiveHealth) {
      let scoringValues = values;
      let roomApplied = false;
      const room = environment?.AcelynnActiveRoomSignature || globalThis.AcelynnActiveRoomSignature;
      if (activeSource === 'mic' && room?.normalizedBands) {
        const normalizedLive = api.normalizeBandValues(values);
        scoringValues = api.applyRoomSignature(normalizedLive, room.normalizedBands).adjusted;
        roomApplied = true;
      }
      const health = api.calculatePerspectiveHealth({ bandValues: scoringValues, target: p.target, perspective });
      return {
        key,
        p,
        normalized: health.normalized,
        score: health.weightedScore,
        rawScore: health.rawScore,
        weightedScore: health.weightedScore,
        roomApplied
      };
    }
    const fallback = fallbackPerspectiveHealth(values, p.target, perspective);
    return { key, p, normalized: fallback.normalized, score: fallback.weightedScore, rawScore: fallback.rawScore, weightedScore: fallback.weightedScore, roomApplied: false };
  }

  function enrichState(baseState, frame, validity) {
    if (baseState.signal !== 'valid') {
      return Object.freeze({
        ...baseState,
        targetLabel: `Target: ${frame?.result?.p?.name || LIVE_PROFILES[getProfileKey()]?.name || 'Balanced mix'}`,
        ruleMeter: Object.freeze({ score: null, label: 'Waiting for usable audio', findings: Object.freeze([]) })
      });
    }
    const result = frame.result;
    const api = appApi();
    const findings = api?.buildRuleFindings
      ? api.buildRuleFindings({
          normalized: result.normalized,
          target: result.p.target,
          perspective: frame.perspective,
          peakDb: frame.peakDb,
          rmsDb: frame.rmsDb,
          weightedScore: result.weightedScore ?? result.score,
          roomApplied: Boolean(result.roomApplied)
        })
      : [];
    return Object.freeze({
      ...baseState,
      coaching: buildCoaching(result),
      targetLabel: `Target: ${result.p.name}`,
      ruleMeter: Object.freeze({
        score: result.weightedScore ?? result.score,
        label: `${Math.round(result.weightedScore ?? result.score)}/100`,
        findings: Object.freeze(findings.slice())
      }),
      signalValidity: validity
    });
  }

  function dispatch(name, detail) {
    if (typeof environment?.dispatchEvent !== 'function' || typeof environment?.CustomEvent !== 'function') return;
    environment.dispatchEvent(new environment.CustomEvent(name, { detail }));
  }

  function processFrame() {
    if (!running || !analyser || !frequencyData || !timeData) return null;
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeData);
    const values = LIVE_BANDS.map(band => bandEnergy(band.min, band.max));

    let peak = 0;
    let sum = 0;
    for (const value of timeData) {
      const normalized = (value - 128) / 128;
      peak = Math.max(peak, Math.abs(normalized));
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / timeData.length);
    const peakDb = 20 * Math.log10(Math.max(peak, 0.00001));
    const rmsDb = 20 * Math.log10(Math.max(rms, 0.00001));
    const result = profileResult(values);
    const focusIndex = result.normalized.indexOf(Math.max(...result.normalized));
    const focus = LIVE_BANDS[Math.max(0, focusIndex)]?.name || '—';
    const frame = {
      capturedAt: Date.now(),
      bandValues: values.map(value => Math.round(value)),
      fftMagnitudes: Array.from(frequencyData),
      sampleRate: audioContext.sampleRate,
      fftSize: analyser.fftSize,
      profile: result.p.name,
      result,
      focus,
      sourceType: activeSource === 'file' ? 'file' : 'microphone',
      perspective: getPerspective() || 'mix',
      peakDb,
      rmsDb,
      saved: false
    };
    const api = appApi();
    const validity = api?.evaluateSignalValidity
      ? api.evaluateSignalValidity({ bandValues: frame.bandValues, fftMagnitudes: frame.fftMagnitudes, rmsDb })
      : { valid: rmsDb >= -72, failures: rmsDb >= -72 ? [] : ['rms'], reason: rmsDb >= -72 ? null : 'rms', metrics: { rmsDb } };
    frame.signalValid = validity.valid;
    frame.signalValidity = validity;
    lastFrame = frame;
    const lifecycle = activeSource === 'file' ? 'playing' : 'listening';
    const baseState = stateMachine.build({ lifecycle, frame, signalValidity: validity, saved: frame.saved });
    liveState = enrichState(baseState, frame, validity);
    renderer?.render(liveState, frame);

    frameTick += 1;
    if (frameTick % 6 === 0) {
      recentFrames.push({ bandValues: frame.bandValues.slice(), fftMagnitudes: frame.fftMagnitudes.slice() });
      recentFrames = recentFrames.slice(-12);
      dispatch('acelynn:frame', { frame });
    }
    return frame;
  }

  function scheduleLoop() {
    if (!running || typeof environment?.requestAnimationFrame !== 'function') return;
    rafHandle = environment.requestAnimationFrame(timestamp => {
      if (!running) return;
      const interval = androidNative ? ANDROID_NATIVE_FRAME_INTERVAL_MS : 0;
      if (!interval || timestamp - lastProcessedAt >= interval) {
        lastProcessedAt = timestamp;
        processFrame(timestamp);
      }
      scheduleLoop();
    });
  }

  function resetSource() {
    lastFrame = null;
    recentFrames = [];
    frameTick = 0;
    lastProcessedAt = -Infinity;
    liveState = null;
    stateMachine.reset();
    dispatch('acelynn:source-reset', {});
  }

  function stop() {
    running = false;
    if (rafHandle != null && typeof environment?.cancelAnimationFrame === 'function') environment.cancelAnimationFrame(rafHandle);
    rafHandle = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    try { micSource?.disconnect(); } catch (_) {}
    micSource = null;
    try { mediaSource?.disconnect(); } catch (_) {}
    if (audioElement) {
      try { audioElement.pause(); } catch (_) {}
    }
    if (lastFrame) {
      const validity = lastFrame.signalValidity || null;
      const baseState = stateMachine.build({ lifecycle: 'paused', frame: lastFrame, signalValidity: validity, saved: lastFrame.saved });
      liveState = enrichState(baseState, lastFrame, validity);
      renderer?.render(liveState, lastFrame);
    } else {
      renderer?.renderReady();
    }
    dispatch('acelynn:stopped', { frame: lastFrame });
  }

  async function startMic() {
    stop();
    resetSource();
    activeSource = 'mic';
    try {
      appApi()?.clearSourceFile?.();
      await ensureAudioContext();
      const mediaDevices = environment?.navigator?.mediaDevices;
      if (!mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable.');
      stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      micSource = audioContext.createMediaStreamSource(stream);
      micSource.connect(analyser);
      running = true;
      scheduleLoop();
      return true;
    } catch (error) {
      running = false;
      renderer?.renderError('Allow microphone access, then start live analysis again.');
      throw error;
    }
  }

  async function startFile(file) {
    stop();
    resetSource();
    activeSource = 'file';
    try {
      if (!file) throw new TypeError('audio file is required');
      await appApi()?.setSourceFile?.(file);
      await ensureAudioContext();
      if (!audioElement) throw new Error('Audio player is unavailable.');
      if (fileUrl && environment?.URL?.revokeObjectURL) environment.URL.revokeObjectURL(fileUrl);
      fileUrl = environment?.URL?.createObjectURL ? environment.URL.createObjectURL(file) : null;
      if (fileUrl) audioElement.src = fileUrl;
      if (!mediaSource) mediaSource = audioContext.createMediaElementSource(audioElement);
      mediaSource.connect(analyser);
      analyser.connect(audioContext.destination);
      await audioElement.play();
      running = true;
      audioElement.onended = stop;
      scheduleLoop();
      return true;
    } catch (error) {
      running = false;
      renderer?.renderError('Try a standard MP3, WAV, or M4A audio file.');
      throw error;
    }
  }

  function markLastFrameSaved() {
    if (!lastFrame) return false;
    lastFrame.saved = true;
    const validity = lastFrame.signalValidity || null;
    const lifecycle = running ? (activeSource === 'file' ? 'playing' : 'listening') : 'paused';
    const baseState = stateMachine.build({ lifecycle, frame: lastFrame, signalValidity: validity, saved: true });
    liveState = enrichState(baseState, lastFrame, validity);
    renderer?.render(liveState, lastFrame);
    return true;
  }

  const controller = Object.freeze({
    startMic,
    startFile,
    stop,
    resetSource,
    getLastFrame: () => lastFrame,
    getRecentFrames: () => recentFrames.slice(),
    getLiveState: () => liveState,
    getSnapshots: () => getSnapshots().slice?.() || [],
    isRunning: () => running,
    markLastFrameSaved,
    processFrame
  });

  if (autoInstall && environment && !environment.AcelynnLiveController) {
    environment.AcelynnLiveController = controller;
  }
  return controller;
}
