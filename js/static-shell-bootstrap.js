export const STATIC_SHELL_BOOTSTRAP_VERSION = 2;
export const STATIC_SHELL_MODULES = Object.freeze([
  '/js/full-state-backup-ui.js',
  '/demo-help.js'
]);

const BOOTSTRAP_KEY = '__acelynnStaticShellBootstrapV2';

export function installStaticShellModules(importModule = specifier => import(specifier)) {
  if (globalThis[BOOTSTRAP_KEY]) return globalThis[BOOTSTRAP_KEY];
  const task = Promise.all(STATIC_SHELL_MODULES.map(specifier => importModule(specifier)))
    .then(() => Object.freeze({ installed: true, modules: STATIC_SHELL_MODULES.slice() }))
    .catch(error => {
      delete globalThis[BOOTSTRAP_KEY];
      throw error;
    });
  globalThis[BOOTSTRAP_KEY] = task;
  return task;
}

if (typeof document !== 'undefined') {
  installStaticShellModules().catch(error => {
    console.error('Acelynn static shell bootstrap failed:', error);
  });
}
