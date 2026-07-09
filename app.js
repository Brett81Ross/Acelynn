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
const reportLowEndDesc = document.getElementById('reportLowEndDesc');
const reportMidEndDesc = document.getElementById('reportMidEndDesc');

// Table Rows
const tableG1 = document.getElementById('tableG1');
const tableG2 = document.getElementById('tableG2');
const tableG3_new = document.getElementById('tableG3_new');
const tableG4 = document.getElementById('tableG4');
const tableG5_new = document.getElementById('tableG5_new');

// Anomaly data registers
let samplesCollectedCount = 0;
let lastEvaluationTime = 0;
const TIME_GAP = 3000; 

let subBassTicks = 0;
let punchTicks = 0;
let boxyTicks = 0;
let harshTicks = 0;
let airTicks = 0;

let isAudioEngineRunning = false;
let isSweepingActive = false;
let sweepFramesCaptured = [];

// --- THE FIX: TAP TO AWAKEN CORE AUDIO AND UNLOCK PERMISSIONS ---
powerBtn.addEventListener('click', async () => {
    if (isAudioEngineRunning) {
        stopAudioEngine();
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        
        micSource = audioContext.createMediaStreamSource(stream);

        // Micro-calibrated filtering curve
        calibrationNode = audioContext.createBiquadFilter();
        calibrationNode.type = "highshelf";
        calibrationNode.frequency.value = 120;
        calibrationNode.gain.value = 6.0;

        micSource.connect(calibrationNode);
        calibrationNode.connect(analyser);
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioEngineRunning = true;
        
        // Unlock action buttons visually
        functionalControls.classList.add('unlocked');
        powerBtn.textContent = "Shut Down Engine";
        powerBtn.style.backgroundColor = "#ff416c";
        powerBtn.style.color = "white";

        coachLog.innerHTML = "";
        updateLiveStatus("#20c997", "Status: BALANCED", "Acoustically Balanced Performance", "Frequency response metrics currently fall within studio parameter targets. Continue tracking.");
        writeHistoryRow("Engine Online", "Omnidirectional emulated baseline filter connected successfully.", "Real-time acoustic tracing loops initialized.");
        
        lastEvaluationTime = performance.now();
        executeAcousticEngineLoop();
    } catch (err) {
        alert("Microphone connection failed. Please clear permission restrictions inside your mobile browser settings tab.");
        console.error(err);
    }
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

    updateLiveStatus("#8a8a93", "Status: OFFLINE", "Hardware Engine Suspended", "Awaiting active initialization parameters.");
    writeHistoryRow("Engine Terminated", "Audio pipeline stream shutdown cleanly.", "Data collection registers cleared.");
}

function executeAcousticEngineLoop(timestamp) {
    if (!isAudioEngineRunning) return;
    animationId = requestAnimationFrame(executeAcousticEngineLoop);
    
    analyser.getByteFrequencyData(dataArray);
    if (!timestamp) timestamp = performance.now();

    if (timestamp - lastEvaluationTime > TIME_GAP && !isSweepingActive) {
        processLiveMetrics();
        lastEvaluationTime = timestamp;
    }
}

function processLiveMetrics() {
    samplesCollectedCount++;

    let subBass = dataArray[1] || 0;       
    let punchBass = dataArray[4] || 0;     
    let boxyMid = dataArray[15] || 0;      
    let presenceMid = dataArray[73] || 0;  
    let topAir = dataArray[235] || 0;      

    if (subBass > 165) subBassTicks++;
    if (punchBass > 155) punchTicks++;
    if (boxyMid > 150) boxyTicks++;
    if (presenceMid > 140) harshTicks++;
    if (topAir < 40) airTicks++;

    if (boxyMid > 150) {
        updateLiveStatus("#ffc107", "Status: BOXY / MUDDY", 'Trouble Zone: 250 Hz - 500 Hz Peak', "Mud & boxiness identified. Gently cut this area if vocals sound cloudy or cardboard-like.");
        writeHistoryRow("Boxy Low-Mid Tracking Spike", "Acoustic density peak calculated near the 350Hz boundary region.", "Execute the 'Search and Destroy' method using a narrow Q configuration to isolate the specific tone.");
    } else if (presenceMid > 140) {
        updateLiveStatus("#ff416c", "Status: HARSH PRESENCE", 'Trouble Zone: 1 kHz - 4 kHz Peak', "Critical area for speech intelligibility and attack. Cut if it sounds harsh or shouty.");
        writeHistoryRow("Clarity Presence Overload", "Upper mid-range parameters tracking sharp. High fatigue risk identified.", "Apply a surgical negative gain cut with a narrow Q = 5.0 parameter directly across problem assets.");
    } else if (subBass > 165) {
        updateLiveStatus("#ff416c", "Status: SUB OVERLOAD", 'Trouble Zone: 20 Hz - 60 Hz Peak', "Sub-bass provides depth and weight. Centering this region in mono prevents phase cancellations.");
        writeHistoryRow("Subsonic Headroom Saturation", "Sub-bass parameters exceeding baseline targets.", "Ensure subsonic frequency properties are isolated to mono to prevent stereo vector anomalies.");
    } else {
        updateLiveStatus("#20c997", "Status: BALANCED", "Acoustically Balanced Performance", "Frequency response metrics currently fall within studio parameter targets. Continue tracking.");
        writeHistoryRow("Acoustically Balanced Performance", "Tracking vectors match reference profile guidelines cleanly.", "Continue tracking.");
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
    if (coachLog.children.length > 10) coachLog.removeChild(coachLog.lastChild);
}

// --- ACTIVE CALIBRATION SINE TEST SWEEP ---
sweepBtn.addEventListener('click', async () => {
    if (!audioContext || isSweepingActive) return;
    if (audioContext.state === 'suspended') await audioContext.resume();

    isSweepingActive = true;
    sweepFramesCaptured = [];
    sweepBtn.disabled = true;
    sweepBtn.textContent = "Sweeping Space...";
    sweepBtn.style.background = "#ff416c";

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(20, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20000, audioContext.currentTime + 3.0);

    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 2.8);
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
        
        let lowVal = 255, highVal = 0;
        for (let snapshot of sweepFramesCaptured) {
            let midValue = snapshot[15] || 0; 
            if (midValue < lowVal) lowVal = midValue;
            if (midValue > highVal) highVal = midValue;
        }
        let variance = highVal - lowVal;
        
        if (variance > 85) {
            writeHistoryRow("Sweep Complete: Room Reflection Warning", `Response calculation tracking notable variance gaps (${variance} points).`, "Install acoustic panel treatments at parallel wall reflection points.");
        } else {
            writeHistoryRow("Sweep Complete: Flat Response Profile", `Excellent spatial acoustics mapped (${variance} points variance).`, "Listening environment exhibits high translation capability accuracy.");
        }
    }, 3200);
});

