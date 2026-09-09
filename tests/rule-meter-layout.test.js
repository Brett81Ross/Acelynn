import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync('js/ui-enhancements.js', 'utf8');

test('Live Rule Meter header reserves stable two-line status height on phones', () => {
  assert.match(source, /\.rule-meter-head\{[^}]*display:grid/);
  assert.match(source, /\.rule-meter-head\{[^}]*grid-template-columns:max-content minmax\(0,1fr\)/);
  assert.match(source, /\.rule-meter-head\{[^}]*min-height:2\.8em/);
  assert.match(source, /\.rule-meter-head>span:first-child\{[^}]*white-space:nowrap/);
  assert.match(source, /\.rule-meter-head>span:last-child\{[^}]*text-align:right[^}]*min-height:2\.7em/);
});
