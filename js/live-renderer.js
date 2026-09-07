const BAND_IDS = Object.freeze(['sub', 'bass', 'mid', 'pres', 'air']);

function defaultScoreColor(score) {
  return score >= 80 ? '#78f0b1' : score >= 60 ? '#ffe27a' : '#ff6a98';
}

function setText(document, id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  const next = value == null ? '' : String(value);
  if (element.textContent !== next) element.textContent = next;
}

function setDisabled(document, id, disabled) {
  const element = document.getElementById(id);
  if (element && element.disabled !== Boolean(disabled)) element.disabled = Boolean(disabled);
}

function setStyle(element, property, value) {
  if (!element) return;
  const next = String(value ?? '');
  if (element.style[property] !== next) element.style[property] = next;
}

function setList(document, id, items, className, renderItem) {
  const host = document.getElementById(id);
  if (!host) return;
  const cleanItems = Array.isArray(items) ? items : [];
  const signature = JSON.stringify(cleanItems);
  if (host.dataset.acelynnRenderSignature === signature) return;
  const fragment = document.createDocumentFragment();
  cleanItems.forEach(item => {
    const node = document.createElement('div');
    node.className = className;
    renderItem(node, item);
    fragment.appendChild(node);
  });
  host.replaceChildren(fragment);
  host.dataset.acelynnRenderSignature = signature;
}

function formatDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : '— dB';
}

function energyDb(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return -100;
  return Math.max(-100, 20 * Math.log10(numeric / 255));
}

function lifecycleLabel(lifecycle) {
  if (lifecycle === 'listening') return 'LIVE';
  if (lifecycle === 'playing') return 'TRACK';
  if (lifecycle === 'paused') return 'PAUSED';
  if (lifecycle === 'error') return 'ERROR';
  return 'READY';
}

function drawSpectrum(canvas, frame) {
  if (!canvas || !frame?.fftMagnitudes?.length || typeof canvas.getContext !== 'function') return;
  let context;
  try {
    context = canvas.getContext('2d');
  } catch (_) {
    return;
  }
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const width = Number(rect.width || canvas.clientWidth || 0);
  const height = Number(rect.height || canvas.clientHeight || 0);
  if (width <= 0 || height <= 0) return;
  const ratio = Number(canvas.ownerDocument?.defaultView?.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#24243c';
  context.lineWidth = 1;
  for (let y = 31; y < height; y += 35) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#73f3ff');
  gradient.addColorStop(0.55, '#9f7cff');
  gradient.addColorStop(1, '#ff6a98');
  context.fillStyle = gradient;
  const data = frame.fftMagnitudes;
  for (let x = 0; x < width; x += 3) {
    const index = Math.min(data.length - 1, Math.floor(Math.pow(x / width, 2.25) * (data.length - 1)));
    const value = Number(data[index] || 0) / 255;
    const bar = Math.max(2, value * (height - 24));
    context.fillRect(x, height - 18 - bar, 2, bar);
  }
}

export function createLiveRenderer({
  document,
  canvas = document?.getElementById('spectrum'),
  colorForScore = defaultScoreColor
} = {}) {
  if (!document) throw new TypeError('document is required');

  function render(state, frame = null) {
    if (!state) return;

    setText(document, 'healthScore', state.healthScore);
    setText(document, 'healthLabel', state.healthLabel);
    setText(document, 'balanceText', state.balanceText);
    setText(document, 'focusValue', state.focus);
    setText(document, 'status', state.status);
    setText(document, 'peakValue', formatDb(state.peakDb));
    setText(document, 'rmsValue', formatDb(state.rmsDb));
    setText(document, 'rangeValue', formatDb(state.rangeDb));
    setText(document, 'targetText', state.targetLabel || '');
    setText(document, 'captureButton', state.capture?.label || 'Save current check');
    setDisabled(document, 'captureButton', !state.capture?.enabled);

    const lifecycle = lifecycleLabel(state.lifecycle);
    setText(document, 'stateText', lifecycle);
    const dot = document.getElementById('dot');
    if (dot) dot.classList.toggle('live', state.lifecycle === 'listening' || state.lifecycle === 'playing');

    const numericScore = Number(state.healthScore);
    if (Number.isFinite(numericScore)) {
      const color = colorForScore(numericScore);
      const scoreNode = document.getElementById('healthScore');
      setStyle(scoreNode, 'borderColor', color);
      setStyle(scoreNode, 'color', color);
    }

    BAND_IDS.forEach((id, index) => {
      const normalized = Math.max(0, Math.min(100, Number(state.normalized?.[index] || 0)));
      const fill = document.getElementById(`${id}Fill`);
      setStyle(fill, 'width', `${normalized}%`);
      setText(document, `${id}Out`, `${energyDb(state.bandValues?.[index]).toFixed(0)} dB`);
    });

    const coaching = state.coaching || {};
    setText(document, 'coachTitle', coaching.title || '');
    setText(document, 'coachText', coaching.text || '');
    setList(document, 'advice', coaching.items, 'advice-item', (node, item) => {
      const title = document.createElement('b');
      title.textContent = item?.title || '';
      node.appendChild(title);
      const text = document.createTextNode(item?.text ? ` ${item.text}` : '');
      node.appendChild(text);
      if (item?.color) node.style.borderLeftColor = item.color;
    });

    const ruleMeter = state.ruleMeter || {};
    setText(document, 'ruleMeterLabel', ruleMeter.label || '');
    const ruleFill = document.getElementById('ruleMeterFill');
    const ruleScore = Number(ruleMeter.score);
    setStyle(ruleFill, 'width', Number.isFinite(ruleScore) ? `${Math.max(0, Math.min(100, ruleScore))}%` : '0%');
    setList(document, 'ruleFindings', ruleMeter.findings, 'rule-item', (node, item) => {
      const title = document.createElement('b');
      title.textContent = item?.title || '';
      node.appendChild(title);
      node.appendChild(document.createTextNode(item?.text ? ` ${item.text}` : ''));
    });

    drawSpectrum(canvas, frame);
  }

  function renderReady() {
    render({
      lifecycle: 'ready',
      signal: 'unknown',
      healthScore: '—',
      healthLabel: 'Waiting for audio',
      balanceText: 'Waiting for signal',
      focus: '—',
      status: 'Not listening',
      peakDb: null,
      rmsDb: null,
      rangeDb: null,
      bandValues: [0, 0, 0, 0, 0],
      normalized: [0, 0, 0, 0, 0],
      targetLabel: '',
      coaching: { title: 'Your next move', text: 'Start a live check or load a track.', items: [] },
      capture: { enabled: false, label: 'Save current check' },
      ruleMeter: { score: null, label: 'Waiting for analysis', findings: [] }
    });
  }

  function renderError(message) {
    render({
      lifecycle: 'error',
      signal: 'unknown',
      healthScore: '—',
      healthLabel: 'Analysis unavailable',
      balanceText: 'Waiting for signal',
      focus: '—',
      status: 'Analysis error',
      peakDb: null,
      rmsDb: null,
      rangeDb: null,
      bandValues: [0, 0, 0, 0, 0],
      normalized: [0, 0, 0, 0, 0],
      targetLabel: '',
      coaching: { title: 'Analysis could not continue', text: String(message || 'Try again.'), items: [] },
      capture: { enabled: false, label: 'Save current check' },
      ruleMeter: { score: null, label: 'Unavailable', findings: [] }
    });
  }

  return Object.freeze({ render, renderReady, renderError });
}
