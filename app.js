let audioContext, analyser, micSource, dataArray, animationId;

// UI Components
const startBtn = document.getElementById('startBtn');
const dbDisplay = document.getElementById('dbValue');
const lufsDisplay = document.getElementById('lufsVal');
const crestDisplay = document.getElementById('crestVal');
const mudDisplay = document.getElementById('mudVal');
const harshDisplay = document.getElementById('harshVal');
const coachCard = document.getElementById('coachCard');
const coachStatus = document.getElementById('coachStatus');
const coachDiag = document.getElementById('coachDiag');
const coachSugg = document.getElementById('coachSugg');
const canvas = document.getElementById('spectrumCanvas');
const canvasCtx = canvas.getContext('2d');

// Smooth & Stabilize Controls
let smoothedDb = 0;
let lastUpdateTime = 0;
const REFRESH_RATE = 3000; // Grid data recalculates cleanly every 3 seconds

startBtn.addEventListener('click', async () => {
    if (audioContext) { stopAudio(); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        initAudio(stream);
        startBtn.textContent = "Shut Down System";
        startBtn.style.borderColor = "#ff4a5a";
        startBtn.style.color = "#ff4a5a";
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
}

function analyzeAndRender(timestamp) {
    animationId = requestAnimationFrame(analyzeAndRender);
    analyser.getByteFrequencyData(dataArray);

    // Continuous fast tracking for the visual dial and analyzer graph
    let sumSquares = 0, peakValue = 0;
    for (let i = 0; i < dataArray.length; i++) {
        let val = dataArray[i];
        if (val > peakValue) peakValue = val;
        sumSquares += val * val;
    }
    let rms = Math.sqrt(sumSquares / dataArray.length);
    let rawDb = rms > 0 ? (20 * Math.log10(rms) + 25) : 0;
    
    smoothedDb = (rawDb * 0.1) + (smoothedDb * 0.9);
    dbDisplay.textContent = Math.max(0, smoothedDb).toFixed(1);
    drawSpectrum();

    // The Grid updates and analyzes variables at a slower, human-readable rate
    if (timestamp - lastUpdateTime > REFRESH_RATE) {
        processAdvancedMetrics(smoothedDb, rms, peakValue);
        lastUpdateTime = timestamp;
    }
}

function processAdvancedMetrics(currentDb, rms, peak) {
    // 1. Calculate LUFS Target Equivalent (Digital Full Scale projection)
    let rawLufs = rms > 0 ? (20 * Math.log10(rms / 255)) : -120;
    let calibratedLufs = rawLufs + 14; // Re-aligning digital roof
    lufsDisplay.textContent = calibratedLufs > -120 ? `${calibratedLufs.toFixed(1)} LUFS` : "-Inf";

    // 2. Compute Crest Factor (Dynamic Range punch score)
    let crestFactorVal = (peak - rms) / 10;
    crestDisplay.textContent = `${crestFactorVal.toFixed(1)} dB`;

    // 3. Extract Deep Frequency Allocations
    let subBass = 0, lowMids = 0, upperMids = 0, sibilance = 0;
    for (let i = 0; i < 6; i++) subBass += dataArray[i];       // 0 - 250 Hz
    for (let i = 6; i < 18; i++) lowMids += dataArray[i];      // 250 - 750 Hz
    for (let i = 45; i < 90; i++) upperMids += dataArray[i];   // 2k - 4k Hz
    for (let i = 140; i < 240; i++) sibilance += dataArray[i]; // 6k - 10k Hz

    let clarityMudRatio = (subBass + 1) / (lowMids + 1);
    mudDisplay.textContent = clarityMudRatio.toFixed(2);

    let harshnessStatus = "Balanced";
    if (sibilance / 100 > 140) { harshnessStatus = "Sibilant"; harshDisplay.style.color = "var(--accent-red)"; }
    else if (upperMids / 45 > 150) { harshnessStatus = "Brittle"; harshDisplay.style.color = "var(--accent-yellow)"; }
    else { harshDisplay.style.color = "var(--text-bright)"; }
    harshDisplay.textContent = harshnessStatus;

    // 4. Run High-Level Mastering Diagnosis
    executeMasteringDiagnosis(calibratedLufs, crestFactorVal, clarityMudRatio, harshnessStatus, currentDb);
}

function executeMasteringDiagnosis(lufs, crest, clarity, harsh, db) {
    const green = "#45f3ff", yellow = "#fbd46d", red = "#ff4a5a";

    if (db > 85) {
        updateCoach(red, "CRITICAL: SAFE EXPOSURE", 
            "The localized audio projection is too loud for prolonged analytical creation.", 
            "Action: Bring sound levels down to preserve your translation accuracy.");
    } else if (lufs > -10 && crest < 6) {
        updateCoach(red, "CRITICAL: MIX OVERCOMPRESSED", 
            `Your tracks register at a crushed ${lufs.toFixed(1)} LUFS with almost zero transient punch (${crest.toFixed(1)}dB Crest).`, 
            "Action: Back off dynamic brickwall limiters. Increase compressor attack values to reclaim musical life.");
    } else if (clarity < 0.6) {
        updateCoach(yellow, "WARNING: HEAVY LOW-MID BUILDUP", 
            "Acoustic accumulation identified in the 300Hz boxiness range. This is obscuring clean detail.", 
            "Action: Apply parametric equalization attenuation cuts across muddy audio tracks to reclaim workspace balance.");
    } else if (harsh === "Sibilant") {
        updateCoach(yellow, "WARNING: DE-ESSER REQUIRED", 
            "Sharp sibilant components are spiking uncontrollably within the 6kHz - 10kHz window.", 
            "Action: Engage a precision dynamic de-esser to smoothly round out sharp vocal components or drum cymbals.");
    } else if (lufs < -20 && db > 40) {
        updateCoach(yellow, "PRO ADVICE: INSUFFICIENT LOUDNESS", 
            `Your perceived signal sits safely at ${lufs.toFixed(1)} LUFS, which is far too quiet for general audio distribution standards.`, 
            "Action: Cleanly maximize gain into your master bus system. Target roughly -14 LUFS to match standard streaming platform curves.");
    } else {
        updateCoach(green, "PROFESSIONAL MASTER PROFILE", 
            "Excellent spatial, frequency, and dynamic calibration observed inside the audio data window.", 
            "Action: Your mix profile holds commercial balance specifications. Safe to bounce files for external distribution.");
    }
}

function updateCoach(color, status, diag, sugg) {
    coachCard.style.borderColor = color;
    coachStatus.textContent = status;
    coachStatus.style.color = color;
    coachDiag.textContent = diag;
    coachSugg.textContent = sugg;
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
