# Acelynn Pro Live Renderer Unification

Date: 2026-09-06
Status: Design approved in chat; implementation not started
Scope: Acelynn Pro live-analysis UI stability on Android WebView, especially Samsung Galaxy Z Fold

## Problem statement

Three production hotfixes reduced symptoms but did not eliminate the Fold glitch. The current live-analysis path has multiple independent writers mutating the same DOM state:

1. The inline controller in `index.html` computes audio frames and directly writes score, focus, band meters, coaching, status, capture state, and spectrum output.
2. `js/ui-enhancements.js` installs a `MutationObserver` over several of those same elements, re-evaluates signal validity, and writes waiting/valid UI state back into the same DOM.
3. `js/ui-enhancements.js` also subscribes to `acelynn:frame` and writes rule/coaching-related live output.
4. `js/live-stability.js` intercepts DOM writes and overlays a second validity/hysteresis layer.
5. `js/webview-performance.js` globally replaces `requestAnimationFrame` for the CactusByte Android WebView.

The result is a feedback loop in which one renderer changes the UI, another observer reacts, another renderer writes again, and the stability layer attempts to reconcile the conflict. Fix #3 reduced the frequency of this loop, which changed the visible glitch, but the ownership conflict remains.

## Goals

- Establish exactly one canonical owner for all live-analysis UI state.
- Preserve existing audio-analysis math, thresholds, room-signature logic, snapshots, backup/restore behavior, and structured persistence.
- Remove observer-driven and monkey-patched live rendering.
- Keep Android WebView rendering on a conservative explicit cadence without globally replacing browser APIs.
- Preserve normal browser behavior and responsive Fold layout.
- Prove the repair on an isolated Fold QA APK before any production deployment.

## Non-goals

- No redesign of Acelynn's visual language.
- No scoring-model changes unless a test proves an existing inconsistency that must be corrected for renderer unification.
- No schema migration.
- No changes to the permanent Android signer, package ID, recovery backup format, or restored user data.
- No Vercel preview deployment.
- No service worker.

## Considered approaches

### A. Keep stacking DOM guards

Continue adding throttles, MutationObserver exclusions, or CSS masking around the current writers.

Rejected. Three attempts have already shown that symptom-level coordination does not remove the underlying ownership conflict.

### B. Make `live-stability.js` the final authority

Keep the existing inline renderer and enhancement observer, but force all output through a stronger stability layer.

Rejected. This would preserve multiple upstream writers and make the stability layer responsible for arbitrating contradictions. It would remain fragile and difficult to test.

### C. Single live state + single renderer

Recommended and approved. Separate frame acquisition/computation from view state, then allow one renderer to mutate live-analysis DOM. Enhancement modules consume stable state but do not write canonical live fields independently.

## Architecture

### 1. Live controller

Create a focused controller module that owns microphone/file lifecycle, analyser reads, frame construction, explicit render cadence, recent-frame buffering, and snapshot-ready frame state.

The controller does not directly mutate live-analysis DOM. It produces a normalized `LiveAnalysisState` object and passes it to the renderer.

Android WebView cadence is explicit inside this controller. For `Android` + `CactusByteNative/1.0`, heavy analysis/render work is limited to 20 FPS. Normal browser behavior may use the browser frame loop without a global API override. `requestAnimationFrame` itself is never monkey-patched.

### 2. Canonical live state

A pure state-building layer converts the current frame plus signal validity into one immutable view model. It is the sole place where `waiting`, `valid`, `paused`, and `ready` presentation states are decided.

Signal validity uses `AcelynnV12.evaluateSignalValidity` from `js/runtime.js`. Hysteresis, if still necessary, lives in state transition logic rather than DOM interception.

Representative state fields:

- lifecycle: `ready | listening | playing | paused | error`
- signal: `unknown | waiting | valid`
- peak/rms/range
- five band values and normalized values
- focus
- score and score color
- health label
- balance label
- status text
- coaching title/body/items
- capture enabled/label
- rule-meter score/findings
- target profile label

### 3. Single live renderer

Create one renderer module that owns mutations for the canonical live elements, including:

- `healthScore`
- `healthLabel`
- `balanceText`
- `focusValue`
- `status`
- `coachTitle`
- `coachText`
- `advice`
- `captureButton`
- `peakValue`, `rmsValue`, `rangeValue`
- band fills/outputs
- `targetText`
- rule meter/finding output
- live/paused header state
- spectrum canvas drawing

The renderer performs idempotent updates, comparing the previous rendered value before changing DOM. It does not use a `MutationObserver` to police its own output.

### 4. Enhancement module boundary

`js/ui-enhancements.js` remains responsible only for non-canonical feature surfaces such as:

- creating the room-signature card
- room-signature capture/clear commands
- Mix-Diff A/B rendering after snapshot events

It must no longer:

- install a signal-validity MutationObserver
- render waiting/valid canonical live UI
- mutate score/coaching/capture/status fields in response to `acelynn:frame`
- duplicate rule-meter rendering owned by the canonical renderer

