const CARD_ID = 'professionalMetering';

function formatNumber(value, digits = 1, suffix = '') {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}${suffix}` : '—';
}

function meterClass(value, kind) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'meter-neutral';
  if (kind === 'truePeak') return number > -1 ? 'meter-bad' : number > -3 ? 'meter-warn' : 'meter-good';
  if (kind === 'correlation') return number < 0 ? 'meter-bad' : number < 0.2 ? 'meter-warn' : 'meter-good';
  return 'meter-neutral';
}

function createCard() {
  if (document.getElementById(CARD_ID)) return document.getElementById(CARD_ID);
  const hero = document.querySelector('.card.hero');
  if (!hero?.parentNode) return null;
  const section = document.createElement('section');
  section.id = CARD_ID;
  section.className = 'card section professional-metering';
  section.innerHTML = `
    <div class="section-head"><span>Professional metering</span><span class="subtle" id="meteringStandard">Starting…</span></div>
    <div class="pro-meter-grid">
      <div class="pro-meter"><small>MOMENTARY</small><strong id="momentaryLufs">—</strong><span>LUFS · 400 ms</span></div>
      <div class="pro-meter"><small>SHORT-TERM</small><strong id="shortTermLufs">—</strong><span>LUFS · 3 s</span></div>
      <div class="pro-meter"><small>INTEGRATED</small><strong id="integratedLufs">—</strong><span>LUFS · gated</span></div>
      <div class="pro-meter"><small>TRUE PEAK</small><strong id="truePeakDbtp">—</strong><span>dBTP estimate</span></div>
      <div class="pro-meter"><small>STEREO CORR</small><strong id="stereoCorrelation">—</strong><span>-1 to +1</span></div>
      <div class="pro-meter"><small>SAMPLE PEAK</small><strong id="samplePeakDbfs">—</strong><span>dBFS</span></div>
    </div>
    <div class="vectorscope-wrap"><canvas id="vectorscope" width="360" height="180" aria-label="Stereo vectorscope"></canvas><div class="vectorscope-label">STEREO VECTORSCOPE</div></div>
    <div class="input-diagnostics" id="inputDiagnostics">Waiting for metering input.</div>
    <div class="metering-note" id="meteringNote">LUFS and true-peak metering are being introduced as standards-aligned measurements. Official compliance test-set validation remains a release gate before Acelynn labels the true-peak estimate as certified.</div>
  `;
  hero.insertAdjacentElement('afterend', section);

  const style = document.createElement('style');
  style.id = 'professionalMeteringStyles';
  style.textContent = `
    .professional-metering{overflow:hidden}.pro-meter-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:13px}.pro-meter{min-width:0;padding:10px;border:1px solid #303049;border-radius:12px;background:#0b0b16}.pro-meter small{display:block;color:#8f8da4;font-size:.55rem;font-weight:900;letter-spacing:.07em}.pro-meter strong{display:block;margin-top:5px;font-size:1.02rem;font-variant-numeric:tabular-nums}.pro-meter span{display:block;margin-top:2px;color:#77768b;font-size:.58rem}.meter-good{color:#78f0b1}.meter-warn{color:#ffe27a}.meter-bad{color:#ff6a98}.meter-neutral{color:#f7f6ff}.vectorscope-wrap{position:relative;height:180px;margin-top:10px;border:1px solid #292943;border-radius:13px;background:#080813;overflow:hidden}.vectorscope-wrap canvas{width:100%;height:100%}.vectorscope-label{position:absolute;top:8px;left:10px;color:#77768b;font-size:.55rem;font-weight:900;letter-spacing:.08em}.input-diagnostics{margin-top:10px;color:#aaa9bb;font-size:.68rem;line-height:1.45}.metering-note{margin-top:8px;padding:9px 10px;border-radius:10px;background:#0d0d18;color:#8c8a9f;font-size:.64rem;line-height:1.4}@media(max-width:560px){.pro-meter-grid{grid-template-columns:repeat(2,1fr)}}
  `;
  document.head.appendChild(style);
  return section;
}

function drawVectorscope(points, channelCount) {
  const canvas = document.getElementById('vectorscope');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const ratio = devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const w = rect.width;
  const h = rect.height;
  context.clearRect(0, 0, w, h);
  context.strokeStyle = '#26263d';
  context.lineWidth = 1;
  context.beginPath(); context.moveTo(w / 2, 0); context.lineTo(w / 2, h); context.stroke();
  context.beginPath(); context.moveTo(0, h / 2); context.lineTo(w, h / 2); context.stroke();
  context.beginPath(); context.moveTo(w * .15, h * .85); context.lineTo(w * .85, h * .15); context.stroke();
  context.beginPath(); context.moveTo(w * .15, h * .15); context.lineTo(w * .85, h * .85); context.stroke();

  const clean = Array.isArray(points) ? points : [];
  context.fillStyle = '#73f3ff';
  for (const point of clean) {
    const left = Number(point?.[0]) || 0;
    const right = Number(point?.[1]) || 0;
    const mid = (left + right) * .5;
    const side = (left - right) * .5;
    const x = w / 2 + side * w * .42;
    const y = h / 2 - mid * h * .42;
    context.fillRect(x - 1, y - 1, 2, 2);
  }
  if (channelCount === 1) {
    context.fillStyle = '#aaa9bb';
    context.font = '11px system-ui';
    context.fillText('Mono input', 10, h - 10);
  }
}

function update(detail) {
  createCard();
  if (!detail?.available) {
    const standard = document.getElementById('meteringStandard');
    const diagnostics = document.getElementById('inputDiagnostics');
    if (standard) standard.textContent = 'v1.2 fallback active';
    if (diagnostics) diagnostics.textContent = 'Professional AudioWorklet metering is unavailable in this browser; core Acelynn analysis remains active.';
    return;
  }
  const fields = {
    momentaryLufs: [detail.momentaryLufs, 1, ' LUFS', 'loudness'],
    shortTermLufs: [detail.shortTermLufs, 1, ' LUFS', 'loudness'],
    integratedLufs: [detail.integratedLufs, 1, ' LUFS', 'loudness'],
    truePeakDbtp: [detail.truePeakEstimateDbtp, 1, ' dBTP', 'truePeak'],
    stereoCorrelation: [detail.correlation, 2, '', 'correlation'],
    samplePeakDbfs: [detail.samplePeakDbfs, 1, ' dBFS', 'samplePeak']
  };
  for (const [id, [value, digits, suffix, kind]] of Object.entries(fields)) {
    const element = document.getElementById(id);
    if (!element) continue;
    element.textContent = formatNumber(value, digits, suffix);
    element.className = meterClass(value, kind);
  }
  const standard = document.getElementById('meteringStandard');
  if (standard) standard.textContent = detail.channelCount === 1 ? 'MONO · BS.1770' : detail.channelCount >= 2 ? 'STEREO · BS.1770' : 'BS.1770';
  const diagnostics = document.getElementById('inputDiagnostics');
  if (diagnostics) {
    const sampleRate = Number.isFinite(detail.sampleRate) ? `${(detail.sampleRate / 1000).toFixed(1)} kHz` : 'sample rate unknown';
    const channels = detail.channelCount === 1 ? 'Mono' : detail.channelCount >= 2 ? 'Stereo' : 'channels unknown';
    const dc = Array.isArray(detail.dcOffset) && detail.dcOffset.length ? detail.dcOffset.map(value => formatNumber(value, 4)).join(' / ') : '—';
    diagnostics.textContent = `${sampleRate} · ${channels} · DC offset ${dc} · Dropouts ${detail.dropoutCount ?? 0}`;
  }
  const note = document.getElementById('meteringNote');
  if (note) {
    note.textContent = detail.measurementDomain === 'acoustic-capture'
      ? 'Microphone LUFS describes the captured speaker + room + microphone signal. It is useful for repeatable monitoring, but it is not the same as source-file mastering loudness and is not calibrated SPL.'
      : 'Digital-file LUFS is measured from the Web Audio program stream. True peak is currently shown as a standards-oriented inter-sample estimate until Acelynn passes the official EBU/ITU compliance test set.';
  }
  drawVectorscope(detail.vectorPoints, detail.channelCount);
}

createCard();
window.addEventListener('acelynn:metering', event => update(event.detail));
window.addEventListener('acelynn:metering-status', event => update(event.detail));
window.addEventListener('acelynn:metering-reset', () => {
  const card = createCard();
  if (card) card.querySelectorAll('.pro-meter strong').forEach(element => { element.textContent = '—'; element.className = 'meter-neutral'; });
  const diagnostics = document.getElementById('inputDiagnostics');
  if (diagnostics) diagnostics.textContent = 'Waiting for metering input.';
  drawVectorscope([], 0);
});
