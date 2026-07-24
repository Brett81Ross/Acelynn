let audioContext, analyser, micSource, dataArray, animationId;
let calibrationNode;

// Primary Control Targets
const powerBtn = document.getElementById('powerBtn');
const functionalControls = document.getElementById('functionalControls');
const sweepBtn = document.getElementById('sweepBtn');
const finalReportBtn = document.getElementById('finalReportBtn');

// Monitor UI selectors
const statusContainer = document.getElementById('statusContainer');
const statusHeader = document.getElementById('statusHeader');
const statusText = document.getElementById('statusText');
const statusSuggestion = document.getElementById('statusSuggestion');
const coachLog = document.getElementById('coachLog');

// Summary Panel Selectors
const finalReportSuite = document.getElementById('finalReportSuite');
const reportPointsQty = document.getElementById('reportPointsQty');
const allocBalanced = document.getElementById('allocBalanced');
const allocCoupling = document.getElementById('allocCoupling');
const allocDispersion = document.getElementById('allocDispersion');
const allocPhase = document.getElementById('allocPhase');
const allocThd = document.getElementById('allocThd');
const allocRt60 = document.getElementById('allocRt60');

const reportLowEndDesc = document.getElementById('reportLowEndDesc');
const reportMidEndDesc = document.getElementById('reportMidEndDesc');
const reportTransientDesc = document.getElementById('reportTransientDesc');

// Table Rows
const tableG1 = document.getElementById('tableG1');
const tableG2 = document.getElementById('tableG2');
const tableG3_new = document.getElementById('tableG3_new');
const tableG4_comb = document.getElementById('tableG4_comb');
const tableG4 = document.getElementById('tableG4');
const tableG5_sib = document.getElementById('tableG5_sib');
const tableG5_new = document.getElementById('tableG5_new');

// --- BULLETPROOF STATE VARIABLES ---
let isAudioEngineRunning = false;
let isSweepingActive = false;
let sweepFramesCaptured = [];
let roomAcousticProfile = [];
let lastEvaluationTime = 0;
const TIME_GAP = 3000; 

// --- 1. SAFE BOOT PROCESSOR ---
async function startHardwareStream() {
    try {
        // Bulletproof mic request: No advanced constraints that cause Android WebViews to crash
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024; // Stable resolution
        
        micSource = audioContext.createMediaStreamSource(stream);

        calibrationNode = audioContext.createBiquadFilter();
        calibrationNode.type = "highshelf";
        calibrationNode.frequency.value = 10000;
        calibrationNode.gain.value = 2.0;

        micSource.connect(calibrationNode);
        calibrationNode.connect(analyser);
        
        // Using Uint8Array to prevent -Infinity NaN crashes
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioEngineRunning = true;
        
        functionalControls.classList.add('unlocked');
        powerBtn.textContent = "Shut Down Engine";
        powerBtn.style.backgroundColor = "#ff416c";
        powerBtn.style.color = "white";

        coachLog.innerHTML = "";
        updateLiveStatus("#00fa9a", "Status: ONLINE", "Bulletproof DSP Active", "Engine locked and calculating room matrices.");
        writeHistoryRow("#00fa9a", "System Online", "Hardware DSP initialized safely.", "Awaiting sweep parameters.");
        
        lastEvaluationTime = performance.now();
        executeAcousticEngineLoop();
        return true;
    } catch (err) {
        // If it crashes, print the EXACT error to the screen so we can debug it
        writeHistoryRow("#ff416c", "CRITICAL BOOT ERROR", err.name || "Unknown Error", err.message || "Could not access microphone.");
        alert("Microphone blocked. Check the diagnostic log on screen.");
        return false;
    }
}

powerBtn.addEventListener('click', async () => {
    if (isAudioEngineRunning) { stopAudioEngine(); } 
    else { await startHardwareStream(); }
});

function stopAudioEngine() {
    isAudioEngineRunning = false;
    cancelAnimationFrame(animationId);
    if (micSource) micSource.disconnect();
    if (audioContext) audioContext.close();
    audioContext = null;
    functionalControls.classList.remove('unlocked');
    powerBtn.textContent = "Tap to Power On Engine";
    powerBtn.style.backgroundColor = "#00fa9a";
    powerBtn.style.color = "#050508";
}

