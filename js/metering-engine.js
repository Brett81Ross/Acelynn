const loadedContexts = new WeakSet();
let activeNode = null;
let activeSource = null;
let activeSink = null;
let latest = null;
let sourceType = 'unknown';

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeMessage(message = {}) {
  return {
    available: true,
    sourceType,
    measurementDomain: sourceType === 'file' ? 'digital-program' : sourceType === 'microphone' ? 'acoustic-capture' : 'unknown',
    sampleRate: finiteOrNull(message.sampleRate),
    channelCount: finiteOrNull(message.channelCount),
    momentaryLufs: finiteOrNull(message.momentaryLufs),
    shortTermLufs: finiteOrNull(message.shortTermLufs),
    integratedLufs: finiteOrNull(message.integratedLufs),
    samplePeakDbfs: finiteOrNull(message.samplePeakDbfs),
    truePeakEstimateDbtp: finiteOrNull(message.truePeakEstimateDbtp),
    truePeakMethod: String(message.truePeakMethod || ''),
    correlation: finiteOrNull(message.correlation),
    dcOffset: Array.isArray(message.dcOffset) ? message.dcOffset.slice(0, 2).map(finiteOrNull) : [],
    dropoutCount: finiteOrNull(message.dropoutCount) ?? 0,
    vectorPoints: Array.isArray(message.vectorPoints)
      ? message.vectorPoints.slice(0, 64).map(point => Array.isArray(point) ? point.slice(0, 2).map(value => finiteOrNull(value) ?? 0) : [0, 0])
      : [],
    standard: String(message.standard || ''),
    compliance: String(message.compliance || '')
  };
}

async function loadWorklet(context) {
  if (!context?.audioWorklet?.addModule) return false;
  if (loadedContexts.has(context)) return true;
  await context.audioWorklet.addModule('/js/metering-processor.js');
  loadedContexts.add(context);
  return true;
}

function createSilentWorkletSink(context, node) {
  if (typeof context?.createGain !== 'function' || !context?.destination) return null;
  const sink = context.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(context.destination);
  return sink;
}

export async function attach(context, sourceNode, analyserNode, options = {}) {
  await detach();
  sourceType = String(options.sourceType || 'unknown');
  if (!context || !sourceNode || !analyserNode) return false;
  try {
    const supported = await loadWorklet(context);
    if (!supported || typeof AudioWorkletNode !== 'function') return false;
    const node = new AudioWorkletNode(context, 'acelynn-professional-meter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers'
    });
    node.port.onmessage = event => {
      if (event?.data?.type !== 'metering') return;
      latest = sanitizeMessage(event.data);
      globalThis.dispatchEvent?.(new CustomEvent('acelynn:metering', { detail: latest }));
    };
    // Professional metering is a parallel tap. It never sits in the proven
    // v1.2 analyser/playback path, so Worklet failure cannot stop core analysis.
    sourceNode.connect(node);
    const sink = createSilentWorkletSink(context, node);
    if (!sink) {
      try { sourceNode.disconnect(node); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
      return false;
    }
    activeNode = node;
    activeSource = sourceNode;
    activeSink = sink;
    latest = {
      available: true,
      sourceType,
      measurementDomain: sourceType === 'file' ? 'digital-program' : sourceType === 'microphone' ? 'acoustic-capture' : 'unknown',
      sampleRate: finiteOrNull(context.sampleRate),
      channelCount: null,
      momentaryLufs: null,
      shortTermLufs: null,
      integratedLufs: null,
      samplePeakDbfs: null,
      truePeakEstimateDbtp: null,
      truePeakMethod: '4x-cubic-inter-sample-estimate',
      correlation: null,
      dcOffset: [],
      dropoutCount: 0,
      vectorPoints: [],
      standard: 'ITU-R BS.1770-5 / EBU Tech 3341 aligned',
      compliance: 'algorithm-aligned; official compliance test-set pending'
    };
    globalThis.dispatchEvent?.(new CustomEvent('acelynn:metering-status', { detail: { available: true, sourceType } }));
    return true;
  } catch (error) {
    await detach();
    latest = {
      available: false,
      sourceType,
      measurementDomain: sourceType === 'file' ? 'digital-program' : sourceType === 'microphone' ? 'acoustic-capture' : 'unknown',
      reason: error?.message || String(error)
    };
    globalThis.dispatchEvent?.(new CustomEvent('acelynn:metering-status', { detail: latest }));
    return false;
  }
}

export async function detach() {
  if (activeSource && activeNode) {
    try { activeSource.disconnect(activeNode); } catch (_) {}
  }
  if (activeSink) {
    try { activeSink.disconnect(); } catch (_) {}
  }
  if (activeNode) {
    try { activeNode.disconnect(); } catch (_) {}
    try { activeNode.port.onmessage = null; } catch (_) {}
  }
  activeNode = null;
  activeSource = null;
  activeSink = null;
  return true;
}

export function reset() {
  latest = null;
  sourceType = 'unknown';
  globalThis.dispatchEvent?.(new CustomEvent('acelynn:metering-reset'));
}

export function getSnapshot() {
  if (!latest) return null;
  return JSON.parse(JSON.stringify(latest));
}

export function isAvailable() {
  return !!latest?.available;
}

const api = Object.freeze({ attach, detach, reset, getSnapshot, isAvailable });
globalThis.AcelynnMetering = api;
export default api;
