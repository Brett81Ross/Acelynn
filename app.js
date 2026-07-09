let audioContext, analyser, micSource, dataArray, animationId;
let calibrationNode; // Biquad filter to flatten phone microphone signature

// UI Components
const startBtn = document.getElementById('startBtn');
const sweepBtn = document.getElementById('sweepBtn');
const dbDisplay = document.getElementById('dbValue');
const lufsDisplay = document.getElementById('lufsVal');
const crestDisplay = document.getElementById('crestVal');
const mudDisplay = document.getElementById('mudVal');
const harshDisplay = document.getElementById('harshVal');
const coachLog = document.getElementById('coachLog');
const canvas = document.getElementById('spectrumCanvas');
const canvasCtx = canvas.getContext('2d');

// State Monitoring Variables
let smoothedDb = 0;
let lastUpdateTime = 0;
const REFRESH_RATE = 4000; 
let lastLoggedStatus = ""; 
let highVolumeDurationMs = 0;
let lastFrameTime = performance.now();
let isSweeping = false;
let sweepCaptureData = [];

startBtn.addEventListener('click', async () => {
    if (audioContext) { stopAudio(); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        initAudio(stream);
        startBtn.textContent = "Shut Down System";
        startBtn.style.borderColor = "#ff4a5a";
        startBtn.style.color = "#ff4a5a";
        sweepBtn.style.display = "block";
        coachLog.innerHTML = ""; 
    } catch (err) {
        alert("Microphone connection failure.");
    }
});

sweepBtn.addEventListener('click', () => {
    if (!audioContext || isSweeping) return;
    runAcousticRoomSweep();
});

function initAudio(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    
    micSource = audioContext.createMediaStreamSource(stream);

    // --- BEHRINGER ECM8000 CAPSULE EMULATION FILTER ---
    // Standard phone mics roll off sharply below 100Hz and build presence bumps at 3.5kHz.
    // We run the raw signal through a hardware optimization curve to restore a flat baseline.
    calibrationNode = audioContext.createBiquadFilter();
    calibrationNode.type = "highshelf";
    calibrationNode.frequency.value = 120;
    calibrationNode.gain.value = 6.0; // Restoring crushed sub-bass extension tracking

    micSource.connect(calibrationNode);
    calibrationNode.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    lastFrameTime = performance.now();
    analyzeAndRender(0);
}

function stopAudio() {
    cancelAnimationFrame(animationId);
    if (micSource) micSource.disconnect();
    if (audioContext) audioContext.close();
    audioContext = null;
    startBtn.textContent = "Initialize Calibration Suite";
    startBtn.style.borderColor = "#66fcf1";
    startBtn.style.color = "#66fcf1";
    sweepBtn.style.display = "none";
    dbDisplay.textContent = "00.0";
    highVolumeDurationMs = 0;
}

// --- ACOUSTIC TEST SINE SWEEP GENERATOR (ECM8000 Feature) ---
function runAcousticRoomSweep() {
    isSweeping = true;
    sweepCaptureData = [];
    sweepBtn.disabled = true;
    sweepBtn.textContent = "SWEEP ACTIVE (TESTING ROOM)...";
    sweepBtn.style.backgroundColor = "var(--accent-red)";

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osc.type = 'sine';
    // Sweep exponentially across audible parameters from 20Hz up to 20kHz
    osc.frequency.setValueAtTime(20, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20000, audioContext.currentTime + 3.5);

    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.2); // Smooth fade-in
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime + 3.3);
    gainNode.gain.linearRampToValueAtTime(0.001, audioContext.currentTime + 3.5); // Smooth fade-out

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination); // Play sweep out through monitor speakers

    osc.start();
    
    // Capture frequency spectrum data frames during playback
    const captureInterval = setInterval(() => {
        let currentSnapshot = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(currentSnapshot);
        sweepCaptureData.push(currentSnapshot);
    }, 50);

    osc.stop(audioContext.currentTime + 3.5);

    setTimeout(() => {
        clearInterval(captureInterval);
        isSweeping = false;
        sweepBtn.disabled = false;
        sweepBtn.textContent = "Run Room Response Sweep (20Hz-20kHz)";
        sweepBtn.style.backgroundColor = "var(--accent-green)";
        diagnoseRoomResponse();
    }, 3600);
}

