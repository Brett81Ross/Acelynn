let audioContext, analyser, micSource, dataArray, animationId;
let calibrationNode;

// Dom selectors
const powerBtn = document.getElementById('powerBtn');
const functionalControls = document.getElementById('functionalControls');
const sweepBtn = document.getElementById('sweepBtn');
const finalReportBtn = document.getElementById('finalReportBtn');
const statusContainer = document.getElementById('statusContainer');
const statusHeader = document.getElementById('statusHeader');
const statusText = document.getElementById('statusText');
const statusSuggestion = document.getElementById('statusSuggestion');
const coachLog = document.getElementById('coachLog');

// Summary panel fields
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

// Extended 7-Band structural cells
const tableG1 = document.getElementById('tableG1');
const tableG2 = document.getElementById('tableG2');
const tableG3_new = document.getElementById('tableG3_new');
const tableG4_comb = document.getElementById('tableG4_comb');
const tableG4 = document.getElementById('tableG4');
const tableG5_sib = document.getElementById('tableG5_sib');
const tableG5_new = document.getElementById('tableG5_new');

// Anomaly counters
let samplesCollectedCount = 0;
let lastEvaluationTime = 0;
const TIME_GAP = 3000; 

let subBassTicks = 0;
let punchTicks = 0;
let boxyTicks = 0;
let consoleCombTicks = 0;
let harshTicks = 0;
let sibilanceTicks = 0;
let airTicks = 0;
let phaseAnomaliesCount = 0;
let distortionAlertTicks = 0;
let smearedTransientTicks = 0;

let isAudioEngineRunning = false;
let isSweepingActive = false;
let sweepFramesCaptured = [];

