let audioContext;
let analyser;
let micSource;
let dataArray;
let animationId;

const startBtn = document.getElementById('startBtn');
const dbDisplay = document.getElementById('dbValue');
const coachCard = document.getElementById('coachCard');
const coachStatus = document.getElementById('coachStatus');
const coachDiag = document.getElementById('coachDiag');
const coachSugg = document.getElementById('coachSugg');
const canvas = document.getElementById('spectrumCanvas');
const canvasCtx = canvas.getContext('2d');

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
    analyser.fftSize = 512; 
    
    micSource = audioContext.createMediaStreamSource(stream);
    micSource.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    analyzeAndRender();
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

function analyzeAndRender() {
    animationId = requestAnimationFrame(analyzeAndRender);
    
    analyser.getByteFrequencyData(dataArray);
    
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
    }
    let average = Math.sqrt(sumSquares / dataArray.length);
    
    let estimatedDb = average > 0 ? (20 * Math.log10(average) + 30).toFixed(1) : "00.0";
    if(estimatedDb < 0) estimatedDb = "00.0";
    
    dbDisplay.textContent = estimatedDb;
    
    let lowEndSum = 0;   
    let harshMidSum = 0; 
    
    for(let i=0; i<15; i++) lowEndSum += dataArray[i];
    for(let i=40; i<80; i++) harshMidSum += dataArray[i];
    
    evaluateEnvironment(estimatedDb, lowEndSum / 15, harshMidSum / 40);
    
    drawSpectrum();
}

function evaluateEnvironment(db, avgLow, avgHarsh) {
    const green = "#00e676";
    const yellow = "#ffd600";
    const red = "#ff1744";

    if (db > 85) {
        coachCard.style.borderColor = red;
        coachStatus.textContent = "CRITICAL: FATIGUE RISK";
        coachStatus.style.color = red;
        dbDisplay.style.color = red;
        coachDiag.textContent = `Volume is at ${db} dB. Human ears automatically compress sound over 85 dB over prolonged periods.`;
        coachSugg.textContent = "Action: Turn down your main output monitor by 6 dB immediately to protect your mixing accuracy.";
    } else if (avgLow > 170 && avgLow > (avgHarsh * 1.5)) {
        coachCard.style.borderColor = yellow;
        coachStatus.textContent = "WARNING: MUDDY LOW-END";
        coachStatus.style.color = yellow;
        dbDisplay.style.color = yellow;
        coachDiag.textContent = "Heavy low-frequency energy detected. This will mask definition in your acoustic vocals and instrument separation.";
        coachSugg.textContent = "Action: High-pass non-bass instruments at 80Hz, or shift your studio setup away from wall corners.";
    } else if (avgHarsh > 160) {
        coachCard.style.borderColor = yellow;
        coachStatus.textContent = "WARNING: PIERCING MIDS";
        coachStatus.style.color = yellow;
        dbDisplay.style.color = yellow;
        coachDiag.textContent = "High buildup noticed around 2 kHz - 4 kHz. This mix element will sound brittle or exhausting to listener ears.";
        coachSugg.textContent = "Action: Apply a narrow dynamic EQ notch at 3.2 kHz on active rhythm guitars or lead vocals.";
    } else {
        coachCard.style.borderColor = green;
        coachStatus.textContent = "BALANCED ROOM PROFILE";
        coachStatus.style.color = green;
        dbDisplay.style.color = green;
        coachDiag.textContent = "Dynamic distribution is clean across low, mid, and high spectrum areas.";
        coachSugg.textContent = "Action: Great acoustic profile. You are safe to make accurate mixing choices at this level.";
    }
}

function drawSpectrum() {
    const width = canvas.width;
    const height = canvas.height;
    canvasCtx.clearRect(0, 0, width, height);
    
    const barWidth = (width / dataArray.length) * 1.5;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2;
        
        canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 250)`;
        canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        
        x += barWidth;
    }
}
