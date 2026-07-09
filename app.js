let audioContext;
let analyser;
let micSource;
let dataArray;
let animationId;

// UI Targets
const startBtn = document.getElementById('startBtn');
const dbDisplay = document.getElementById('dbValue');
const coachCard = document.getElementById('coachCard');
const coachStatus = document.getElementById('coachStatus');
const coachDiag = document.getElementById('coachDiag');
const coachSugg = document.getElementById('coachSugg');
const canvas = document.getElementById('spectrumCanvas');
const canvasCtx = canvas.getContext('2d');

// --- SMOOTHING & TIMING STATE VARIABLES ---
let smoothedDb = 0;
const SMOOTHING_FACTOR = 0.08; // Lower = slower, smoother text numbers
let lastEvaluationTime = 0;
const EVALUATION_INTERVAL = 2500; // Only update coach advice every 2.5 seconds

startBtn.addEventListener('click', async () => {
    if (audioContext) {
        stopAudio();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        initAudio(stream);
        startBtn.textContent = "Stop Measurement";
        startBtn.style.backgroundColor = "#ff1744";
    } catch (err) {
        alert("Microphone access denied or unsupported on this device.");
        console.error(err);
    }
});

function initAudio(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024; // Increased resolution for better low-mid detection
    
    micSource = audioContext.createMediaStreamSource(stream);
    micSource.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    analyzeAndRender(0);
}

function stopAudio() {
    cancelAnimationFrame(animationId);
    if (micSource) micSource.disconnect();
    if (audioContext) audioContext.close();
    audioContext = null;
    startBtn.textContent = "Start Measurement";
    startBtn.style.backgroundColor = "#3f51b5";
    dbDisplay.textContent = "00.0";
    dbDisplay.style.color = "var(--accent-green)";
}

function analyzeAndRender(timestamp) {
    animationId = requestAnimationFrame(analyzeAndRender);
    
    analyser.getByteFrequencyData(dataArray);
    
    // 1. Calculate Peak vs RMS values
    let sumSquares = 0;
    let peakValue = 0;
    for (let i = 0; i < dataArray.length; i++) {
        let val = dataArray[i];
        if (val > peakValue) peakValue = val;
        sumSquares += val * val;
    }
    let rms = Math.sqrt(sumSquares / dataArray.length);
    
    // 2. Convert to Calibrated Decibel Values
    let rawDb = rms > 0 ? (20 * Math.log10(rms) + 25) : 0;
    if (rawDb < 0) rawDb = 0;
    
    // Apply Exponential Moving Average to prevent screen text flickering
    smoothedDb = (rawDb * SMOOTHING_FACTOR) + (smoothedDb * (1 - SMOOTHING_FACTOR));
    dbDisplay.textContent = smoothedDb.toFixed(1);
    
    // 3. Dynamic Range Calculation (Crest Factor approximation)
    let crestFactor = peakValue - rms; 

    // 4. Detailed Spectral Frequency Bin Mapping
    let subBass = 0;     // Bins < 80Hz
    let lowMids = 0;      // Boxy zone 250Hz - 500Hz
    let harshPresence = 0;// Piercing zone 2kHz - 4kHz
    let sibilance = 0;    // Harsh Highs 6kHz - 10kHz

    // Approximate mapping for a 1024 FFT window at 44.1kHz sample rate
    for (let i = 0; i < 4; i++) subBass += dataArray[i];
    for (let i = 12; i < 24; i++) lowMids += dataArray[i];
    for (let i = 90; i < 180; i++) harshPresence += dataArray[i];
    for (let i = 270; i < 450; i++) sibilance += dataArray[i];

    // Normalize averages
    avgSub = subBass / 4;
    avgLowMids = lowMids / 12;
    avgHarsh = harshPresence / 90;
    avgSibilance = sibilance / 180;

    // 5. Throttled Evaluation System (Stays locked on screen for readability)
    if (timestamp - lastEvaluationTime > EVALUATION_INTERVAL) {
        evaluateEnvironment(smoothedDb, crestFactor, avgSub, avgLowMids, avgHarsh, avgSibilance);
        lastEvaluationTime = timestamp;
    }
    
    drawSpectrum();
}

function evaluateEnvironment(db, crest, sub, boxy, harsh, sibilant) {
    const green = "#00e676";
    const yellow = "#ffd600";
    const red = "#ff1744";

    // Tier 1: Ear Protection 
    if (db > 85) {
        updateCoach(red, "CRITICAL: FATIGUE WARNING", 
            `Volume is tracking at ${db.toFixed(1)} dB. Transient hearing shift and ear fatigue will distort your leveling judgments.`, 
            "Action: Lower monitors by 6dB immediately. Reverb.com advice: Never mix structural elements at high sound pressures.");
        return;
    }

    // Tier 2: Dynamic Compression Evaluation
    if (db > 45 && crest < 15) {
        updateCoach(yellow, "CRITICAL: OVER-COMPRESSED", 
            "Your audio energy lacks transient range. Sound wave peaks are crushed down flat.", 
            "Action: Turn up the attack time or back off the threshold on your master bus compressor to let the transients punch through.");
        return;
    }

    // Tier 3: Low Mid Mud ("The Boxy Zone")
    if (boxy > 150 && boxy > (harsh * 1.4)) {
        updateCoach(yellow, "WARNING: BOXY LOW-MIDS", 
            "Sustained acoustic accumulation noted between 250Hz - 500Hz. This completely muddies instruments.", 
            "Action: Apply a targeted parametric EQ dip across muddy audio signals. Clean your mix workspace up so lead melodies can breathe.");
        return;
    }

    // Tier 4: High End Piercing / Sibilance
    if (sibilant > 130 && sibilant > harsh) {
        updateCoach(yellow, "WARNING: HIGH END SIBILANCE", 
            "Uncomfortable sibilant buildup inside the 6kHz - 10kHz window. Your hi-hats or vocal tracks are overly piercing.", 
            "Action: Engage a dedicated De-Esser plugin targeting the problem track frequencies or reduce high-shelf equalization filters.");
        return;
    }

    // Balanced Room Profile 
    updateCoach(green, "PROFESSIONAL SWEET SPOT", 
        "Dynamic ranges, harmonic profiles, and spectral acoustics are clean and structurally solid.", 
        "Action: Excellent environment balance. Decisions made here will cleanly translate out to consumer speakers.");
}

function updateCoach(color, status, diagnosis, suggestion) {
    coachCard.style.borderColor = color;
    coachStatus.textContent = status;
    coachStatus.style.color = color;
    dbDisplay.style.color = color;
    coachDiag.textContent = diagnosis;
    coachSugg.textContent = suggestion;
}

function drawSpectrum() {
    const width = canvas.width;
    const height = canvas.height;
    canvasCtx.clearRect(0, 0, width, height);
    
    const barWidth = (width / dataArray.length) * 2;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2.2;
        canvasCtx.fillStyle = `rgb(${barHeight + 90}, 60, 240)`;
        canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
    }
}