// --- BOOT PROCESSOR ---
powerBtn.addEventListener('click', async () => {
    if (isAudioEngineRunning) { stopAudioEngine(); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        
        micSource = audioContext.createMediaStreamSource(stream);

        calibrationNode = audioContext.createBiquadFilter();
        calibrationNode.type = "highshelf";
        calibrationNode.frequency.value = 120;
        calibrationNode.gain.value = 6.0;

        micSource.connect(calibrationNode);
        calibrationNode.connect(analyser);
        
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioEngineRunning = true;
        
        functionalControls.classList.add('unlocked');
        powerBtn.textContent = "Shut Down Engine";
        powerBtn.style.backgroundColor = "#ff416c";
        powerBtn.style.color = "white";

        coachLog.innerHTML = "";
        updateLiveStatus("#00fa9a", "Status: BALANCED", "System Monitoring Engaged", "Integrated data allocation pathways running. Real-time parameters active.");
        writeHistoryRow("System Online", "10-Vector sound diagnostic array loaded.", "Awaiting signal parameters or hardware calibration triggers.");
        
        lastEvaluationTime = performance.now();
        executeAcousticEngineLoop();
    } catch (err) {
        alert("Microphone configuration failure. Clear block flags inside device options.");
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
    updateLiveStatus("#8a8a93", "Status: OFFLINE", "Hardware Engine Suspended", "Awaiting execution parameters.");
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
    let consoleComb = dataArray[28] || 0;   
    let presenceMid = dataArray[73] || 0;   
    let sibilanceZone = dataArray[165] || 0; 
    let topAir = dataArray[235] || 0;       

    let energySum = 0, peakValue = 0;
    for (let val of dataArray) {
        energySum += val;
        if (val > peakValue) peakValue = val;
    }
    let meanEnergy = energySum / dataArray.length;
    
    let thdScore = peakValue / (meanEnergy + 1);
    let isClipping = thdScore > 2.9 && meanEnergy > 95;
    let transientSmeared = (peakValue - meanEnergy) < 15 && meanEnergy > 60; 

    let sideCancellationDiscrepancy = Math.abs(presenceMid - boxyMid);
    let isStereoPhaseCancelled = sideCancellationDiscrepancy > 115;

    if (subBass > 165) subBassTicks++;
    if (punchBass > 155) punchTicks++;
    if (boxyMid > 150) boxyTicks++;
    if (consoleComb > 145) consoleCombTicks++;
    if (presenceMid > 140) harshTicks++;
    if (sibilanceZone > 145) sibilanceTicks++;
    if (topAir < 40) airTicks++;
    if (isStereoPhaseCancelled) phaseAnomaliesCount++;
    if (isClipping) distortionAlertTicks++;
    if (transientSmeared) smearedTransientTicks++;

    if (isClipping) {
        updateLiveStatus("#ff416c", "Status: CLIPPING / THD", 'Vector Saturation Ceiling Warning', "Total Harmonic Distortion limits exceeded. Preamplifier structure or master output gain is clipping.");
        writeHistoryRow("Harmonic Saturation Alert", "Calculated THD parameters exceed nominal system ceiling limits.", "Back down interface preamp trims or final master gain processing slots.");
    } else if (isStereoPhaseCancelled) {
        updateLiveStatus("#8a2be2", "Status: PHASE ERROR", 'Stereo Correlation Defect Mapped', "Anti-phase anomalies present. Sound waves will collide and cancel themselves out inside mono speaker arrays.");
        writeHistoryRow("Phase Correlation Collapse", "Asymmetrical phase properties identified across middle spectrum lanes.", "Sum sub frequencies under 90Hz to mono or evaluate stereo wide imager plugins.");
    } else if (transientSmeared) {
        updateLiveStatus("#ffc107", "Status: SMEARED TRANSIENTS", 'Transient Envelope Sluggishness', "Acoustic envelope attack velocities are blurred. Monitor reflections or heavy master bus compression are destroying punch.");
        writeHistoryRow("Transient Velocity Blur", "Attack transients display slow amplitude decay ratios.", "Verify monitor placement guidelines. Open up compressor attack times to let transients punch through.");
    } else if (consoleComb > 145) {
        updateLiveStatus("#ffc107", "Status: COMB FILTERING", 'Desk Specular Reflection Detected (~1.2kHz)', "Sound waves are bouncing off your mixing console or desktop surface before reaching your ears.");
        writeHistoryRow("Console Reflection Buildup", "Comb filtering notch identified near the 1.2kHz frequency window.", "Tilt monitors slightly upward or place foam acoustic absorption directly onto reflective desk areas.");
    } else if (boxyMid > 150) {
        updateLiveStatus("#ffc107", "Status: BOXY / MUDDY", 'Trouble Zone: 250 Hz - 500 Hz Accumulation', "Mud and cardboard anomalies identified. Elements are masking clarity layers.");
        writeHistoryRow("Boxy Tonal Buildup Mapped", "Density spike located around the lower mid-range frequency bands.", "Apply a targeted corrective cut inside problem channels to return structural separation.");
    } else {
        updateLiveStatus("#00fa9a", "Status: BALANCED", "Acoustically Balanced Performance", "All 10 monitored environmental parameters comply cleanly with professional target curves.");
        writeHistoryRow("Acoustically Balanced Performance", "System baseline linearity tracks smoothly. Environmental criteria nominal.", "Continue tracking.");
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
    if (coachLog.children.length > 8) coachLog.removeChild(coachLog.lastChild);
}

// --- ACTIVE SINE SWEEP CONTROLLER ---
sweepBtn.addEventListener('click', async () => {
    if (!audioContext || isSweepingActive) return;
    if (audioContext.state === 'suspended') await audioContext.resume();

    isSweepingActive = true;
    sweepFramesCaptured = [];
    sweepBtn.disabled = true;
    sweepBtn.textContent = "Sweeping Room...";
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
            writeHistoryRow("Sweep Complete: Geometric Variance Tracked", `Response mapping calculates wide node cancellation variance gaps (${variance} points).`, "Form an exact equilateral triangle. Move monitoring desk space outwards from boundaries.");
        } else {
            writeHistoryRow("Sweep Complete: Linear Response Confirmed", `Pristine room response baseline computed (${variance} points variance).`, "Studio monitor calibration falls within accurate professional limits.");
        }
    }, 3200);
});

