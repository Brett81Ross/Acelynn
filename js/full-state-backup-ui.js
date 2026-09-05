import {
  MAX_FULL_BACKUP_FILE_BYTES,
  createFullStateBackup,
  detectBackupKind,
  parseFullStateBackupText,
  restoreFullStateBackup
} from './full-state-backup.js';

const byId = id => document.getElementById(id);

function downloadJson(payload, name) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 750);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function setStatus(message) {
  const status = byId('status');
  if (status) status.textContent = message;
}

function setRecoveryMessage(title, text) {
  const heading = byId('coachTitle');
  const copy = byId('coachText');
  if (heading) heading.textContent = title;
  if (copy) copy.textContent = text;
}

async function exportFullBackup() {
  const button = byId('exportButton');
  const previousText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing full backup…';
  }
  try {
    const backup = await createFullStateBackup();
    downloadJson(backup, `acelynn-pro-full-backup-v2-${stamp()}.json`);
    setStatus('Full backup exported');
    setRecoveryMessage('Full backup created', 'Snapshots, structured analyses, room signatures, projects, songs, versions, references, and required metadata were included.');
  } catch (error) {
    setStatus('Backup failed');
    setRecoveryMessage('Full backup could not be created', error?.userMessage || error?.message || 'Acelynn could not export the complete local state.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText || 'Export session report';
    }
  }
}

async function restoreSelectedFile(file, input) {
  try {
    if (!file) return;
    if (file.size > MAX_FULL_BACKUP_FILE_BYTES) throw new Error('Backup file is larger than 25 MB.');
    const raw = await file.text();
    let envelope;
    try { envelope = JSON.parse(raw); }
    catch { throw new Error('Backup is not valid JSON.'); }
    const kind = detectBackupKind(envelope);
    if (kind === 'unknown') throw new Error('This is not a supported Acelynn Pro backup.');

    if (kind === 'legacy-v1') {
      const preRestore = await createFullStateBackup();
      downloadJson(preRestore, `acelynn-pro-pre-restore-full-v2-${stamp()}.json`);
      const recovery = globalThis.AcelynnRecovery;
      if (!recovery) throw new Error('Legacy recovery engine is unavailable.');
      const incoming = recovery.parseBackupText(raw);
      const restored = recovery.restore(localStorage, incoming);
      setStatus(`Legacy backup restored · ${restored.length} snapshots`);
      setRecoveryMessage('Legacy backup restored', 'Your older snapshot backup was merged safely. A full v2 pre-restore backup was downloaded first.');
      setTimeout(() => globalThis.location?.reload?.(), 200);
      return;
    }

    const approved = typeof globalThis.confirm !== 'function' || globalThis.confirm(
      'Restore this full Acelynn backup?\n\nAcelynn will first download a full backup of the data currently on this device. The selected backup will then replace the structured Acelynn database and legacy snapshot state so the restore can be exact.'
    );
    if (!approved) {
      setStatus('Restore canceled');
      return;
    }

    const payload = await parseFullStateBackupText(raw);
    const preRestore = await createFullStateBackup();
    downloadJson(preRestore, `acelynn-pro-pre-restore-full-v2-${stamp()}.json`);
    const result = await restoreFullStateBackup(payload);
    const versionCount = Number(result.counts?.versions || 0);
    const referenceCount = Number(result.counts?.references || 0);
    setStatus(`Full restore verified · ${versionCount} analyses · ${referenceCount} references`);
    setRecoveryMessage('Full backup restored and verified', 'Acelynn restored the complete local database plus the legacy snapshot state. Reloading now to reopen the restored workspace.');
    setTimeout(() => globalThis.location?.reload?.(), 250);
  } catch (error) {
    setStatus('Restore failed · current data preserved');
    setRecoveryMessage('Backup could not be restored', error?.userMessage || error?.message || 'The selected backup was rejected. Current data was preserved.');
  } finally {
    if (input) input.value = '';
  }
}

function installFullStateBackupUi() {
  const exportButton = byId('exportButton');
  const restoreInput = byId('restoreInput');
  if (!exportButton || !restoreInput) return;

  exportButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    exportFullBackup();
  }, true);

  restoreInput.addEventListener('change', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const file = event.target?.files?.[0] || null;
    restoreSelectedFile(file, restoreInput);
  }, true);

  const restoreButton = byId('restoreButton');
  if (restoreButton) restoreButton.textContent = 'Restore full backup';
  exportButton.disabled = false;
  exportButton.textContent = 'Export full backup';
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFullStateBackupUi, { once: true });
  else queueMicrotask(installFullStateBackupUi);
}
