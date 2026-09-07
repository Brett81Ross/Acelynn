import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createLiveRenderer } from '../js/live-renderer.js';

const html = readFileSync('index.html', 'utf8');
const enhancements = readFileSync('js/ui-enhancements.js', 'utf8');
const rendererSource = readFileSync('js/live-renderer.js', 'utf8');

function state(overrides = {}) {
  return {
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
    targetLabel: 'Target: Balanced mix',
    coaching: { title: 'Your next move', text: 'Ready', items: [] },
    capture: { enabled: false, label: 'Save current check' },
    ruleMeter: { score: null, label: 'Waiting for analysis', findings: [] },
    ...overrides
  };
}

describe('unified renderer browser DOM QA', () => {
  it('changes live contents without adding removing or replacing app sections', () => {
    const page = new JSDOM(html, { url: 'https://acelynn.example.test/' });
    const document = page.window.document;
    const renderer = createLiveRenderer({ document, canvas: null });
    const sectionsBefore = [...document.querySelectorAll('section')];
    const advice = document.getElementById('advice');
    const adviceParent = advice.parentElement;
    const capture = document.getElementById('captureButton');
    const captureParent = capture.parentElement;

    renderer.renderReady();
    renderer.render(state({
      lifecycle: 'listening',
      signal: 'waiting',
      status: 'Waiting for usable audio',
      coaching: { title: 'Waiting for usable audio', text: 'Hold', items: [] },
      capture: { enabled: false, label: 'Waiting for audio' }
    }));
    renderer.render(state({
      lifecycle: 'listening',
      signal: 'valid',
      healthScore: 82,
      healthLabel: 'Healthy balance',
      balanceText: 'On target',
      focus: 'Mids',
      status: 'Mids is leading',
      peakDb: -12,
      rmsDb: -24,
      rangeDb: 12,
      bandValues: [30, 50, 70, 55, 40],
      normalized: [43, 71, 100, 79, 57],
      coaching: { title: 'Your mix is translating well', text: 'Balance is in a good place.', items: [{ title: 'Mids', text: 'Check them.' }] },
      capture: { enabled: true, label: 'Save current check' },
      ruleMeter: { score: 82, label: '82/100', findings: [{ title: 'Balance', text: 'Stable' }] }
    }));
    renderer.render(state({ lifecycle: 'paused', signal: 'valid', status: 'Analysis stopped' }));

    const sectionsAfter = [...document.querySelectorAll('section')];
    expect(sectionsAfter).toHaveLength(sectionsBefore.length);
    expect(sectionsAfter.every((section, index) => section === sectionsBefore[index])).toBe(true);
    expect(document.getElementById('advice')).toBe(advice);
    expect(advice.parentElement).toBe(adviceParent);
    expect(document.getElementById('captureButton')).toBe(capture);
    expect(capture.parentElement).toBe(captureParent);
  });

  it('keeps renderer navigation-neutral', () => {
    expect(rendererSource).not.toContain('scrollIntoView');
    expect(rendererSource).not.toContain('.focus(');
    expect(rendererSource).not.toContain('window.location');
    expect(rendererSource).not.toContain('document.location');
  });

  it('preserves narrow and wide Fold-responsive shell rules', () => {
    const combinedStyles = `${html}\n${enhancements}`;
    expect(combinedStyles).toContain('@media(min-width:620px)');
    expect(combinedStyles).toContain('@media(max-width:430px)');
    expect(combinedStyles).toContain('width:min(780px,100%)');
    expect(html).toContain('viewport-fit=cover');
  });
});
