import {
  STORES,
  getAllByIndex,
  getAllRecords,
  getRecord,
  requestToPromise,
  withTransaction
} from './db.js';

export const WRITE_RETRY_DELAYS_MS = Object.freeze([100, 500, 2000]);
export const SAVE_FAILURE_MESSAGE = 'Unable to save due to storage constraints. Please close other tabs and try again.';
export const QUOTA_WARNING_THRESHOLDS = Object.freeze({ advisory: 0.60, strong: 0.80, critical: 0.90 });
const ERROR_LOG_KEY = 'acelynn-local-storage-errors';
const MAX_LOCAL_ERRORS = 50;

export class StorageWriteError extends Error {
  constructor(cause) {
    super(SAVE_FAILURE_MESSAGE);
    this.name = 'StorageWriteError';
    this.userMessage = SAVE_FAILURE_MESSAGE;
    this.cause = cause;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function canRetry(error) {
  const name = error?.name || '';
  return !['DataError', 'ConstraintError', 'ReadOnlyError', 'SyntaxError', 'TypeError'].includes(name);
}

function logLocalFailure(error, context = {}) {
  try {
    if (!globalThis.localStorage) return;
    let existing = [];
    try { existing = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch (_) {}
    existing.push({
      at: Date.now(),
      name: error?.name || 'Error',
      message: String(error?.message || error),
      context
    });
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existing.slice(-MAX_LOCAL_ERRORS)));
  } catch (_) {}
}

export async function resilientWrite(operation, context = {}) {
  let lastError;
  for (let attempt = 0; attempt <= WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(WRITE_RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!canRetry(error) || attempt === WRITE_RETRY_DELAYS_MS.length) break;
    }
  }
  logLocalFailure(lastError, context);
  throw new StorageWriteError(lastError);
}

export const read = Object.freeze({
  one: (store, key) => getRecord(store, key),
  all: store => getAllRecords(store),
  byIndex: (store, index, query) => getAllByIndex(store, index, query)
});

export function runWriteTransaction(storeNames, work, context = {}) {
  return resilientWrite(
    () => withTransaction(storeNames, 'readwrite', work),
    { operation: 'transaction', stores: storeNames, ...context }
  );
}

export function put(store, value) {
  return runWriteTransaction([store], stores => requestToPromise(stores[store].put(value)), {
    operation: 'put', store, key: value?.id ?? value?.key ?? null
  });
}

export function remove(store, key) {
  return runWriteTransaction([store], stores => requestToPromise(stores[store].delete(key)), {
    operation: 'delete', store, key
  });
}

export function clear(store) {
  return runWriteTransaction([store], stores => requestToPromise(stores[store].clear()), {
    operation: 'clear', store
  });
}

export const meta = Object.freeze({
  get: key => read.one(STORES.META, key),
  set: (key, value) => put(STORES.META, { key, value, updatedAt: Date.now() }),
  remove: key => remove(STORES.META, key)
});

export async function deleteSongCascade(songId) {
  return runWriteTransaction([STORES.SONGS, STORES.VERSIONS, STORES.REFERENCES], async stores => {
    const versions = await requestToPromise(stores[STORES.VERSIONS].index('bySong').getAll(songId));
    const refs = await requestToPromise(stores[STORES.REFERENCES].index('bySong').getAll(songId));
    for (const version of versions) await requestToPromise(stores[STORES.VERSIONS].delete(version.id));
    for (const ref of refs) await requestToPromise(stores[STORES.REFERENCES].delete(ref.id));
    await requestToPromise(stores[STORES.SONGS].delete(songId));
    return { versionsDeleted: versions.length, referencesDeleted: refs.length };
  }, { operation: 'deleteSongCascade', songId });
}

export async function deleteProjectCascade(projectId) {
  return runWriteTransaction([STORES.PROJECTS, STORES.SONGS, STORES.VERSIONS, STORES.REFERENCES], async stores => {
    const songs = await requestToPromise(stores[STORES.SONGS].index('byProject').getAll(projectId));
    let versionCount = 0;
    let referenceCount = 0;
    for (const song of songs) {
      const versions = await requestToPromise(stores[STORES.VERSIONS].index('bySong').getAll(song.id));
      const refs = await requestToPromise(stores[STORES.REFERENCES].index('bySong').getAll(song.id));
      versionCount += versions.length;
      referenceCount += refs.length;
      for (const version of versions) await requestToPromise(stores[STORES.VERSIONS].delete(version.id));
      for (const ref of refs) await requestToPromise(stores[STORES.REFERENCES].delete(ref.id));
      await requestToPromise(stores[STORES.SONGS].delete(song.id));
    }
    await requestToPromise(stores[STORES.PROJECTS].delete(projectId));
    return { songsDeleted: songs.length, versionsDeleted: versionCount, referencesDeleted: referenceCount };
  }, { operation: 'deleteProjectCascade', projectId });
}

function asArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (ArrayBuffer.isView(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  throw new TypeError('Expected ArrayBuffer or typed array');
}

export async function hashBytesSha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', asArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashAudioContent(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('A File or Blob with arrayBuffer() is required');
  return hashBytesSha256(await file.arrayBuffer());
}

export async function findVersionsByFileHash(fileHash) {
  if (!fileHash) return [];
  return read.byIndex(STORES.VERSIONS, 'byFileHash', fileHash);
}

export function classifyQuotaRatio(ratio) {
  if (!Number.isFinite(ratio)) return 'unknown';
  if (ratio >= QUOTA_WARNING_THRESHOLDS.critical) return 'critical';
  if (ratio >= QUOTA_WARNING_THRESHOLDS.strong) return 'strong';
  if (ratio >= QUOTA_WARNING_THRESHOLDS.advisory) return 'advisory';
  return 'normal';
}

export async function getStorageHealth() {
  let browserEstimate = null;
  let persisted = null;
  try {
    if (globalThis.navigator?.storage?.estimate) browserEstimate = await navigator.storage.estimate();
    if (globalThis.navigator?.storage?.persisted) persisted = await navigator.storage.persisted();
  } catch (_) {}

  let structuredBytes = 0;
  for (const store of Object.values(STORES)) {
    const records = await read.all(store);
    for (const record of records) {
      try { structuredBytes += new Blob([JSON.stringify(record)]).size; } catch (_) {}
    }
  }

  const usage = Number(browserEstimate?.usage);
  const quota = Number(browserEstimate?.quota);
  const ratio = Number.isFinite(usage) && Number.isFinite(quota) && quota > 0 ? usage / quota : null;

  return {
    browserEstimate: browserEstimate ? { usage: browserEstimate.usage ?? null, quota: browserEstimate.quota ?? null } : null,
    structuredBytes,
    persisted,
    quotaRatio: ratio,
    warningLevel: classifyQuotaRatio(ratio)
  };
}

export async function requestPersistentStorage() {
  if (!globalThis.navigator?.storage?.persist) return { supported: false, persisted: false };
  try {
    return { supported: true, persisted: await navigator.storage.persist() };
  } catch (_) {
    return { supported: true, persisted: false };
  }
}

export function getLocalStorageFailures() {
  try { return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch (_) { return []; }
}
