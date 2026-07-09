let audioContext, analyser, micSource, dataArray, animationId;

// Interface selectors
const startBtn = document.getElementById('sweepBtn'); // Using sweepBtn as trigger for stream init
const finalReportBtn = document.getElementById('finalReportBtn');
const statusContainer = document.getElementById('statusContainer');
const statusHeader = document.getElementById('statusHeader');
const statusText = document.getElementById('statusText');
const statusSuggestion = document.getElementById('statusSuggestion');
const coachLog = document.getElementById('coachLog');

// Report elements
const finalReportSuite = document.getElementById('finalReportSuite');
const reportPointsQty = document.getElementById('reportPointsQty');
const allocBalanced = document.getElementById('allocBalanced');
const allocCoupling = document.getElementById('allocCoupling');
const allocDispersion = document.getElementById('allocDispersion');
const reportLowEndDesc = document.getElementById('reportLowEndDesc');
const reportMidEndDesc = document.getElementById('reportMidEndDesc');

// Table element selectors
const tableG1 = document.getElementById('tableG1');
const tableG2 = document.getElementById('tableG2');
const tableG3 = document.getElementById('tableG3');
const tableG4 = document.getElementById('tableG4');

// Data tracking registers
let samplesCollectedCount = 0;
let lastEvaluationTime = 0;
const TIME_GAP = 3000; // Analyzes tracking conditions every 3 seconds

// Accumulator variables to measure room anomalies over time
let boxyAnomalyTicks = 0;
let mudAnomalyTicks = 0;
let harshAnomalyTicks = 0;

// Auto boot on layout load
window.addEventListener('DOMContentLoaded', () => {
    initializeAudioCapture();
});

async function initializeAudioCapture() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        
        micSource = audioContext.createMediaStreamSource(stream);
        micSource.connect(analyser);
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        executeAnalysisLoop();
    } catch (err) {
        console.warn("Microphone focus blocked or device connection absent.");
    }
}

function executeAnalysisLoop(timestamp) {
    animationId = requestAnimationFrame(executeAnalysisLoop);
    if (!analyser) return;

    analyser.getByteFrequencyData(dataArray);

    if (!timestamp) timestamp = performance.now();

    if (timestamp - lastEvaluationTime > TIME_GAP) {
        processRealtimeAcoustics();
        lastEvaluationTime = timestamp;
    }
}

function processRealtimeAcoustics() {
    samplesCollectedCount++;

    // Read target frequency buckets 
    let subBass = dataArray[1] || 0;
    let roomBoundaryZone = dataArray[4] || 0; // ~130Hz line boundary check
    let midPresenceZone = dataArray[73] || 0; // ~3.1kHz comb line check
    let highPresenceZone = dataArray[230] || 0;

    // Boundary evaluation metrics
    let hasBoundaryMud = roomBoundaryZone > 155;
    let hasHarshMids = midPresenceZone > 145;

    if (hasBoundaryMud) boxyAnomalyTicks++;
    if (subBass > 175) mudAnomalyTicks++;
    if (hasHarshMids) harshAnomalyTicks++;

    // Live update tracking cards down the page viewport array
    if (hasBoundaryMud) {
        updateLiveStatus("#ffc107", "Status: REVERBERANT", "Boundary Acoustic Buildup Detected", "Reflection points peaking near your boundary limits. Sound staging calculation accuracy lower.");
        writeHistoryRow("Boundary Reflection Buildup", "Room mode spike tracked around the low mid boundaries.", "Reposition desktop monitors 6 inches away from the nearest back boundary lines.");
    } else if (hasHarshMids) {
        updateLiveStatus("#ff416c", "Status: HARSH PRESENCE", "Harsh Presence Zone Peak Detected", "Upper midrange frequencies exhibit high resonant tracking points. High fatigue risk.");
        writeHistoryRow("Harsh Presence Zone Peak Detected", "Early reflection phase interference noted within the 3kHz range.", "Apply software parametric equalizer reductions across localized stem assets.");
    } else {
        updateLiveStatus("#20c997", "Status: BALANCED", "Acoustically Balanced Performance", "Frequency response metrics currently fall within studio parameter targets. Continue tracking.");
        writeHistoryRow("Acoustically Balanced Performance", "Frequency response metrics currently fall within studio parameter targets.", "Continue tracking.");
    }
}

