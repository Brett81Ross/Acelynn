const textDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
const htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
const nativeAppendChild = Node.prototype.appendChild;

let signalVisualState = null;
let validStreak = 0;
let invalidStreak = 0;
const VALID_STREAK_REQUIRED = 3;
const INVALID_STREAK_REQUIRED = 2;
const ADVICE_FLUSH_INTERVAL_MS = 220;

function dedupeTextContent(element) {
  if (!element || !textDescriptor?.get || !textDescriptor?.set) return false;
  if (element.dataset.acelynnStableText === '1') return true;
  Object.defineProperty(element, 'textContent', {
    configurable: true,
    get() {
      return textDescriptor.get.call(this);
    },
    set(value) {
      const next = value == null ? '' : String(value);
      if (textDescriptor.get.call(this) === next) return;
      textDescriptor.set.call(this, next);
    }
  });
  element.dataset.acelynnStableText = '1';
  return true;
}

function dedupeInnerHtml(element) {
  if (!element || !htmlDescriptor?.get || !htmlDescriptor?.set) return false;
  if (element.dataset.acelynnStableHtml === '1') return true;
  Object.defineProperty(element, 'innerHTML', {
    configurable: true,
    get() {
      return htmlDescriptor.get.call(this);
    },
    set(value) {
      const next = value == null ? '' : String(value);
      if (htmlDescriptor.get.call(this) === next) return;
      htmlDescriptor.set.call(this, next);
    }
  });
  element.dataset.acelynnStableHtml = '1';
  return true;
}

function batchAdviceUpdates(box) {
  if (!box || !htmlDescriptor?.get || !htmlDescriptor?.set) return false;
  if (box.dataset.acelynnAdviceBatching === '2') return true;

  let collecting = false;
  let fragment = document.createDocumentFragment();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (!collecting) return;
    collecting = false;
    const holder = document.createElement('div');
    holder.appendChild(fragment.cloneNode(true));
    const next = holder.innerHTML;
    if (htmlDescriptor.get.call(box) !== next) {
      htmlDescriptor.set.call(box, next);
    }
    fragment = document.createDocumentFragment();
  };

  Object.defineProperty(box, 'innerHTML', {
    configurable: true,
    get() {
      return htmlDescriptor.get.call(this);
    },
    set(value) {
      const next = value == null ? '' : String(value);
      if (next === '') {
        collecting = true;
        fragment = document.createDocumentFragment();
        if (!scheduled) {
          scheduled = true;
          setTimeout(flush, ADVICE_FLUSH_INTERVAL_MS);
        }
        return;
      }
      collecting = false;
      fragment = document.createDocumentFragment();
      if (htmlDescriptor.get.call(this) === next) return;
      htmlDescriptor.set.call(this, next);
    }
  });

  box.appendChild = function appendStableAdvice(node) {
    if (collecting) {
      fragment.appendChild(node);
      return node;
    }
    return nativeAppendChild.call(this, node);
  };

  box.dataset.acelynnAdviceBatching = '2';
  return true;
}

function installStableStyles() {
  if (document.getElementById('acelynn-live-stability-styles')) return;
  const style = document.createElement('style');
  style.id = 'acelynn-live-stability-styles';
  style.textContent = `
    #advice,#ruleFindings,#diffRows{overflow-anchor:none}
    #advice{contain:layout style paint}
    #ruleFindings,#diffRows{contain:layout style}

    body.acelynn-signal-invalid #healthScore,
    body.acelynn-signal-invalid #healthLabel,
    body.acelynn-signal-invalid #balanceText,
    body.acelynn-signal-invalid #focusValue,
    body.acelynn-signal-invalid #status,
    body.acelynn-signal-invalid #coachTitle,
    body.acelynn-signal-invalid #coachText,
    body.acelynn-signal-invalid #captureButton{font-size:0!important}

    body.acelynn-signal-invalid #healthScore::after{content:'—';font-size:.91rem}
    body.acelynn-signal-invalid #healthLabel::after{content:'Waiting for audio';font-size:.88rem}
    body.acelynn-signal-invalid #balanceText::after{content:'Waiting for signal';font-size:.72rem}
    body.acelynn-signal-invalid #focusValue::after{content:'—';font-size:.87rem}
    body.acelynn-signal-invalid #status::after{content:'Waiting for usable audio';font-size:.68rem}
    body.acelynn-signal-invalid #coachTitle::after{content:'Waiting for usable audio';font-size:.87rem}
    body.acelynn-signal-invalid #coachText::after{content:'Acelynn can hear the input path, but there is not enough stable spectral energy to score this check yet.';font-size:.81rem;line-height:1.45}
    body.acelynn-signal-invalid #captureButton::after{content:'Waiting for audio';font-size:.73rem}

    body.acelynn-signal-invalid #captureButton{pointer-events:none;opacity:.4}
    body.acelynn-signal-invalid #advice>*{display:none!important}
    body.acelynn-signal-invalid #advice::after{content:'No score is being created yet. Play audio at a normal listening level and let the spectrum settle.';display:block;padding:10px;border-radius:11px;background:#0c0c17;border-left:3px solid var(--violet);font-size:.76rem;line-height:1.4;color:#d7d6e0}
    body.acelynn-signal-invalid #ruleFindings>*{display:none!important}
    body.acelynn-signal-invalid #ruleFindings::after{content:'Waiting for a stable signal before showing rule findings.';display:block;padding:8px 9px;border-radius:10px;background:#0c0c17;border-left:3px solid var(--violet);font-size:.7rem;line-height:1.4;color:#d7d6e0}
  `;
  document.head.appendChild(style);
}

