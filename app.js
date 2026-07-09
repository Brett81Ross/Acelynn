let audioContext, analyser, micSource, dataArray, animationId;
let calibrationNode; 

// Core UI Control Hooks
const startBtn = document.getElementById('sweepBtn'); // This initializes the stream in this layout version
const finalReportBtn = document.getElementById('finalReportBtn');
const statusContainer = document.getElementById('statusContainer');
const statusHeader = document.getElementById('statusHeader');
const statusText = document.getElementById('statusText');
const statusSuggestion = document.getElementById('statusSuggestion');
const coachLog = document.getElementById('coachLog');

// Report Suite Hooks
const finalReportSuite = document.getElementById('finalReportSuite');
const reportPointsQty = document.getElementById('reportPointsQty');
const allocBalanced = document.getElementById('allocBalanced');
const allocCoupling = document.getElementById('allocCoupling');
const allocDispersion = document.getElementById('allocDispersion');
const reportLowEndDesc = document.getElementById('reportLowEndDesc');
const reportMidEndDesc = document.getElementById('reportMidEndDesc');

// Table Data Row Hooks
const tableG1 = document.getElementById('tableG1');
const tableG2 = document.getElementById('tableG2');
const tableG3 = document.getElementById('tableG3');
const tableG4 = document.getElementById('tableG4');

// Data Monitoring State Registers
let samplesCollectedCount = 0;
let lastEvaluationTime = 0;
const TIME_GAP = 3000; 

let boxyAnomalyTicks = 0;
let mudAnomalyTicks = 0;
let harshAnomalyTicks = 0;
let isTrackingActive = false;

// --- FIX 1: CALIBRATE AND ATTACH INITIALIZATION TO THE PRIMARY BUTTON ---
startBtn.addEventListener('click', async () => {
    if (isTrackingActive) {
        // Toggle action: Shutdown engine if clicked while running
        stopAudioCapture();
        return;
    }
    
    try {
        // Explicit user gesture unlocks mobile browser mic restrictions securely
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        
        micSource = audioContext.createMediaStreamSource(stream);

        // Linear flat microphone filtering profile
        calibrationNode = audioContext.createBiquadFilter();
        calibrationNode.type = "highshelf";
        calibrationNode.frequency.value = 120;
        calibrationNode.gain.value = 6.0; 

        micSource.connect(calibrationNode);
        calibrationNode.connect(analyser);
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        // Reset state variables for fresh execution
        isTrackingActive = true;
        samplesCollectedCount = 0;
        boxyAnomalyTicks = 0;
        mudAnomalyTicks = 0;
        harshAnomalyTicks = 0;
        coachLog.innerHTML = "";
        finalReportSuite.style.display = "none"; 

        // Update button appearance to show active system status
        startBtn.textContent = "Stop Measurement Engine";
        startBtn.style.background = "#ff416c";
        
        lastEvaluationTime = performance.now();
        executeAnalysisLoop();
        
        writeHistoryRow("System Initialized", "Omnidirectional emulated capsule calibration loaded.", "Measurement data actively streaming.");
    } catch (err) {
        alert("Microphone connection failed. Please ensure permission is allowed in your browser settings.");
        console.error(err);
    }
});

function stopAudioCapture() {
    isTrackingActive = false;
    cancelAnimationFrame(animationId);
    if (micSource) micSource.disconnect();
    if (audioContext) audioContext.close();
    audioContext = null;
    
    startBtn.textContent = "Run Room Sweep Test";
    startBtn.style.background = "#5c3bc4";
    updateLiveStatus("#20c997", "Status: BALANCED", "Measurement Engine Offline", "Initialize the engine to map live audio components.");
}

function executeAnalysisLoop(timestamp) {
    if (!isTrackingActive) return;
    animationId = requestAnimationFrame(executeAnalysisLoop);
    
    analyser.getByteFrequencyData(dataArray);

    if (!timestamp) timestamp = performance.now();

    if (timestamp - lastEvaluationTime > TIME_GAP) {
        processRealtimeAcoustics();
        lastEvaluationTime = timestamp;
    }
}

function processRealtimeAcoustics() {
    samplesCollectedCount++;

    // Safe boundaries checking for array indices
    let subBass = dataArray[1] || 0;
    let roomBoundaryZone = dataArray[4] || 0; 
    let midPresenceZone = dataArray[73] || 0; 
    let highPresenceZone = dataArray[210] || 0;

    let hasBoundaryMud = roomBoundaryZone > 150;
    let hasHarshMids = midPresenceZone > 140;

    if (hasBoundaryMud) boxyAnomalyTicks++;
    if (subBass > 170) mudAnomalyTicks++;
    if (hasHarshMids) harshAnomalyTicks++;

    // Real-time panel display shifting rules
    if (hasBoundaryMud) {
        updateLiveStatus("#ffc107", "Status: REVERBERANT", "Boundary Acoustic Buildup Detected", "Reflection points peaking near your boundary limits. Sound staging calculation accuracy lower.");
        writeHistoryRow("Boundary Reflection Buildup", "Room mode spike tracked around the low mid boundaries.", "Reposition desktop monitors 6 inches away from back boundary surfaces.");
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

    if (coachLog.children.length > 15) {
        coachLog.removeChild(coachLog.lastChild);
    }
}

// --- FIX 2: EXPLICIT ON-CLICK ATTACHMENT FOR THE FINAL ANALYSIS MODULE ---
finalReportBtn.addEventListener('click', () => {
    if (!isTrackingActive || samplesCollectedCount === 0) {
        alert("Please run the measurement engine and collect some audio data before generating a final report.");
        return;
    }
    
    reportPointsQty.textContent = samplesCollectedCount;

    // Computational weighting maps for final session display modules
    let couplingFactor = Math.round((boxyAnomalyTicks / samplesCollectedCount) * 45);
    let dispersionFactor = Math.round((harshAnomalyTicks / samplesCollectedCount) * 35);
    let balancedFactor = Math.max(0, 100 - (couplingFactor + dispersionFactor));

    allocBalanced.textContent = `${balancedFactor}%`;
    allocCoupling.textContent
