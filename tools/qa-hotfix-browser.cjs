const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const BASE='http://127.0.0.1:4173/hotfix-preview.html';

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:360,height:800}});
    const page=await context.newPage();
    await page.addInitScript(()=>{
      class FakeAnalyser{
        constructor(){this.fftSize=2048;this.smoothingTimeConstant=.78;this.minDecibels=-100;this.maxDecibels=-20}
        get frequencyBinCount(){return this.fftSize/2}
        connect(){}
        disconnect(){}
        getByteFrequencyData(array){for(let i=0;i<array.length;i++)array[i]=20+(i%5)}
        getByteTimeDomainData(array){for(let i=0;i<array.length;i++)array[i]=i%2?129:127}
      }
      class FakeAudioContext{
        constructor(){this.sampleRate=48000;this.state='running';this.destination={};this.audioWorklet=null}
        async resume(){this.state='running'}
        createAnalyser(){return new FakeAnalyser()}
        createMediaStreamSource(){return{connect(){},disconnect(){}}}
        createMediaElementSource(){return{connect(){},disconnect(){}}}
      }
      Object.defineProperty(window,'AudioContext',{configurable:true,value:FakeAudioContext});
      Object.defineProperty(window,'webkitAudioContext',{configurable:true,value:FakeAudioContext});
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
    });

    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#acelynnSplash'));
    assert.equal(await page.locator('#acelynnSplash').isVisible(),true,'splash is visible on launch');
    const logo=page.locator('.mark.acelynn-logo img');
    await logo.waitFor({state:'visible'});
    assert.match(await logo.getAttribute('src'),/acelynnpro\.png$/,'real Acelynn logo asset is used in header');
    assert.match(await page.locator('#cactusbyte-standard-footer').textContent(),/v1\.3\.0/,'footer visibly reports v1.3.0');
    await page.waitForFunction(()=>!document.querySelector('#acelynnSplash'),null,{timeout:3000});

    const source=await page.content();
    assert.ok(!source.includes('if(avg<8)'),'obsolete FFT-byte waiting gate is absent');
    assert.ok(source.includes('signalDb&lt;-72')||source.includes('signalDb<-72'),'RMS signal floor is present');
    assert.ok(source.includes('/js/metering-engine.js'),'v1.3 metering engine module is present');
    assert.ok(source.includes('/js/metering-ui.js'),'v1.3 metering UI module is present');
    await page.waitForFunction(()=>document.querySelector('#professionalMetering'));

    await page.locator('#micButton').click();
    await page.waitForFunction(()=>document.querySelector('#stateText')?.textContent==='LIVE');
    await page.waitForFunction(()=>document.querySelector('#healthLabel')?.textContent!=='Waiting for audio');
    const healthLabel=await page.locator('#healthLabel').textContent();
    const rmsText=await page.locator('#rmsValue').textContent();
    assert.notEqual(healthLabel,'Waiting for audio','valid microphone signal produces an analysis result');
    assert.match(rmsText,/-4[0-9]\.[0-9] dB/,'deterministic test signal is in the same usable range as the reported device reading');
    assert.equal(await page.locator('#captureButton').isDisabled(),false,'valid live analysis becomes saveable');
    assert.match(await page.locator('#inputDiagnostics').textContent(),/Professional AudioWorklet metering is unavailable|Waiting for metering input/,'v1.2 analysis remains usable when AudioWorklet is unavailable');

    await page.locator('#micButton').click();
    await page.waitForFunction(()=>document.querySelector('#stateText')?.textContent==='PAUSED');
    assert.equal(await page.locator('#captureButton').textContent(),'Save last check','stopped analysis remains clearly saveable');
    assert.equal(await page.locator('#captureButton').isDisabled(),false,'stopped valid frame remains enabled for save');

    console.log('Acelynn Pro v1.3 logo + splash + footer + valid-signal + metering fallback browser QA passed.');
    await context.close();
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1)});
