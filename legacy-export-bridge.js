(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AcelynnLegacyExportBridge = api;
    api.install();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'acelynn-snapshots';
  const APP_NAME = 'Acelynn Pro';
  const BRIDGE_PATH = '/legacy-export.html';
  const MAX_SNAPSHOTS = 12;
  const MAX_BRIDGE_URL_LENGTH = 7600;

  function isAndroidWebView(userAgent) {
    const ua = String(userAgent || '');
    if (!/Android/i.test(ua)) return false;
    return /;\s*wv\)/i.test(ua) || (/Version\/4\.0/i.test(ua) && /Chrome\//i.test(ua));
  }

  function parseSnapshots(raw) {
    let snapshots;
    try {
      snapshots = JSON.parse(raw || '[]');
    } catch (error) {
      throw new Error('Saved checks could not be read. Do not uninstall Acelynn Pro.');
    }
    if (!Array.isArray(snapshots)) {
      throw new Error('Saved checks are not in the expected format. Do not uninstall Acelynn Pro.');
    }
    snapshots = snapshots.slice(-MAX_SNAPSHOTS);
    if (!snapshots.length) {
      throw new Error('There are no saved checks to export yet.');
    }
    return snapshots;
  }

  function buildLegacyPayload(rawSnapshots, createdIso) {
    return {
      app: APP_NAME,
      created: String(createdIso || new Date().toISOString()),
      snapshots: parseSnapshots(rawSnapshots)
    };
  }

  function buildBridgeUrl(origin, payload) {
    const cleanOrigin = String(origin || '').replace(/\/$/, '');
    if (!/^https:\/\//i.test(cleanOrigin)) {
      throw new Error('A secure Acelynn Pro connection is required to export this backup.');
    }
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const url = cleanOrigin + BRIDGE_PATH + '#v1=' + encoded;
    if (url.length > MAX_BRIDGE_URL_LENGTH) {
      throw new Error('This backup is too large for the migration link. Do not uninstall Acelynn Pro.');
    }
    return url;
  }

  function install(environment) {
    const env = environment || (typeof window !== 'undefined' ? window : null);
    if (!env || !env.document || !env.navigator) return false;
    if (!isAndroidWebView(env.navigator.userAgent)) return false;

    const document = env.document;
    const button = document.getElementById('exportButton');
    if (!button || button.dataset.cactusbyteLegacyExportBridge === '1') return false;

    const replacement = button.cloneNode(true);
    replacement.dataset.cactusbyteLegacyExportBridge = '1';
    button.replaceWith(replacement);

    replacement.addEventListener('click', function () {
      try {
        const payload = buildLegacyPayload(
          env.localStorage.getItem(STORAGE_KEY),
          new Date().toISOString()
        );
        const bridgeUrl = buildBridgeUrl(env.location.origin, payload);

        const launcher = document.createElement('a');
        launcher.href = bridgeUrl;
        launcher.download = 'acelynn-pro-backup-launch.html';
        launcher.rel = 'noopener noreferrer';
        launcher.style.display = 'none';
        document.body.appendChild(launcher);
        launcher.click();
        launcher.remove();
      } catch (error) {
        env.alert((error && error.message) || 'Backup export could not start. Do not uninstall Acelynn Pro.');
      }
    });

    return true;
  }

  return {
    APP_NAME,
    BRIDGE_PATH,
    MAX_BRIDGE_URL_LENGTH,
    MAX_SNAPSHOTS,
    STORAGE_KEY,
    isAndroidWebView,
    parseSnapshots,
    buildLegacyPayload,
    buildBridgeUrl,
    install
  };
});
