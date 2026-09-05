import { DB_NAME, DB_VERSION, STORES, requestToPromise } from './db.js';
import { hashBytesSha256, read, runWriteTransaction } from './storage.js';

export const FULL_BACKUP_SCHEMA = 'acelynn-pro-full-backup-v2';
export const FULL_BACKUP_VERSION = 2;
export const LEGACY_BACKUP_SCHEMA = 'acelynn-pro-backup-v1';
export const LEGACY_STORAGE_KEY = 'acelynn-snapshots';
export const MAX_FULL_BACKUP_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_RECORDS_PER_STORE = 10000;

const APP = 'Acelynn Pro';
const STORE_NAMES = Object.freeze(Object.values(STORES));
const textEncoder = new TextEncoder();

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (ArrayBuffer.isView(value)) return Array.from(value, canonicalize);
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) output[key] = canonicalize(value[key]);
  }
  return output;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function backupError(message, code) {
  const error = new Error(message);
  error.name = 'AcelynnFullBackupError';
  error.code = code;
  error.userMessage = message;
  return error;
}

function recordKey(storeName, record) {
  return storeName === STORES.META ? record?.key : record?.id;
}

function sortedRecords(storeName, records) {
  return [...records].sort((a, b) => String(recordKey(storeName, a)).localeCompare(String(recordKey(storeName, b))));
}

function normalizeLegacyRaw(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw backupError('Legacy snapshot storage is not valid JSON.', 'LEGACY_STORAGE_INVALID'); }
  if (!Array.isArray(parsed)) throw backupError('Legacy snapshot storage is not an array.', 'LEGACY_STORAGE_INVALID');
  return raw;
}

function countsFor(stores) {
  return Object.fromEntries(STORE_NAMES.map(name => [name, stores[name].length]));
}

function validateStoreRecords(storeName, records) {
  if (!Array.isArray(records)) throw backupError(`Backup store ${storeName} must be an array.`, 'STORE_INVALID');
  if (records.length > MAX_RECORDS_PER_STORE) throw backupError(`Backup store ${storeName} contains too many records.`, 'STORE_TOO_LARGE');
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw backupError(`Backup store ${storeName} contains an invalid record.`, 'RECORD_INVALID');
    const key = recordKey(storeName, record);
    if (typeof key !== 'string' || !key) throw backupError(`Backup store ${storeName} contains a record without a stable key.`, 'RECORD_KEY_INVALID');
    if (seen.has(key)) throw backupError(`Backup store ${storeName} contains duplicate key ${key}.`, 'DUPLICATE_RECORD');
    seen.add(key);
  }
}

function validateRelationships(stores) {
  const projectIds = new Set(stores[STORES.PROJECTS].map(record => record.id));
  const songs = new Map(stores[STORES.SONGS].map(record => [record.id, record]));
  const versionIds = new Set(stores[STORES.VERSIONS].map(record => record.id));
  const referenceIds = new Set(stores[STORES.REFERENCES].map(record => record.id));

  for (const song of songs.values()) {
    if (!projectIds.has(song.projectId)) throw backupError(`Song ${song.id} references a missing project.`, 'RELATIONSHIP_INVALID');
  }
  for (const version of stores[STORES.VERSIONS]) {
    if (!songs.has(version.songId)) throw backupError(`Version ${version.id} references a missing song.`, 'RELATIONSHIP_INVALID');
    if (version.parentVersionId && !versionIds.has(version.parentVersionId)) throw backupError(`Version ${version.id} references a missing parent version.`, 'RELATIONSHIP_INVALID');
    if (version.roomSignatureId && !referenceIds.has(version.roomSignatureId)) throw backupError(`Version ${version.id} references a missing room signature.`, 'RELATIONSHIP_INVALID');
  }
  for (const reference of stores[STORES.REFERENCES]) {
    if (reference.songId && !songs.has(reference.songId)) throw backupError(`Reference ${reference.id} references a missing song.`, 'RELATIONSHIP_INVALID');
  }

  const metaRecords = new Map(stores[STORES.META].map(record => [record.key, record.value]));
  const workspace = metaRecords.get('defaultWorkspace');
  if (workspace?.projectId || workspace?.songId) {
    const song = songs.get(workspace.songId);
    if (!projectIds.has(workspace.projectId) || !song || song.projectId !== workspace.projectId) {
      throw backupError('Default workspace metadata references missing structured records.', 'RELATIONSHIP_INVALID');
    }
  }
  const activeRoomSignatureId = metaRecords.get('activeRoomSignatureId');
  if (activeRoomSignatureId && !referenceIds.has(activeRoomSignatureId)) {
    throw backupError('Active room signature metadata references a missing reference.', 'RELATIONSHIP_INVALID');
  }
}

function validatePayloadShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw backupError('Backup must be a JSON object.', 'PAYLOAD_INVALID');
  if (payload.app !== APP) throw backupError('This backup belongs to a different app.', 'WRONG_APP');
  if (payload.schema !== FULL_BACKUP_SCHEMA || Number(payload.version) !== FULL_BACKUP_VERSION) throw backupError('Unsupported Acelynn full backup schema.', 'SCHEMA_UNSUPPORTED');
  if (payload.database?.name !== DB_NAME || Number(payload.database?.version) !== DB_VERSION) throw backupError('This full backup targets an unsupported Acelynn database version.', 'DATABASE_UNSUPPORTED');
  const stores = payload.database?.stores;
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) throw backupError('Full backup database stores are missing.', 'STORES_MISSING');
  for (const storeName of STORE_NAMES) validateStoreRecords(storeName, stores[storeName]);
  validateRelationships(stores);
  const raw = payload.legacy?.raw ?? null;
  normalizeLegacyRaw(raw);
  return stores;
}

async function checksumPayload(payloadWithoutChecksum) {
  return hashBytesSha256(textEncoder.encode(stableStringify(payloadWithoutChecksum)));
}

export function detectBackupKind(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'unknown';
  if (payload.app !== APP) return 'unknown';
  if (payload.schema === FULL_BACKUP_SCHEMA && Number(payload.version) === FULL_BACKUP_VERSION) return 'full-v2';
  if ((payload.schema === LEGACY_BACKUP_SCHEMA && Number(payload.version) === 1) || (!payload.database && Array.isArray(payload.snapshots))) return 'legacy-v1';
  return 'unknown';
}

export async function createFullStateBackup({ storage = globalThis.localStorage } = {}) {
  if (!storage || typeof storage.getItem !== 'function') throw backupError('Local storage is unavailable.', 'LOCAL_STORAGE_UNAVAILABLE');
  const entries = await Promise.all(STORE_NAMES.map(async storeName => [storeName, await read.all(storeName)]));
  const stores = Object.fromEntries(entries);
  for (const storeName of STORE_NAMES) validateStoreRecords(storeName, stores[storeName]);
  validateRelationships(stores);
  const legacyRaw = normalizeLegacyRaw(storage.getItem(LEGACY_STORAGE_KEY));
  const core = {
    app: APP,
    schema: FULL_BACKUP_SCHEMA,
    version: FULL_BACKUP_VERSION,
    created: new Date().toISOString(),
    database: {
      name: DB_NAME,
      version: DB_VERSION,
      counts: countsFor(stores),
      stores
    },
    legacy: {
      storageKey: LEGACY_STORAGE_KEY,
      raw: legacyRaw
    }
  };
  const value = await checksumPayload(core);
  return { ...core, checksum: { algorithm: 'SHA-256', scope: 'payload-without-checksum', value } };
}

