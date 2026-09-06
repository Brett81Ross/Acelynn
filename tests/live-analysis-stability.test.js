import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyBridge = readFileSync('legacy-export-bridge.js', 'utf8');
const stability = readFileSync('js/live-stability.js', 'utf8');

describe('Acelynn live analysis stability guard', () => {
  it('loads before the static-shell bootstrap path finishes', () => {
    expect(legacyBridge).toContain("import('/js/live-stability.js')");
    expect(legacyBridge).toContain("import('/js/static-shell-bootstrap.js')");
  });

  it('deduplicates repeated text and HTML writes', () => {
    expect(stability).toContain('dedupeTextContent');
    expect(stability).toContain('dedupeInnerHtml');
    expect(stability).toContain("if (textDescriptor.get.call(this) === next) return;");
    expect(stability).toContain("if (htmlDescriptor.get.call(this) === next) return;");
  });

  it('batches the high-frequency coaching rebuild instead of clearing it every animation frame', () => {
    expect(stability).toContain('batchAdviceUpdates');
    expect(stability).toContain("if (next === '')");
    expect(stability).toContain('queueMicrotask(flush)');
    expect(stability).toContain('fragment.appendChild(node)');
  });

  it('disables scroll anchoring on volatile live-analysis sections', () => {
    expect(stability).toContain('#advice,#ruleFindings,#diffRows{overflow-anchor:none}');
  });

  it('uses the runtime signal validator as the visual-state authority', () => {
    expect(stability).toContain('AcelynnV12?.evaluateSignalValidity');
    expect(stability).toContain('evaluateFrameValidity');
    expect(stability).toContain("window.addEventListener('acelynn:frame'");
  });

  it('uses hysteresis instead of flipping waiting and valid UI on every frame', () => {
    expect(stability).toContain('VALID_STREAK_REQUIRED = 3');
    expect(stability).toContain('INVALID_STREAK_REQUIRED = 2');
    expect(stability).toContain("body.classList.toggle('acelynn-signal-invalid', valid === false)");
  });

  it('masks conflicting score coaching and save controls while signal is invalid', () => {
    expect(stability).toContain('body.acelynn-signal-invalid #healthScore');
    expect(stability).toContain("content:'Waiting for audio'");
    expect(stability).toContain('body.acelynn-signal-invalid #advice>*{display:none!important}');
    expect(stability).toContain("captureButton.setAttribute('aria-disabled', 'true')");
  });
});
