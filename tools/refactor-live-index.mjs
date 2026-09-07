import { readFileSync, writeFileSync } from 'node:fs';

const path = 'index.html';
const html = readFileSync(path, 'utf8');
const startMarker = "<script>\n(()=>{const $=id=>document.getElementById(id),canvas=$('spectrum')";
const endMarker = 'retireLegacyServiceWorker()})();\n</script>';
const replacement = '<script type="module" src="/js/live-app.js"></script>';

if (html.includes(replacement)) {
  if (html.includes('function loop(){if(!running)return;')) {
    throw new Error('Unified live-app script exists but legacy inline loop is still present.');
  }
  console.log('index.html is already refactored.');
  process.exit(0);
}

const start = html.indexOf(startMarker);
if (start < 0) throw new Error('Legacy Acelynn live-loop start marker was not found.');
const endStart = html.indexOf(endMarker, start);
if (endStart < 0) throw new Error('Legacy Acelynn live-loop end marker was not found.');
const end = endStart + endMarker.length;

const next = `${html.slice(0, start)}${replacement}${html.slice(end)}`;

if (next.includes('function loop(){if(!running)return;')) {
  throw new Error('Legacy live loop remained after transformation.');
}
if (!next.includes(replacement)) {
  throw new Error('Unified live-app bootstrap was not inserted.');
}
if (!next.includes('<script src="/acelynn-recovery.js"></script>')) {
  throw new Error('Recovery script was lost during transformation.');
}
if (!next.includes('<script src="/legacy-export-bridge.js?v=cutover1"></script>')) {
  throw new Error('Legacy export bridge was lost during transformation.');
}

writeFileSync(path, next);
console.log('Replaced the legacy inline live loop with /js/live-app.js while preserving the rest of index.html.');
