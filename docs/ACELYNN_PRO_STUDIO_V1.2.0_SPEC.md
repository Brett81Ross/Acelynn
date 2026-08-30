# Acelynn Pro Studio™ v1.2.0 Technical Build Specification

Status: Canonical engineering spec for red-team review
Repository: Brett81Ross/Acelynn
Deployment: MUST remain locked until full QA passes and the CEO explicitly approves production deployment.

## 1. Locked product direction

Permanent product name: **Acelynn Pro Studio™**

Long-term proprietary framework:
- Acelynn Translation Matrix™
- Mix Evolution Matrix™
- Confidence-Aware Mix Health™
- Private Reference Intelligence™
- Explainable Coaching Matrix™
- Translation Memory™

v1.2.0 builds the shared local data and analysis foundation. It does not ship on-device ML, cloud sync, stem separation, or room calibration.

Core principles:
- Audio analysis remains on-device.
- Confidence is mathematical and affects claim strength.
- No raw reference audio is persisted by default.
- Historical data must never be fabricated to look richer or more reliable than it really is.
- New features should write structured observations into the same project/song/version model when appropriate.

## 2. Current-repo facts that constrain implementation

The current app is a static browser/PWA-style application, not a TypeScript application framework. The primary production shell is served through `api/demo-shell.js`, which fetches `app-base.html`. Root and `/index.html` are rewritten to that shell by `vercel.json`.

The repository currently contains both `index.html` and `app-base.html` with the same application body. v1.2.0 must avoid letting these two copies drift. `app-base.html` is the production source of truth unless the implementation deliberately consolidates the two surfaces.

Current analysis/profile identifiers:
- Listening profiles: `balanced`, `bass`, `acoustic`, `vocal`
- Analysis perspectives/modes: `mix`, `room`, `detail`

Current five bands:
- Sub: 20–60 Hz
- Bass: 60–250 Hz
- Mids: 250–2000 Hz
- Presence: 2000–6000 Hz
- Air: 6000–18000 Hz

Current saved snapshots are limited to 12 and stored in `localStorage` under `acelynn-snapshots`. A legacy snapshot stores only:
- localized time string
- profile display name
- score
- focus band display name
- five analyzer-byte-average band values

Legacy snapshots do **not** store source type, analysis perspective, RMS, peak, confidence, spectral features, file identity, reference information, or coaching findings.

The app currently registers `./sw.js`, and `sw.js` actively caches the application. Removing only the file is insufficient; v1.2.0 requires a one-time unregister + old-cache cleanup path so existing installed copies are not left under stale service-worker control.

`vercel.json` currently has `git.deploymentEnabled=false`. This must remain false during staging.

## 3. IndexedDB design

Database: `AcelynnProStudioDB`
Schema version: `1`

### Store: `projects`
Key path: `id`

Fields:
- `id`
- `name`
- `createdAt`
- `updatedAt`
- `artist?`
- `genre?`
- `bpm?`
- `notes?`

Indexes:
- `name`
- `createdAt`
- `updatedAt`

### Store: `songs`
Key path: `id`

Fields:
- `id`
- `projectId`
- `name`
- `createdAt`
- `updatedAt`
- `duration?`
- `sampleRate?`
- `fileHash?`

Indexes:
- `projectId`
- `name`
- `createdAt`
- `updatedAt`

### Store: `versions`
Key path: `id`

Required fields:
- `id`
- `songId`
- `parentVersionId: string|null`
- `versionLabel`
- `createdAt`
- `legacy: boolean`

Source block:
- `sourceType: 'file'|'live-mic'|'unknown-legacy'`
- `sourceMetadata.fileName?`
- `sourceMetadata.fileSize?`
- `sourceMetadata.sampleRate?`
- `sourceMetadata.micDeviceLabel?`

Selection block:
- `profileId: 'balanced'|'bass'|'acoustic'|'vocal'|'unknown-legacy'`
- `perspectiveId: 'mix'|'room'|'detail'|'unknown-legacy'`

Core bands:
- each band stores `energy`, `db`, and `percent` when those values are genuinely available
- legacy imports store only their original legacy analyzer value in `legacyEnergy`, and leave unavailable derived values null rather than inventing them

Level metrics:
- `peakDbfs: number|null`
- `rmsDbfs: number|null`
- `peakToAverageDb: number|null`
- `dominantBand`

Future-ML feature block for newly analyzed v1.2.0 versions:
- per-band crest factor
- spectral centroid Hz
- spectral flatness 0–1
- 85% spectral rolloff Hz
- 16 normalized coarse spectral bins
- feature schema version

Scores:
- `mixHealth.raw`
- `mixHealth.perspectiveWeighted`
- `mixHealth.targetProfileMatch`