function updateLiveStatus(color, title, subtitle, suggestion) {
    statusContainer.style.borderColor = color;
    statusHeader.textContent = title;
    statusHeader.style.color = color;
    statusText.textContent = subtitle;
    statusText.style.color = color;
    statusSuggestion.textContent = `Suggestion: ${suggestion}`;
    statusSuggestion.style.color = color;
}

function writeHistoryRow(status, diagnosis, suggestion) {
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const lineItem = document.createElement('div');
    lineItem.className = 'log-item';
    lineItem.innerHTML = `
        <div class="log-meta">[${stamp}] ${status}</div>
        <div class="log-body">↳ Diagnosis: ${diagnosis}</div>
        <div class="log-fix">Fix: ${suggestion}</div>
    `;
    coachLog.insertBefore(lineItem, coachLog.firstChild);

    if (coachLog.children.length > 10) {
        coachLog.removeChild(coachLog.lastChild);
    }
}

// --- GENERATE MATRICES REPORT (THE BACKEND MATH) ---
function generateFinalSessionAnalysis() {
    if (samplesCollectedCount === 0) return;

    reportPointsQty.textContent = samplesCollectedCount;

    // Calculate dynamic duty allocation indexes based on anomaly triggers
    let couplingFactor = Math.round((boxyAnomalyTicks / samplesCollectedCount) * 45);
    let dispersionFactor = Math.round((harshAnomalyTicks / samplesCollectedCount) * 35);
    let balancedFactor = 100 - (couplingFactor + dispersionFactor);

    allocBalanced.textContent = `${balancedFactor}%`;
    allocCoupling.textContent = `${couplingFactor}%`;
    allocDispersion.textContent = `${dispersionFactor}%`;

    // 1. Diagnose Low-End Room Modes
    if (couplingFactor > 25) {
        reportLowEndDesc.textContent = "Low-end boundary resonance tracking above safe target floors. Heavy modal excitement found near 130Hz lines due to rear acoustic boundary reflections. Geometric acoustic displacement required.";
        tableG2.textContent = `-${(couplingFactor / 6).toFixed(1)} dB`;
        tableG2.className = "txt-pink";
    } else {
        reportLowEndDesc.textContent = "Sub-bass decay rates fall within acceptable professional tolerances. Axial modes are not being critically excited at the current monitoring axis coordinates. No geometric displacement required.";
        tableG2.textContent = "0.0 dB (Flat)";
        tableG2.className = "";
    }

    // 2. Diagnose Mid-Range Comb Filtering
    if (dispersionFactor > 20) {
        reportMidEndDesc.textContent = "Destructive comb filtering and reflection paths are creating frequency deviations across your presence bands. Midrange parameters tracking harsh, blurring transient stereo spatial depth.";
        tableG3.textContent = `-${(dispersionFactor / 7).toFixed(1)} dB`;
        tableG3.className = "txt-pink";
    } else {
        reportMidEndDesc.textContent = "Clean Transient Phase Performance. Destructive comb filtering and flutter echo across reflection paths are nominal. Vocal intelligibility and stereo imaging localization thresholds are performing cleanly.";
        tableG3.textContent = "0.0 dB (Flat)";
        tableG3.className = "";
    }

    // Evaluate sub bass profile baseline adjustments 
    if (mudAnomalyTicks / samplesCollectedCount > 0.3) {
        tableG1.textContent = "-2.5 dB";
        tableG1.className = "txt-pink";
    } else {
        tableG1.textContent = "0.0 dB (Flat)";
        tableG1.className = "";
    }

    // Reveal report box container panel smoothly onto view window array
    finalReportSuite.style.display = "block";
    final
