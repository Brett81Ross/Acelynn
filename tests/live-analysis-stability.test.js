import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyBridge = readFileSync('legacy-export-bridge.js', 'utf8');
const enhancements = readFileSync('js/ui-enhancements.js', 'utf8');
const controller = readFileSync('js/live-controller.js', 'utf8');

const CANONICAL_IDS = ['captureButton','healthScore','healthLabel','balanceText','focusValue','status','coachTitle','coachText','advice'];

describe('single live-renderer architecture', () => {
  it('does not boot the former DOM arbitration hotfixes', () => {
    expect(legacyBridge).not.toContain("import('/js/webview-performance.js')");
    expect(legacyBridge).not.toContain("import('/js/live-stability.js')");
    expect(legacyBridge).toContain("import('/js/static-shell-bootstrap.js')");
  });

  it('does not install a MutationObserver over canonical live fields', () => {
    expect(enhancements).not.toContain('signalGuardObserver');
    expect(enhancements).not.toContain('new MutationObserver');
    for (const id of CANONICAL_IDS) {
      expect(enhancements).not.toContain(`setText('${id}'`);
    }
  });

  it('never replaces global RAF APIs', () => {
    expect(controller).not.toContain('environment.requestAnimationFrame =');
    expect(controller).not.toContain('environment.cancelAnimationFrame =');
    expect(controller).toContain('ANDROID_NATIVE_FRAME_INTERVAL_MS');
  });
});
