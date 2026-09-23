import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');

describe('pre-Play product language contract',()=>{
 it('removes Mix Health from user-facing shell',()=>{ expect(html).not.toMatch(/Mix Health/i); expect(html).toMatch(/Balance Score/i); });
 it('keeps listening profiles emphasis-only',()=>{
  expect(html).toMatch(/emphasis:\[0,1\]/);
  expect(html).toMatch(/balanceTarget=\[42,56,62,55,43\]/);
  expect(html).not.toMatch(/Bass \/ hip-hop',target:/);
  expect(html).toMatch(/Focus: /);
 });
 it('escapes restored legacy snapshot text before innerHTML rendering',()=>{ expect(html).toMatch(/esc\(s\.profile\)/); expect(html).toMatch(/esc\(s\.time\)/); expect(html).toMatch(/esc\(s\.focus\)/); });
});
