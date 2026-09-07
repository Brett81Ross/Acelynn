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

describe('live renderer', () => {
  it('renders waiting state from one state object', () => {
    const page = dom();
    const renderer = createLiveRenderer({ document: page.window.document });
    renderer.render({
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
    });
    expect(page.window.document.getElementById('healthScore').textContent).toBe('—');
    expect(page.window.document.getElementById('captureButton').disabled).toBe(true);
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