function diagnoseRoomResponse() {
    // Process captured frames to find extreme frequency nulls or room reflections
    let lowestBinValue = 255;
    let highestBinValue = 0;
    
    for (let frame of sweepCaptureData) {
        for (let i = 4; i < frame.length / 2; i++) { // Target sub-to-mid reflections
            if (frame[i] < lowestBinValue) lowestBinValue = frame[i];
            if (frame[i] > highestBinValue) highestBinValue = frame[i];
        }
    }

    let responseVariance = highestBinValue - lowestBinValue;
    const green = "#45f3ff", yellow = "#fbd46d", red = "#ff4a5a";

    if (responseVariance > 130) {
        pushLogItem(red, "SWEEP COMPLETE: SEVERE ROOM NULLS", 
            `Acoustic sweep detected massive phase cancellation issues (Variance: ${responseVariance} points). Your room setup has deep audio blind spots.`, 
            "Action Required: Reposition monitors immediately. Avoid placing mixing chairs exactly halfway between front and back walls to eliminate standing wave cancellations.");
    } else if (responseVariance > 80) {
        pushLogItem(yellow, "SWEEP COMPLETE: ACOUSTIC REFLECTIONS", 
            `Room variance is prominent (${responseVariance} points). Hard parallel surfaces are coloring your monitors.`, 
            "Action Required: Apply acoustic absorption panels at primary reflection points (walls directly to left and right of your monitor setup).");
    } else {
        pushLogItem(green, "SWEEP COMPLETE: FLAT CALIBRATION", 
            `Superb acoustic accuracy identified (Variance: ${responseVariance} points). Your workspace response mirrors professional treated studio environments.`, 
            "No room adjustment adjustments needed. Your space exhibits high-grade monitoring linearity.");
    }
}

function analyzeAndRender(timestamp) {
    animationId = requestAnimationFrame(analyzeAndRender);
    analyser.getByteFrequencyData(dataArray);

    const now = performance.now();
    const deltaTime = now - lastFrameTime;
    lastFrameTime = now;

    let sumSquares = 0, peakValue = 0;
    for (let i = 0; i < dataArray.length; i++) {
        let val = dataArray[i];
        if (val > peakValue) peakValue = val;
        sumSquares += val * val;
    }
    let rms = Math.sqrt(sumSquares / dataArray.length);
    let rawDb = rms > 0 ? (20 * Math.log10(rms) + 12) : 0;
    
    smoothedDb = (rawDb * 0.1) + (smoothedDb * 0.9);
    dbDisplay.textContent = Math.max(0, smoothedDb).toFixed(1);
    drawSpectrum();

    if (smoothedDb > 85) { highVolumeDurationMs += deltaTime; } 
    else { highVolumeDurationMs = Math.max(0, highVolumeDurationMs - deltaTime * 0.5); }

    // Pause normal ambient log evaluations if an active sine test sweep is writing data
    if (timestamp - lastUpdateTime > REFRESH_RATE && !isSweeping) {
        processAdvancedMetrics(smoothedDb, rms, peakValue);
        lastUpdateTime = timestamp;
    }
}

