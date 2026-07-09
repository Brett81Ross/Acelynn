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
const REFRESH_RATE = 4000; // Analyzes sound and drops a new historical card every 4 seconds
let lastLoggedStatus = ""; // Prevents flooding identical notes back-to-back

startBtn.addEventListener('click', async () => {
    if (audioContext) { stopAudio(); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        initAudio(stream);
        startBtn.textContent = "Shut Down System";
        startBtn.style.borderColor = "#ff4a5a";
        startBtn.style.color = "#ff4a5a";
        coachLog.innerHTML = ""; // Clear initial startup placeholder
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
    let rawDb = rms > 0 ? (20 * Math.log10(rms) + 25) : 0;
    
    smoothedDb = (rawDb * 0.1) + (smoothedDb * 0.9);
    dbDisplay.textContent = Math.max(0, smoothedDb).toFixed(1);
    drawSpectrum();

    if (timestamp - lastUpdateTime > REFRESH_RATE) {
        processAdvancedMetrics(smoothedDb, rms, peakValue);
        lastUpdateTime = timestamp;
    }
}

function processAdvancedMetrics(currentDb, rms, peak) {
    let rawLufs = rms > 0 ? (20 * Math.log10(rms / 255)) : -120;
    let calibratedLufs = rawLufs + 14;
    lufsDisplay.textContent = calibratedLufs > -120 ? `${calibratedLufs.toFixed(1)} LUFS` : "-Inf";

    let crestFactorVal = (peak - rms) / 10;
    crestDisplay.textContent = `${crestFactorVal.toFixed(1)} dB`;

    let subBass = 0, lowMids = 0, upperMids = 0, sibilance = 0;
    for (let i = 0; i < 6; i++) subBass += dataArray[i];       
    for (let i = 6; i < 18; i++) lowMids += dataArray[i];      
    for (let i = 45; i < 90; i++) upperMids += dataArray[i];   
    for (let i = 140; i < 240; i++) sibilance += dataArray[i]; 

    let clarityMudRatio = (subBass + 1) / (lowMids + 1);
    mudDisplay.textContent = clarityMudRatio.toFixed(2);

    let harshnessStatus = "Balanced";
    if (sibilance / 100 > 140) { harshnessStatus = "Sibilant"; harshDisplay.style.color = "var(--accent-red)"; }
    else if (upperMids / 45 > 150) { harshnessStatus = "Brittle"; harshDisplay.style.color = "var(--accent-yellow)"; }
    else { harshDisplay.style.color = "var(--text-bright)"; }
    harshDisplay.textContent = harshnessStatus;

    executeMasteringDiagnosis(calibratedLufs, crestFactorVal, clarityMudRatio, harshnessStatus, currentDb);
}

function executeMasteringDiagnosis(lufs, crest, clarity, harsh, db) {
    const green = "#45f3ff", yellow = "#fbd46d", red = "#ff4a5a";

    if (db > 85) {
        pushLogItem(red, "FATIGUE WARNING", `Volume tracking high at ${db.toFixed(1)} dB SPL.`, "Lower master monitors to protect analytical accuracy.");
    } else if (lufs > -10 && crest < 6) {
        pushLogItem(red, "MIX OVERCOMPRESSED", `Crushed energy signature at ${lufs.toFixed(1)} LUFS.`, "Back off dynamic limiters and widen compressor attack spaces.");
    } else if (clarity < 0.6) {
        pushLogItem(yellow, "BOXY LOW-MIDS", "Acoustic accumulation identified near the 300Hz line.", "Drop narrow parametric cuts across non-bass instrument groupings.");
    } else if (harsh === "Sibilant") {
        pushLogItem(yellow, "DE-ESSER REQUIRED", "Sibilant components spiking between 6kHz - 10kHz.", "Engage a dynamic split de-esser across problem vocal paths.");
    } else if (lufs < -20 && db > 40) {
        pushLogItem(yellow, "INSUFFICIENT LOUDNESS", `Signal measuring quiet at ${lufs.toFixed(1)} LUFS.`, "Increase structural gain towards your final output targets.");
    } else {
        pushLogItem(green, "MASTER Sweet Spot", "Dynamic spectrum structures cleanly balanced.", "Your mix profile translates efficiently across standard consumer formats.");
    }
}

// Builds and prepends the new log card items to the timeline feed
function pushLogItem(color, status, diag, sugg) {
    // Prevent flooding the timeline with identical consecutive readings
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

    // Insert at the absolute top of the container
    coachLog.insertBefore(newCard, coachLog.firstChild);

    // Keep memory clean: remove extremely old metrics when log exceeds 25 historical cards
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
