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

    if (timestamp - lastUpdateTime > REFRESH_RATE) {
        processAdvancedMetrics(smoothedDb, rms, peakValue);
        lastUpdateTime = timestamp;
    }
}

function processAdvancedMetrics(currentDb, rms, peak) {
    // Re-mapped digital translation algorithms to prevent permanent +1.1 saturation 
    let rawLufs = rms > 0 ? (20 * Math.log10(rms / 255)) : -120;
    let calibratedLufs = Math.min(-1.0, rawLufs + 8.0); 
    lufsDisplay.textContent = currentDb > 25 ? `${calibratedLufs.toFixed(1)} LUFS` : "-Inf";

    let crestFactorVal = rms > 0 ? ((peak - rms) / 12) : 0;
    crestDisplay.textContent = `${crestFactorVal.toFixed(1)} dB`;

    // Advanced segment bin indexing
    let subBass = 0, lowMids = 0, upperMids = 0, sibilance = 0;
    for (let i = 0; i < 4; i++) subBass += dataArray[i];       
    for (let i = 5; i < 20; i++) lowMids += dataArray[i];      
    for (let i = 45; i < 90; i++) upperMids += dataArray[i];   
    for (let i = 140; i < 240; i++) sibilance += dataArray[i]; 

    // Normalizing ranges cleanly 
    let avgSub = subBass / 4;
    let avgLowMids = lowMids / 15;
    let avgHarsh = upperMids / 45;
    let avgSibilant = sibilance / 100;

    let clarityMudRatio = (avgSub + 1) / (avgLowMids + 1);
    mudDisplay.textContent = clarityMudRatio.toFixed(2);

    let harshnessStatus = "Balanced";
    if (avgSibilant > 130 && avgSibilant > avgHarsh) { harshnessStatus = "Sibilant"; harshDisplay.style.color = "var(--accent-red)"; }
    else if (avgHarsh > 140) { harshnessStatus = "Brittle"; harshDisplay.style.color = "var(--accent-yellow)"; }
    else { harshDisplay.style.color = "var(--text-bright)"; }
    harshDisplay.textContent = harshnessStatus;

    executeMasteringDiagnosis(calibratedLufs, crestFactorVal, clarityMudRatio, harshnessStatus, currentDb, avgSub, avgLowMids);
}

function executeMasteringDiagnosis(lufs, crest, clarity, harsh, db, sub, mud) {
    const green = "#45f3ff", yellow = "#fbd46d", red = "#ff4a5a";

    // State 1: Silence / System Ambient Noise floor floor tracking
    if (db < 35) {
        pushLogItem("#a1a1aa", "AMBIENT ROOM FLOOR", "Input signal tracking quiet ambient environment baseline noise.", "Ready for signal input. Play audio tracks or perform mic checks to start monitoring.");
        return;
    }

    // State 2: High Level Hearing Protection
    if (db > 82) {
        pushLogItem(red, "FATIGUE CEILING WARNING", `Acoustic levels peaking near safe thresholds (${db.toFixed(1)} dB).`, "Action Required: Turn down monitor volumes down to safeguard acoustic evaluation precision.");
        return;
    }

    // State 3: Brickwall Clipping / Flat Transients
    if (lufs > -9.0 && crest < 5.0) {
        pushLogItem(red, "MIX OVERCOMPRESSED", `Signal is heavily limited (${lufs.toFixed(1)} LUFS) with minimal kinetic punch.`, "Action: Ease back dynamic compression thresholds. Open attack structures on main submix buses.");
        return;
    }

    // State 4: Low Frequency Mud (Bass Buildup)
    if (sub > 160 && clarity > 2.2) {
        pushLogItem(yellow, "SUB-BASS OVERLOAD", "Massive low end accumulation found pushing beneath the 80Hz line.", "Action: Apply steep high-pass filtering cuts to track groupings that do not require low extension elements.");
        return;
    }

    // State 5: Boxy Room / Muddy Lower Mid Range 
    if (clarity < 0.55) {
        pushLogItem(yellow, "BOXY LOW-MIDS", "Acoustic density buildup found cluttering your 250Hz - 500Hz workspace zone.", "Action: Attenuate target elements using a narrow parametric notch to recover harmonic separation.");
        return;
    }

    // State 6: Brittle Upper Presence Frequencies
    if (harsh === "Brittle") {
        pushLogItem(yellow, "BRITTLE UPPER MIDS", "Harmonic sharpness accumulating within the 2kHz - 4kHz window.", "Action: Apply soft dynamic equalization dips across lead synth accents or primary vocal lines.");
        return;
    }

    // State 7: Sharp Sibilant Peaks
    if (harsh === "Sibilant") {
        pushLogItem(yellow, "HARSH SIBILANCE DETECTED", "Piercing energy bursts identified within the 6kHz - 10kHz window.", "Action: Engage high shelf balancing plugins or split-band de-essers directly across active tracks.");
        return;
    }

    // State 8: Insufficient Master Volume Floor
    if (lufs < -19.0) {
        pushLogItem(yellow, "INSUFFICIENT PRODUCTION LOUDNESS", `Mix parameters register at a quiet ${lufs.toFixed(1)} LUFS target curve.`, "Action: Push clean structural gain towards the limiter stage to align with streaming specifications (-14 LUFS).");
        return;
    }

    // State 9: Professional sweet spot 
    pushLogItem(green, "MASTER SWEET SPOT", "Dynamic ranges and frequency properties match commercial target profiles.", "Acoustic distribution is balanced across all monitored vectors. Excellent monitoring environment configuration.");
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
