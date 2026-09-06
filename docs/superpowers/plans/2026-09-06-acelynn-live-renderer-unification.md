# Acelynn Pro Live Renderer Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Acelynn Pro’s competing live-analysis DOM writers with one canonical live state machine and one renderer, then prove the repair in browser QA and an isolated Samsung Galaxy Z Fold Render QA APK before any production release.

**Architecture:** Keep the existing audio/scoring/persistence algorithms, but extract live frame processing into a focused controller, convert raw frames into an immutable `LiveAnalysisState`, and render all canonical live UI through one idempotent renderer. `ui-enhancements.js` becomes a non-canonical feature layer only, while `live-stability.js` and `webview-performance.js` leave the startup path. Android WebView cadence is enforced inside the controller rather than by replacing global browser APIs.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Web Audio API, Canvas 2D, Vitest 3.2.4, jsdom 26.1.0, fake-indexeddb 6.2.2, Android WebView, Gradle Kotlin DSL, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-acelynn-live-renderer-unification-design.md`

## Global Constraints

- Preserve existing audio-analysis math, thresholds, room-signature logic, snapshots, backup/restore behavior, and structured persistence.
- No redesign of Acelynn's visual language.
- No schema migration.
- No changes to the permanent Android signer, package ID `com.cactusbyte.acelynnpro`, recovery backup format, or restored user data.
- No Vercel preview deployment.
- No service worker.
- Android WebView heavy processing target: 20 FPS for `Android` + `CactusByteNative/1.0` only.
- Normal browser mode must not globally replace `requestAnimationFrame` or `cancelAnimationFrame`.
- Existing Recovery QA package `com.cactusbyte.acelynnpro.qa` remains untouched and installed through field acceptance.
- Physical Fold acceptance requires at least 60 seconds of live microphone analysis with no visible UI oscillation before production release is proposed.

---

## File Structure

### Acelynn repo: `Brett81Ross/Acelynn`

- Create `js/live-state.js`: pure signal-state transition and immutable `LiveAnalysisState` builder.
- Create `js/live-renderer.js`: sole owner of canonical live DOM and canvas mutations.
- Create `js/live-controller.js`: Web Audio lifecycle, frame acquisition, cadence, recent-frame buffering, and bridge/event emission.
- Modify `index.html`: remove the inline live-analysis controller/renderer, load the three new modules, keep snapshot/backup UI wiring and visual markup.
- Modify `js/ui-enhancements.js`: remove signal MutationObserver and canonical live writes; retain room-signature and Mix-Diff surfaces.
- Modify `legacy-export-bridge.js`: stop importing `webview-performance.js` and `live-stability.js`; continue loading the static-shell bootstrap.
- Keep `js/live-stability.js` and `js/webview-performance.js` temporarily as rollback/history files, but production startup must not import them.
- Create `tests/live-state.test.js`: transition/hysteresis/state-output unit tests.
- Create `tests/live-renderer.test.js`: canonical ownership and idempotent rendering tests in jsdom.
- Create `tests/live-controller.test.js`: cadence and event/bridge tests with fake RAF/analyser inputs.
- Replace `tests/live-analysis-stability.test.js`: architecture regression tests proving the old arbitration layers are not in the startup path.
- Modify `package.json`: include the new tests in `qa:v1.2`.

### Android packager repo: `Brett81Ross/cactusbyte-studios`

- Modify `android-packager/app/build.gradle.kts`: add a Render QA-only application-ID override/label for Acelynn without changing direct/play signing.
- Create `android-packager/app/src/acelynnproRenderqaDebug/AndroidManifest.xml`: Render QA-specific manifest if needed for label/permissions isolation.
- Create `android-packager/app/src/acelynnproRenderqaDebug/assets/acelynnrenderqa/`: exact staged Acelynn asset bundle generated from the approved commit.
- Create `.github/workflows/acelynn-render-qa-apk.yml`: deterministic debug build + artifact workflow for `com.cactusbyte.acelynnpro.renderqa`.
- Create `tools/qa-acelynn-render-qa.mjs`: static package/content guard proving no production cutover action and no service worker.

---

### Task 1: Canonical Live State Machine

**Files:**
- Create: `js/live-state.js`
- Create: `tests/live-state.test.js`

**Interfaces:**
- Consumes: `AcelynnV12.evaluateSignalValidity({ bandValues, fftMagnitudes, rmsDb })` from `js/runtime.js`.
- Produces:
  - `createLiveStateMachine(options)` → `{ reset(), build(input), getState() }`
  - `build(input)` accepts `{ lifecycle, frame, profileName, signalValidity, saved }` and returns immutable `LiveAnalysisState`.
  - `LiveAnalysisState.signal` is one of `unknown | waiting | valid`.
  - Hysteresis defaults: 3 consecutive valid frames to leave `waiting`, 2 consecutive invalid frames to leave `valid`.

- [ ] **Step 1: Write the failing transition tests**

Create `tests/live-state.test.js` with explicit boundary cases:

```js
import { describe, expect, it } from 'vitest';
import { createLiveStateMachine } from '../js/live-state.js';

