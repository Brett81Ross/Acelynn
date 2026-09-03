export const DB_NAME = 'AcelynnProStudioDB';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  META: 'meta',
  PROJECTS: 'projects',
  SONGS: 'songs',
  VERSIONS: 'versions',
  REFERENCES: 'references'
});

let dbPromise;

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new DOMException('IndexedDB transaction aborted', 'AbortError'));
    tx.onerror = () => {};
  });
}

function ensureStore(db, name, options, indexes = []) {
  const store = db.objectStoreNames.contains(name) ? null : db.createObjectStore(name, options);
  if (!store) return;
  for (const index of indexes) store.createIndex(index.name, index.keyPath, index.options || {});
}

function createOpenPromise(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ensureStore(db, STORES.META, { keyPath: 'key' });
      ensureStore(db, STORES.PROJECTS, { keyPath: 'id' }, [
        { name: 'byName', keyPath: 'name' },
        { name: 'byCreatedAt', keyPath: 'createdAt' },
        { name: 'byUpdatedAt', keyPath: 'updatedAt' }
      ]);
      ensureStore(db, STORES.SONGS, { keyPath: 'id' }, [
        { name: 'byProject', keyPath: 'projectId' },
        { name: 'byProjectCreated', keyPath: ['projectId', 'createdAt'] },
        { name: 'byName', keyPath: 'name' }
      ]);
      ensureStore(db, STORES.VERSIONS, { keyPath: 'id' }, [
        { name: 'bySong', keyPath: 'songId' },
        { name: 'bySongCreated', keyPath: ['songId', 'createdAt'] },
        { name: 'byParent', keyPath: 'parentVersionId' },
        { name: 'byCreatedAt', keyPath: 'createdAt' },
        { name: 'bySourceType', keyPath: 'sourceType' },
        { name: 'byPerspective', keyPath: 'perspective' },
        { name: 'byFileHash', keyPath: 'fileHash' }
      ]);
      ensureStore(db, STORES.REFERENCES, { keyPath: 'id' }, [
        { name: 'byScope', keyPath: 'scope' },
        { name: 'bySong', keyPath: 'songId' },
        { name: 'byCreatedAt', keyPath: 'createdAt' },
        { name: 'byName', keyPath: 'name' }
      ]);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Unable to open IndexedDB'));
    request.onblocked = () => reject(new DOMException('IndexedDB upgrade blocked by another tab', 'BlockedError'));
  });
}

export function openDatabase(factory = globalThis.indexedDB) {
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable in this browser'));
  if (factory !== globalThis.indexedDB) return createOpenPromise(factory);
  if (!dbPromise) {
    dbPromise = createOpenPromise(factory).catch(error => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

export async function withTransaction(storeNames, mode, work, factory = globalThis.indexedDB) {
  const db = await openDatabase(factory);
  const tx = db.transaction(storeNames, mode);
  const done = transactionDone(tx);
  const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]));
  let result;
  try {
    result = await work(stores, tx);
  } catch (error) {
    try { tx.abort(); } catch (_) {}
    try { await done; } catch (_) {}
    throw error;
  }
  await done;
  return result;
}

export async function getRecord(storeName, key, factory = globalThis.indexedDB) {
  return withTransaction([storeName], 'readonly', stores => requestToPromise(stores[storeName].get(key)), factory);
}

export async function getAllRecords(storeName, factory = globalThis.indexedDB) {
  return withTransaction([storeName], 'readonly', stores => requestToPromise(stores[storeName].getAll()), factory);
}

export async function getAllByIndex(storeName, indexName, query, factory = globalThis.indexedDB) {
  return withTransaction([storeName], 'readonly', stores => requestToPromise(stores[storeName].index(indexName).getAll(query)), factory);
}

export function resetDatabaseConnectionForTests() {
  dbPromise = undefined;
}