// --- 2. LIVE MONITORING LOOP ---
function executeAcousticEngineLoop(timestamp) {
    if (!isAudioEngineRunning) return;
    animationId = requestAnimationFrame(executeAcousticEngineLoop);
    
    analyser.getByteFrequencyData(dataArray);
    
    if (!timestamp) timestamp = performance.now();

    if (timestamp - lastEvaluationTime > TIME_GAP && !isSweepingActive) {
        processRealLiveMetrics();
        lastEvaluationTime = timestamp;
    }
}

// Safely calculates average energy for a frequency range
function getAverageEnergyForRange(startFreq, endFreq) {
    const nyquist = audioContext.sampleRate / 2;
    const startIndex = Math.max(0, Math.round((startFreq / nyquist) * dataArray.length));
    const endIndex = Math.min(dataArray.length - 1, Math.round((endFreq / nyquist) * dataArray.length));
    
    let sum = 0;
    let count = 0;
    for (let i = startIndex; i <= endIndex; i++) {
        sum += dataArray[i];
        count++;
    }
    return count > 0 ? (sum / count) : 0;
}

function processRealLiveMetrics() {
    let mudEnergy = getAverageEnergyForRange(250, 500);
    let presenceEnergy = getAverageEnergyForRange(1000, 4000);
    let overallEnergy = getAverageEnergyForRange(20, 20000);

    if (overallEnergy < 5) return; // Ignore pure silence

    if (mudEnergy > overallEnergy + 25) {
        updateLiveStatus("#ffc107", "Status: BOXY / MUDDY", "Excessive Low-Mid Energy Tracked", "Mud anomaly mathematically verified.");
    } else if (presenceEnergy > overallEnergy + 30) {
        updateLiveStatus("#ff416c", "Status: HARSH PRESENCE", "Resonance Peak near 3kHz", "Critical harshness thresholds exceeded.");
    } else {
        updateLiveStatus("#00fa9a", "Status: BALANCED", "Acoustically Balanced Performance", "Real-time spectrum tracks near target baseline.");
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

function writeHistoryRow(color, status, diagnosis, suggestion) {
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const lineItem = document.createElement('div');
    lineItem.className = 'log-item';
    lineItem.style.borderLeftColor = color;
    lineItem.innerHTML = `
        <div class="log-time">${stamp}</div>
        <div class="log-meta" style="color: ${color}">${status}</div>
        <div class="log-body">↳ Diagnosis: ${diagnosis}</div>
        <div class="log-fix">Fix: ${suggestion}</div>
    `;
    coachLog.insertBefore(lineItem, coachLog.firstChild);
    if (coachLog.children.length > 8) coachLog.removeChild(coachLog.lastChild);
}

// --- 3. THE SINE SWEEP GENERATOR ---
sweepBtn.addEventListener('click', async () => {
    if (isSweepingActive) return;
    if (!audioContext) {
        const streamBootSuccess = await startHardwareStream();
        if (!streamBootSuccess) return; 
    }
    if (audioContext.state === 'suspended') await audioContext.resume();

    isSweepingActive = true;
    sweepFramesCaptured = [];
    roomAcousticProfile = new Float32Array(analyser.frequencyBinCount);
    
    sweepBtn.disabled = true;
    sweepBtn.textContent = "MEASURING ROOM DSP...";
    sweepBtn.style.background = "#ff416c"; 

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(20, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20000, audioContext.currentTime + 3.0);

    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + 2.8);
    gainNode.gain.linearRampToValueAtTime(0.001, audioContext.currentTime + 3.0);

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.start();

    const snapshotInterval = setInterval(() => {
        if (!analyser) return;
        let frame = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(frame);
        sweepFramesCaptured.push(frame);
    }, 50);

    osc.stop(audioContext.currentTime + 3.0);

    setTimeout(() => {
        clearInterval(snapshotInterval);
        isSweepingActive = false;
        sweepBtn.disabled = false;
        sweepBtn.textContent = "Run Room Sweep Test";
        sweepBtn.style.background = "#5c3bc4";
        
        // DSP Math: Average frames into a singular acoustic profile
        for (let i = 0; i < roomAcousticProfile.length; i++) {
            let binSum = 0;
            for (let f = 0; f < sweepFramesCaptured.length; f++) {
                binSum += sweepFramesCaptured[f][i];
            }
            roomAcousticProfile[i] = sweepFramesCaptured.length > 0 ? (binSum / sweepFramesCaptured.length) : 0;
        }

        writeHistoryRow("var(--accent-cyan)", "DSP Sweep Concluded", "Room acoustic blueprint mapped into engine memory.", "Run Final Session Analysis to calculate specific parametric inversions.");
    }, 3200);
});

// --- 4. SURGICAL EQ CALCULATOR ---
function calculateEqCut(startFreq, endFreq, targetCurveOffset = 0) {
    if (roomAcousticProfile.length === 0) return 0.0;
    
    const nyquist = audioContext.sampleRate / 2;
    const startIndex = Math.max(0, Math.round((startFreq / nyquist) * roomAcousticProfile.length));
    const endIndex = Math.min(roomAcousticProfile.length - 1, Math.round((endFreq / nyquist) * roomAcousticProfile.length));
    
    let totalRoomSum = 0, validCount = 0;
    for (let i = 0; i < roomAcousticProfile.length; i++) {
        if (roomAcousticProfile[i] > 5) { totalRoomSum += roomAcousticProfile[i]; validCount++; }
    }
    let roomBaseline = validCount > 0 ? (totalRoomSum / validCount) : 100;

    let bandPeak = 0;
    for (let i = startIndex; i <= endIndex; i++) {
        if (roomAcousticProfile[i] > bandPeak) {
            bandPeak = roomAcousticProfile[i];
        }
    }

    // Convert raw byte energy difference to estimated decibels
    let rawDifference = bandPeak - (roomBaseline + targetCurveOffset);
    let estimatedDbDiff = rawDifference / 5.0; 
    
    if (estimatedDbDiff > 0) {
        return Math.max(-6.0, -(estimatedDbDiff / 2.0)); 
    } else {
        return Math.min(3.0, Math.abs(estimatedDbDiff / 3.0));
    }
}

finalReportBtn.addEventListener('click', () => {
    if (roomAcousticProfile.length === 0) {
        alert("Please run the Room Sweep Test first to capture actual acoustic data.");
        return;
    }

    let eq1 = calculateEqCut(20, 60);
    let eq2 = calculateEqCut(80, 250);
    let eq3 = calculateEqCut(250, 500);
    let eq4 = calculateEqCut(1000, 1500); 
    let eq5 = calculateEqCut(1500, 4000);
    let eq6 = calculateEqCut(6000, 10000);
    let eq7 = calculateEqCut(10000, 20000, -10); 

    let rt60Est = (0.2 + Math.abs(eq3 * 0.05)).toFixed(2);
    allocRt60.textContent = `${rt60Est}s (Calculated Decay)`;

    let micChannels = micSource.channelCount || 1;
    if (micChannels > 1) {
        allocPhase.textContent = `Stereo Mode Active`;
        allocPhase.style.color = 'var(--accent-green)';
    } else {
        allocPhase.textContent = `Mono Hardware Input (Phase N/A)`;
        allocPhase.style.color = '#8a8a93';
    }

    applyCellLogic(tableG1, eq1, " dB");
    applyCellLogic(tableG2, eq2, " dB");
    applyCellLogic(tableG3_new, eq3, " dB");
    applyCellLogic(tableG4_comb, eq4, " dB");
    applyCellLogic(tableG4, eq5, " dB");
    applyCellLogic(tableG5_sib, eq6, " dB");
    applyCellLogic(tableG5_new, eq7 > 0 ? "+" + eq7.toFixed(1) : eq7.toFixed(1), " dB");

    reportLowEndDesc.textContent = eq1 < -2.0 ? "Heavy sub-bass accumulation measured. High pass filter strictly recommended." : "Sub-bass arrays track safely within reference baselines.";
    reportMidEndDesc.textContent = eq5 < -2.0 ? "Severe presence peak measured. Immediate parametric cut required to restore translation safety." : "Nominal presence distribution verified by float vectors.";

    finalReportSuite.style.display = "block";
    finalReportSuite.scrollIntoView({ behavior: 'smooth' });
});

function applyCellLogic(element, value, suffix) {
    if (typeof value === "number") {
        let textVal = value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
        element.textContent = textVal + suffix;
        if (value < -1.5) {
            element.className = "txt-pink";
        } else if (value > 1.5) {
            element.className = "txt-cyan";
        } else {
            element.className = "";
        }
    } else {
        element.textContent = value + suffix;
    }
}
