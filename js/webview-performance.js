const TARGET_FPS = 20;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

function isCactusByteAndroidWebView(userAgent = globalThis.navigator?.userAgent || '') {
  const ua = String(userAgent);
  return /Android/i.test(ua) && /CactusByteNative\/1\.0/i.test(ua);
}

function installWebViewFrameBudget(environment = globalThis) {
  if (!environment || !isCactusByteAndroidWebView(environment.navigator?.userAgent)) return false;
  if (environment.__acelynnWebViewFrameBudgetInstalled) return true;
  if (typeof environment.requestAnimationFrame !== 'function' || typeof environment.cancelAnimationFrame !== 'function') return false;

  const nativeRequestAnimationFrame = environment.requestAnimationFrame.bind(environment);
  const nativeCancelAnimationFrame = environment.cancelAnimationFrame.bind(environment);
  const pending = new Map();
  let nextHandle = 1;
  let lastDeliveredAt = -Infinity;

  environment.requestAnimationFrame = callback => {
    if (typeof callback !== 'function') return nativeRequestAnimationFrame(callback);

    const handle = nextHandle++;
    const tick = timestamp => {
      if (!pending.has(handle)) return;
      const elapsed = timestamp - lastDeliveredAt;
      if (elapsed + 0.5 >= FRAME_INTERVAL_MS) {
        pending.delete(handle);
        lastDeliveredAt = timestamp;
        callback(timestamp);
        return;
      }
      pending.set(handle, nativeRequestAnimationFrame(tick));
    };

    pending.set(handle, nativeRequestAnimationFrame(tick));
    return handle;
  };

  environment.cancelAnimationFrame = handle => {
    const nativeHandle = pending.get(handle);
    if (nativeHandle !== undefined) {
      pending.delete(handle);
      nativeCancelAnimationFrame(nativeHandle);
      return;
    }
    nativeCancelAnimationFrame(handle);
  };

  environment.__acelynnWebViewFrameBudgetInstalled = true;
  environment.AcelynnWebViewPerformance = Object.freeze({
    enabled: true,
    targetFps: TARGET_FPS,
    frameIntervalMs: FRAME_INTERVAL_MS
  });

  const markReady = () => {
    if (environment.document?.body) {
      environment.document.body.dataset.acelynnWebViewFrameBudget = String(TARGET_FPS);
    }
  };
  if (environment.document?.readyState === 'loading') {
    environment.document.addEventListener('DOMContentLoaded', markReady, { once: true });
  } else {
    markReady();
  }

  return true;
}

installWebViewFrameBudget();

export { FRAME_INTERVAL_MS, TARGET_FPS, installWebViewFrameBudget, isCactusByteAndroidWebView };