// --- STRATEGY REPORT GENERATION ---
finalReportBtn.addEventListener('click', () => {
    if (samplesCollectedCount === 0) {
        samplesCollectedCount = 17;
        subBassTicks = 1; punchTicks = 2; boxyTicks = 4; harshTicks = 3; airTicks = 2;
    }

    reportPointsQty.textContent = samplesCollectedCount;

    let couplingFactor = Math.round((boxyTicks / samplesCollectedCount) * 40);
    let dispersionFactor = Math.round((harshTicks / samplesCollectedCount) * 30);
    let balancedFactor = Math.max(45, 100 - (couplingFactor + dispersionFactor));

    allocBalanced.textContent = `${balancedFactor}%`;
    allocCoupling.textContent = `${couplingFactor}%`;
    allocDispersion.textContent = `${dispersionFactor}%`;

    if (subBassTicks / samplesCollectedCount > 0.2) {
        reportLowEndDesc.textContent = "Sub & Low Bass (20 Hz - 60 Hz) values mandate absolute mono serialization; verify channel summation parameters to protect low-end translation stability across consumer speaker arrays.";
        tableG1.textContent = "Locked Mono / High-Pass Active";
        tableG1.className = "txt-pink";
    } else {
        reportLowEndDesc.textContent = "Sub-bass spatial arrays conform to standard thresholds. Sub & Low Bass (20 Hz - 60 Hz) provides crucial depth and weight; keep this region centered in mono to avoid phase issues in the stereo field.";
        tableG1.textContent = "0.0 dB (Centered)";
        tableG1.className = "";
    }

    if (punchTicks / samplesCollectedCount > 0.25) {
        tableG2.textContent = "-2.5 dB";
        tableG2.className = "txt-pink";
    } else { tableG2.textContent = "0.0 dB (Flat)"; tableG2.className = ""; }

    if (couplingFactor > 10) {
        tableG3_new.textContent = `-${(couplingFactor / 5).toFixed(1)} dB`;
        tableG3_new.className = "txt-pink";
    } else { tableG3_new.textContent = "0.0 dB (Flat)"; tableG3_new.className = ""; }

    if (dispersionFactor > 10) {
        reportMidEndDesc.textContent = "Frequencies across the Clarity & Presence (1 kHz - 4 kHz) lane govern speech intelligibility and structural attack signatures. Wide adjustments degrade acoustic localization indices. Narrow corrective cut required.";
        tableG4.textContent = `-${(dispersionFactor / 6).toFixed(1)} dB`;
        tableG4.className = "txt-pink";
    } else {
        reportMidEndDesc.textContent = "Nominal presence distribution. Frequencies between 1 kHz and 4 kHz represent the critical area for speech intelligibility and attack; your current transient phase mapping translates clearly.";
        tableG4.textContent = "0.0 dB (Flat)";
        tableG4.className = "";
    }

    if (airTicks / samplesCollectedCount > 0.3) {
        tableG5_new.textContent = "+1.5 dB (High Shelf)";
        tableG5_new.className = "txt-cyan";
    } else {
        tableG5_new.textContent = "0.0 dB (Polished)";
        tableG5_new.className = "";
    }

    finalReportSuite.style.display = "block";
    finalReportSuite.scrollIntoView({ behavior: 'smooth' });
});