Room-signature availability is derived from the canonical state or controller bridge, not by observing DOM changes.

### 5. Retire hotfix arbitration layers

`js/live-stability.js` is removed from the startup path after its useful state logic has been moved into the canonical state layer.

`js/webview-performance.js` is removed from the startup path. Its global `requestAnimationFrame` replacement is replaced by explicit controller cadence.

The files may remain temporarily for rollback/history until the implementation is verified, but production startup must not import them after unification.

### 6. Event/API boundary

The controller exposes a small frozen bridge for non-rendering consumers:

- `getLastFrame()`
- `getRecentFrames()`
- `getSnapshots()`
- optionally `getLiveState()`

Events remain for decoupled feature actions, but canonical live rendering does not depend on multiple event listeners mutating the same fields.

Expected events:

- `acelynn:frame` for read-only consumers
- `acelynn:stopped`
- `acelynn:source-reset`
- `acelynn:snapshot-saved`

No event listener outside the renderer may mutate canonical live elements.

## Data flow

1. Audio source produces analyser data.
2. Controller reads FFT/time-domain data at the allowed processing cadence.
3. Existing analysis math computes bands, levels, profile result, room-aware score, focus, and signal validity.
4. State builder converts the result into one `LiveAnalysisState`.
5. Renderer applies that state once to DOM/canvas.
6. Controller stores the current raw frame for snapshot persistence and read-only feature consumers.
7. Snapshot/room/diff features operate on frame/state data, not by scraping or reacting to canonical DOM changes.

## Error handling

- Microphone permission denial becomes a controller error state rendered by the canonical renderer.
- Unsupported audio files become a controller error state.
- Invalid/quiet signal produces a stable `waiting` signal state. Score/coaching/capture remain deterministic until validity crosses the configured transition threshold.
- Persistence failures remain non-destructive: the local snapshot stays preserved and the renderer shows the existing storage warning.
- Renderer exceptions must not stop the audio source. Development/QA builds record the failed render phase and state revision for diagnosis.

## QA strategy

### Automated Acelynn repo QA

Before implementation, add failing tests for the current architecture, then make them pass through unification.

Required tests:

1. A state-transition test proving quiet/valid boundary frames do not alternate visible states frame-by-frame.
2. A renderer ownership test proving canonical element IDs are mutated only by the renderer module.
3. A static regression test proving no `MutationObserver` watches canonical live elements.
4. A regression test proving no module replaces `window.requestAnimationFrame` or `cancelAnimationFrame`.
5. A cadence test proving CactusByte Android WebView heavy processing is capped to 20 FPS without affecting normal browser mode.
6. Snapshot save/export/restore regression coverage.
7. Room-signature and Mix-Diff feature coverage.
8. Existing v1.2 foundation/storage/migration tests remain green.

### Browser QA

Run Acelynn locally with synthetic audio-frame sequences and verify:

- no layout thrash
- no score/waiting flicker
- stable button state
- stable coaching
- correct spectrum and band updates
- file and microphone lifecycle controls still work
- responsive widths including Fold-like narrow and wide viewports

### Fold-specific Android WebView QA

Do not use a Vercel preview.

Build a separate temporary debug QA flavor/package, distinct from both the permanent app and the existing Recovery QA parachute, for example:

`com.cactusbyte.acelynnpro.renderqa`

The QA APK bundles the exact staged Acelynn commit as local assets so the test is deterministic and cannot affect production or depend on a preview deployment.

It must:

- coexist with `com.cactusbyte.acelynnpro`
- coexist with `com.cactusbyte.acelynnpro.qa`
- use debug signing only
- contain no production cutover action
- preserve the permanent signer and recovery package untouched

Physical Fold acceptance requires at least 60 seconds of live-microphone analysis with no visible UI oscillation, then save one check, stop/restart live analysis, close/relaunch, and confirm the QA app remains stable.

## Release gate

Production release is blocked until all of the following are green:

- automated Acelynn QA
- browser QA
- isolated Render QA APK build
- physical Samsung Galaxy Z Fold live-analysis acceptance by the user

Only after those gates pass will a production PR/deployment be proposed. Vercel deployment remains disabled during implementation and QA.

## Rollback and safety

- Current production deployment remains the fallback throughout staging.
- Permanent Android app, signing identity, and restored backup remain untouched.
- Existing Recovery QA app remains installed until field acceptance is complete.
- No production data migration is involved.
- If the unified renderer fails QA, abandon/rework the staging branch rather than stacking another production hotfix.

## Success criteria

The repair is successful when Acelynn can run live microphone analysis on the user's Samsung Galaxy Z Fold for at least 60 seconds with:

- no visible score/waiting oscillation
- no coaching/status flicker
- no capture-button thrash
- no layout jumping caused by competing renderers
- responsive spectrum/band visualization
- correct save/restore behavior
- no regression in room-signature, Mix-Diff, file analysis, or v1.2 persistence

Production is not considered fixed until the user confirms this physical-device acceptance gate.