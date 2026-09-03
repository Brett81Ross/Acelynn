const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const BASE='http://127.0.0.1:4173/hotfix-preview.html';

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:900,height:900}});
    const page=await context.newPage();
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>globalThis.AcelynnMetering&&document.querySelector('#professionalMetering'));
    await page.waitForFunction(()=>!document.querySelector('#acelynnSplash'),null,{timeout:3000});

    const result=await page.evaluate(async()=>{
      const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextCtor)return{supported:false,reason:'AudioContext unavailable'};
      const ctx=new AudioContextCtor({sampleRate:48000});
      if(!ctx.audioWorklet||typeof AudioWorkletNode!=='function'){
        await ctx.close();
        return{supported:false,reason:'AudioWorklet unavailable'};
      }
      await ctx.resume();
      const oscillator=ctx.createOscillator();
      oscillator.frequency.value=1000;
      const gain=ctx.createGain();
      gain.gain.value=0.1;
      const analyser=ctx.createAnalyser();
      analyser.fftSize=2048;
      analyser.connect(ctx.destination);
      oscillator.connect(gain);
      const attached=await globalThis.AcelynnMetering.attach(ctx,gain,analyser,{sourceType:'file'});
      if(!attached){await ctx.close();return{supported:true,attached:false};}
      oscillator.start();
      const deadline=performance.now()+4300;
      while(performance.now()<deadline){
        const snapshot=globalThis.AcelynnMetering.getSnapshot();
        if(snapshot&&Number.isFinite(snapshot.momentaryLufs)&&Number.isFinite(snapshot.shortTermLufs)&&Number.isFinite(snapshot.integratedLufs))break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const snapshot=globalThis.AcelynnMetering.getSnapshot();
      oscillator.stop();
      await globalThis.AcelynnMetering.detach();
      await ctx.close();
      return{supported:true,attached:true,snapshot};
    });

    assert.equal(result.supported,true,`Chromium must expose AudioWorklet for v1.3 QA: ${result.reason||''}`);
    assert.equal(result.attached,true,'metering engine attaches AudioWorklet to a real Web Audio graph');
    const meter=result.snapshot;
    assert.ok(meter,'metering snapshot is produced');
    assert.equal(meter.available,true,'metering snapshot reports available');
    assert.equal(meter.measurementDomain,'digital-program','file path is identified as digital program audio');
    assert.equal(meter.sampleRate,48000,'real AudioContext sample rate is preserved');
    assert.ok(Number.isFinite(meter.momentaryLufs),'Momentary LUFS becomes finite after 400 ms');
    assert.ok(Number.isFinite(meter.shortTermLufs),'Short-term LUFS becomes finite after 3 seconds');
    assert.ok(Number.isFinite(meter.integratedLufs),'Integrated gated LUFS becomes finite');
    assert.ok(Number.isFinite(meter.samplePeakDbfs),'sample peak is finite');
    assert.ok(Number.isFinite(meter.truePeakEstimateDbtp),'inter-sample true-peak estimate is finite');
    assert.match(meter.truePeakMethod,/4x-cubic/,'true-peak method is explicitly identified as an estimate');
    assert.match(meter.compliance,/test-set pending/,'meter does not overclaim standards certification');
    assert.ok(Array.isArray(meter.vectorPoints),'vectorscope data is available ephemerally');

    await page.waitForFunction(()=>document.querySelector('#professionalMetering'));
    assert.match(await page.locator('#meteringNote').textContent(),/True peak|true-peak|Microphone LUFS|Digital-file LUFS/,'professional metering card contains measurement-domain guidance');
    console.log('Acelynn Pro v1.3 real AudioWorklet professional metering browser QA passed.');
    await context.close();
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1)});
