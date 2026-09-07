import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { createLiveRenderer } from '../js/live-renderer.js';

function dom() {
  return new JSDOM(`<!doctype html><body>
    <span id="dot"></span><span id="stateText"></span>
    <div id="healthLabel"></div><div id="healthScore"></div><div id="balanceText"></div>
    <div id="focusValue"></div><div id="status"></div><div id="coachTitle"></div><div id="coachText"></div>
    <div id="advice"></div><button id="captureButton"></button>
    <div id="peakValue"></div><div id="rmsValue"></div><div id="rangeValue"></div><div id="targetText"></div>
    <div id="ruleMeterFill"></div><div id="ruleMeterLabel"></div><div id="ruleFindings"></div>
    ${['sub','bass','mid','pres','air'].map(id => `<div id="${id}Fill"></div><output id="${id}Out"></output>`).join('')}
    <canvas id="spectrum"></canvas>
  </body>`);
}

const waitingState = {
  lifecycle: 'listening',
  signal: 'waiting',
  healthScore: '—',
  healthLabel: 'Waiting for audio',
  balanceText: 'Waiting for signal',
  focus: '—',
  status: 'Waiting for usable audio',
  peakDb: -50,
  rmsDb: -55,
  rangeDb: 5,
  bandValues: [1, 1, 1, 1, 1],
  normalized: [1, 1, 1, 1, 1],
  targetLabel: 'Target: Balanced mix',
  coaching: { title: 'Waiting for usable audio', text: 'Hold', items: [] },
  capture: { enabled: false, label: 'Waiting for audio' },
  ruleMeter: { score: null, label: 'Waiting for usable audio', findings: [] }
};

describe('live renderer', () => {
  it('renders waiting state from one state object', () => {
    const page = dom();
    const renderer = createLiveRenderer({ document: page.window.document });
    renderer.render(waitingState);
    expect(page.window.document.getElementById('healthScore').textContent).toBe('—');
    expect(page.window.document.getElementById('captureButton').disabled).toBe(true);
  });

  it('owns score coaching capture rule bands and header from one valid state', () => {
    const page = dom();
    const renderer = createLiveRenderer({ document: page.window.document });
    renderer.render({
      lifecycle: 'listening',
      signal: 'valid',
      healthScore: 82,
      healthLabel: 'Healthy balance',
      balanceText: 'On target',
      focus: 'Mids',
      status: 'Mids is leading',
      peakDb: -12.4,
      rmsDb: -24.8,
      rangeDb: 12.4,
      bandValues: [30, 50, 70, 55, 40],
      normalized: [43, 71, 100, 79, 57],
      targetLabel: 'Target: Balanced mix',
      coaching: {
        title: 'Your mix is translating well',
        text: 'Balance is in a good place.',
        items: [{ title: 'Mids are high.', text: 'Check the midrange.', color: '#ffe27a' }]
      },
      capture: { enabled: true, label: 'Save current check' },
      ruleMeter: {
        score: 82,
        label: '82/100',
        findings: [{ title: 'Balance', text: 'Stable' }]
      }
    });

    const document = page.window.document;
    expect(document.getElementById('stateText').textContent).toBe('LIVE');
    expect(document.getElementById('dot').classList.contains('live')).toBe(true);
    expect(document.getElementById('healthScore').textContent).toBe('82');
    expect(document.getElementById('coachTitle').textContent).toBe('Your mix is translating well');
    expect(document.getElementById('advice').textContent).toContain('Mids are high.');
    expect(document.getElementById('captureButton').disabled).toBe(false);
    expect(document.getElementById('ruleMeterLabel').textContent).toBe('82/100');
    expect(document.getElementById('ruleMeterFill').style.width).toBe('82%');
    expect(document.getElementById('ruleFindings').textContent).toContain('Balance');
    expect(document.getElementById('midFill').style.width).toBe('100%');
    expect(document.getElementById('targetText').textContent).toBe('Target: Balanced mix');
  });

  it('does not rewrite unchanged text on an identical render', () => {
    const page = dom();
    const node = page.window.document.getElementById('healthLabel');
    const spy = vi.spyOn(node, 'replaceChildren');
    const renderer = createLiveRenderer({ document: page.window.document });
    const state = {
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
      ruleMeter: { score: null, label: 'Waiting for analysis', findings: [] }
    };
    renderer.render(state);
    renderer.render(state);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
