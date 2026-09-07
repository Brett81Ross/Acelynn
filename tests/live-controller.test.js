import { describe, expect, it, vi } from 'vitest';
import { createLiveController, isCactusByteAndroidWebView, ANDROID_NATIVE_FRAME_INTERVAL_MS } from '../js/live-controller.js';

describe('live controller cadence', () => {
  it('detects only the CactusByte Android WebView', () => {
    expect(isCactusByteAndroidWebView('Mozilla/5.0 (Linux; Android 16) CactusByteNative/1.0')).toBe(true);
    expect(isCactusByteAndroidWebView('Mozilla/5.0 (Linux; Android 16) Chrome/140')).toBe(false);
    expect(isCactusByteAndroidWebView('Mozilla/5.0 (iPhone) CactusByteNative/1.0')).toBe(false);
  });

  it('uses a 50 ms Android-native heavy processing interval', () => {
    expect(ANDROID_NATIVE_FRAME_INTERVAL_MS).toBe(50);
  });

  it('caps heavy processing without replacing requestAnimationFrame', () => {
    const raf = vi.fn();
    const env = {
      navigator: { userAgent: 'Android CactusByteNative/1.0' },
      requestAnimationFrame: raf,
      cancelAnimationFrame: vi.fn()
    };
    const original = env.requestAnimationFrame;
    createLiveController({ environment: env, autoInstall: false });
    expect(env.requestAnimationFrame).toBe(original);
  });
});
