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
  } catch (_) {
    // Debug logging must never block the save path.
  }
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
    for (const version of versions) stores[STORES.VERSIONS].delete(version.id);
    for (const ref of refs) stores[STORES.REFERENCES].delete(ref.id);
    stores[STORES.SONGS].delete(songId);
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
      for (const version of versions) stores[STORES.VERSIONS].delete(version.id);
      for (const ref of refs) stores[STORES.REFERENCES].delete(ref.id);
      stores[STORES.SONGS].delete(song.id);
    }
    stores[STORES.PROJECTS].delete(projectId);
    return { songsDeleted: songs.length, versionsDeleted: versionCount, referencesDeleted: referenceCount };
  }, { operation: 'deleteProjectCascade', projectId });
}

export async function hashBytesSha256(bytes) {
  const source = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashAudioContent(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('A File or Blob with arrayBuffer() is required');
  return hashBytesSha256(await file.arrayBuffer());
}

export async function getStorageHealth() {
  let browserEstimate = null;
  let persisted = null;
  try {
    if (navigator.storage?.estimate) browserEstimate = await navigator.storage.estimate();
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
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
  const level = ratio == null ? 'unknown' : ratio >= 0.9 ? 'critical' : ratio >= 0.8 ? 'strong' : ratio >= 0.6 ? 'advisory' : 'normal';

  return {
    browserEstimate: browserEstimate ? { usage: browserEstimate.usage ?? null, quota: browserEstimate.quota ?? null } : null,
    structuredBytes,
    persisted,
    quotaRatio: ratio,
    warningLevel: level
  };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  try {
    return { supported: true, persisted: await navigator.storage.persist() };
  } catch (_) {
    return { supported: true, persisted: false };
  }
}

export function getLocalStorageFailures() {
  try { return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch (_) { return []; }
}