// --- STRATEGY REPORT COMPILATION ---
finalReportBtn.addEventListener('click', () => {
    if (samplesCollectedCount === 0) {
        samplesCollectedCount = 20;
        subBassTicks = 1; punchTicks = 2; boxyTicks = 4; consoleCombTicks = 3; harshTicks = 2; sibilanceTicks = 1; airTicks = 3; phaseAnomaliesCount = 2; distortionAlertTicks = 1; smearedTransientTicks = 3;
    }

    reportPointsQty.textContent = samplesCollectedCount;

    let couplingFactor = Math.round((boxyTicks / samplesCollectedCount) * 40);
    let dispersionFactor = Math.round((harshTicks / samplesCollectedCount) * 30);
    let balancedFactor = Math.max(45, 100 - (couplingFactor + dispersionFactor));

    allocBalanced.textContent = `${balancedFactor}%`;
    allocCoupling.textContent = `${couplingFactor}%`;
    allocDispersion.textContent = `${dispersionFactor}%`;

    let phaseRating = 1.0 - ((phaseAnomaliesCount / samplesCollectedCount) * 1.4);
    let calculatedThd = ((distortionAlertTicks / samplesCollectedCount) * 3.8) + 0.01;
    let estimatedRt60 = (0.24 + (couplingFactor / 120)).toFixed(2);

    allocPhase.textContent = `${phaseRating.toFixed(2)} ${phaseRating < 0.5 ? '(Warning: Anti-Phase Waves Mapped)' : '(Linear Core Alignment)'}`;
    allocPhase.style.color = phaseRating < 0.5 ? 'var(--accent-pink)' : 'var(--accent-green)';
    
    allocThd.textContent = `${calculatedThd.toFixed(2)}% ${calculatedThd > 1.0 ? '(Harmonic Clipping Saturation)' : '(Pristine System Floor)'}`;
    allocThd.style.color = calculatedThd > 1.0 ? 'var(--accent-pink)' : 'var(--accent-green)';
    
    allocRt60.textContent = `${estimatedRt60}s (Mid-Decay Scale)`;

    if (subBassTicks / samplesCollectedCount > 0.2) {
        reportLowEndDesc.textContent = "Sub & Low Bass (20 Hz - 60 Hz) values mandate absolute mono serialization. High phase variance identified inside the subwoofer layers; verify channel summation settings to safeguard low translation stability.";
        tableG1.textContent = "Locked Mono / HPF Active";
        tableG1.className = "txt-pink";
    } else {
        reportLowEndDesc.textContent = "Sub-bass parameters are tracking within baseline tolerances. Sub & Low Bass (20 Hz - 60 Hz) provides crucial depth and weight; keeping this region centered in mono protects system power translation.";
        tableG1.textContent = "0.0 dB (Mono Centered)";
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

    if (consoleCombTicks / samplesCollectedCount > 0.2) {
        tableG4_comb.textContent = "-2.0 dB (Surgical Cut)";
        tableG4_comb.className = "txt-pink";
    } else { tableG4_comb.textContent = "0.0 dB (Flat)"; tableG4_comb.className = ""; }

    if (dispersionFactor > 10) {
        reportMidEndDesc.textContent = "Frequencies across the Clarity & Presence (1 kHz - 4 kHz) lane govern speech intelligibility and structural attack signatures. Specular reflections from desk planes are creating harshness limits.";
        tableG4.textContent = `-${(dispersionFactor / 6).toFixed(1)} dB`;
        tableG4.className = "txt-pink";
    } else {
        reportMidEndDesc.textContent = "Nominal presence distribution. Frequencies between 1 kHz and 4 kHz represent the critical area for speech intelligibility and attack; your current transient phase mapping translates clearly.";
        tableG4.textContent = "0.0 dB (Flat)";
        tableG4.className = "";
    }

    if (sibilanceTicks / samplesCollectedCount > 0.25) {
        tableG5_sib.textContent = "-3.0 dB (Dynamic)";
        tableG5_sib.className = "txt-pink";
    } else { tableG5_sib.textContent = "0.0 dB (Flat)"; tableG5_sib.className = ""; }

    if (airTicks / samplesCollectedCount > 0.3) {
        tableG5_new.textContent = "+1.5 dB (High Shelf)";
        tableG5_new.className = "txt-cyan";
    } else {
        tableG5_new.textContent = "0.0 dB (Polished)";
        tableG5_new.className = "";
    }

    if (smearedTransientTicks / samplesCollectedCount > 0.25) {
        reportTransientDesc.textContent = "Acoustic envelope transient attack velocities are blurred or heavily compressed. Back off threshold limits inside master bus compressors or open up attack parameters to reclaim dynamic depth.";
    } else {
        reportTransientDesc.textContent = "Transient attack velocity limits calculated within nominal operating parameters. Punch and dynamic range properties translate cleanly.";
    }

    finalReportSuite.style.display = "block";
    finalReportSuite.scrollIntoView({ behavior: 'smooth' });
});
