import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const source = readFileSync('js/ui-enhancements.js', 'utf8');

test('Live Rule Meter header reserves stable two-line status height on phones', () => {
  expect(source).toMatch(/\.rule-meter-head\{[^}]*display:grid/);
  expect(source).toMatch(/\.rule-meter-head\{[^}]*grid-template-columns:max-content minmax\(0,1fr\)/);
  expect(source).toMatch(/\.rule-meter-head\{[^}]*min-height:2\.8em/);
  expect(source).toMatch(/\.rule-meter-head>span:first-child\{[^}]*white-space:nowrap/);
  expect(source).toMatch(/\.rule-meter-head>span:last-child\{[^}]*text-align:right[^}]*min-height:2\.7em/);
});
