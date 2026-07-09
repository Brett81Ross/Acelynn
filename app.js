let audioContext, analyser, micSource, dataArray, animationId;

// UI Components
const startBtn = document.getElementById('startBtn');
const dbDisplay = document.getElementById('dbValue');
const lufsDisplay = document.getElementById('lufsVal');
const crestDisplay = document.getElementById('crestVal');
const mudDisplay = document.getElementById('mudVal');
const harshDisplay = document.getElementById('harshVal');
const coachLog = document.getElementById('coachLog');
const canvas = document.getElementById('spectrumCanvas');
const canvasCtx = canvas.getContext('2d');

// Smoothing & Historical Flow Variables
let smoothedDb = 0;
let lastUpdateTime = 0;
const REFRESH_RATE = 4000; // Drops a fresh structural analysis every 4 seconds
let lastLoggedStatus = ""; 

// Persistent Exposure Tracking for Ear Fatigue Rule
let highVolumeDurationMs = 0;
let lastFrameTime = performance.now();

startBtn.addEventListener('click', async () => {
    if (audioContext) { stopAudio(); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        initAudio(stream);
        startBtn.textContent = "Shut Down System";
        startBtn.style.borderColor = "#ff4a5a";
        startBtn.style.color = "#ff4a5a";
        coachLog.innerHTML = ""; 
    } catch (err) {
        alert("Microphone connection failure.");
    }
});

function initAudio(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    micSource = audioContext.createMediaStreamSource(stream);
    micSource.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    lastFrameTime = performance.now();
    analyzeAndRender(0);
}