const valid = { valid: true, failures: [], reason: null, metrics: {} };
const invalid = { valid: false, failures: ['bands'], reason: 'bands', metrics: {} };
const frame = {
  peakDb: -12.4,
  rmsDb: -24.8,
  bandValues: [30, 50, 70, 55, 40],
  focus: 'Mids',
  result: {
    score: 82,
    weightedScore: 82,
    normalized: [43, 71, 100, 79, 57],
    p: { name: 'Balanced mix', target: [42, 56, 62, 55, 43] }
  }
};

describe('live state machine', () => {
  it('does not leave waiting until three consecutive valid frames', () => {
    const machine = createLiveStateMachine();
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: invalid }).signal).toBe('waiting');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: valid }).signal).toBe('waiting');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: valid }).signal).toBe('waiting');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: valid }).signal).toBe('valid');
  });

  it('does not leave valid until two consecutive invalid frames', () => {
    const machine = createLiveStateMachine();
    machine.build({ lifecycle: 'listening', frame, signalValidity: valid });
    machine.build({ lifecycle: 'listening', frame, signalValidity: valid });
    machine.build({ lifecycle: 'listening', frame, signalValidity: valid });
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: invalid }).signal).toBe('valid');
    expect(machine.build({ lifecycle: 'listening', frame, signalValidity: invalid }).signal).toBe('waiting');
  });

  it('returns a deterministic waiting view model without score/coaching thrash', () => {
    const machine = createLiveStateMachine();
    const state = machine.build({ lifecycle: 'listening', frame, signalValidity: invalid, saved: false });
    expect(state.healthScore).toBe('—');
    expect(state.healthLabel).toBe('Waiting for audio');
    expect(state.capture.enabled).toBe(false);
    expect(state.coaching.title).toBe('Waiting for usable audio');
    expect(Object.isFrozen(state)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/live-state.test.js
```

Expected: FAIL because `js/live-state.js` does not exist.

- [ ] **Step 3: Implement the minimal state machine**

Create `js/live-state.js` with the exact ownership model:

```js
const DEFAULT_HYSTERESIS = Object.freeze({ validFrames: 3, invalidFrames: 2 });

export function createLiveStateMachine({ hysteresis = DEFAULT_HYSTERESIS } = {}) {
  let signal = 'unknown';
  let validStreak = 0;
  let invalidStreak = 0;
  let current = null;

  function transition(validity) {
    if (!validity) return signal;
    if (validity.valid) {
      validStreak += 1;
      invalidStreak = 0;
      if (signal !== 'valid' && validStreak >= hysteresis.validFrames) signal = 'valid';
    } else {
      invalidStreak += 1;
      validStreak = 0;
      if (signal === 'unknown') signal = 'waiting';
      else if (signal === 'valid' && invalidStreak >= hysteresis.invalidFrames) signal = 'waiting';
    }
    return signal;
  }

  function build({ lifecycle = 'ready', frame = null, signalValidity = null, saved = false } = {}) {
    const nextSignal = transition(signalValidity);
    const result = frame?.result;
    const score = Number(result?.weightedScore ?? result?.score);
    const waiting = lifecycle === 'listening' && nextSignal !== 'valid';
    const rangeDb = Number.isFinite(frame?.peakDb) && Number.isFinite(frame?.rmsDb)
      ? Math.max(0, frame.peakDb - frame.rmsDb)
      : null;

    current = Object.freeze({
      lifecycle,
      signal: nextSignal,
      peakDb: Number.isFinite(frame?.peakDb) ? frame.peakDb : null,
      rmsDb: Number.isFinite(frame?.rmsDb) ? frame.rmsDb : null,
      rangeDb,
      bandValues: Object.freeze((frame?.bandValues || [0, 0, 0, 0, 0]).slice(0, 5)),
      normalized: Object.freeze((result?.normalized || [0, 0, 0, 0, 0]).slice(0, 5)),
      focus: waiting ? '—' : (frame?.focus || '—'),
      healthScore: waiting || !Number.isFinite(score) ? '—' : Math.round(score),
      healthLabel: waiting ? 'Waiting for audio' : Number.isFinite(score) ? (score >= 80 ? 'Healthy balance' : score >= 60 ? 'A few things to check' : 'Needs attention') : 'Waiting for audio',
      balanceText: waiting ? 'Waiting for signal' : Number.isFinite(score) ? (score >= 80 ? 'On target' : score >= 60 ? 'Check the highlighted bands' : 'Out of target') : 'Waiting for signal',
      status: waiting ? 'Waiting for usable audio' : frame?.focus ? `${frame.focus} is leading` : 'Not listening',
      coaching: Object.freeze(waiting
        ? { title: 'Waiting for usable audio', text: 'Acelynn can hear the input path, but there is not enough real spectral energy to score this check yet.', items: Object.freeze([]) }
        : { title: null, text: null, items: Object.freeze([]) }),
      capture: Object.freeze({ enabled: Boolean(frame && !saved && !waiting), label: frame ? (saved ? 'Last check saved' : 'Save current check') : 'Save current check' })
    });
    return current;
  }

  return Object.freeze({
    build,
    getState: () => current,
    reset() {
      signal = 'unknown';
      validStreak = 0;
      invalidStreak = 0;
      current = null;
    }
  });
}
```

The implementer may add pure helpers for score color/coaching later, but this task must not touch DOM.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run tests/live-state.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add js/live-state.js tests/live-state.test.js
git commit -m "refactor: add canonical Acelynn live state machine"
```

---

### Task 2: Single Idempotent Live Renderer

**Files:**
- Create: `js/live-renderer.js`
- Create: `tests/live-renderer.test.js`

**Interfaces:**
- Consumes: immutable `LiveAnalysisState` from Task 1 plus optional raw `frame` for spectrum data.
- Produces:
  - `createLiveRenderer({ document, canvas, colorForScore })`
  - `.render(state, frame)`
  - `.renderReady()`
  - `.renderError(message)`
- Canonical IDs owned by this renderer only: `healthScore`, `healthLabel`, `balanceText`, `focusValue`, `status`, `coachTitle`, `coachText`, `advice`, `captureButton`, `peakValue`, `rmsValue`, `rangeValue`, `targetText`, `ruleMeterFill`, `ruleMeterLabel`, `ruleFindings`, `dot`, `stateText`, five band fills/outputs, and `spectrum`.

- [ ] **Step 1: Write failing renderer tests**

Create `tests/live-renderer.test.js` using jsdom. Assert idempotence by instrumenting a setter count:

```js
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
    renderer.render({ lifecycle: 'listening', signal: 'waiting', healthScore: '—', healthLabel: 'Waiting for audio', balanceText: 'Waiting for signal', focus: '—', status: 'Waiting for usable audio', peakDb: -50, rmsDb: -55, rangeDb: 5, bandValues: [1,1,1,1,1], normalized: [1,1,1,1,1], targetLabel: 'Target: Balanced mix', coaching: { title: 'Waiting for usable audio', text: 'Hold', items: [] }, capture: { enabled: false, label: 'Waiting for audio' }, ruleMeter: { score: null, label: 'Waiting for usable audio', findings: [] } });
    expect(page.window.document.getElementById('healthScore').textContent).toBe('—');
    expect(page.window.document.getElementById('captureButton').disabled).toBe(true);
  });

  it('does not rewrite unchanged text on an identical render', () => {
    const page = dom();
    const node = page.window.document.getElementById('healthLabel');
    const spy = vi.spyOn(node, 'replaceChildren');
    const renderer = createLiveRenderer({ document: page.window.document });
    const state = { lifecycle: 'ready', signal: 'unknown', healthScore: '—', healthLabel: 'Waiting for audio', balanceText: 'Waiting for signal', focus: '—', status: 'Not listening', peakDb: null, rmsDb: null, rangeDb: null, bandValues: [0,0,0,0,0], normalized: [0,0,0,0,0], targetLabel: 'Target: Balanced mix', coaching: { title: 'Your next move', text: 'Ready', items: [] }, capture: { enabled: false, label: 'Save current check' }, ruleMeter: { score: null, label: 'Waiting for analysis', findings: [] } };
    renderer.render(state);
    renderer.render(state);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run tests/live-renderer.test.js
```

Expected: FAIL because `js/live-renderer.js` does not exist.

- [ ] **Step 3: Implement the renderer with small idempotent helpers**

Create `js/live-renderer.js` with helpers equivalent to:

```js
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

export function createLiveRenderer({ document, canvas = document?.getElementById('spectrum') } = {}) {
  if (!document) throw new TypeError('document is required');

  function render(state, frame = null) {
    setText(document, 'healthScore', state.healthScore);
    setText(document, 'healthLabel', state.healthLabel);
    setText(document, 'balanceText', state.balanceText);
    setText(document, 'focusValue', state.focus);
    setText(document, 'status', state.status);
    setText(document, 'peakValue', state.peakDb == null ? '— dB' : `${state.peakDb.toFixed(1)} dB`);
    setText(document, 'rmsValue', state.rmsDb == null ? '— dB' : `${state.rmsDb.toFixed(1)} dB`);
    setText(document, 'rangeValue', state.rangeDb == null ? '— dB' : `${state.rangeDb.toFixed(1)} dB`);
    setText(document, 'targetText', state.targetLabel);
    setText(document, 'captureButton', state.capture.label);
    setDisabled(document, 'captureButton', !state.capture.enabled);
    // Render bands, coaching, rule meter, header state, and spectrum here.
  }

  return Object.freeze({ render });
}
```

Do not use `MutationObserver`, property descriptors, CSS pseudo-content masking, or global event interception.

- [ ] **Step 4: Expand tests for all canonical IDs and verify GREEN**

Add assertions proving `render()` owns score, coaching, capture state, rule meter, band output, and header state from one state object.

Run:

```bash
npx vitest run tests/live-renderer.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add js/live-renderer.js tests/live-renderer.test.js
git commit -m "refactor: add single Acelynn live renderer"
```

---

### Task 3: Extract Live Audio Controller and Android-Only Cadence

**Files:**
- Create: `js/live-controller.js`
- Create: `tests/live-controller.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `createLiveStateMachine()` from Task 1, `createLiveRenderer()` from Task 2, existing `AcelynnV12` scoring/persistence APIs, existing profile/band definitions.
- Produces:
  - `createLiveController(options)` → `{ startMic(), startFile(file), stop(), resetSource(), getLastFrame(), getRecentFrames(), getLiveState(), isRunning() }`
  - frozen `globalThis.AcelynnCoreBridge` delegates to the controller.
- `processFrame(timestamp)` is the only heavy live-analysis path.
- Android native processing interval: `50 ms` (20 FPS).
- Browser interval: no explicit 20 FPS cap.

- [ ] **Step 1: Write failing cadence/controller tests**

Create `tests/live-controller.test.js` with a fake scheduler. The key assertion is that Android native mode skips heavy processing inside 50 ms while browser mode does not apply that cap:

```js
import { describe, expect, it, vi } from 'vitest';
import { createLiveController, isCactusByteAndroidWebView } from '../js/live-controller.js';

describe('live controller cadence', () => {
  it('detects only the CactusByte Android WebView', () => {
    expect(isCactusByteAndroidWebView('Mozilla/5.0 (Linux; Android 16) CactusByteNative/1.0')).toBe(true);
    expect(isCactusByteAndroidWebView('Mozilla/5.0 (Linux; Android 16) Chrome/140')).toBe(false);
    expect(isCactusByteAndroidWebView('Mozilla/5.0 (iPhone) CactusByteNative/1.0')).toBe(false);
  });

  it('caps heavy processing to 20 FPS without replacing requestAnimationFrame', () => {
    const raf = vi.fn();
    const env = { navigator: { userAgent: 'Android CactusByteNative/1.0' }, requestAnimationFrame: raf, cancelAnimationFrame: vi.fn() };
    const original = env.requestAnimationFrame;
    createLiveController({ environment: env, autoInstall: false });
    expect(env.requestAnimationFrame).toBe(original);
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
npx vitest run tests/live-controller.test.js
```

Expected: FAIL because `js/live-controller.js` does not exist.

- [ ] **Step 3: Move frame acquisition/computation from the inline script into the controller**

Extract the existing functions and preserve their math:

```js
export const ANDROID_NATIVE_TARGET_FPS = 20;
export const ANDROID_NATIVE_FRAME_INTERVAL_MS = 1000 / ANDROID_NATIVE_TARGET_FPS;

export function isCactusByteAndroidWebView(userAgent = globalThis.navigator?.userAgent || '') {
  return /Android/i.test(userAgent) && /CactusByteNative\/1\.0/i.test(userAgent);
}
```

The loop keeps native RAF unchanged and gates only heavy work:

```js
function scheduleLoop() {
  rafHandle = environment.requestAnimationFrame(timestamp => {
    if (!running) return;
    const interval = androidNative ? ANDROID_NATIVE_FRAME_INTERVAL_MS : 0;
    if (!interval || timestamp - lastProcessedAt >= interval) {
      lastProcessedAt = timestamp;
      processFrame(timestamp);
    }
    scheduleLoop();
  });
}
```

`processFrame()` must preserve the current analyzer parameters and formulas from `index.html`:

- `fftSize = 2048`
- `smoothingTimeConstant = .78`
- `minDecibels = -100`
- `maxDecibels = -20`
- existing five frequency bands
- existing profile targets
- existing room-signature adjustment via `AcelynnV12.applyRoomSignature`
- existing perspective health via `AcelynnV12.calculatePerspectiveHealth`
- `acelynn:frame` event cadence may remain every 6 processed frames for read-only consumers.

Each processed frame must call `AcelynnV12.evaluateSignalValidity`, pass that result into the state machine, then call `renderer.render(state, frame)` exactly once.

- [ ] **Step 4: Replace the inline live loop in `index.html` with module bootstrap wiring**

Keep static markup and snapshot/backup functions, but remove direct canonical live DOM writes from the giant inline IIFE. Load:

```html
<script type="module" src="/js/runtime.js"></script>
<script type="module" src="/js/ui-enhancements.js"></script>
<script type="module" src="/js/live-app.js"></script>
```

If a separate `js/live-app.js` bootstrap is clearer, create it in this task and have it instantiate controller + renderer + state machine and attach button/file/profile handlers. The key invariant is that event handlers call controller methods; they do not directly mutate canonical live fields.

Preserve `AcelynnRecovery` export/restore, snapshot list rendering, and `legacy-export-bridge.js` loading.

- [ ] **Step 5: Run controller + state + renderer tests and verify GREEN**

```bash
npx vitest run tests/live-state.test.js tests/live-renderer.test.js tests/live-controller.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add index.html js/live-controller.js js/live-app.js tests/live-controller.test.js
git commit -m "refactor: route Acelynn live analysis through one controller"
```

---

### Task 4: Remove Competing UI Writers and Retire Arbitration Imports

**Files:**
- Modify: `js/ui-enhancements.js`
- Modify: `legacy-export-bridge.js`
- Replace: `tests/live-analysis-stability.test.js`

**Interfaces:**
- Consumes: `AcelynnCoreBridge.getLastFrame()`, `.getRecentFrames()`, `.getSnapshots()`, optional `.getLiveState()` from Task 3.
- Produces: room-signature commands/status and Mix-Diff rendering only.

- [ ] **Step 1: Replace the old stability tests with architecture-failure tests**

Rewrite `tests/live-analysis-stability.test.js` so the current code fails before cleanup:

```js
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
  });
});
```

- [ ] **Step 2: Run architecture test and verify RED before cleanup**

```bash
npx vitest run tests/live-analysis-stability.test.js
```

Expected: FAIL because old imports/observer code still exist.

- [ ] **Step 3: Remove canonical live rendering from `ui-enhancements.js`**

Delete:

- `signalGuardObserver`
- `lastSignalUiReason`
- `renderSignalWaiting()`
- `enforceSignalValidityUi()`
- `installSignalValidityGuard()`
- `renderRules()` writes to canonical live state if rule rendering has moved to the renderer
- any `acelynn:frame` listener whose purpose is canonical score/coaching/capture/status updates

Retain room-signature creation/capture/clear and Mix-Diff rendering. Change room capture availability to read bridge/state rather than DOM:

```js
function updateRoomCaptureAvailability() {
  const button = byId('roomSignatureButton');
  const bridge = globalThis.AcelynnCoreBridge;
  if (!button || !bridge) return;
  const state = bridge.getLiveState?.();
  const frame = bridge.getLastFrame?.();
  const recent = bridge.getRecentFrames?.() || [];
  button.disabled = !(state?.signal === 'valid' && frame?.sourceType === 'microphone' && recent.length >= 3);
}
```

- [ ] **Step 4: Remove hotfix arbitration imports from `legacy-export-bridge.js`**

The browser bootstrap must become:

```js
root.AcelynnLegacyExportBridge = api;
api.install();
import('/js/static-shell-bootstrap.js').catch(error => {
  console.error('Acelynn static shell bootstrap could not start:', error);
});
```

Do not delete `live-stability.js` or `webview-performance.js` yet; simply remove them from production startup.

- [ ] **Step 5: Run architecture regression and verify GREEN**

```bash
npx vitest run tests/live-analysis-stability.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add js/ui-enhancements.js legacy-export-bridge.js tests/live-analysis-stability.test.js
git commit -m "refactor: remove competing Acelynn live UI writers"
```

---

### Task 5: Preserve Snapshots, Recovery, Room Signature, Mix-Diff, and Full v1.2 QA

**Files:**
- Modify: `tests/runtime.test.js` only if needed for new bridge/state fixtures
- Modify: `tests/signal-validity.test.js` only if needed for shared state fixtures
- Create: `tests/live-integration.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: controller/renderer/state machine from Tasks 1–4.
- Produces: regression proof that renderer unification does not alter storage or recovery semantics.

- [ ] **Step 1: Write a failing integration test for alternating quiet/valid frames**

Create `tests/live-integration.test.js` with a fake renderer and the canonical state machine. Feed an alternating validity sequence and assert the visible signal state remains stable according to hysteresis rather than alternating every frame.

Example sequence:

```js
const sequence = [false, true, false, true, true, true, false, true, false, false];
```

Expected visible signal states:

```js
['waiting','waiting','waiting','waiting','waiting','valid','valid','valid','valid','waiting']
```

- [ ] **Step 2: Add regression assertions for snapshot/recovery semantics**

Test that the live controller exposes a snapshot-ready raw frame but does not change the backup schema. Existing recovery remains:

```json
{
  "app": "Acelynn Pro",
  "schema": "acelynn-pro-backup-v1",
  "version": 1,
  "snapshots": []
}
```

Do not change `AcelynnRecovery.createBackup`, `parseBackupText`, or `restore` format.

- [ ] **Step 3: Add room-signature/Mix-Diff regression checks**

Assert that `ui-enhancements.js` still contains room signature and Mix-Diff functions, but no MutationObserver or canonical renderer ownership.

- [ ] **Step 4: Update `qa:v1.2`**

Change `package.json` so `qa:v1.2` includes:

```json
"qa:v1.2": "vitest run tests/v1.2-foundation.test.js tests/spectral.test.js tests/runtime.test.js tests/insights.test.js tests/static-shell-authority.test.js tests/signal-validity.test.js tests/full-state-backup.test.js tests/live-state.test.js tests/live-renderer.test.js tests/live-controller.test.js tests/live-analysis-stability.test.js tests/live-integration.test.js"
```

- [ ] **Step 5: Run the complete Acelynn test suite**

```bash
npm test
npm run qa:v1.2
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add tests/live-integration.test.js tests/runtime.test.js tests/signal-validity.test.js package.json
git commit -m "test: lock Acelynn unified renderer regressions"
```

---

### Task 6: Browser/Fold-Like Viewport QA Without Vercel Preview

**Files:**
- Create: `tests/live-browser-dom.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: the staged static shell and live modules.
- Produces: local deterministic DOM/layout/runtime regression coverage without a preview deployment.

- [ ] **Step 1: Add browser-DOM tests**

Use jsdom to load the static shell markup and invoke the renderer with `ready`, `waiting`, `valid`, and `paused` states. Assert:

- the canonical elements remain present
- state transitions do not add/remove sections
- `advice` changes contents without changing its parent section
- capture button changes disabled/text only
- no renderer call calls `scrollIntoView`, `focus`, or changes `window.location`

- [ ] **Step 2: Add viewport invariants**

Parse CSS and assert the existing responsive rules remain present:

```js
expect(html).toContain('@media(min-width:620px)');
expect(html).toContain('@media(max-width:430px)');
expect(html).toContain('width:min(780px,100%)');
```

Do not redesign layout in this task.

- [ ] **Step 3: Run browser-DOM and full QA**

```bash
npx vitest run tests/live-browser-dom.test.js
npm run qa:v1.2
```

Expected: PASS.

- [ ] **Step 4: Commit Task 6**

```bash
git add tests/live-browser-dom.test.js package.json
git commit -m "test: add Acelynn unified renderer browser QA"
```

---

### Task 7: Build an Isolated Acelynn Render QA APK

**Files in `Brett81Ross/cactusbyte-studios`:**
- Modify: `android-packager/app/build.gradle.kts`
- Create: `android-packager/app/src/acelynnproRenderqaDebug/AndroidManifest.xml`
- Create/generated: `android-packager/app/src/acelynnproRenderqaDebug/assets/acelynnrenderqa/*`
- Create: `tools/qa-acelynn-render-qa.mjs`
- Create: `.github/workflows/acelynn-render-qa-apk.yml`

**Interfaces:**
- Consumes: exact approved Acelynn staging commit SHA after Tasks 1–6 are green.
- Produces: debug-signed APK with package `com.cactusbyte.acelynnpro.renderqa`, local staged assets, and no production cutover action.

- [ ] **Step 1: Create a dedicated implementation branch in `cactusbyte-studios` from `android-release-v2-foundation`**

```bash
git switch android-release-v2-foundation
git switch -c acelynn-render-qa
```

- [ ] **Step 2: Add an isolated Render QA distribution path**

Do not alter `direct` or `play`. Extend Gradle so only Acelynn debug can build the render QA package. Use a dedicated distribution flavor or variant override whose final application ID is exactly:

```text
com.cactusbyte.acelynnpro.renderqa
```

Its label must be exactly:

```text
Acelynn Pro Render QA
```

Its `START_URL` must be local assets only, for example:

```text
https://appassets.androidplatform.net/assets/acelynnrenderqa/index.html
```

Signing must remain the debug signing config.

- [ ] **Step 3: Add the static QA guard before asset generation**

Create `tools/qa-acelynn-render-qa.mjs` that fails unless all of these are true:

```js
const expectedPackage = 'com.cactusbyte.acelynnpro.renderqa';
const forbidden = [
  'https://acelynn.vercel.app/',
  'navigator.serviceWorker.register',
  'CactusRecoveryBridge',
  'permanent-acelynnpro'
];
```

The guard must also verify staged assets contain `js/live-state.js`, `js/live-renderer.js`, and `js/live-controller.js`, and do not boot `js/live-stability.js` or `js/webview-performance.js`.

- [ ] **Step 4: Create deterministic asset generation in GitHub Actions**

The workflow checks out both repositories at pinned SHAs, copies only the Acelynn static runtime files needed by the shell into `acelynnrenderqa`, writes a `PINNED_SOURCE.json` containing the exact Acelynn commit SHA, then runs the static guard.

The workflow must not deploy to Vercel and must not touch permanent signing secrets.

- [ ] **Step 5: Build only the Render QA debug APK**

Run the exact Gradle variant created in Step 2, for example:

```bash
./gradlew :app:assembleAcelynnproRenderqaDebug
```

The actual task name must be confirmed from `./gradlew :app:tasks --all` after the flavor is added; use the generated task name rather than guessing in the workflow.

- [ ] **Step 6: Verify APK package, label, signer class, and bundled source pin**

Use Android build tools in CI:

```bash
aapt dump badging app/build/outputs/apk/**/app-*-debug.apk
apksigner verify --print-certs app/build/outputs/apk/**/app-*-debug.apk
```

Required assertions:

- package = `com.cactusbyte.acelynnpro.renderqa`
- label = `Acelynn Pro Render QA`
- signer is debug, not permanent Acelynn signer
- bundled `PINNED_SOURCE.json` matches the approved Acelynn staging commit
- no production URL in staged assets

- [ ] **Step 7: Upload exactly one Render QA artifact**

Artifact name:

```text
acelynn-pro-render-qa
```

- [ ] **Step 8: Commit Task 7 in `cactusbyte-studios`**

```bash
git add android-packager/app/build.gradle.kts android-packager/app/src/acelynnproRenderqaDebug tools/qa-acelynn-render-qa.mjs .github/workflows/acelynn-render-qa-apk.yml
git commit -m "test: add isolated Acelynn renderer QA APK"
```

---

### Task 8: Physical Samsung Galaxy Z Fold Acceptance Gate

**Files:**
- No production code changes.
- Update the Acelynn design/QA record only after physical result is known.

**Interfaces:**
- Consumes: the Render QA APK artifact from Task 7.
- Produces: field-acceptance result only; no automatic release.

- [ ] **Step 1: Install Render QA beside both existing apps**

Confirm all three packages coexist:

```text
com.cactusbyte.acelynnpro
com.cactusbyte.acelynnpro.qa
com.cactusbyte.acelynnpro.renderqa
```

Do not uninstall either existing package.

- [ ] **Step 2: Run live microphone for at least 60 seconds**

Acceptance requires all of the following during continuous audio:

```text
No score/waiting oscillation
No coaching/status flicker
No capture-button thrash
No layout jumping
Spectrum remains responsive
Band meters remain responsive
```

- [ ] **Step 3: Exercise lifecycle persistence**

In Render QA:

1. Save one check.
2. Stop live analysis.
3. Start live analysis again.
4. Close the app completely.
5. Relaunch.
6. Verify the Render QA app still opens cleanly and its locally saved QA check remains available if the bundled QA shell intentionally supports snapshots.

- [ ] **Step 4: Record GREEN or RED without production deployment**

If RED, capture a short screen recording and return to root-cause investigation on the staging branch. Do not add another production hotfix.

If GREEN, update the QA record to state that physical Fold renderer acceptance passed. Production remains unchanged until the user separately approves a release.

---

### Task 9: Production Release Preparation Only After All Gates Are GREEN

**Files:**
- Acelynn repo release PR only.
- No Android signer/package changes.

**Interfaces:**
- Consumes: GREEN automated QA + browser QA + Render QA artifact + physical Fold acceptance.
- Produces: a production-ready PR and release evidence; deployment still requires explicit user approval.

- [ ] **Step 1: Re-run complete Acelynn QA from the exact release commit**

```bash
npm test
npm run qa:v1.2
```

Expected: PASS.

- [ ] **Step 2: Verify production startup no longer loads arbitration layers**

Static assertions:

```text
legacy-export-bridge.js does not import /js/live-stability.js
legacy-export-bridge.js does not import /js/webview-performance.js
ui-enhancements.js has no MutationObserver for canonical fields
live-controller.js does not replace global RAF APIs
```

- [ ] **Step 3: Open the production PR with the four-gate evidence**

PR description must include:

```text
Automated QA: GREEN
Browser QA: GREEN
Render QA APK: GREEN
Physical Galaxy Z Fold: GREEN
Vercel deployment: NOT YET AUTHORIZED
```

- [ ] **Step 4: Stop and request explicit deployment approval**

Do not enable Vercel deployment or create a production deployment until the user explicitly approves it.

---

## Plan Self-Review

### Spec coverage

- Single canonical live state: Task 1.
- Single canonical renderer: Task 2.
- Controller/cadence without global RAF replacement: Task 3.
- Remove MutationObserver and competing writers: Task 4.
- Preserve recovery/storage/room/Mix-Diff: Task 5.
- Browser/Fold-like local QA: Task 6.
- Separate `com.cactusbyte.acelynnpro.renderqa` APK: Task 7.
- Physical 60-second Fold gate: Task 8.
- No production release before all gates and explicit approval: Task 9.

### Placeholder scan

No `TBD`, `TODO`, “implement later”, unspecified error-handling step, or undefined future interface remains in this plan. Where Gradle task naming is generated by Android Gradle Plugin, the plan explicitly requires discovering the generated task via `:app:tasks --all` before hard-coding it.

### Type/interface consistency

- `createLiveStateMachine().build()` feeds `createLiveRenderer().render()`.
- `createLiveController()` owns the last raw frame and exposes it through `AcelynnCoreBridge`.
- `ui-enhancements.js` consumes bridge state but does not mutate canonical live fields.
- Android Render QA consumes an exact Acelynn staging commit and does not alter the production package/signer.
