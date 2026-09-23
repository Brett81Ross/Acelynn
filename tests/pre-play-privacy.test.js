import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const files=['js/analysis-model.js','js/comparability.js','js/core-loop.js'];
describe('pre-Play privacy regression',()=>{
 it('adds no network telemetry to the new core loop',()=>{
  for(const file of files){const src=fs.readFileSync(file,'utf8');expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket\s*\(/);}
 });
 it('keeps usage counters local and backup-visible through meta storage',()=>{
  const src=fs.readFileSync('js/core-loop.js','utf8');expect(src).toMatch(/prePlayUsageCounters/);expect(src).toMatch(/STORES\.META/);
 });
});