function patchCurrentTargets() {
  [
    'coachTitle',
    'coachText',
    'captureButton',
    'healthLabel',
    'balanceText',
    'status',
    'focusValue',
    'targetText',
    'sessionCount'
  ].forEach(id => dedupeTextContent(document.getElementById(id)));

  batchAdviceUpdates(document.getElementById('advice'));
  const rulesReady = dedupeInnerHtml(document.getElementById('ruleFindings'));
  const diffReady = dedupeInnerHtml(document.getElementById('diffRows'));
  return rulesReady && diffReady;
}

function evaluateFrameValidity(frame) {
  const evaluator = globalThis.AcelynnV12?.evaluateSignalValidity;
  if (!frame || typeof evaluator !== 'function') return null;
  return evaluator({
    bandValues: frame.bandValues,
    fftMagnitudes: frame.fftMagnitudes,
    rmsDb: frame.rmsDb
  });
}

function applySignalVisualState(valid) {
  const body = document.body;
  if (!body) return;
  signalVisualState = valid;
  body.classList.toggle('acelynn-signal-invalid', valid === false);
  body.dataset.acelynnSignalVisualState = valid === false ? 'waiting' : 'valid';
  const captureButton = document.getElementById('captureButton');
  if (captureButton) {
    if (valid === false) captureButton.setAttribute('aria-disabled', 'true');
    else captureButton.removeAttribute('aria-disabled');
  }
}

function stabilizeFrame(frame) {
  const validity = evaluateFrameValidity(frame);
  if (!validity) return null;

  if (validity.valid) {
    validStreak += 1;
    invalidStreak = 0;
    const required = signalVisualState === false ? VALID_STREAK_REQUIRED : 1;
    if (validStreak >= required) applySignalVisualState(true);
  } else {
    invalidStreak += 1;
    validStreak = 0;
    const required = signalVisualState === true ? INVALID_STREAK_REQUIRED : 1;
    if (invalidStreak >= required) applySignalVisualState(false);
  }

  return validity;
}

function resetSignalVisualState() {
  signalVisualState = null;
  validStreak = 0;
  invalidStreak = 0;
  const body = document.body;
  if (body) {
    body.classList.remove('acelynn-signal-invalid');
    delete body.dataset.acelynnSignalVisualState;
  }
  document.getElementById('captureButton')?.removeAttribute('aria-disabled');
}

function install() {
  installStableStyles();
  const allDynamicTargetsReady = patchCurrentTargets();

  if (!allDynamicTargetsReady && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (patchCurrentTargets()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('acelynn:frame', event => stabilizeFrame(event.detail?.frame));
  window.addEventListener('acelynn:stopped', event => {
    if (event.detail?.frame) stabilizeFrame(event.detail.frame);
  });
  window.addEventListener('acelynn:source-reset', resetSignalVisualState);

  const body = document.body;
  if (body) body.dataset.acelynnLiveStability = '3';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

export {
  ADVICE_FLUSH_INTERVAL_MS,
  batchAdviceUpdates,
  dedupeInnerHtml,
  dedupeTextContent,
  evaluateFrameValidity,
  install,
  resetSignalVisualState,
  stabilizeFrame
};