Confidence:
- `overall: number|null`
- factor scores for signal duration, level stability, clipping, noise floor, and source reliability
- `analysisDurationMs`
- `sampleCount`
- `droppedFrames`
- `confidenceVersion`
- `notScorableReason?`

Coaching snapshot:
- exact deterministic findings generated at capture time for new versions
- each finding includes stable ID, category, severity, detection summary, listen area, suggested inspection action, confidence, and band delta if applicable

References:
- array of reference comparisons with per-band deltas and overall match

Future reservation only:
- `roomSignatureId: string|null`
- `roomConfidence: number|null`

Indexes:
- `songId`
- `parentVersionId`
- `createdAt`
- `sourceType`
- `profileId`
- `perspectiveId`
- `mixHealth.raw`
- `mixHealth.perspectiveWeighted`
- `confidence.overall`

### Store: `references`
Key path: `id`

No raw audio blob is persisted by default.

Fields:
- `id`
- `songId: string|null` (`null` = global reference)
- `name`
- `createdAt`
- derived five-band metrics
- level metrics
- same future-ML spectral feature vector used by versions
- file hash
- duration
- sample rate

Indexes:
- `songId`
- `name`
- `createdAt`
- `fileHash`

### Store: `settings`
Key path: `key`

Used for:
- migration completion/version
- service-worker cleanup completion
- storage-warning acknowledgement state
- future local preference/Translation Memory settings

### Store: `roomSignatures`
Reserved schema only. No calibration workflow writes to it in v1.2.0.

## 4. Legacy snapshot migration rules

Migration must preserve truth.

On startup, if `acelynn-snapshots` exists and has not already been migrated:
1. Parse safely without modifying the original value.
2. Show a preview that reports how many snapshots are valid and how many are malformed.
3. User may import or skip.
4. Import uses one IndexedDB transaction for project/song/version creation.
5. Create project `Imported Snapshots` and song `Legacy Session` only if at least one valid snapshot is imported.
6. Each imported record is marked `legacy:true`.
7. `sourceType` is `unknown-legacy` because the current snapshot format does not preserve mic-vs-file origin.
8. `perspectiveId` is `unknown-legacy` because the current snapshot format does not preserve analysis mode.
9. Profile is mapped only when the saved profile display name maps unambiguously to the current four profiles; otherwise use `unknown-legacy`.
10. Legacy analyzer band values are preserved as legacy values and are not relabeled as dB measurements.
11. `peakDbfs`, `rmsDbfs`, spectral features, reference deltas, and confidence remain null/unavailable.
12. Do not assign an arbitrary confidence such as 70%.
13. Do not regenerate coaching and pretend it was the coaching shown at capture time. If regenerated guidance is offered later, label it explicitly as regenerated from limited legacy data.
14. The original localStorage value remains untouched after import unless the user explicitly chooses to remove it after verification.
15. Migration is idempotent and must not duplicate versions on reload/retry.

## 5. Service-worker retirement

v1.2.0 will not register a service worker.

A one-time cleanup routine must:
- inspect `navigator.serviceWorker.getRegistrations()` where available
- unregister Acelynn-controlled registrations
- delete caches whose names begin with the existing Acelynn cache prefix
- store a cleanup-complete marker locally
- fail gracefully on browsers without the APIs

The existing `sw.js` can be deleted only after the cleanup path is staged in the app code. The cleanup path must remain for at least the v1.2.x line so older installed clients can self-heal after loading the new app.

## 6. Spectral feature extraction

For new v1.2.0 analyses, derive and persist compact features without storing raw audio:
- 16 normalized coarse spectrum bins
- spectral centroid
- spectral flatness
- 85% rolloff
- per-band crest factor

All feature vectors include a `featureSchemaVersion` so future models know how observations were generated.

The feature extractor must use the same analysis frame source for both file and mic modes where technically possible and must not block rendering. No WebGPU/WebNN dependency is required in v1.2.0; this is signal processing only.

## 7. Confidence-Aware Mix Health™ foundation

Confidence is computed only from observed factors, not guessed metadata.

Minimum factors:
- usable analysis duration
- RMS/level stability across windows
- clipping incidence
- estimated noise-floor / low-signal contamination
- source reliability (`file` higher than `live-mic`)
- analysis completeness/dropped-frame integrity

Confidence must influence coaching language:
- High confidence: direct engineering language
- Medium confidence: qualified recommendation language
- Low confidence: inspection-oriented language and warning that the reading may be unstable
- Unscorable: no numeric confidence claim and no strong recommendation

The exact weighting constants must be centralized and versioned rather than embedded across UI code.

## 8. Perspective-weighted Mix Health

The current `mix`, `room`, and `detail` modes already alter scoring in a limited way. v1.2.0 makes perspective weighting explicit and centralized.

Each perspective has a documented weight vector across the five bands plus any perspective-specific penalties. The UI must distinguish:
- raw profile match
- perspective-weighted Mix Health
- confidence