export async function verifyFullStateBackup(payload) {
  validatePayloadShape(payload);
  if (payload.checksum?.algorithm !== 'SHA-256' || typeof payload.checksum?.value !== 'string') {
    throw backupError('Full backup checksum is missing.', 'CHECKSUM_MISSING');
  }
  const { checksum, ...core } = payload;
  const actual = await checksumPayload(core);
  if (actual !== checksum.value) throw backupError('Full backup checksum verification failed.', 'CHECKSUM_MISMATCH');
  const expectedCounts = payload.database?.counts || {};
  for (const storeName of STORE_NAMES) {
    if (Number(expectedCounts[storeName]) !== payload.database.stores[storeName].length) {
      throw backupError(`Full backup count mismatch for ${storeName}.`, 'COUNT_MISMATCH');
    }
  }
  return { ok: true, checksum: actual, counts: { ...expectedCounts } };
}

export async function parseFullStateBackupText(raw) {
  if (typeof raw !== 'string') throw backupError('Backup must be text.', 'BACKUP_NOT_TEXT');
  if (textEncoder.encode(raw).length > MAX_FULL_BACKUP_FILE_BYTES) throw backupError('Full backup file is larger than 25 MB.', 'BACKUP_TOO_LARGE');
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw backupError('Backup is not valid JSON.', 'BACKUP_JSON_INVALID'); }
  await verifyFullStateBackup(payload);
  return payload;
}

async function replaceStructuredState(storesPayload) {
  return runWriteTransaction(STORE_NAMES, async stores => {
    for (const storeName of STORE_NAMES) await requestToPromise(stores[storeName].clear());
    for (const storeName of STORE_NAMES) {
      for (const record of storesPayload[storeName]) await requestToPromise(stores[storeName].put(record));
    }
    for (const storeName of STORE_NAMES) {
      const actual = await requestToPromise(stores[storeName].getAll());
      const expectedText = stableStringify(sortedRecords(storeName, storesPayload[storeName]));
      const actualText = stableStringify(sortedRecords(storeName, actual));
      if (actualText !== expectedText) throw backupError(`Restore verification failed for ${storeName}.`, 'RESTORE_VERIFY_FAILED');
    }
  }, { operation: 'restoreFullStateBackupV2' });
}

function restoreLegacyRaw(storage, raw) {
  if (raw === null) storage.removeItem(LEGACY_STORAGE_KEY);
  else storage.setItem(LEGACY_STORAGE_KEY, raw);
}

export async function restoreFullStateBackup(payload, { storage = globalThis.localStorage } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw backupError('Local storage is unavailable.', 'LOCAL_STORAGE_UNAVAILABLE');
  }
  const verification = await verifyFullStateBackup(payload);
  const previousRaw = storage.getItem(LEGACY_STORAGE_KEY);
  const targetRaw = payload.legacy?.raw ?? null;

  try {
    restoreLegacyRaw(storage, targetRaw);
    await replaceStructuredState(payload.database.stores);
  } catch (error) {
    try { restoreLegacyRaw(storage, previousRaw); } catch (_) {}
    throw error;
  }

  if (storage.getItem(LEGACY_STORAGE_KEY) !== targetRaw) {
    try { restoreLegacyRaw(storage, previousRaw); } catch (_) {}
    throw backupError('Legacy snapshot restore verification failed.', 'LEGACY_RESTORE_VERIFY_FAILED');
  }

  return {
    restored: true,
    checksum: verification.checksum,
    counts: verification.counts,
    legacySnapshotsPresent: targetRaw !== null
  };
}

export const fullStateBackupApi = Object.freeze({
  FULL_BACKUP_SCHEMA,
  FULL_BACKUP_VERSION,
  LEGACY_BACKUP_SCHEMA,
  LEGACY_STORAGE_KEY,
  MAX_FULL_BACKUP_FILE_BYTES,
  createFullStateBackup,
  detectBackupKind,
  parseFullStateBackupText,
  restoreFullStateBackup,
  verifyFullStateBackup
});

globalThis.AcelynnFullStateBackup = fullStateBackupApi;
