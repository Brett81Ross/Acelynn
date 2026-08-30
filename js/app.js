import { APP_META } from './meta.js';
import { openDatabase } from './db.js';
import { dryRunLegacyMigration, finalizeLegacyBackupAfterCleanLaunch, getLegacyBackupStatus, importLegacySnapshots } from './migration.js';
import { getStorageHealth, hashAudioContent, read, requestPersistentStorage } from './storage.js';

const LEGACY_CACHE_PREFIX = 'acelynn-pro-';

export async function cleanupLegacyServiceWorker() {
  const result = { registrationsRemoved: 0, cachesRemoved: 0 };
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        const scriptURL = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '';
        if (!scriptURL || new URL(scriptURL, location.href).origin === location.origin) {
          if (await registration.unregister()) result.registrationsRemoved += 1;
        }
      }
    }
  } catch (_) {}

  try {
    if ('caches' in globalThis) {
      const names = await caches.keys();
      for (const name of names) {
        if (name.startsWith(LEGACY_CACHE_PREFIX) && await caches.delete(name)) result.cachesRemoved += 1;
      }
    }
  } catch (_) {}
  return result;
}

export async function initializeDataFoundation() {
  await openDatabase();
  const cleanup = await cleanupLegacyServiceWorker();
  const backupStatus = await getLegacyBackupStatus();
  if (backupStatus.migration?.status === 'validated' && backupStatus.backup) {
    await finalizeLegacyBackupAfterCleanLaunch();
  }
  const legacyDryRun = dryRunLegacyMigration();
  const storageHealth = await getStorageHealth();
  return { app: APP_META, cleanup, legacyDryRun, storageHealth };
}

const foundation = {
  APP_META,
  initializeDataFoundation,
  cleanupLegacyServiceWorker,
  dryRunLegacyMigration,
  importLegacySnapshots,
  getLegacyBackupStatus,
  getStorageHealth,
  requestPersistentStorage,
  hashAudioContent,
  read
};

globalThis.AcelynnDataFoundation = foundation;

if (typeof window !== 'undefined') {
  initializeDataFoundation()
    .then(state => window.dispatchEvent(new CustomEvent('acelynn:data-foundation-ready', { detail: state })))
    .catch(error => {
      console.error('Acelynn v1.2.0 data foundation initialization failed:', error);
      window.dispatchEvent(new CustomEvent('acelynn:data-foundation-error', { detail: { message: error?.message || String(error) } }));
    });
}