Confidence must not secretly change the underlying raw score. Instead, confidence controls certainty/claim strength and may be used later by Translation Matrix aggregation.

## 9. Mix Evolution Matrix™ foundation

Users can compare any two non-legacy or legacy-compatible versions of the same song.

Comparison output:
- five-band delta where comparable
- raw Mix Health change
- perspective-weighted score change
- confidence change
- resolved findings
- persistent findings
- new findings
- potential correction side effects

When either version lacks a metric, the comparison must show `Unavailable` rather than manufacture a value.

## 10. Private Reference Intelligence™ foundation

Reference import flow:
1. User selects a local audio file.
2. Analyze entirely on-device.
3. Derive fingerprint + spectral features.
4. Persist only derived data and descriptive metadata by default.
5. Revoke temporary object URL and do not store the audio blob.

Comparison supports one or multiple references and produces:
- per-band deltas
- overall relative-match score
- confidence-aware interpretation

## 11. Storage Health Module

Use `navigator.storage.estimate()` when available.

Display values as approximate because browser quotas and eviction behavior vary.

Thresholds:
- >=60%: advisory warning
- >=80%: high warning
- >=90%: critical persistent warning

Fallback behavior must not invent a fake device quota. If the browser cannot provide a quota, show local database record counts and an `Exact quota unavailable in this browser` state rather than estimating `5KB/version + 50KB/reference` as if it were authoritative.

The app stores observations, not source audio, so normal project history should remain compact.

## 12. Export

JSON export:
- single version
- whole song
- whole project
- includes schema/version metadata

CSV export:
- song timeline summary
- key five-band, score, confidence, profile, perspective, and source fields

Legacy fields must be clearly marked.

## 13. UI surfaces for v1.2.0

Required:
- Projects view
- Songs within project
- Versions within song
- Save Analysis flow
- Version comparison view
- Session timeline
- Reference manager
- Storage Health section in Settings
- Legacy migration preview/status
- confidence badge/indicator beside Mix Health

Do not add room-calibration UI in v1.2.0.

## 14. Release-blocking QA matrix

Blocking:
- Android 12+ — Chrome latest
- Android 12+ — Samsung Internet latest
- iOS 16+ — Safari latest
- Windows/macOS — Chrome latest
- Windows/macOS — Edge latest

Smoke/non-blocking except for data loss/corruption/privacy failure:
- Firefox desktop latest
- Firefox Android latest

Core QA gates:
- no service-worker registration remains
- stale Acelynn service-worker registrations/caches are cleaned up
- IndexedDB open/upgrade succeeds
- migration is idempotent
- malformed legacy data cannot corrupt the DB
- project/song/version cascade behavior is deterministic
- no raw audio is persisted by default
- reference file object URLs are revoked
- live-mic permissions fail gracefully
- file analysis still works with supported browser codecs
- comparisons never fabricate missing metrics
- export data matches stored observations
- storage warning behavior degrades safely where quota APIs are absent
- current live-screen demo/help remains available
- phone layouts remain usable on narrow Android cover screens and ordinary phone widths

## 15. Implementation sequencing / Atomic Build List

### Sprint 1 — Persistence foundation
- browser IndexedDB module
- schema creation and indexes
- CRUD for projects, songs, versions, references, settings
- cascade helpers
- migration parser + dry-run + transactional import
- migration idempotency tests
- service-worker unregister/cache cleanup path
- no production deployment

### Sprint 2 — Analysis foundation
- versioned spectral feature extractor
- confidence engine
- centralized perspective scoring
- structured coaching finding model
- save full observation records

### Sprint 3 — Project workflow UI
- Projects → Songs → Versions navigation
- create/rename/delete flows
- save-analysis-to-song/version flow
- lineage/parent selection

### Sprint 4 — Mix Evolution + timeline
- two-version comparison
- resolved/persistent/new finding analysis
- correction-side-effect rules
- score/confidence trajectory

### Sprint 5 — References + export
- local reference fingerprinting
- multi-reference comparison
- JSON export
- CSV timeline export

### Sprint 6 — Storage health + release QA
- settings storage surface
- 60/80/90 warnings
- migration/service-worker regression QA
- blocking browser matrix
- final UI polish
- version/manifest/footer consistency

## 16. Explicitly deferred beyond v1.2.0

- Room + Playback Signature calibration UI
- Acelynn Translation Matrix™ full aggregation
- Translation Memory™ preference learning
- on-device ONNX/ML inference
- LUFS/true-peak/stereo-correlation professional metering layer
- cloud sync
- stem separation

## 17. Build authorization rule

This file is the source of truth for v1.2.0 after red-team reconciliation. Scope additions go to a later ABL unless the CEO explicitly reopens v1.2.0 scope.

No Vercel production deployment is authorized by this specification alone.