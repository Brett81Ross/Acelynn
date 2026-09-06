const textDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
const htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
const nativeAppendChild = Node.prototype.appendChild;

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
  if (box.dataset.acelynnAdviceBatching === '1') return true;

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
          queueMicrotask(flush);
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

  box.dataset.acelynnAdviceBatching = '1';
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

function install() {
  installStableStyles();
  const allDynamicTargetsReady = patchCurrentTargets();

  if (!allDynamicTargetsReady && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (patchCurrentTargets()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const body = document.body;
  if (body) body.dataset.acelynnLiveStability = '1';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

export { batchAdviceUpdates, dedupeInnerHtml, dedupeTextContent, install };