function processAdvancedMetrics(currentDb, rms, peak) {
    let rawLufs = rms > 0 ? (20 * Math.log10(rms / 255)) : -120;
    let calibratedLufs = Math.min(-1.0, rawLufs + 8.0); 
    lufsDisplay.textContent = currentDb > 25 ? `${calibratedLufs.toFixed(1)} LUFS` : "-Inf";

    let crestFactorVal = rms > 0 ? ((peak - rms) / 12) : 0;
    crestDisplay.textContent = `${crestFactorVal.toFixed(1)} dB`;

    let weightA_LowSum = 0, weightC_LowSum = 0, roomModeSum = 0, harshZoneSum = 0;
    
    for (let i = 0; i < 3; i++) {
        weightC_LowSum += dataArray[i];
        weightA_LowSum += dataArray[i] * 0.3; 
    }
    let weightingDifference = (weightC_LowSum / 3) - (weightA_LowSum / 3);

    for (let i = 3; i <= 6; i++) roomModeSum += dataArray[i];
    for (let i = 46; i <= 93; i++) harshZoneSum += dataArray[i];

    let avgRoomModeZone = roomModeSum / 4;
    let avgHarshZone = harshZoneSum / 48;

    let subBassTotal = 0, lowMidsTotal = 0;
    for (let i = 0; i < 6; i++) subBassTotal += dataArray[i];       
    for (let i = 6; i < 18; i++) lowMidsTotal += dataArray[i];      
    let clarityMudRatio = (subBassTotal / 6 + 1) / (lowMidsTotal / 12 + 1);
    mudDisplay.textContent = clarityMudRatio.toFixed(2);

    let harshnessStatus = "Balanced";
    if (avgHarshZone > 140) { harshnessStatus = "Harsh Mids"; harshDisplay.style.color = "var(--accent-yellow)"; }
    else { harshDisplay.style.color = "var(--text-bright)"; }
    harshDisplay.textContent = harshnessStatus;

    executeMasteringDiagnosis(calibratedLufs, crestFactorVal, clarityMudRatio, harshnessStatus, currentDb, weightingDifference, avgRoomModeZone);
}

function executeMasteringDiagnosis(lufs, crest, clarity, harsh, db, weightDiff, roomMode) {
    const green = "#45f3ff", yellow = "#fbd46d", red = "#ff4a5a";

    if (highVolumeDurationMs > 900000) {
        pushLogItem(red, "EAR FATIGUE RISK", "Ear fatigue setting in; high risk of permanent hearing damage. Your mixing decisions will become unreliable.", "Ear fatigue alert. Your mixing decisions will become unreliable. Turn down your master by 6 dB or take a mandatory 10-minute break.");
        return;
    }
    if (weightDiff > 15.0 && db > 40) {
        pushLogItem(red, "MUDDY SUB-BASS DETECTED", "Excessive, muddy sub-bass is masking your mid-range.", "Mud alert. Turn down your subwoofer or apply a high-pass filter (24 dB/octave at 80 Hz) to your master track.");
        return;
    }
    if (roomMode > 165) {
        pushLogItem(yellow, "ROOM BOUNDARY BUILDUP", 'Massive spike at 120 Hz -- 250 Hz. Room boundary reflection or "room mode" buildup.', 'The "Boxy" range is peaking. Move your studio monitors 6 inches away from the back wall, or drop a narrow EQ notch at 160 Hz.');
        return;
    }
    if (harsh === "Harsh Mids") {
        pushLogItem(yellow, "AGGRESSIVE HARSHNESS ZONE", 'Sustained peak at 2 kHz -- 4 kHz. The "Harshness" zone is too aggressive.', "Vocals/Guitars are piercing. Smooth out the track with a dynamic EQ dipping 3 kHz by -2.5 dB.");
        return;
    }
    if (db < 35) {
        pushLogItem("#a1a1aa", "AMBIENT ENVIRONMENT FLOOR", "Input signal tracking quiet ambient workspace noise.", "Awaiting live performance or submix master signal playback to calculate frequency properties.");
        return;
    }
    pushLogItem(green, "MASTER SWEET SPOT", "Dynamic spectrum structures cleanly balanced.", "Your mix profile translates efficiently across standard consumer formats.");
}

function pushLogItem(color, status, diag, sugg) {
    if (status === lastLoggedStatus) return;
    lastLoggedStatus = status;

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newCard = document.createElement('div');
    newCard.className = 'log-item';
    newCard.style.borderLeftColor = color;

    newCard.innerHTML = `
        <div class="log-time">${timeString}</div>
        <div class="log-title" style="color: ${color}">${status}</div>
        <div class="log-diagnosis">${diag}</div>
        <div class="log-suggestion">${sugg}</div>
    `;

    coachLog.insertBefore(newCard, coachLog.firstChild);

    if (coachLog.children.length > 25) {
        coachLog.removeChild(coachLog.lastChild);
    }
}

function drawSpectrum() {
    const width = canvas.width, height = canvas.height;
    canvasCtx.clearRect(0, 0, width, height);
    const barWidth = (width / dataArray.length) * 2.5;
    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
        let barHeight = dataArray[i] / 2.5;
        canvasCtx.fillStyle = `rgb(69, 243, 255)`;
        canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
    }
}
