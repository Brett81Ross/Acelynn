import {
  KWeightingState,
  amplitudeToDbfs,
  calculateIntegratedLufs,
  classifyDropout,
  correlationFromSums,
  estimateInterSamplePeak4x,
  powerToLufs
} from './metering-core.js';

class RunningWindow {
  constructor(length) {
    this.buffer = new Float64Array(Math.max(1, Math.round(length)));
    this.index = 0;
    this.count = 0;
    this.sum = 0;
  }

  push(value) {
    const clean = Number.isFinite(value) ? value : 0;
    this.sum += clean - this.buffer[this.index];
    this.buffer[this.index] = clean;
    this.index = (this.index + 1) % this.buffer.length;
    this.count = Math.min(this.count + 1, this.buffer.length);
    return this.sum;
  }

  mean() {
    return this.count ? this.sum / this.count : 0;
  }

  full() {
    return this.count >= this.buffer.length;
  }
}

class AcelynnMeteringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.momentary = new RunningWindow(sampleRate * 0.4);
    this.shortTerm = new RunningWindow(sampleRate * 3);
    this.dcWindows = [new RunningWindow(sampleRate), new RunningWindow(sampleRate)];
    this.correlationLR = new RunningWindow(sampleRate * 0.4);
    this.correlationL2 = new RunningWindow(sampleRate * 0.4);
    this.correlationR2 = new RunningWindow(sampleRate * 0.4);
    this.kStates = [new KWeightingState(sampleRate), new KWeightingState(sampleRate)];
    this.hopSamples = Math.max(1, Math.round(sampleRate * 0.1));
    this.hopCounter = 0;
    this.hopRawSquares = 0;
    this.hopRawCount = 0;
    this.previousHopRmsDbfs = -Infinity;
    this.integratedBlocks = [];
    this.integratedLufs = -Infinity;
    this.integratedTick = 0;
    this.samplePeak = 0;
    this.truePeak = 0;
    this.peakTails = [[], []];
    this.dropoutCount = 0;
    this.vectorPoints = [];
    this.vectorStride = Math.max(1, Math.round(sampleRate / 2400));
    this.vectorCounter = 0;
  }

  updateTruePeak(channel, channelIndex) {
    if (!channel?.length) return;
    const tail = this.peakTails[channelIndex] || [];
    const combined = tail.concat(Array.from(channel));
    const estimate = estimateInterSamplePeak4x(combined);
    this.truePeak = Math.max(this.truePeak, estimate);
    this.peakTails[channelIndex] = combined.slice(-3);
  }

  emit(channelCount) {
    const momentaryPower = this.momentary.full() ? this.momentary.mean() : 0;
    const shortTermPower = this.shortTerm.full() ? this.shortTerm.mean() : 0;
    const correlation = channelCount >= 2
      ? correlationFromSums({
          sumLR: this.correlationLR.sum,
          sumL2: this.correlationL2.sum,
          sumR2: this.correlationR2.sum
        })
      : null;
    this.port.postMessage({
      type: 'metering',
      sampleRate,
      channelCount,
      momentaryLufs: powerToLufs(momentaryPower),
      shortTermLufs: powerToLufs(shortTermPower),
      integratedLufs: this.integratedLufs,
      samplePeakDbfs: amplitudeToDbfs(this.samplePeak),
      truePeakEstimateDbtp: amplitudeToDbfs(this.truePeak),
      truePeakMethod: '4x-cubic-inter-sample-estimate',
      correlation,
      dcOffset: this.dcWindows.slice(0, channelCount).map(window => window.mean()),
      dropoutCount: this.dropoutCount,
      vectorPoints: this.vectorPoints.slice(-32),
      standard: 'ITU-R BS.1770-5 / EBU Tech 3341 aligned',
      compliance: 'algorithm-aligned; official compliance test-set pending'
    });
    this.vectorPoints = [];
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const channelCount = Math.min(2, input.length);
    const frameLength = input[0]?.length || output[0]?.length || 128;

    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      const out = output[channelIndex];
      const source = input[channelIndex] || input[0];
      if (!out) continue;
      if (!source) {
        out.fill(0);
        continue;
      }
      for (let i = 0; i < out.length; i += 1) out[i] = source[i] || 0;
    }

    if (!channelCount) return true;
    for (let c = 0; c < channelCount; c += 1) this.updateTruePeak(input[c], c);

    for (let i = 0; i < frameLength; i += 1) {
      let weightedPower = 0;
      let rawSquare = 0;
      const left = input[0]?.[i] || 0;
      const right = channelCount >= 2 ? (input[1]?.[i] || 0) : left;

      for (let c = 0; c < channelCount; c += 1) {
        const raw = Number.isFinite(input[c]?.[i]) ? input[c][i] : 0;
        this.samplePeak = Math.max(this.samplePeak, Math.abs(raw));
        rawSquare += raw * raw;
        this.dcWindows[c].push(raw);
        const weighted = this.kStates[c].process(raw);
        weightedPower += weighted * weighted;
      }

      this.momentary.push(weightedPower);
      this.shortTerm.push(weightedPower);
      if (channelCount >= 2) {
        this.correlationLR.push(left * right);
        this.correlationL2.push(left * left);
        this.correlationR2.push(right * right);
      }

      if (this.vectorCounter++ % this.vectorStride === 0 && this.vectorPoints.length < 32) {
        this.vectorPoints.push(channelCount >= 2 ? [left, right] : [left, left]);
      }

      this.hopRawSquares += rawSquare;
      this.hopRawCount += channelCount;
      this.hopCounter += 1;
      if (this.hopCounter >= this.hopSamples) {
        if (this.momentary.full()) this.integratedBlocks.push(this.momentary.mean());
        const hopRms = this.hopRawCount ? Math.sqrt(this.hopRawSquares / this.hopRawCount) : 0;
        const currentHopRmsDbfs = amplitudeToDbfs(hopRms);
        if (classifyDropout({ previousRmsDbfs: this.previousHopRmsDbfs, currentRmsDbfs: currentHopRmsDbfs })) {
          this.dropoutCount += 1;
        }
        this.previousHopRmsDbfs = currentHopRmsDbfs;
        this.hopCounter = 0;
        this.hopRawSquares = 0;
        this.hopRawCount = 0;
        this.integratedTick += 1;
        if (this.integratedTick >= 10) {
          this.integratedLufs = calculateIntegratedLufs(this.integratedBlocks).integratedLufs;
          this.integratedTick = 0;
        }
        this.emit(channelCount);
      }
    }
    return true;
  }
}

registerProcessor('acelynn-professional-meter', AcelynnMeteringProcessor);
