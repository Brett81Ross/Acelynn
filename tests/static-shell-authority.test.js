import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const index = readFileSync('index.html', 'utf8');
const legacyBridge = readFileSync('legacy-export-bridge.js', 'utf8');
const bootstrap = readFileSync('js/static-shell-bootstrap.js', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

function count(text, needle) {
  return text.split(needle).length - 1;
}

describe('Acelynn static shell authority', () => {
  it('serves index.html directly while keeping Git deployment disabled', () => {
    expect(vercel.git?.deploymentEnabled).toBe(false);
    expect(vercel.rewrites ?? []).toEqual([]);
    expect(index).toContain('Acelynn Pro™');
    expect(index).toContain('v1.2.0 · Cactus🌵Byte Studios™');
    expect(index).toContain('signalDb<-72');
    expect(index).toContain('AcelynnV12.persistAnalysis');
  });

  it('keeps one controlled static entrypoint for runtime and enhancement modules', () => {
    expect(count(index, '<script type="module" src="/js/runtime.js"></script>')).toBe(1);
    expect(count(index, '<script type="module" src="/js/ui-enhancements.js"></script>')).toBe(1);
    expect(count(index, '<script src="/legacy-export-bridge.js?v=cutover1"></script>')).toBe(1);
    expect(legacyBridge).toContain("import('/js/static-shell-bootstrap.js')");
    expect(bootstrap).toContain("'/js/full-state-backup-ui.js'");
    expect(bootstrap).toContain("'/demo-help.js'");
  });

  it('retires the server-side HTML rewrite path and duplicate base shell', () => {
    expect(existsSync('api/demo-shell.js')).toBe(false);
    expect(existsSync('api/shell-transform.cjs')).toBe(false);
    expect(existsSync('app-base.html')).toBe(false);
    expect(existsSync('tests/shell-transform.test.js')).toBe(false);
  });
});