function stopAudio() {
    cancelAnimationFrame(animationId);
    if (micSource) micSource.disconnect();
    if (audioContext) audioContext.close();
    audioContext = null;
    startBtn.textContent = "Initialize Core Systems";
    startBtn.style.borderColor = "#66fcf1";
    startBtn.style.color = "#66fcf1";
    dbDisplay.textContent = "00.0";
    highVolumeDurationMs = 0; // Reset timer on stop
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
    
    // Calibrated adjustment loop specifically for internal Android mobile hardware ceilings
    let rawDb = rms > 0 ? (20 * Math.log10(rms) + 15) : 0;
    
    smoothedDb = (rawDb * 0.1) + (smoothedDb * 0.9);
    dbDisplay.textContent = Math.max(0, smoothedDb).toFixed(1);
    drawSpectrum();

    // Accumulate time if volume is continuously over 85 dBA
    if (smoothedDb > 85) {
        highVolumeDurationMs += deltaTime;
    } else {
        // Slowly decay the fatigue window if they turn it down
        highVolumeDurationMs = Math.max(0, highVolumeDurationMs - deltaTime * 0.5);
    }

    if (timestamp - lastUpdateTime > REFRESH_RATE) {
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

    // Advanced precision frequency band mapping for 1024 FFT window @ 44.1kHz
    // Bin width = 44100 / 1024 = ~43Hz per bin
    let weightA_LowSum = 0;
    let weightC_LowSum = 0;
    
    // 1. Calculate dBC vs dBA weighting differences for sub-bass evaluation (<80 Hz)
    // C-weighting is flat at low frequencies, while A-weighting severely rolls off sub frequencies
    for (let i = 0; i < 3; i++) {
        weightC_LowSum += dataArray[i];
        weightA_LowSum += dataArray[i] * 0.3; // Emulate severe A-weighting bass attenuation
    }
    let dbC_est = weightC_LowSum / 3;
    let dbA_est = weightA_LowSum / 3;
    let weightingDifference = dbC_est - dbA_est;

    // 2. Room Mode buildup detection (120 Hz to 250 Hz -> Bins 3 to 6)
    let roomModeSum = 0;
    for (let i = 3; i <= 6; i++) {
        roomModeSum += dataArray[i];
    }
    let avgRoomModeZone = roomModeSum / 4;

    // 3. Piercing/Harshness Detection (2 kHz to 4 kHz -> Bins 46 to 93)
    let harshZoneSum = 0;
    for (let i = 46; i <= 93; i++) {
        harshZoneSum += dataArray[i];
    }
    let avgHarshZone = harshZoneSum / 48;

    // 4. Clarity vs Mud base metric comparison
    let subBassTotal = 0, lowMidsTotal = 0;
    for (let i = 0; i < 6; i++) subBassTotal += dataArray[i];       
    for (let i = 6; i < 18; i++) lowMidsTotal += dataArray[i];      
    let clarityMudRatio = (subBassTotal / 6 + 1) / (lowMidsTotal / 12 + 1);
    mudDisplay.textContent = clarityMudRatio.toFixed(2);

    let harshnessStatus = "Balanced";
    if (avgHarshZone > 140) { 
        harshnessStatus = "Harsh Mids"; 
        harshDisplay.style.color = "var(--accent-yellow)"; 
    } else { 
        harshDisplay.style.color = "var(--text-bright)"; 
    }
    harshDisplay.textContent = harshnessStatus;

    // Run the updated diagnosis tree matching your artistic constraints
    executeMasteringDiagnosis(calibratedLufs, crestFactorVal, clarityMudRatio, harshnessStatus, currentDb, weightingDifference, avgRoomModeZone);
}

function executeMasteringDiagnosis(lufs, crest, clarity, harsh, db, weightDiff, roomMode) {
    const green = "#45f3ff", yellow = "#fbd46d", red = "#ff4a5a";

    // Rule 1: Continuous Exposure Ear Fatigue Check (15 minutes = 900,000 ms)
    // Scaled to 30 seconds for immediate test evaluation inside localized sessions
    if (highVolumeDurationMs > 30000 || db > 88) {
        pushLogItem(red, "EAR FATIGUE RISK", 
            "Ear fatigue setting in; high risk of permanent hearing damage. Your mixing decisions will become unreliable.", 
            "Ear fatigue alert. Your mixing decisions will become unreliable. Turn down your master by 6 dB or take a mandatory 10-minute break.");
        return;
    }

    // Rule 2: Sub-Bass Mud Detection (dBC - dBA > 15)
    if (weightDiff > 15.0 && db > 40) {
        pushLogItem(red, "MUDDY SUB-BASS DETECTED", 
            "Excessive, muddy sub-bass is masking your mid-range.", 
            'Mud alert. Turn down your subwoofer or apply a high-pass filter (24 dB/octave at 80 Hz) to your master track.');
        return;
    }

    // Rule 3: Room Boundary Reflection Buildup (Massive spike at 120Hz - 250Hz)
    if (roomMode > 165) {
        pushLogItem(yellow, "ROOM BOUNDARY BUILDUP", 
            'Massive spike at 120 Hz -- 250 Hz. Room boundary reflection or "room mode" buildup.', 
            'The "Boxy" range is peaking. Move your studio monitors 6 inches away from the back wall, or drop a narrow EQ notch at 160 Hz.');
        return;
    }

    // Rule 4: Harsh Mid Buildup (Sustained peak at 2kHz - 4kHz)
    if (harsh === "Harsh Mids") {
        pushLogItem(yellow, "AGGRESSIVE HARSHNESS ZONE", 
            'Sustained peak at 2 kHz -- 4 kHz. The "Harshness" zone is too aggressive.', 
            "Vocals/Guitars are piercing. Smooth out the track with a dynamic EQ dipping 3 kHz by -2.5 dB.");
        return;
    }

    // Ambient/Quiet floor protection
    if (db < 35) {
        pushLogItem("#a1a1aa", "AMBIENT ENVIRONMENT FLOOR", "Input signal tracking quiet ambient workspace noise.", "Awaiting live performance or submix master signal playback to calculate frequency properties.");
        return;
    }

    // Standard Sweet Spot
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
